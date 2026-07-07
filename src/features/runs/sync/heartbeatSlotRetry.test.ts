import assert from 'node:assert/strict';
import test from 'node:test';
import { armHeartbeatSlotAcquireRetry } from '@/features/runs/sync/heartbeatSlotRetry';
import { buildMatchProgressRegistryKey } from '@/features/runs/sync/registryKeys';
import {
  acquireRgHeartbeatSlot,
  canUseRgHeartbeatSlot,
  getActiveRgHeartbeatSlotCount,
  resetRgHeartbeatRegistryForTest,
} from '@/utils/rgHeartbeatRegistry';

type FakeTimer = { id: number; callback: () => void; intervalMs: number };

function createFakeTimerHarness() {
  const timers: FakeTimer[] = [];
  const cleared: FakeTimer[] = [];

  return {
    timers,
    cleared,
    setIntervalFn: ((callback: () => void, intervalMs: number) => {
      const timer = { id: timers.length + 1, callback, intervalMs };
      timers.push(timer);
      return timer;
    }) as unknown as typeof setInterval,
    clearIntervalFn: ((timer: FakeTimer) => {
      cleared.push(timer);
    }) as unknown as typeof clearInterval,
  };
}

// Heartbeat-slot latch fix — the exact seam useMatchProgressSync's lost-acquire branch arms:
// zombie owner holds the SLOT registry key → retry armed → retry ticks stay unacquired (the slot
// registry has NO eviction; only the owner's release frees it) → zombie releases → the next retry
// tick re-acquires, installs the owner bookkeeping (send-gate visible) BEFORE firing exactly ONE
// catch-up send, and stops retrying. Cleanup releases the slot and leaves zero live timers.
test('heartbeat slot retry re-acquires after a zombie owner releases and fires one catch-up send', async () => {
  resetRgHeartbeatRegistryForTest();
  const heartbeatKey = buildMatchProgressRegistryKey('duel-match-heartbeat-retry');
  const zombie = acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat', {
    cadence: 'zombie owner',
    heartbeatKey,
  });
  assert.equal(zombie.acquired, true);

  // The effect's first acquire loses (the zombie owns the key) — this is the latched state where
  // the send gate reads canUseRgHeartbeatSlot(key, undefined) → false.
  const initial = acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat');
  assert.equal(initial.acquired, false);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, undefined), false);

  let catchUpCount = 0;
  const ownerRefSets: number[] = [];
  let ownerRefSetBeforeCatchUp: boolean | null = null;
  let teardownRuns = 0;
  const harness = createFakeTimerHarness();
  const retry = armHeartbeatSlotAcquireRetry({
    intervalMs: 2_500,
    acquireSlot: () => acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat', {
      cadence: 'on tracking tick',
      heartbeatKey,
    }),
    onReacquired: (slot) => {
      // Owner-ref set callback — mirrors heartbeatSlotOwnerRef.current = { key, ownerId }.
      ownerRefSets.push(slot.ownerId);
      return () => {
        teardownRuns += 1;
      };
    },
    onCatchUp: () => {
      ownerRefSetBeforeCatchUp = ownerRefSets.length > 0;
      catchUpCount += 1;
    },
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });
  assert.equal(harness.timers.length, 1);

  // While the zombie still owns the slot, retry ticks stay unacquired — no bookkeeping, no send.
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(catchUpCount, 0);
  assert.equal(ownerRefSets.length, 0);
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);

  // Zombie releases (unmount / unfreeze-processed cleanup) → the NEXT retry tick re-acquires,
  // sets the owner ref FIRST, then fires exactly ONE catch-up send.
  zombie.release();
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(ownerRefSets.length, 1);
  assert.equal(catchUpCount, 1);
  assert.equal(ownerRefSetBeforeCatchUp, true);
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);
  // The re-acquired owner passes the send gate; a strange ownerless probe still fails it.
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, ownerRefSets[0]), true);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, undefined), false);
  // The retry timer was stopped on re-acquire.
  assert.equal(harness.cleared.includes(harness.timers[0]), true);

  // A straggler retry callback after re-acquire is a no-op — no double-acquire, no extra send.
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(catchUpCount, 1);
  assert.equal(ownerRefSets.length, 1);
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);

  // Effect cleanup runs the caller teardown and releases the slot → zero slots, zero timers.
  retry.stop();
  assert.equal(teardownRuns, 1);
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, undefined), true);
  // Zero live timers: every timer the retry armed has been cleared (stop() re-clears the retry
  // timer defensively, same as the shipped polling retry — double-clearInterval is a no-op).
  assert.equal(harness.timers.every((timer) => harness.cleared.includes(timer)), true);

  // stop() is idempotent — no double teardown, no double release.
  retry.stop();
  assert.equal(teardownRuns, 1);
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
});

test('heartbeat slot retry cleanup before re-acquire clears the timer and acquires nothing', async () => {
  resetRgHeartbeatRegistryForTest();
  const heartbeatKey = buildMatchProgressRegistryKey('duel-match-heartbeat-retry-cleanup');
  const zombie = acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat');
  assert.equal(zombie.acquired, true);

  let catchUpCount = 0;
  let ownerRefSetCount = 0;
  const harness = createFakeTimerHarness();
  const retry = armHeartbeatSlotAcquireRetry({
    intervalMs: 2_500,
    acquireSlot: () => acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat'),
    onReacquired: () => {
      ownerRefSetCount += 1;
      return () => {};
    },
    onCatchUp: () => {
      catchUpCount += 1;
    },
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });
  assert.equal(harness.timers.length, 1);

  // Effect cleanup while still waiting for the slot: the retry timer is cleared...
  retry.stop();
  assert.equal(harness.cleared.includes(harness.timers[0]), true);

  // ...and even if a straggler retry callback fires after stop (and the slot is now free), it
  // must NOT acquire anything, set any owner ref, or send — the retry is dead.
  zombie.release();
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(catchUpCount, 0);
  assert.equal(ownerRefSetCount, 0);
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
});

test('heartbeat slot retry swallows a rejecting catch-up send and keeps the acquired slot', async () => {
  resetRgHeartbeatRegistryForTest();
  const heartbeatKey = buildMatchProgressRegistryKey('duel-match-heartbeat-retry-reject');

  let teardownRuns = 0;
  const harness = createFakeTimerHarness();
  const retry = armHeartbeatSlotAcquireRetry({
    intervalMs: 2_500,
    acquireSlot: () => acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat'),
    onReacquired: () => () => {
      teardownRuns += 1;
    },
    // Same swallow-errors contract as the keep-alive tick's send: a failed catch-up must not
    // surface an unhandled rejection or drop the freshly acquired slot.
    onCatchUp: () => Promise.reject(new Error('catch-up send failed')),
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });

  // Slot is free — the first retry tick acquires it and the rejecting catch-up is swallowed.
  harness.timers[0].callback();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);

  retry.stop();
  assert.equal(teardownRuns, 1);
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
});
