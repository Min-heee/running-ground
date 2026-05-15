import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireRgHeartbeatSlot,
  canUseRgHeartbeatSlot,
  getActiveRgHeartbeatSlotCount,
  getInFlightRgHeartbeatRequestCount,
  resetRgHeartbeatRegistryForTest,
  runRgHeartbeatSingleFlight,
} from './rgHeartbeatRegistry';

test('heartbeat registry blocks duplicate active match slots', () => {
  resetRgHeartbeatRegistryForTest();
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

test('heartbeat registry allows same matchId only after cleanup release', () => {
  resetRgHeartbeatRegistryForTest();
  const first = acquireRgHeartbeatSlot('match-progress:match-cleanup', 'match progress heartbeat');
  assert.equal(first.acquired, true);

  const duplicateBeforeCleanup = acquireRgHeartbeatSlot('match-progress:match-cleanup', 'match progress heartbeat');
  assert.equal(duplicateBeforeCleanup.acquired, false);

  first.release();
  const nextAfterCleanup = acquireRgHeartbeatSlot('match-progress:match-cleanup', 'match progress heartbeat');
  assert.equal(nextAfterCleanup.acquired, true);

  nextAfterCleanup.release();
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
});

test('heartbeat single-flight reuses in-flight API requests by key', async () => {
  resetRgHeartbeatRegistryForTest();
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

test('heartbeat cleanup after room exit releases the active match owner', () => {
  resetRgHeartbeatRegistryForTest();
  const heartbeat = acquireRgHeartbeatSlot('match-progress:room-exit-match', 'match progress heartbeat');
  assert.equal(heartbeat.acquired, true);
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);

  heartbeat.release();

  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
  const restarted = acquireRgHeartbeatSlot('match-progress:room-exit-match', 'match progress heartbeat');
  assert.equal(restarted.acquired, true);
  restarted.release();
});

test('heartbeat single-flight cleans up rejected API requests for retry', async () => {
  resetRgHeartbeatRegistryForTest();
  let callCount = 0;
  const failing = runRgHeartbeatSingleFlight('match-progress:match-retry', async () => {
    callCount += 1;
    throw new Error('network failed');
  });
  const duplicate = runRgHeartbeatSingleFlight('match-progress:match-retry', async () => {
    callCount += 1;
    return 'duplicate';
  });

  assert.equal(failing.started, true);
  assert.equal(duplicate.started, false);
  assert.equal(getInFlightRgHeartbeatRequestCount(), 1);
  await assert.rejects(failing.promise, /network failed/);
  await assert.rejects(duplicate.promise, /network failed/);
  assert.equal(getInFlightRgHeartbeatRequestCount(), 0);

  const retry = runRgHeartbeatSingleFlight('match-progress:match-retry', async () => {
    callCount += 1;
    return 'ok';
  });

  assert.equal(retry.started, true);
  assert.equal(await retry.promise, 'ok');
  assert.equal(callCount, 2);
  assert.equal(getInFlightRgHeartbeatRequestCount(), 0);
});
