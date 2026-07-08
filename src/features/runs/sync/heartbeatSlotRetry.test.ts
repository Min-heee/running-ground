import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HEARTBEAT_SLOT_STEAL_STALL_MS,
  armHeartbeatSlotAcquireRetry,
} from '@/features/runs/sync/heartbeatSlotRetry';
import { buildMatchProgressRegistryKey } from '@/features/runs/sync/registryKeys';
import {
  acquireRgHeartbeatSlot,
  canUseRgHeartbeatSlot,
  evictRgHeartbeatSlot,
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

// STALE-OWNER STEAL scenarios — the LIVE silent holder (frozen ghost whose target collapsed via
// a non-render ref mutation) never releases and never sends, so the retry alone can never win.
// These tests exercise the steal gates against the REAL rgHeartbeatRegistry: armed-window +
// stale push-activity stamp + viable sender → exactly one evict + same-tick re-acquire.

type StealHarnessOptions = {
  heartbeatKey: string;
  getLastPushActivityAtMs: () => number | null;
  isViableSender: () => boolean;
  nowFn: () => number;
};

function armStealRetryHarness({ heartbeatKey, getLastPushActivityAtMs, isViableSender, nowFn }: StealHarnessOptions) {
  const timerHarness = createFakeTimerHarness();
  const state = {
    catchUpCount: 0,
    evictCount: 0,
    ownerRefSets: [] as number[],
    ownerRefSetBeforeCatchUp: null as boolean | null,
    stolenContexts: [] as { evictedAfterMs: number }[],
    teardownRuns: 0,
  };
  const retry = armHeartbeatSlotAcquireRetry({
    intervalMs: 2_500,
    acquireSlot: () => acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat', {
      cadence: 'on tracking tick',
      heartbeatKey,
    }),
    onReacquired: (slot) => {
      state.ownerRefSets.push(slot.ownerId);
      return () => {
        state.teardownRuns += 1;
      };
    },
    onCatchUp: () => {
      state.ownerRefSetBeforeCatchUp = state.ownerRefSets.length > 0;
      state.catchUpCount += 1;
    },
    steal: {
      stallMs: HEARTBEAT_SLOT_STEAL_STALL_MS,
      getLastPushActivityAtMs,
      isViableSender,
      evict: () => {
        state.evictCount += 1;
        evictRgHeartbeatSlot(heartbeatKey, { heartbeatKey });
      },
      onStolen: (context) => {
        state.stolenContexts.push(context);
      },
    },
    clearIntervalFn: timerHarness.clearIntervalFn,
    setIntervalFn: timerHarness.setIntervalFn,
    nowFn,
  });

  return { retry, state, timerHarness };
}

// (a) A fresh push-activity stamp means SOMEONE is pushing — never evict, never steal, no matter
// how long the retry has been armed. This protects a healthy owner whose sends are flowing.
test('heartbeat slot steal never fires while the push-activity stamp is fresh', async () => {
  resetRgHeartbeatRegistryForTest();
  const heartbeatKey = buildMatchProgressRegistryKey('duel-match-steal-fresh-stamp');
  const holder = acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat');
  assert.equal(holder.acquired, true);

  let nowMs = 50_000;
  const { retry, state, timerHarness } = armStealRetryHarness({
    heartbeatKey,
    // The stamp always reads as ~1s old — a healthy pusher is landing on the HTTP layer.
    getLastPushActivityAtMs: () => nowMs - 1_000,
    isViableSender: () => true,
    nowFn: () => nowMs,
  });

  // Many ticks far past the armed stall window: the fresh stamp alone must block the steal.
  for (let tick = 0; tick < 40; tick += 1) {
    nowMs += 2_500;
    timerHarness.timers[0].callback();
    await Promise.resolve();
  }
  assert.equal(state.evictCount, 0);
  assert.equal(state.stolenContexts.length, 0);
  assert.equal(state.catchUpCount, 0);
  assert.equal(state.ownerRefSets.length, 0);
  // The original owner still holds the slot and still passes the send gate.
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, holder.ownerId), true);

  retry.stop();
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);
  holder.release();
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
});

// (b)+(f)+(g) The silent-live-holder signature: stale stamp + viable latched loser → exactly one
// evict after the stall window, win-path bookkeeping BEFORE exactly one catch-up, duplicate
// acquires blocked by the NEW owner, the OLD owner's release a no-op, stragglers no-ops.
test('heartbeat slot steal evicts a silent live holder and rebinds ownership atomically', async () => {
  resetRgHeartbeatRegistryForTest();
  const heartbeatKey = buildMatchProgressRegistryKey('duel-match-steal-silent-holder');
  const ghost = acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat');
  assert.equal(ghost.acquired, true);

  let nowMs = 100_000;
  const armedAtMs = nowMs;
  // Stamped once around arm time, then silent forever — nobody's pushes reach the HTTP layer.
  const staleStampMs = nowMs;
  const { retry, state, timerHarness } = armStealRetryHarness({
    heartbeatKey,
    getLastPushActivityAtMs: () => staleStampMs,
    isViableSender: () => true,
    nowFn: () => nowMs,
  });

  // Inside the stall window (2.5s ticks up to exactly stallMs): fail-and-wait, no steal yet.
  while (nowMs - armedAtMs < HEARTBEAT_SLOT_STEAL_STALL_MS) {
    nowMs = Math.min(nowMs + 2_500, armedAtMs + HEARTBEAT_SLOT_STEAL_STALL_MS);
    timerHarness.timers[0].callback();
    await Promise.resolve();
  }
  assert.equal(state.evictCount, 0);
  assert.equal(state.stolenContexts.length, 0);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, ghost.ownerId), true);

  // First tick past the window: exactly one evict + same-tick re-acquire + bookkeeping-then-catch-up.
  nowMs = armedAtMs + HEARTBEAT_SLOT_STEAL_STALL_MS + 1;
  timerHarness.timers[0].callback();
  await Promise.resolve();
  assert.equal(state.evictCount, 1);
  assert.deepEqual(state.stolenContexts, [{ evictedAfterMs: HEARTBEAT_SLOT_STEAL_STALL_MS + 1 }]);
  assert.equal(state.ownerRefSets.length, 1);
  assert.equal(state.catchUpCount, 1);
  assert.equal(state.ownerRefSetBeforeCatchUp, true);
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);
  // Ownership swapped: the NEW owner passes the send gate, the evicted ghost no longer does,
  // and a fresh duplicate acquire is blocked by the NEW ownerId.
  const newOwnerId = state.ownerRefSets[0];
  assert.notEqual(newOwnerId, ghost.ownerId);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, newOwnerId), true);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, ghost.ownerId), false);
  const duplicateAfterSteal = acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat');
  assert.equal(duplicateAfterSteal.acquired, false);
  assert.equal(duplicateAfterSteal.ownerId, newOwnerId);
  // The retry timer was stopped by the win path.
  assert.equal(timerHarness.cleared.includes(timerHarness.timers[0]), true);

  // (f) The OLD owner's late release is a no-op against the real registry: the new owner
  // still holds the slot and the send gate is unchanged.
  ghost.release();
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, newOwnerId), true);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, undefined), false);

  // (g) A straggler tick after the win is a no-op — no second evict, no extra catch-up.
  nowMs += 2_500;
  timerHarness.timers[0].callback();
  await Promise.resolve();
  assert.equal(state.evictCount, 1);
  assert.equal(state.catchUpCount, 1);
  assert.equal(state.ownerRefSets.length, 1);

  retry.stop();
  assert.equal(state.teardownRuns, 1);
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
});

// (c) SAFETY INVARIANT — a NON-viable instance must never steal, no matter how stale the stamp:
// the ghost's own retry interval also keeps ticking (frozen trees still fire timers), and letting
// it evict a healthy-but-momentarily-quiet owner would recreate the exact bug this fixes
// (owners have no retry loop, so a stolen-from healthy owner goes permanently silent).
test('heartbeat slot steal never fires for a non-viable sender even with a stale stamp', async () => {
  resetRgHeartbeatRegistryForTest();
  const heartbeatKey = buildMatchProgressRegistryKey('duel-match-steal-not-viable');
  const holder = acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat');
  assert.equal(holder.acquired, true);

  let nowMs = 200_000;
  const staleStampMs = nowMs;
  const { retry, state, timerHarness } = armStealRetryHarness({
    heartbeatKey,
    getLastPushActivityAtMs: () => staleStampMs,
    // This retry belongs to a ghost: its own match target resolves null.
    isViableSender: () => false,
    nowFn: () => nowMs,
  });

  for (let tick = 0; tick < 40; tick += 1) {
    nowMs += 2_500;
    timerHarness.timers[0].callback();
    await Promise.resolve();
  }
  assert.equal(state.evictCount, 0);
  assert.equal(state.stolenContexts.length, 0);
  assert.equal(state.catchUpCount, 0);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, holder.ownerId), true);

  retry.stop();
  holder.release();
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
});

// (d) A null stamp (no push attempt this app session yet) does NOT bypass the stall window: the
// armed-at clock alone gates the steal, so a fresh arm still waits the full window before evicting.
test('heartbeat slot steal with a null stamp waits for the armed stall window', async () => {
  resetRgHeartbeatRegistryForTest();
  const heartbeatKey = buildMatchProgressRegistryKey('duel-match-steal-null-stamp');
  const holder = acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat');
  assert.equal(holder.acquired, true);

  let nowMs = 300_000;
  const armedAtMs = nowMs;
  const { retry, state, timerHarness } = armStealRetryHarness({
    heartbeatKey,
    getLastPushActivityAtMs: () => null,
    isViableSender: () => true,
    nowFn: () => nowMs,
  });

  // At exactly armedAt + stallMs: still no steal (the window must be EXCEEDED).
  nowMs = armedAtMs + HEARTBEAT_SLOT_STEAL_STALL_MS;
  timerHarness.timers[0].callback();
  await Promise.resolve();
  assert.equal(state.evictCount, 0);
  assert.equal(state.stolenContexts.length, 0);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, holder.ownerId), true);

  // One ms past the window: the viable latched loser steals the slot.
  nowMs = armedAtMs + HEARTBEAT_SLOT_STEAL_STALL_MS + 1;
  timerHarness.timers[0].callback();
  await Promise.resolve();
  assert.equal(state.evictCount, 1);
  assert.equal(state.ownerRefSets.length, 1);
  assert.equal(state.catchUpCount, 1);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, state.ownerRefSets[0]), true);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, holder.ownerId), false);

  retry.stop();
  assert.equal(state.teardownRuns, 1);
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
});

// (e) stop() before the stall window: no evict ever happens and no timers stay live — even a
// straggler tick that fires after stop (past the window, stamp stale, viable) is dead.
test('heartbeat slot steal never evicts after stop', async () => {
  resetRgHeartbeatRegistryForTest();
  const heartbeatKey = buildMatchProgressRegistryKey('duel-match-steal-stopped');
  const holder = acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat');
  assert.equal(holder.acquired, true);

  let nowMs = 400_000;
  const armedAtMs = nowMs;
  const { retry, state, timerHarness } = armStealRetryHarness({
    heartbeatKey,
    getLastPushActivityAtMs: () => null,
    isViableSender: () => true,
    nowFn: () => nowMs,
  });

  // Stopped before the window ever elapses: the timer is cleared immediately.
  retry.stop();
  assert.equal(timerHarness.cleared.includes(timerHarness.timers[0]), true);

  // A straggler callback far past the window must not evict, acquire, or send.
  nowMs = armedAtMs + HEARTBEAT_SLOT_STEAL_STALL_MS * 3;
  timerHarness.timers[0].callback();
  await Promise.resolve();
  assert.equal(state.evictCount, 0);
  assert.equal(state.stolenContexts.length, 0);
  assert.equal(state.catchUpCount, 0);
  assert.equal(state.ownerRefSets.length, 0);
  assert.equal(canUseRgHeartbeatSlot(heartbeatKey, holder.ownerId), true);
  assert.equal(getActiveRgHeartbeatSlotCount(), 1);

  holder.release();
  assert.equal(getActiveRgHeartbeatSlotCount(), 0);
});
