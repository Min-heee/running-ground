import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  consumeOptimisticMatchRoomHydration,
  hydrateOptimisticMatchRoom,
} from '@/features/match/hooks/lobby/optimisticRoomHydration';

function createRoom(roomId: string): RunningMatchRoom {
  return {
    roomId,
    inviteToken: 'ABC123',
    inviteLink: 'https://example.com/ABC123',
    mode: 'duel',
    state: 'waiting',
    startMode: 'host',
    distanceKm: 3,
    slotStartAt: '2026-05-15T12:00:00.000Z',
    slotLabel: '오늘 12:00',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    hostUserId: 'user-a',
    hostName: 'host',
    participants: [],
    invitedFriendIds: [],
  };
}

test('optimistic room hydration is consumed once for lobby first render', () => {
  hydrateOptimisticMatchRoom({
    nowMs: 1000,
    room: createRoom('room-1'),
    source: 'test create room',
  });

  const hydration = consumeOptimisticMatchRoomHydration(1200);

  assert.equal(hydration?.room.roomId, 'room-1');
  assert.equal(consumeOptimisticMatchRoomHydration(1300), null);
});

test('optimistic room hydration ignores expired room state', () => {
  hydrateOptimisticMatchRoom({
    nowMs: 1000,
    room: createRoom('room-expired'),
    source: 'test stale room',
  });

  assert.equal(consumeOptimisticMatchRoomHydration(32_000), null);
});

