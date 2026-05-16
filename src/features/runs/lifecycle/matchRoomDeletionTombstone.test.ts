import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearMatchRoomDeletedTombstone,
  isMatchRoomDeleted,
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

test('deleted room tombstone expires after the safety window', () => {
  resetMatchRoomDeletionTombstonesForTest();

  markMatchRoomDeleted('room-expired', 'test', 1_000);

  assert.equal(isMatchRoomDeleted('room-expired', 1_000 + 10 * 60 * 1000 + 1), false);
});
