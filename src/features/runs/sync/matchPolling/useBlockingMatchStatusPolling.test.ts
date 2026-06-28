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
  buildBlockingMatchStatusPollingKey,
  resolveBlockingMatchStatusPollIntervalMs,
  shouldSkipBlockingMatchStatusPollingForMountedMatch,
} from './useBlockingMatchStatusPolling';

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
