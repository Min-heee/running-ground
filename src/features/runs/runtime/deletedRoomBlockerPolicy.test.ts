import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  markMatchRoomDeleted,
  resetMatchRoomDeletionTombstonesForTest,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import {
  getDeletedCreateBlockerRoomId,
  getCleanupBlockerRoomId,
  getDeletedCleanupBlockerRoomId,
  recoverDeletedRoomCreateBlocker,
} from './deletedRoomBlockerPolicy';

function room(roomId: string): RunningMatchRoom {
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

test('cleanup blocker room id prefers returned room and falls back to blocker details', () => {
  assert.equal(getCleanupBlockerRoomId({
    blockerDetails: { source: 'matchRooms.participant', roomId: 'room-details' },
    room: room('room-payload'),
  }), 'room-payload');

  assert.equal(getCleanupBlockerRoomId({
    blockerDetails: { source: 'matchRooms.participant', roomId: 'room-details' },
    room: null,
  }), 'room-details');
});

test('cleanup blocker policy ignores deleted tombstone room ids only', () => {
  resetMatchRoomDeletionTombstonesForTest();
  markMatchRoomDeleted('room-deleted', 'test delete');

  assert.equal(getDeletedCleanupBlockerRoomId({
    blockerDetails: { source: 'matchRooms.participant', roomId: 'room-deleted' },
    room: null,
  }), 'room-deleted');

  assert.equal(getDeletedCleanupBlockerRoomId({
    blockerDetails: { source: 'matchRooms.participant', roomId: 'room-other' },
    room: null,
  }), null);
});

test('create blocker policy identifies deleted tombstone blocker ids only', () => {
  resetMatchRoomDeletionTombstonesForTest();
  markMatchRoomDeleted('room-deleted', 'test delete');

  assert.equal(getDeletedCreateBlockerRoomId({
    blocker: 'activeRoom',
    blockerSource: 'matchRooms.participant',
    roomId: 'room-deleted',
  }), 'room-deleted');
  assert.equal(getDeletedCreateBlockerRoomId({
    blocker: 'activeRoom',
    blockerSource: 'matchRooms.participant',
    roomId: 'room-other',
  }), null);
});

test('deleted room blocker cleanup allows create retry after recovery cleanup', async () => {
  resetMatchRoomDeletionTombstonesForTest();
  markMatchRoomDeleted('room-deleted', 'test delete');
  const cleanupSources: string[] = [];
  const traceLabels: string[] = [];

  const result = await recoverDeletedRoomCreateBlocker({
    blocker: {
      blocker: 'activeRoom',
      blockerSource: 'matchRooms.participant',
      roomId: 'room-deleted',
    },
    cleanup: async ({ source }) => {
      cleanupSources.push(source);
      return {
        payload: {
          cleaned: true,
          cleanedItems: ['matchRooms.participant'],
          room: null,
          success: true,
        },
        status: 'completed',
      };
    },
    trace: (label) => {
      traceLabels.push(label);
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.shouldRetry, true);
  assert.equal(result.blockerRoomId, 'room-deleted');
  assert.deepEqual(cleanupSources, ['room create deleted blocker recovery']);
  assert.deepEqual(traceLabels, [
    'room create blocker ignored deleted room',
    'room delete active blocker cleanup begin',
    'room delete active blocker cleanup end',
  ]);
});

test('deleted room blocker cleanup does not retry create when recovery times out', async () => {
  resetMatchRoomDeletionTombstonesForTest();
  markMatchRoomDeleted('room-deleted', 'test delete');

  const result = await recoverDeletedRoomCreateBlocker({
    blocker: {
      blocker: 'activeRoom',
      blockerSource: 'matchRooms.participant',
      roomId: 'room-deleted',
    },
    cleanup: async () => ({ status: 'timeout' }),
    trace: () => undefined,
  });

  assert.equal(result.handled, true);
  assert.equal(result.shouldRetry, false);
  assert.equal(result.status, 'timeout');
});
