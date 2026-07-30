import assert from 'node:assert/strict';
import test from 'node:test';

import type { RunningMatchRoom, RunningMatchRoomCleanupResponse } from '@/lib/api/types';
import {
  EMPTY_LOBBY_RECONCILE_MIN_ROOM_AGE_MS,
  findDivergedWaitingRoomFromCleanup,
  shouldLeaveDivergedWaitingRoom,
} from './emptyLobbyReconcile';

const NOW_MS = Date.parse('2026-07-31T12:00:00.000Z');

function buildRoom(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'duel-room-1',
    inviteToken: 'ABC123',
    inviteLink: 'runningground://running?roomInviteToken=ABC123',
    mode: 'duel',
    state: 'waiting',
    startMode: 'host',
    distanceKm: 3,
    slotStartAt: '2026-07-31T09:00:00.000Z',
    slotLabel: '방장 시작',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    hostUserId: 'u1',
    hostName: '회원G',
    participants: [{
      userId: 'u1',
      name: '회원G',
      districtName: '고양시',
      averagePace: '05:40/km',
      levelLabel: 'Lv.7',
      isHost: true,
      isReady: false,
      isCountdownReady: false,
      invited: false,
      joinedAt: new Date(NOW_MS - 60 * 60 * 1000).toISOString(),
    }],
    invitedFriendIds: [],
    ...overrides,
  } as RunningMatchRoom;
}

function buildCleanup(overrides: Partial<RunningMatchRoomCleanupResponse> = {}): RunningMatchRoomCleanupResponse {
  return {
    success: true,
    cleaned: false,
    cleanedItems: [],
    blocker: 'activeRoom',
    blockerSource: 'matchRooms.participant',
    code: 'active_room_blocked',
    room: buildRoom(),
    ...overrides,
  };
}

test('앱이 비어 있는데 서버가 붙잡고 있는 오래된 대기방은 정리 대상이다', () => {
  assert.equal(shouldLeaveDivergedWaitingRoom({ nowMs: NOW_MS, room: buildRoom() }), true);
});

test('연결된 대결이 있는 방은 절대 정리하지 않는다', () => {
  // 진행 중인 대결을 화면 한 번 비었다고 날려버리면 안 된다.
  const room = buildRoom({ linkedMatchId: 'duel-match-1', state: 'countdown' });

  assert.equal(shouldLeaveDivergedWaitingRoom({ nowMs: NOW_MS, room }), false);
});

test('시작 전(waiting)이 아닌 방은 정리하지 않는다', () => {
  assert.equal(shouldLeaveDivergedWaitingRoom({ nowMs: NOW_MS, room: buildRoom({ state: 'active' }) }), false);
});

test('방금 만들어진 방/초대는 정리하지 않는다', () => {
  // 조회 사이에 친구 초대가 도착하는 경우를 자동 거절로 만들면 안 된다.
  const freshRoom = buildRoom({
    participants: [{
      ...buildRoom().participants[0],
      joinedAt: new Date(NOW_MS - (EMPTY_LOBBY_RECONCILE_MIN_ROOM_AGE_MS - 1_000)).toISOString(),
    }],
  });

  assert.equal(shouldLeaveDivergedWaitingRoom({ nowMs: NOW_MS, room: freshRoom }), false);
});

test('시각을 읽을 수 없으면 아무것도 하지 않는다', () => {
  const room = buildRoom({ participants: [] });

  assert.equal(shouldLeaveDivergedWaitingRoom({ nowMs: NOW_MS, room }), false);
});

test('서버가 스스로 정리해서 막는 게 없으면 화해할 것도 없다', () => {
  const cleanup = buildCleanup({ blocker: undefined, code: undefined, room: null });

  assert.equal(findDivergedWaitingRoomFromCleanup({ cleanup, nowMs: NOW_MS }), null);
});

test('대기방이 아닌 다른 이유(진행 중 세션 등)로 막힌 경우는 건드리지 않는다', () => {
  const cleanup = buildCleanup({ blocker: 'matchSession', blockerSource: 'matchSessions.activeParticipant', room: null });

  assert.equal(findDivergedWaitingRoomFromCleanup({ cleanup, nowMs: NOW_MS }), null);
});

test('막고 있는 오래된 대기방은 그대로 돌려준다', () => {
  const found = findDivergedWaitingRoomFromCleanup({ cleanup: buildCleanup(), nowMs: NOW_MS });

  assert.equal(found?.roomId, 'duel-room-1');
});
