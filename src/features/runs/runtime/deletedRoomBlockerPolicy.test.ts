import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  markMatchRoomDeleted,
  resetMatchRoomDeletionTombstonesForTest,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import {
  getCleanupBlockerRoomId,
  getDeletedCleanupBlockerRoomId,
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
