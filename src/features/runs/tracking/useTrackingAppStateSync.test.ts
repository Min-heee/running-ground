import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTrackingAppStateSyncPlan,
  shouldRunBackgroundElapsedTicker,
} from './trackingAppStatePolicy';
import type { BackgroundRunTrackingSnapshot } from './background';

function snapshot(overrides: Partial<BackgroundRunTrackingSnapshot> = {}): BackgroundRunTrackingSnapshot {
  return {
    accumulatedPausedMs: 0,
    currentPace: '--:--/km',
    distanceKm: 0,
    elevationGainM: 0,
    pausedAt: null,
    route: [],
    startedAt: '2026-05-23T00:00:00.000Z',
    status: 'running',
    ...overrides,
  };
}

test('tracking app state sync plans active running state as foreground location sync', () => {
  const plan = resolveTrackingAppStateSyncPlan({
    nextState: 'active',
    previousState: 'background',
    trackerStatus: 'running',
  });

  assert.equal(plan.locationTaskAppState, 'active');
  assert.equal(plan.locationTaskDelayMs, 0);
  assert.equal(plan.lifecycleStatus, 'running');
  assert.equal(plan.shouldSyncBackgroundSnapshot, true);
  assert.equal(plan.shouldRefreshStaleArtifacts, true);
});

test('tracking app state sync does not start location task while idle on active foreground', () => {
  const plan = resolveTrackingAppStateSyncPlan({
    nextState: 'active',
    previousState: 'background',
    trackerStatus: 'idle',
  });

  assert.equal(plan.locationTaskAppState, null);
  assert.equal(plan.locationTaskDelayMs, null);
  assert.equal(plan.lifecycleStatus, null);
  assert.equal(plan.shouldSyncBackgroundSnapshot, true);
  assert.equal(plan.shouldRefreshStaleArtifacts, true);
});

test('tracking app state sync plans background transition only from active running state', () => {
  const plan = resolveTrackingAppStateSyncPlan({
    nextState: 'background',
    previousState: 'active',
    trackerStatus: 'running',
  });

  assert.equal(plan.locationTaskAppState, 'background');
  assert.equal(plan.locationTaskDelayMs, 400);
  assert.equal(plan.lifecycleStatus, 'background');
  assert.equal(plan.shouldSyncBackgroundSnapshot, false);
});

test('tracking app state sync ignores repeated background state without running foreground handoff', () => {
  const plan = resolveTrackingAppStateSyncPlan({
    nextState: 'background',
    previousState: 'inactive',
    trackerStatus: 'running',
  });

  assert.equal(plan.locationTaskAppState, null);
  assert.equal(plan.locationTaskDelayMs, null);
  assert.equal(plan.lifecycleStatus, null);
  assert.equal(plan.shouldSyncBackgroundSnapshot, false);
});

test('background elapsed ticker runs for non-warmup running snapshots by default', () => {
  assert.equal(shouldRunBackgroundElapsedTicker(snapshot()), true);
});

test('background elapsed ticker can be disabled by focus gate', () => {
  assert.equal(shouldRunBackgroundElapsedTicker(snapshot(), { enabled: false }), false);
});

test('background elapsed ticker does not run for warmup or non-running snapshots', () => {
  assert.equal(shouldRunBackgroundElapsedTicker(snapshot({ startedAt: null })), false);
  assert.equal(shouldRunBackgroundElapsedTicker(snapshot({ status: 'paused' })), false);
});
