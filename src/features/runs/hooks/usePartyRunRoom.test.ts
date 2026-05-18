import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  clearMatchRoomDeletedTombstone,
  markMatchRoomDeleted,
  markMatchRoomDeletedFromMissingActiveRoom,
  markMatchRoomHostTransferObserved,
  resetMatchRoomDeletionTombstonesForTest,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { shouldClearPartyRunRoomForDeletedTombstone } from './usePartyRunRoom';

function room(roomId: string): RunningMatchRoom {
  return {
    canStart: false,
    distanceKm: 5,
    hostName: 'Host',
    hostUserId: 'host-user',
    inviteLink: 'runningground://running?roomInviteToken=ABC123',
    inviteToken: 'ABC123',
    invitedFriendIds: [],
    isHost: true,
    maxParticipants: 2,
    minParticipants: 2,
    mode: 'duel',
    participants: [],
    roomId,
    slotLabel: 'Now',
    slotStartAt: '2026-05-18T00:00:00.000Z',
    startMode: 'host',
    state: 'waiting',
  };
}

test('party run room clears the current room when matching tombstone is applied', () => {
  resetMatchRoomDeletionTombstonesForTest();
  const currentRoom = room('room-deleted');

  markMatchRoomDeleted('room-deleted', 'test delete');

  assert.equal(shouldClearPartyRunRoomForDeletedTombstone({
    deletedRoomId: 'room-deleted',
    matchRoom: currentRoom,
  }), true);
});

test('party run room keeps normal rooms when tombstone belongs to another room', () => {
  resetMatchRoomDeletionTombstonesForTest();

  markMatchRoomDeleted('room-deleted', 'test delete');

  assert.equal(shouldClearPartyRunRoomForDeletedTombstone({
    deletedRoomId: 'room-deleted',
    matchRoom: room('room-active'),
  }), false);
});

test('party run room does not clear a newly created room after tombstone clear', () => {
  resetMatchRoomDeletionTombstonesForTest();

  markMatchRoomDeleted('room-recreated', 'test delete');
  clearMatchRoomDeletedTombstone('room-recreated', 'room create');

  assert.equal(shouldClearPartyRunRoomForDeletedTombstone({
    deletedRoomId: 'room-recreated',
    matchRoom: room('room-recreated'),
  }), false);
});

test('host transfer delete path marks party run room for clearing', () => {
  resetMatchRoomDeletionTombstonesForTest();
  const transferredRoom = {
    ...room('room-transfer'),
    hostUserId: 'new-host',
  };

  markMatchRoomHostTransferObserved({
    currentRoom: { roomId: 'room-transfer', hostUserId: 'old-host', isHost: false },
    nextRoom: { roomId: 'room-transfer', hostUserId: 'new-host', isHost: true },
    source: 'test host transfer',
  });
  markMatchRoomDeletedFromMissingActiveRoom({
    room: transferredRoom,
    source: 'test host transfer delete',
  });

  assert.equal(shouldClearPartyRunRoomForDeletedTombstone({
    deletedRoomId: 'room-transfer',
    matchRoom: transferredRoom,
  }), true);
});
