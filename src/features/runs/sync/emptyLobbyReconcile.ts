// 빈 대기실 ↔ 서버 상태 화해 (오너 2026-07-31).
//
// 증상: 대기실 화면은 "열린 방이 없어요"인데, 러닝 탭에서 방을 만들면 "이미 참여 중인
// 1대1 방이 있어요"로 막히고 관리자 화면에도 그 대기방이 그대로 남아 있었다. 앱과 서버가
// 서로 다른 사실을 믿는 상태이고, 이걸 풀 방법이 유저에게 하나도 없었다.
//
// 정책: 대기실이 '방 없음'으로 확정됐는데 서버는 아직 나를 시작 전 대기방에 넣어두고
// 있으면, 그 방에서 실제로 나간다(방장이면 방이 사라진다). 앱이 없다고 말한 방은 서버에도
// 없어야 한다.
//
// 안전장치 — 이 화해는 사람이 아무것도 누르지 않았는데 서버 상태를 바꾸는 자동 동작이다.
// 폴링 한 번 실패한 것만으로 남의 파티방에 영향이 가면 안 되므로 조건을 아주 좁게 잡는다:
//  1) 연결된 대결 세션이 있는 방(linkedMatchId)은 절대 건드리지 않는다. 진행 중인 대결을
//     화면 한 번 비었다고 날려버리면 안 된다.
//  2) 시작 전(waiting) 상태만.
//  3) 나 혼자 있는 방만. 다른 참가자가 있는 방은 손대지 않는다 — 유령 대기방은 정의상
//     아무도 안 들어온 방이고, 사람이 있는 방을 건드리는 건 그 사람들에게 영향을 준다.
//  4) 초대만 받은 방은 제외. 그건 '내가 갇힌 방'이 아니라 아직 답 안 한 초대이고, 여기서
//     나가면 초대가 조용히 거절된다. 거절은 사람이 누르는 동작이어야 한다.
//  5) 방이 생긴 지 EMPTY_LOBBY_RECONCILE_MIN_ROOM_AGE_MS 이상 지난 방만.

import type { RunningMatchRoom, RunningMatchRoomCleanupResponse } from '@/lib/api/types';

// 갓 만들어진 방/초대는 화해 대상이 아니다.
export const EMPTY_LOBBY_RECONCILE_MIN_ROOM_AGE_MS = 5 * 60 * 1000;

// 나이 비교는 서버 시계끼리 해야 한다. 방의 시각(joinedAt)은 서버가 찍는데 '지금'을 기기
// 시계로 잡으면, 기기 시계가 앞선 폰에서는(안드로이드에서 드물지 않다) 방금 만든 방이
// 5분 넘은 방으로 보여 '갓 만든 방' 보호막이 통째로 무력화된다.
export function parseServerNowMs(serverNow?: string | null): number {
  const parsedMs = serverNow ? Date.parse(serverNow) : Number.NaN;
  return Number.isFinite(parsedMs) ? parsedMs : Date.now();
}

// 방이 생긴 시각의 근사치 — 응답에 createdAt이 없으므로 가장 오래된 참가자의 joinedAt
// (= 방장이 방을 만든 시각)을 쓴다. 참가자가 하나도 없으면 판단 불가.
export function getMatchRoomOpenedAtMs(room: RunningMatchRoom | null | undefined): number {
  const joinedAtMsList = (room?.participants ?? [])
    .map((participant) => Date.parse(participant.joinedAt ?? ''))
    .filter((value) => Number.isFinite(value));

  return joinedAtMsList.length ? Math.min(...joinedAtMsList) : Number.NaN;
}

export function shouldLeaveDivergedWaitingRoom({
  nowMs = Date.now(),
  room,
}: {
  nowMs?: number;
  room: RunningMatchRoom | null | undefined;
}): boolean {
  if (!room?.roomId || room.linkedMatchId || room.state !== 'waiting') {
    return false;
  }

  // 다른 사람이 들어와 있는 방은 자동으로 손대지 않는다. 유령 대기방은 아무도 안 들어온
  // 방이므로 이 조건으로도 신고된 증상은 그대로 낫고, 사람이 있는 방의 반경은 0이 된다.
  if (room.participants.length > 1) {
    return false;
  }

  // 아직 답을 기다리는 초대가 걸린 방도 마찬가지다. 방이 사라지면 그 친구들의 초대가 조용히
  // 죽고(초대 카드가 '참여할 방을 찾지 못했어요'가 된다) 아무 안내도 가지 않는다.
  if ((room.invitedFriendIds?.length ?? 0) > 0) {
    return false;
  }

  // 초대만 받은 상태(참가 전)면 대상이 아니다 — 자동 거절이 돼버린다.
  const joinedThisRoom = room.joined !== false && room.participants.length > 0;

  if (!joinedThisRoom) {
    return false;
  }

  const openedAtMs = getMatchRoomOpenedAtMs(room);

  // 나이를 못 읽으면 건드리지 않는다 — 지우는 동작의 기본값은 '아무것도 안 함'이어야 한다.
  return Number.isFinite(openedAtMs) && nowMs - openedAtMs >= EMPTY_LOBBY_RECONCILE_MIN_ROOM_AGE_MS;
}

// cleanup-stale 응답에서 '내가 아직 갇혀 있는 대기방'을 뽑아낸다. 서버가 스스로 정리했으면
// (blocker 없음) 화해할 것도 없다.
export function findDivergedWaitingRoomFromCleanup({
  cleanup,
  nowMs = Date.now(),
}: {
  cleanup: RunningMatchRoomCleanupResponse | null | undefined;
  nowMs?: number;
}): RunningMatchRoom | null {
  if (!cleanup || cleanup.blocker !== 'activeRoom') {
    return null;
  }

  // 초대로 막힌 경우(matchRooms.invited)는 화해 대상이 아니다 — 아직 답 안 한 초대다.
  if (cleanup.blockerSource === 'matchRooms.invited') {
    return null;
  }

  const room = cleanup.room ?? null;
  return shouldLeaveDivergedWaitingRoom({ nowMs, room }) ? room : null;
}
