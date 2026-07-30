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
// 안전장치 — 이 화해는 방을 지우는 쪽이므로 조건을 좁게 잡는다:
//  1) 연결된 대결 세션이 있는 방(linkedMatchId)은 절대 건드리지 않는다. 진행 중인 대결을
//     화면 한 번 비었다고 날려버리면 안 된다.
//  2) 시작 전(waiting) 상태만.
//  3) 방이 생긴 지 EMPTY_LOBBY_RECONCILE_MIN_ROOM_AGE_MS 이상 지난 방만. 방금 도착한 친구
//     초대가 조회 사이에 끼어들어 자동으로 거절되는 사고를 막는다.

import type { RunningMatchRoom, RunningMatchRoomCleanupResponse } from '@/lib/api/types';

// 갓 만들어진 방/초대는 화해 대상이 아니다.
export const EMPTY_LOBBY_RECONCILE_MIN_ROOM_AGE_MS = 5 * 60 * 1000;

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

  const room = cleanup.room ?? null;
  return shouldLeaveDivergedWaitingRoom({ nowMs, room }) ? room : null;
}
