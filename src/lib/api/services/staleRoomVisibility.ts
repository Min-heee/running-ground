// 방 응답 가리개의 순수 판정 (오너 2026-07-31 신고의 진짜 원인이 여기 있었다).
//
// sanitizeRunningMatchRoomResponse는 목 응답뿐 아니라 진짜 서버 응답(/running/rooms/my,
// /running/rooms/invite-inbox)에도 걸린다. 그래서 이 판정이 틀리면 서버에 멀쩡히 있는 방이
// 앱에서만 사라진다 — 신고된 증상이 정확히 그거였다: 대기실은 "열린 방이 없어요"인데
// 방 만들기는 "이미 참여 중인 방이 있어요"로 막히고, 관리자 화면에는 그 방이 남아 있었다.
//
// 규칙: 가리개는 '시작 절차에 들어갔는데 끝내 진행되지 않은 방'만 치운다. 시작 전 대기방의
// 수명은 서버가 정한다(MATCH_ROOM_WAITING_TTL_MS + 주기 청소). 클라의 표시 휴리스틱이
// 서버보다 짧은 수명을 주장하면 두 쪽이 갈라지고, 그 분기를 유저가 풀 방법이 없다.
//
// 여기 있는 것들은 React Native에 손대지 않는 순수 함수라 그대로 테스트할 수 있다.

import type { RunningMatchRoom } from '../types';

export const STALE_MATCHED_HIDE_MS = 10 * 60 * 1000;

export function getResponseNowMs(serverNow?: string) {
  const parsedMs = serverNow ? new Date(serverNow).getTime() : NaN;
  return Number.isFinite(parsedMs) ? parsedMs : Date.now();
}

export function shouldHideStaleRunningMatchRoom(
  room: RunningMatchRoom | null | undefined,
  nowMs: number,
): boolean {
  if (!room) {
    return false;
  }

  // 아직 시작 전인 대기방은 절대 숨기지 않는다. 방장 시작 방은 slotStartAt이 곧 '만든 시각'
  // 이라(백엔드 createRunningMatchRoom), 예전 규칙에서는 만든 지 10분이면 멀쩡한 대기실이
  // 통째로 사라졌다.
  if (!room.linkedMatchId && room.state !== 'countdown') {
    return false;
  }

  const referenceStartMs = new Date(room.linkedMatchSlotStartAt ?? room.slotStartAt).getTime();

  if (!Number.isFinite(referenceStartMs)) {
    return false;
  }

  return nowMs - referenceStartMs > STALE_MATCHED_HIDE_MS;
}
