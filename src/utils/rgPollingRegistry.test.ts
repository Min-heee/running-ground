import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireRgPollingSlot,
  getActiveRgPollingSlotCount,
} from './rgPollingRegistry';

test('polling registry blocks duplicate active keys and releases by owner', () => {
  const first = acquireRgPollingSlot('room:1:party-room', 'party room polling');
  assert.equal(first.acquired, true);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  const duplicate = acquireRgPollingSlot('room:1:party-room', 'party room polling');
  assert.equal(duplicate.acquired, false);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  duplicate.release();
  assert.equal(getActiveRgPollingSlotCount(), 1);

  first.release();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('polling registry allows different sources for the same room when keys differ', () => {
  const partyRoom = acquireRgPollingSlot('room:1:party-room', 'party room polling');
  const snapshot = acquireRgPollingSlot('room:1:match-room-snapshot', 'match-room snapshot polling');

  assert.equal(partyRoom.acquired, true);
  assert.equal(snapshot.acquired, true);
  assert.equal(getActiveRgPollingSlotCount(), 2);

  partyRoom.release();
  snapshot.release();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('polling cleanup after room leave releases room and linked match owners', () => {
  const roomPolling = acquireRgPollingSlot('room:cleanup:match-room-snapshot', 'match-room snapshot polling');
  const linkedPolling = acquireRgPollingSlot('match:cleanup:linked-match-status', 'linked match status polling');

  assert.equal(roomPolling.acquired, true);
  assert.equal(linkedPolling.acquired, true);
  assert.equal(getActiveRgPollingSlotCount(), 2);

  roomPolling.release();
  linkedPolling.release();

  assert.equal(getActiveRgPollingSlotCount(), 0);
});
