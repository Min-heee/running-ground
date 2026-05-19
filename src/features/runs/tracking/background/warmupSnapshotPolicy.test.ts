import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWarmupBaselineSnapshot,
  buildWarmupLocationSnapshot,
  isBackgroundRunWarmupSnapshot,
} from '@/features/runs/tracking/background/warmupSnapshotPolicy';
import {
  INITIAL_SNAPSHOT,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background/snapshotStore';

function snapshot(overrides: Partial<BackgroundRunTrackingSnapshot>): BackgroundRunTrackingSnapshot {
  return {
    ...INITIAL_SNAPSHOT,
    ...overrides,
  };
}

test('warmup snapshot keeps elapsed and distance baseline unset before countdown completes', () => {
  const warmup = snapshot({
    status: 'running',
    startedAt: null,
    route: [{
      latitude: 37,
      longitude: 127,
      timestamp: new Date(1_000).toISOString(),
    }],
    distanceKm: 0.2,
    elevationGainM: 4,
    currentPace: '5:30/km',
  });

  const nextSnapshot = buildWarmupLocationSnapshot(warmup);

  assert.equal(isBackgroundRunWarmupSnapshot(warmup), true);
  assert.deepEqual(nextSnapshot, {
    ...warmup,
    route: [],
    distanceKm: 0,
    elevationGainM: 0,
    currentPace: '--:--/km',
  });
});

test('warmup baseline commit starts recording from the commit timestamp', () => {
  const warmup = snapshot({
    status: 'running',
    startedAt: null,
    route: [{
      latitude: 37,
      longitude: 127,
      timestamp: new Date(1_000).toISOString(),
    }],
    distanceKm: 0.2,
    elevationGainM: 4,
    currentPace: '5:30/km',
  });

  const nextSnapshot = buildWarmupBaselineSnapshot(warmup, 5_000);

  assert.deepEqual(nextSnapshot, {
    ...warmup,
    route: [],
    distanceKm: 0,
    elevationGainM: 0,
    currentPace: '--:--/km',
    startedAt: new Date(5_000).toISOString(),
    pausedAt: null,
    accumulatedPausedMs: 0,
  });
});

test('warmup snapshot policy is a no-op for already started tracking', () => {
  const started = snapshot({
    status: 'running',
    startedAt: new Date(2_000).toISOString(),
  });

  assert.equal(isBackgroundRunWarmupSnapshot(started), false);
  assert.equal(buildWarmupLocationSnapshot(started), null);
  assert.equal(buildWarmupBaselineSnapshot(started, 5_000), null);
});
