import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireRgPollingSlot,
  getActiveRgPollingSlotCount,
  resetRgPollingRegistryForTest,
  startRgPollingInterval,
} from './rgPollingRegistry';

test('polling registry blocks duplicate active keys and releases by owner', () => {
  resetRgPollingRegistryForTest();
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
  resetRgPollingRegistryForTest();
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
  resetRgPollingRegistryForTest();
  const roomPolling = acquireRgPollingSlot('room:cleanup:match-room-snapshot', 'match-room snapshot polling');
  const linkedPolling = acquireRgPollingSlot('match:cleanup:linked-match-status', 'linked match status polling');

  assert.equal(roomPolling.acquired, true);
  assert.equal(linkedPolling.acquired, true);
  assert.equal(getActiveRgPollingSlotCount(), 2);

  roomPolling.release();
  linkedPolling.release();

  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('polling interval primitive blocks duplicate starts and restarts after stop', () => {
  resetRgPollingRegistryForTest();
  const first = startRgPollingInterval({
    intervalMs: 10_000,
    key: 'blocking-match-status:match-interval',
    label: 'blocking match status polling',
    onTick: () => {},
  });
  const duplicate = startRgPollingInterval({
    intervalMs: 10_000,
    key: 'blocking-match-status:match-interval',
    label: 'blocking match status polling',
    onTick: () => {},
  });

  assert.equal(first.acquired, true);
  assert.equal(duplicate.acquired, false);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  duplicate.stop();
  assert.equal(getActiveRgPollingSlotCount(), 1);

  first.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);

  const restarted = startRgPollingInterval({
    intervalMs: 10_000,
    key: 'blocking-match-status:match-interval',
    label: 'blocking match status polling',
    onTick: () => {},
  });
  assert.equal(restarted.acquired, true);
  restarted.stop();
});
