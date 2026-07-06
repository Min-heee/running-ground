import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireRgPollingSlot,
  getActiveRgPollingSlotCount,
  resetRgPollingRegistryForTest,
  startRgPollingInterval,
} from '@/utils/rgPollingRegistry';
import {
  markLiveMatchMounted,
  resetLiveMatchMountedRegistryForTest,
} from '@/features/runs/lifecycle/liveMatchMountedRegistry';
import { buildWaitingMatchDiscoveryRegistryKey } from '@/features/runs/sync/registryKeys';
import {
  armBlockingMatchStatusPollRetry,
  buildBlockingMatchStatusPollingKey,
  resolveBlockingMatchStatusPollIntervalMs,
  shouldSkipBlockingMatchStatusPollingForMountedMatch,
} from './useBlockingMatchStatusPolling';

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

test('blocking match status recovery polling stays singleton for the same matchId', () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-singleton');
  const first = acquireRgPollingSlot(pollingKey, 'blocking match status polling', {
    matchId: 'duel-match-singleton',
    source: 'test recovery start',
  });
  const duplicate = acquireRgPollingSlot(pollingKey, 'blocking match status polling', {
    matchId: 'duel-match-singleton',
    source: 'test duplicate recovery start',
  });

  assert.equal(first.acquired, true);
  assert.equal(duplicate.acquired, false);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  duplicate.release();
  assert.equal(getActiveRgPollingSlotCount(), 1);

  first.release();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('blocking match status recovery polling can restart after fallback success cleanup', () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-fallback');
  const recovery = acquireRgPollingSlot(pollingKey, 'blocking match status polling');
  assert.equal(recovery.acquired, true);

  recovery.release();
  assert.equal(getActiveRgPollingSlotCount(), 0);

  const restarted = acquireRgPollingSlot(pollingKey, 'blocking match status polling');
  assert.equal(restarted.acquired, true);

  restarted.release();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('blocking match status recovery polling cleanup releases on unmount', () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-unmount');
  const mountedPolling = acquireRgPollingSlot(pollingKey, 'blocking match status polling');

  assert.equal(mountedPolling.acquired, true);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  mountedPolling.release();

  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('blocking match status interval keeps one active polling owner per matchId', () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-interval-singleton');
  let tickCount = 0;

  const first = startRgPollingInterval({
    intervalMs: 10_000,
    key: pollingKey,
    label: 'blocking match status polling',
    onTick: () => {
      tickCount += 1;
    },
  });
  const duplicate = startRgPollingInterval({
    intervalMs: 10_000,
    key: pollingKey,
    label: 'blocking match status polling',
    onTick: () => {
      tickCount += 1;
    },
  });

  assert.equal(first.acquired, true);
  assert.equal(duplicate.acquired, false);
  assert.equal(getActiveRgPollingSlotCount(), 1);
  assert.equal(tickCount, 0);

  duplicate.stop();
  assert.equal(getActiveRgPollingSlotCount(), 1);

  first.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);

  const restarted = startRgPollingInterval({
    intervalMs: 10_000,
    key: pollingKey,
    label: 'blocking match status polling',
    onTick: () => {
      tickCount += 1;
    },
  });

  assert.equal(restarted.acquired, true);
  assert.equal(getActiveRgPollingSlotCount(), 1);
  restarted.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('waiting match discovery polling is keyed per mode and slot, separate from matchId polling', () => {
  resetRgPollingRegistryForTest();
  const duelSlotA = buildWaitingMatchDiscoveryRegistryKey('duel', '2026-05-14T12:00:00.000Z');
  const duelSlotB = buildWaitingMatchDiscoveryRegistryKey('duel', '2026-05-14T13:00:00.000Z');
  const groupSlotA = buildWaitingMatchDiscoveryRegistryKey('group', '2026-05-14T12:00:00.000Z');

  // Distinct slots / modes never collide with each other.
  assert.notEqual(duelSlotA, duelSlotB);
  assert.notEqual(duelSlotA, groupSlotA);
  // The waiting-discovery key namespace never collides with a matchId-keyed live poll,
  // so the discovery poll and a live poll can coexist without one starving the other.
  assert.notEqual(duelSlotA, buildBlockingMatchStatusPollingKey('2026-05-14T12:00:00.000Z'));

  const first = startRgPollingInterval({
    intervalMs: 10_000,
    key: duelSlotA,
    label: 'waiting match discovery polling',
    onTick: () => {},
  });
  const duplicate = startRgPollingInterval({
    intervalMs: 10_000,
    key: duelSlotA,
    label: 'waiting match discovery polling',
    onTick: () => {},
  });

  assert.equal(first.acquired, true);
  // A second mount for the same waiting slot reuses the singleton instead of double-polling.
  assert.equal(duplicate.acquired, false);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  first.stop();
  duplicate.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

// Bundle A2 step 8 — the UNIFIED mounted safety poll runs at IDLE cadence (never fast), so it can
// not compete with the foreground heartbeat or the linked poll. The non-mounted lobby/recovery path
// keeps its normal fast/idle cadence.
test('mounted safety poll forces idle cadence; non-mounted keeps fast/idle cadence', () => {
  const fastPollMs = 1_000;
  const idlePollMs = 5_000;

  // Mounted matched-duel/group safety poll → ALWAYS idle, even when the fast-poll signal is on.
  assert.equal(
    resolveBlockingMatchStatusPollIntervalMs({
      isMountedSafetyPoll: true,
      shouldFastPoll: true,
      fastPollMs,
      idlePollMs,
    }),
    idlePollMs,
  );
  assert.equal(
    resolveBlockingMatchStatusPollIntervalMs({
      isMountedSafetyPoll: true,
      shouldFastPoll: false,
      fastPollMs,
      idlePollMs,
    }),
    idlePollMs,
  );

  // Non-mounted (lobby/recovery) path keeps the fast-or-idle cadence.
  assert.equal(
    resolveBlockingMatchStatusPollIntervalMs({
      isMountedSafetyPoll: false,
      shouldFastPoll: true,
      fastPollMs,
      idlePollMs,
    }),
    fastPollMs,
  );
  assert.equal(
    resolveBlockingMatchStatusPollIntervalMs({
      isMountedSafetyPoll: false,
      shouldFastPoll: false,
      fastPollMs,
      idlePollMs,
    }),
    idlePollMs,
  );
});

// Bundle A2 step 8 — the mounted safety poll is SINGLE-FLIGHTED via rgPollingRegistry (keyed by
// matchId), so it can never double up with the heartbeat or the linked poll for the same match.
test('mounted safety poll is single-flighted per matchId (cannot double up)', () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-mounted-safety');
  let tickCount = 0;

  const safetyPoll = startRgPollingInterval({
    intervalMs: 5_000,
    key: pollingKey,
    label: 'blocking match status polling',
    onTick: () => {
      tickCount += 1;
    },
    detail: { source: 'mounted match safety poll' },
  });
  // A second acquirer for the SAME matchId (e.g. the linked poll / heartbeat-adjacent path) is
  // refused — only one poll runs for the match.
  const duplicate = startRgPollingInterval({
    intervalMs: 5_000,
    key: pollingKey,
    label: 'blocking match status polling',
    onTick: () => {
      tickCount += 1;
    },
    detail: { source: 'linked match via blocking status' },
  });

  assert.equal(safetyPoll.acquired, true);
  assert.equal(duplicate.acquired, false);
  assert.equal(getActiveRgPollingSlotCount(), 1);
  assert.equal(tickCount, 0);

  duplicate.stop();
  assert.equal(getActiveRgPollingSlotCount(), 1);
  safetyPoll.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

// Opponent-poll stall fix Piece 1 — a lost acquire is no longer permanently dead. The retry
// keeps re-attempting the slot at the poll cadence; once the zombie owner releases, the next
// retry tick re-acquires, fires exactly ONE immediate catch-up tick, and stops retrying.
test('blocking poll retry re-acquires after a zombie owner releases and fires one catch-up tick', async () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-retry');
  const zombie = acquireRgPollingSlot(pollingKey, 'blocking match status polling', {
    source: 'zombie owner',
  });
  assert.equal(zombie.acquired, true);

  let tickCount = 0;
  const harness = createFakeTimerHarness();
  const startPolling = () => startRgPollingInterval({
    // Real poll cadence far beyond the test lifetime — the acquired poll never ticks here, so
    // any tickCount increment can only be the retry's immediate catch-up tick.
    intervalMs: 600_000,
    key: pollingKey,
    label: 'blocking match status polling',
    onTick: () => {
      tickCount += 1;
    },
  });

  // The effect's first startRgPollingInterval loses the acquire (the zombie owns the key)...
  const initial = startPolling();
  assert.equal(initial.acquired, false);

  // ...so the retry is armed at the same cadence.
  let reacquiredOwnerId: number | null = null;
  const retry = armBlockingMatchStatusPollRetry({
    intervalMs: 600_000,
    onReacquired: (handle) => {
      reacquiredOwnerId = handle.ownerId;
    },
    onTick: () => {
      tickCount += 1;
    },
    startPolling,
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });
  assert.equal(harness.timers.length, 1);

  // While the zombie still owns the slot, retry ticks stay unacquired — no poll, no tick.
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(tickCount, 0);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  // Zombie dies (releases) → the NEXT retry tick re-acquires and fires ONE catch-up tick.
  zombie.release();
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(tickCount, 1);
  assert.notEqual(reacquiredOwnerId, null);
  assert.equal(getActiveRgPollingSlotCount(), 1);
  // The retry timer was stopped on re-acquire.
  assert.equal(harness.cleared.includes(harness.timers[0]), true);

  // A straggler retry callback after re-acquire is a no-op — no double-arm, no extra tick.
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(tickCount, 1);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  // Effect cleanup stops the live poll handle → zero slots left behind.
  retry.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('blocking poll retry cleanup before re-acquire clears the timer and acquires nothing', async () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-retry-cleanup');
  const zombie = acquireRgPollingSlot(pollingKey, 'blocking match status polling');
  assert.equal(zombie.acquired, true);

  let tickCount = 0;
  const harness = createFakeTimerHarness();
  const retry = armBlockingMatchStatusPollRetry({
    intervalMs: 600_000,
    onTick: () => {
      tickCount += 1;
    },
    startPolling: () => startRgPollingInterval({
      intervalMs: 600_000,
      key: pollingKey,
      label: 'blocking match status polling',
      onTick: () => {
        tickCount += 1;
      },
    }),
    clearIntervalFn: harness.clearIntervalFn,
    setIntervalFn: harness.setIntervalFn,
  });
  assert.equal(harness.timers.length, 1);

  // Effect cleanup while still waiting for the slot: the retry timer is cleared...
  retry.stop();
  assert.equal(harness.cleared.includes(harness.timers[0]), true);

  // ...and even if a straggler retry callback fires after stop (and the slot is now free), it
  // must NOT acquire anything or tick — the retry is dead.
  zombie.release();
  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(tickCount, 0);
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('blocking match status polling skips already mounted live match ids', () => {
  resetLiveMatchMountedRegistryForTest();

  assert.equal(
    shouldSkipBlockingMatchStatusPollingForMountedMatch({
      matchId: 'duel-match-mounted',
      mode: 'duel',
    }),
    false,
  );

  const mounted = markLiveMatchMounted({
    matchId: 'duel-match-mounted',
    mode: 'duel',
    source: 'test mount signal',
  });

  assert.equal(mounted.alreadyMounted, false);
  assert.equal(
    shouldSkipBlockingMatchStatusPollingForMountedMatch({
      matchId: 'duel-match-mounted',
      mode: 'duel',
    }),
    true,
  );
  assert.equal(
    shouldSkipBlockingMatchStatusPollingForMountedMatch({
      matchId: 'duel-match-other',
      mode: 'duel',
    }),
    false,
  );
  assert.equal(
    shouldSkipBlockingMatchStatusPollingForMountedMatch({
      matchId: 'duel-match-mounted',
      mode: 'group',
    }),
    false,
  );

  const duplicate = markLiveMatchMounted({
    matchId: 'duel-match-mounted',
    mode: 'duel',
    source: 'duplicate mount signal',
  });
  assert.equal(duplicate.alreadyMounted, true);

  resetLiveMatchMountedRegistryForTest();
  assert.equal(
    shouldSkipBlockingMatchStatusPollingForMountedMatch({
      matchId: 'duel-match-mounted',
      mode: 'duel',
    }),
    false,
  );
});
