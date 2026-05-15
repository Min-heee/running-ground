import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  buildMatchRoomSnapshotRouteKey,
  shouldSuppressNoRoomStateDuringHydration,
} from './lobbyHydrationGuard';
import type { OptimisticMatchRoomHydration } from '../optimisticRoomHydration';

function room(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'room-1',
    inviteToken: 'ABC123',
    inviteLink: 'runningground://running?roomInviteToken=ABC123',
    mode: 'duel',
    state: 'waiting',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: new Date().toISOString(),
    slotLabel: '방장 시작',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    joined: true,
    hostUserId: 'host-user',
    hostName: '방장',
    participants: [],
    invitedFriendIds: [],
    invitedFriends: [],
    ...overrides,
  };
}

function hydration(nextRoom: RunningMatchRoom): OptimisticMatchRoomHydration {
  return {
    createdAtMs: 1000,
    room: nextRoom,
    source: 'room create',
  };
}

test('lobby hydration suppresses no-room state for the created room', () => {
  const optimisticRoom = room();

  assert.equal(shouldSuppressNoRoomStateDuringHydration({
    optimisticRoomHydration: hydration(optimisticRoom),
    room: optimisticRoom,
  }), true);
});

test('lobby hydration does not suppress a different or missing room', () => {
  assert.equal(shouldSuppressNoRoomStateDuringHydration({
    optimisticRoomHydration: hydration(room()),
    room: room({ roomId: 'room-2' }),
  }), false);
  assert.equal(shouldSuppressNoRoomStateDuringHydration({
    optimisticRoomHydration: hydration(room()),
    room: null,
  }), false);
});

test('match-room route key uses hydrated room before falling back to no-room', () => {
  const hydratedRouteKey = buildMatchRoomSnapshotRouteKey({
    isFocused: true,
    isPollingPaused: false,
    room: room({ linkedMatchId: 'match-1' }),
  });
  const emptyRouteKey = buildMatchRoomSnapshotRouteKey({
    isFocused: true,
    isPollingPaused: false,
    room: null,
  });

  assert.equal(hydratedRouteKey.includes('no-room'), false);
  assert.equal(hydratedRouteKey.includes('room-1'), true);
  assert.equal(hydratedRouteKey.includes('match-1'), true);
  assert.equal(emptyRouteKey.includes('no-room'), true);
});
