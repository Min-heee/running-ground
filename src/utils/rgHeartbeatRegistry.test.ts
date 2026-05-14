import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireRgHeartbeatSlot,
  canUseRgHeartbeatSlot,
  getActiveRgHeartbeatSlotCount,
  getInFlightRgHeartbeatRequestCount,
  runRgHeartbeatSingleFlight,
} from './rgHeartbeatRegistry';

test('heartbeat registry blocks duplicate active match slots', () => {
  const first = acquireRgHeartbeatSlot('match-progress:match-1', 'match progress heartbeat');
  assert.equal(first.acquired, true);
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);
  assert.equal(canUseRgHeartbeatSlot('match-progress:match-1', first.ownerId), true);
  assert.equal(canUseRgHeartbeatSlot('match-progress:match-1', first.ownerId + 1), false);

  const duplicate = acquireRgHeartbeatSlot('match-progress:match-1', 'match progress heartbeat');
  assert.equal(duplicate.acquired, false);
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);

  duplicate.release();
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);

  first.release();
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
});

test('heartbeat single-flight reuses in-flight API requests by key', async () => {
  let callCount = 0;
  let resolveRequest: ((value: string) => void) | null = null;
  const task = () => {
    callCount += 1;
    return new Promise<string>((resolve) => {
      resolveRequest = resolve;
    });
  };

  const first = runRgHeartbeatSingleFlight('match-progress:match-1', task);
  const duplicate = runRgHeartbeatSingleFlight('match-progress:match-1', task);

  assert.equal(first.started, true);
  assert.equal(duplicate.started, false);
  assert.equal(callCount, 1);
  assert.equal(getInFlightRgHeartbeatRequestCount(), 1);

  assert.ok(resolveRequest);
  const resolveHeartbeatRequest = resolveRequest as (value: string) => void;
  resolveHeartbeatRequest('ok');
  assert.equal(await first.promise, 'ok');
  assert.equal(await duplicate.promise, 'ok');
  assert.equal(getInFlightRgHeartbeatRequestCount(), 0);
});
