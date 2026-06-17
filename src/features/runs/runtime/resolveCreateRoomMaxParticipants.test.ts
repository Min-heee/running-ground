import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREATE_ROOM_GROUP_DEFAULT_PARTICIPANTS,
  CREATE_ROOM_GROUP_MAX_PARTICIPANTS,
  CREATE_ROOM_GROUP_MIN_PARTICIPANTS,
  resolveCreateRoomMaxParticipants,
} from './resolveCreateRoomMaxParticipants';

test('duel create never sends a maxParticipants value', () => {
  assert.equal(resolveCreateRoomMaxParticipants('duel', '2'), undefined);
  assert.equal(resolveCreateRoomMaxParticipants('duel', '10'), undefined);
  assert.equal(resolveCreateRoomMaxParticipants('duel', ''), undefined);
});

test('group create keeps a sensible explicit size within bounds', () => {
  assert.equal(resolveCreateRoomMaxParticipants('group', '10'), 10);
  assert.equal(resolveCreateRoomMaxParticipants('group', '12'), 12);
  assert.equal(
    resolveCreateRoomMaxParticipants('group', '30'),
    CREATE_ROOM_GROUP_MAX_PARTICIPANTS,
  );
  assert.equal(
    resolveCreateRoomMaxParticipants('group', '99'),
    CREATE_ROOM_GROUP_MAX_PARTICIPANTS,
  );
});

test('group create never inherits a stale duel value of 2', () => {
  // This is the original bug: a duel room (maxParticipants 2) leaked its value
  // into the shared create-form state via useMatchRoomSelectionSync.
  assert.equal(
    resolveCreateRoomMaxParticipants('group', '2'),
    CREATE_ROOM_GROUP_DEFAULT_PARTICIPANTS,
  );
  assert.equal(CREATE_ROOM_GROUP_DEFAULT_PARTICIPANTS > 2, true);
  assert.equal(CREATE_ROOM_GROUP_MIN_PARTICIPANTS > 2, true);
});

test('group create falls back to the default for unusable values', () => {
  assert.equal(
    resolveCreateRoomMaxParticipants('group', ''),
    CREATE_ROOM_GROUP_DEFAULT_PARTICIPANTS,
  );
  assert.equal(
    resolveCreateRoomMaxParticipants('group', 'not-a-number'),
    CREATE_ROOM_GROUP_DEFAULT_PARTICIPANTS,
  );
  assert.equal(
    resolveCreateRoomMaxParticipants('group', '0'),
    CREATE_ROOM_GROUP_DEFAULT_PARTICIPANTS,
  );
  assert.equal(
    resolveCreateRoomMaxParticipants('group', '1'),
    CREATE_ROOM_GROUP_DEFAULT_PARTICIPANTS,
  );
});
