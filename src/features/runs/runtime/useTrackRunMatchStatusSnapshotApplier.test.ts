import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import {
  applyGuardedMatchStatusSnapshot,
  type GuardedMatchStatusSnapshotApplyDeps,
} from '@/features/runs/runtime/useTrackRunMatchStatusSnapshotApplier';

function buildStatus(overrides: Partial<RunningMatchStatusResponse> = {}): RunningMatchStatusResponse {
  return {
    success: true,
    serverNow: '2026-07-06T00:00:10.000Z',
    mode: 'duel',
    state: 'active',
    matchId: 'duel-m1',
    distanceKm: 3,
    slotStartAt: '2026-07-06T00:00:00.000Z',
    slotLabel: '',
    paceBandLabel: '',
    levelBandLabel: '',
    criteriaSummary: '',
    estimatedWaitMinutes: 0,
    participantCount: 2,
    acceptedCount: 2,
    capacity: 2,
    userAccepted: true,
    readyToStart: true,
    // Non-terminal, so the terminal background-teardown side effect stays out of these tests.
    currentUserLiveStatus: 'running',
    ...overrides,
  };
}

function buildApplierHarness({
  duelStatus = null,
  groupStatus = null,
  forfeitedMatchIds = new Set<string>(),
}: {
  duelStatus?: RunningMatchStatusResponse | null;
  groupStatus?: RunningMatchStatusResponse | null;
  forfeitedMatchIds?: Set<string>;
} = {}) {
  const duelApplies: RunningMatchStatusResponse[] = [];
  const groupApplies: RunningMatchStatusResponse[] = [];
  const clockSyncs: (string | undefined)[] = [];
  const deps: GuardedMatchStatusSnapshotApplyDeps = {
    duelMatchStatusRef: { current: duelStatus },
    forfeitedMatchIdsRef: { current: forfeitedMatchIds },
    groupMatchStatusRef: { current: groupStatus },
    lastMatchStatusAppliedAtMsRef: { current: 0 },
    latestDuelStatusServerNowMsRef: { current: 0 },
    latestGroupStatusServerNowMsRef: { current: 0 },
    roomLinkedMatchContextRef: { current: null },
    setDuelMatchStatus: (next) => {
      duelApplies.push(next as RunningMatchStatusResponse);
    },
    setGroupMatchStatus: (next) => {
      groupApplies.push(next as RunningMatchStatusResponse);
    },
    syncServerClock: (serverNow) => {
      clockSyncs.push(serverNow);
    },
  };

  return {
    clockSyncs,
    deps,
    duelApplies,
    groupApplies,
  };
}

// Piece 2 stamp wiring — an ACCEPTED apply through the funnel advances the lifeline stamp.
test('accepted duel snapshot apply advances the lifeline stamp', () => {
  const harness = buildApplierHarness({
    duelStatus: buildStatus({ serverNow: '2026-07-06T00:00:05.000Z' }),
  });

  const beforeMs = Date.now();
  applyGuardedMatchStatusSnapshot(harness.deps, buildStatus(), { source: 'test' });

  assert.equal(harness.duelApplies.length, 1);
  assert.equal(harness.clockSyncs.length, 1);
  assert.equal(harness.deps.lastMatchStatusAppliedAtMsRef.current >= beforeMs, true);
});

test('accepted group snapshot apply advances the lifeline stamp', () => {
  const groupStatus = buildStatus({ mode: 'group', matchId: 'group-m1' });
  const harness = buildApplierHarness({ groupStatus });

  const beforeMs = Date.now();
  applyGuardedMatchStatusSnapshot(
    harness.deps,
    buildStatus({ mode: 'group', matchId: 'group-m1' }),
  );

  assert.equal(harness.groupApplies.length, 1);
  assert.equal(harness.duelApplies.length, 0);
  assert.equal(harness.deps.lastMatchStatusAppliedAtMsRef.current >= beforeMs, true);
});

// A DROPPED snapshot must NOT stamp: the whole point of the lifeline is that a channel that
// keeps dropping (or stopped delivering) leaves the stamp stale and trips the recovery fetch.
test('forfeited-match snapshot is dropped and does not advance the lifeline stamp', () => {
  const harness = buildApplierHarness({
    duelStatus: buildStatus(),
    forfeitedMatchIds: new Set(['duel-m1']),
  });

  applyGuardedMatchStatusSnapshot(harness.deps, buildStatus());

  assert.equal(harness.duelApplies.length, 0);
  assert.equal(harness.clockSyncs.length, 0);
  assert.equal(harness.deps.lastMatchStatusAppliedAtMsRef.current, 0);
});

test('stale-serverNow snapshot is dropped and does not advance the lifeline stamp', () => {
  const harness = buildApplierHarness({ duelStatus: buildStatus() });
  // The per-mode monotonic clock is already ahead of this snapshot's serverNow.
  harness.deps.latestDuelStatusServerNowMsRef.current = Date.parse('2026-07-06T00:00:20.000Z');

  applyGuardedMatchStatusSnapshot(
    harness.deps,
    buildStatus({ serverNow: '2026-07-06T00:00:10.000Z' }),
  );

  assert.equal(harness.duelApplies.length, 0);
  assert.equal(harness.deps.lastMatchStatusAppliedAtMsRef.current, 0);
});
