import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';
import { applyGoalFreezeToDisplayedSnapshot } from './goalFreezeClamp';
import type { DisplayedTrackingSnapshot } from './types';

// A crossed 5km run whose save-time snapshot DRIFTED past the crossing: the slot-anchored elapsed
// kept ticking (+~5min) and GPS appended a post-goal tail (5.4km, extra route points).
function driftedSnapshot(overrides?: Partial<DisplayedTrackingSnapshot>): DisplayedTrackingSnapshot {
  return {
    route: [
      { latitude: 37.1, longitude: 127.1, timestamp: '2026-05-15T00:00:00.000Z' },
      { latitude: 37.2, longitude: 127.2, timestamp: '2026-05-15T00:10:00.000Z' },
      { latitude: 37.3, longitude: 127.3, timestamp: '2026-05-15T00:20:00.000Z' },
      { latitude: 37.4, longitude: 127.4, timestamp: '2026-05-15T00:26:40.000Z' },
      { latitude: 37.5, longitude: 127.5, timestamp: '2026-05-15T00:30:00.000Z' },
    ],
    distanceKm: 5.4,
    elevationGainM: 12,
    currentPace: '6:00/km',
    elapsedSeconds: 1_930,
    startedAt: '2026-05-15T00:00:00.000Z',
    ...overrides,
  };
}

// The at-crossing freeze: 26:46 elapsed at the measured 5.0km, crossed at 00:26:46.
function freeze(overrides?: Partial<LocalGoalFreeze>): LocalGoalFreeze {
  return {
    matchId: 'duel-freeze-clamp',
    elapsedSeconds: 1_606,
    distanceKm: 5,
    pace: '05:21/km',
    crossedAtIso: '2026-05-15T00:26:46.000Z',
    ...overrides,
  };
}

test('goal freeze clamp: min-only — drifted elapsed/distance clamp DOWN to the at-crossing values', () => {
  const clamped = applyGoalFreezeToDisplayedSnapshot(driftedSnapshot(), freeze());

  assert.equal(clamped.elapsedSeconds, 1_606, 'slot-anchored drift (1930) clamped to the crossing elapsed');
  assert.equal(clamped.distanceKm, 5, 'post-goal GPS tail (5.4) clamped to the measured-at-crossing distance');
  // Untouched fields pass through.
  assert.equal(clamped.elevationGainM, 12);
  assert.equal(clamped.currentPace, '6:00/km');
  assert.equal(clamped.startedAt, '2026-05-15T00:00:00.000Z');
});

test('goal freeze clamp: route is truncated at crossedAtIso (post-goal tail dropped)', () => {
  const clamped = applyGoalFreezeToDisplayedSnapshot(driftedSnapshot(), freeze());

  // The 00:30:00 point is after the 00:26:46 crossing → dropped; the rest stay.
  assert.equal(clamped.route.length, 4);
  assert.equal(clamped.route[clamped.route.length - 1].timestamp, '2026-05-15T00:26:40.000Z');
});

test('goal freeze clamp: keeps the full route when truncation would leave fewer than 2 points', () => {
  const snapshot = driftedSnapshot();
  // Crossing timestamp before the second point → only 1 point would remain → keep everything
  // (the route is display-only; a 1-point line would even fail the save's route guard).
  const clamped = applyGoalFreezeToDisplayedSnapshot(snapshot, freeze({ crossedAtIso: '2026-05-15T00:05:00.000Z' }));

  assert.equal(clamped.route.length, snapshot.route.length);
  assert.deepEqual(clamped.route, snapshot.route);
});

test('goal freeze clamp: no freeze is a passthrough (same snapshot reference)', () => {
  const snapshot = driftedSnapshot();

  assert.equal(applyGoalFreezeToDisplayedSnapshot(snapshot, null), snapshot);
  assert.equal(applyGoalFreezeToDisplayedSnapshot(snapshot, undefined), snapshot);
});

test('goal freeze clamp: a freeze ABOVE the displayed values is a no-op (can never inflate)', () => {
  // Anti-corruption invariant: min() only — a bogus/huge freeze must not raise anything.
  const snapshot = driftedSnapshot({ distanceKm: 4.8, elapsedSeconds: 1_500 });
  const clamped = applyGoalFreezeToDisplayedSnapshot(snapshot, freeze({
    elapsedSeconds: 2_000,
    distanceKm: 6,
    crossedAtIso: '2026-05-15T01:00:00.000Z',
  }));

  assert.equal(clamped.elapsedSeconds, 1_500);
  assert.equal(clamped.distanceKm, 4.8);
  assert.equal(clamped.route.length, snapshot.route.length, 'crossing after every point → nothing truncated');
});

test('goal freeze clamp: a forfeit snapshot below the freeze only clamps down (stays untouched)', () => {
  // Forfeit-after-crossing safety: the forfeit snapshot (shorter run) is already below the freeze
  // in both dimensions — min() must keep the forfeit values, never pull them UP to the freeze.
  const forfeitSnapshot = driftedSnapshot({
    distanceKm: 3.1,
    elapsedSeconds: 900,
    route: driftedSnapshot().route.slice(0, 3),
  });
  const clamped = applyGoalFreezeToDisplayedSnapshot(forfeitSnapshot, freeze());

  assert.equal(clamped.elapsedSeconds, 900);
  assert.equal(clamped.distanceKm, 3.1);
  assert.equal(clamped.route.length, 3, 'all points precede the crossing → route unchanged');
});

test('goal freeze clamp: an unparseable crossedAtIso keeps the route whole but still min-clamps values', () => {
  const clamped = applyGoalFreezeToDisplayedSnapshot(driftedSnapshot(), freeze({ crossedAtIso: 'not-a-date' }));

  assert.equal(clamped.route.length, driftedSnapshot().route.length);
  assert.equal(clamped.elapsedSeconds, 1_606);
  assert.equal(clamped.distanceKm, 5);
});

test('goal freeze clamp: non-finite freeze numbers never corrupt the snapshot (NaN can not propagate)', () => {
  const clamped = applyGoalFreezeToDisplayedSnapshot(driftedSnapshot(), freeze({
    elapsedSeconds: Number.NaN,
    distanceKm: Number.POSITIVE_INFINITY,
  }));

  assert.equal(clamped.elapsedSeconds, 1_930, 'NaN elapsed ignored — displayed value kept');
  assert.equal(clamped.distanceKm, 5.4, 'non-finite distance ignored — displayed value kept');
});
