import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTrackingAppStateSyncPlan } from './trackingAppStatePolicy';

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
