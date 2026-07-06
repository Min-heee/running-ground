import assert from 'node:assert/strict';
import test from 'node:test';
import { armBlockingMatchStatusPollRetry } from '@/features/runs/sync/matchPolling/useBlockingMatchStatusPolling';
import {
  LINKED_MATCH_ARMING_POLL_MS,
  resolveLinkedMatchPollingCadence,
} from '@/features/runs/sync/partyRunSync/useLinkedMatchSync';
import {
  acquireRgPollingSlot,
  getActiveRgPollingSlotCount,
  resetRgPollingRegistryForTest,
  startRgPollingInterval,
} from '@/utils/rgPollingRegistry';

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

test('linked match polling uses 1s cadence while arming so clients poll in before countdown appears', () => {
  assert.deepEqual(resolveLinkedMatchPollingCadence({
    fastMatchStatusPollMs: 2500,
    idleMatchStatusPollMs: 3000,
    phase: 'arming',
    shouldOpenArena: false,
  }), {
    intervalMs: LINKED_MATCH_ARMING_POLL_MS,
    transitionReason: 'arming-poll-in',
  });

  assert.deepEqual(resolveLinkedMatchPollingCadence({
    fastMatchStatusPollMs: 2500,
    idleMatchStatusPollMs: 3000,
    phase: 'readyAcked',
    shouldOpenArena: false,
  }), {
    intervalMs: LINKED_MATCH_ARMING_POLL_MS,
    transitionReason: 'readyAcked-poll-in',
  });
});

test('linked match polling keeps existing fast countdown and idle cadences outside arming', () => {
  assert.deepEqual(resolveLinkedMatchPollingCadence({
    fastMatchStatusPollMs: 2500,
    idleMatchStatusPollMs: 3000,
    phase: 'countdown',
    shouldOpenArena: false,
  }), {
    intervalMs: 2500,
    transitionReason: 'countdown-handoff',
  });

  assert.deepEqual(resolveLinkedMatchPollingCadence({
    fastMatchStatusPollMs: 2500,
    idleMatchStatusPollMs: 3000,
    phase: 'waiting',
    shouldOpenArena: false,
  }), {
    intervalMs: 3000,
    transitionReason: 'linked-idle-sync',
  });
});

// Opponent-poll stall fix — organ-3 (linked match status) un-latch. The lose branch in
// useLinkedMatchSync used to return a cancel-only cleanup on a lost keyed-slot acquire; with
// every effect dep stable during a stable active match, the linked poll stayed permanently dead
// until match end (a zombie runtime instance owning the key starves the visible one). The lose
// branch now arms the shared df02afc retry helper on the SAME linked key with the SAME tick fn.
// The hook cannot render under the plain node runner (repo pattern), so these tests exercise the
// exact lose-branch wiring at the seam: same key shape, same label, same tick fn for both the
// acquired interval and the retry catch-up.
test('linked match poll retry re-acquires after a zombie owner releases and fires one catch-up sync', async () => {
  resetRgPollingRegistryForTest();
  // Mirrors useLinkedMatchSync's pollingKey: `match:${matchId}:linked-match-status`.
  const pollingKey = 'match:party-duel-retry:linked-match-status';
  const zombie = acquireRgPollingSlot(pollingKey, 'linked match status polling', {
    source: 'zombie runtime instance',
  });
  assert.equal(zombie.acquired, true);

  let syncCount = 0;
  const syncRoomLinkedMatch = () => {
    syncCount += 1;
  };
  const harness = createFakeTimerHarness();
  // Same invocation shape as the effect's startRgPollingInterval call (identical key/label/tick).
  const startLinkedPolling = () => startRgPollingInterval({
    // Real poll cadence far beyond the test lifetime — the acquired poll never ticks here, so
    // any syncCount increment can only be the retry's immediate catch-up tick.
    intervalMs: 600_000,
    key: pollingKey,
    label: 'linked match status polling',
    onTick: syncRoomLinkedMatch,
  });

  // The effect's first startRgPollingInterval loses the acquire (the zombie owns the key)...
  const initial = startLinkedPolling();
  assert.equal(initial.acquired, false);

  // ...so the lose branch arms the shared retry helper at the same cadence with the same tick fn.
  let reacquiredOwnerId: number | null = null;
  const retry = armBlockingMatchStatusPollRetry({
    intervalMs: 600_000,
    onReacquired: (handle) => {
      reacquiredOwnerId = handle.ownerId;
    },
    onTick: syncRoomLinkedMatch,
    startPolling: startLinkedPolling,
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });
  assert.equal(harness.timers.length, 1);

  // While the zombie still owns the slot, retry ticks stay unacquired — no poll, no sync.
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(syncCount, 0);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  // Zombie dies (releases) → the NEXT retry tick re-acquires and fires ONE catch-up sync.
  zombie.release();
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(syncCount, 1);
  assert.notEqual(reacquiredOwnerId, null);
  assert.equal(getActiveRgPollingSlotCount(), 1);
  // The retry timer was stopped on re-acquire.
  assert.equal(harness.cleared.includes(harness.timers[0]), true);

  // A straggler retry callback after re-acquire is a no-op — no double-arm, no extra sync.
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(syncCount, 1);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  // Effect cleanup stops the live poll handle → zero slots left behind.
  retry.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('linked match poll retry cleanup before re-acquire clears the timer and leaks nothing', async () => {
  resetRgPollingRegistryForTest();
  const pollingKey = 'match:party-duel-retry-cleanup:linked-match-status';
  const zombie = acquireRgPollingSlot(pollingKey, 'linked match status polling');
  assert.equal(zombie.acquired, true);

  let syncCount = 0;
  const harness = createFakeTimerHarness();
  const retry = armBlockingMatchStatusPollRetry({
    intervalMs: 600_000,
    onTick: () => {
      syncCount += 1;
    },
    startPolling: () => startRgPollingInterval({
      intervalMs: 600_000,
      key: pollingKey,
      label: 'linked match status polling',
      onTick: () => {
        syncCount += 1;
      },
    }),
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });
  assert.equal(harness.timers.length, 1);

  // Effect cleanup while still waiting for the slot: the retry timer is cleared...
  retry.stop();
  assert.equal(harness.cleared.includes(harness.timers[0]), true);

  // ...and even if a straggler retry callback fires after stop (the slot is now free), it must
  // NOT acquire anything or tick — the retry is dead, zero slots leaked.
  zombie.release();
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(syncCount, 0);
  assert.equal(getActiveRgPollingSlotCount(), 0);
});
