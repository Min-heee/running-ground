// 대기실이 "열린 방이 없어요"로 뒤집히던 진짜 원인의 회귀 방지 (오너 2026-07-31 신고).
//
// sanitizeRunningMatchRoomResponse는 진짜 서버 응답(/running/rooms/my, /invite-inbox)에도
// 걸리는 필터다. 여기서 시작 전 대기방을 슬롯 나이로 숨겨 버리면, 서버에는 멀쩡히 있는 방이
// 앱에서만 사라진다 — 그게 신고된 증상 3종(대기실 빈 화면 / 방 만들기 차단 / 관리자 화면에
// 남는 방)의 원인이었다. 방장 시작 방은 slotStartAt이 곧 '만든 시각'이라 10분이면 걸렸다.

import assert from 'node:assert/strict';
import test from 'node:test';

import type { RunningMatchRoom } from '@/lib/api/types';
import { shouldHideStaleRunningMatchRoom } from './staleRoomVisibility';

const NOW = '2026-07-31T12:00:00.000Z';

function buildRoom(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'duel-room-1',
    inviteToken: 'ABC123',
    inviteLink: 'runningground://running?roomInviteToken=ABC123',
    mode: 'duel',
    state: 'waiting',
    startMode: 'host',
    distanceKm: 3,
    // 방장 시작 방의 slotStartAt = 방을 만든 시각. 40분 전에 만든 대기실.
    slotStartAt: '2026-07-31T11:20:00.000Z',
    slotLabel: '방장 시작',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    hostUserId: 'u1',
    hostName: '회원G',
    participants: [],
    invitedFriendIds: [],
    ...overrides,
  } as RunningMatchRoom;
}

function isHidden(room: RunningMatchRoom) {
  return shouldHideStaleRunningMatchRoom(room, Date.parse(NOW));
}

test('40분 전에 만든 대기방은 그대로 보인다 (서버에 살아 있으므로)', () => {
  assert.equal(isHidden(buildRoom()), false);
});

test('시작 전 방은 슬롯이 아무리 지나도 앱에서 임의로 지우지 않는다', () => {
  // 수명 판정은 서버(MATCH_ROOM_WAITING_TTL_MS + 주기 청소)의 몫이다.
  assert.equal(isHidden(buildRoom({ slotStartAt: '2026-07-30T12:00:00.000Z' })), false);
});

test('시작해 놓고 끝내 진행되지 않은 방(연결된 대결 있음)은 여전히 숨긴다', () => {
  assert.equal(isHidden(buildRoom({
    linkedMatchId: 'duel-match-1',
    state: 'countdown',
    linkedMatchSlotStartAt: '2026-07-31T11:40:00.000Z',
  })), true);
});

test('연결된 대결이 아직 최근이면 숨기지 않는다', () => {
  assert.equal(isHidden(buildRoom({
    linkedMatchId: 'duel-match-1',
    state: 'countdown',
    linkedMatchSlotStartAt: '2026-07-31T11:55:00.000Z',
  })), false);
});
