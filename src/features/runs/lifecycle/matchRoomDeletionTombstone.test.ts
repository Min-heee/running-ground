import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearMatchRoomDeletedTombstone,
  findDeletedMatchRoomId,
  hasMatchRoomHostTransferred,
  isMatchRoomDeleted,
  markMatchRoomDeletedFromMissingActiveRoom,
  markMatchRoomHostTransferObserved,
  markMatchRoomDeleted,
  resetMatchRoomDeletionTombstonesForTest,
} from './matchRoomDeletionTombstone';

test('deleted room tombstone blocks the same room id until cleared', () => {
  resetMatchRoomDeletionTombstonesForTest();

  markMatchRoomDeleted('room-deleted', 'test', 1_000);

  assert.equal(isMatchRoomDeleted('room-deleted', 1_100), true);
  assert.equal(isMatchRoomDeleted('room-other', 1_100), false);

  clearMatchRoomDeletedTombstone('room-deleted', 'test clear');

  assert.equal(isMatchRoomDeleted('room-deleted', 1_200), false);
});

test('deleted room tombstone resolves the first deleted blocker id', () => {
  resetMatchRoomDeletionTombstonesForTest();

  markMatchRoomDeleted('room-deleted', 'test', 1_000);

  assert.equal(findDeletedMatchRoomId(['room-other', 'room-deleted'], 1_100), 'room-deleted');
  assert.equal(findDeletedMatchRoomId(['room-other'], 1_100), null);
});

test('deleted room tombstone expires after the safety window', () => {
  resetMatchRoomDeletionTombstonesForTest();

  markMatchRoomDeleted('room-expired', 'test', 1_000);

  assert.equal(isMatchRoomDeleted('room-expired', 1_000 + 10 * 60 * 1000 + 1), false);
});

test('deleted room tombstone is cleared for delete failure fallback', () => {
  resetMatchRoomDeletionTombstonesForTest();

  markMatchRoomDeleted('room-delete-failed', 'delete button', 1_000);
  assert.equal(isMatchRoomDeleted('room-delete-failed', 1_100), true);

  clearMatchRoomDeletedTombstone('room-delete-failed', 'room delete failure');
  assert.equal(isMatchRoomDeleted('room-delete-failed', 1_200), false);
});

test('host transfer is detected for the same room id only', () => {
  assert.equal(hasMatchRoomHostTransferred({
    currentRoom: { roomId: 'room-1', hostUserId: 'host-a', isHost: false },
    nextRoom: { roomId: 'room-1', hostUserId: 'host-b', isHost: true },
  }), true);

  assert.equal(hasMatchRoomHostTransferred({
    currentRoom: { roomId: 'room-1', hostUserId: 'host-a', isHost: true },
    nextRoom: { roomId: 'room-2', hostUserId: 'host-b', isHost: false },
  }), false);
});

test('missing active room after host transfer propagates a deleted tombstone', () => {
  resetMatchRoomDeletionTombstonesForTest();

  assert.equal(markMatchRoomHostTransferObserved({
    currentRoom: { roomId: 'room-transfer', hostUserId: 'host-a', isHost: false },
    nextRoom: { roomId: 'room-transfer', hostUserId: 'host-b', isHost: true },
    nowMs: 1_000,
    source: 'test host transfer',
  }), true);

  const deletedRoomId = markMatchRoomDeletedFromMissingActiveRoom({
    nowMs: 1_100,
    room: { roomId: 'room-transfer', hostUserId: 'host-b', isHost: true },
    source: 'test missing active room',
  });

  assert.equal(deletedRoomId, 'room-transfer');
  assert.equal(isMatchRoomDeleted('room-transfer', 1_200), true);
});
