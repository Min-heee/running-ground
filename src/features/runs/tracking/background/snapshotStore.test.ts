import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBackgroundSyncDiagnostics,
  recordBackgroundTaskStarted,
} from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import {
  commitSnapshot,
  setSnapshotState,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background/snapshotStore';

// 오너 실기기 대결 2026-08-09. The Galaxy's distance froze at ~3.05km with the screen off, yet the
// run kept reading as FRESH — because a GPS fix the filters REJECT still commits a snapshot (its
// pace/elapsed move on) and the only freshness signal was "a snapshot was committed". With
// freshness permanently true the screen-off native gap-fill could never engage, and every flush
// re-seeded the native accumulator back to the frozen JS total. Freshness must therefore track
// "are we still MEASURING", which is what lastDistanceAdvanceAtMs answers.
function snapshot(distanceKm: number): BackgroundRunTrackingSnapshot {
  return {
    status: 'running',
    route: [],
    distanceKm,
    elevationGainM: 0,
    currentPace: '06:00/km',
    startedAt: null,
  } as unknown as BackgroundRunTrackingSnapshot;
}

function resetTo(distanceKm: number) {
  setSnapshotState(snapshot(distanceKm));
}

test('a rejected fix advances the snapshot clock but NOT the distance-advance clock', () => {
  resetTo(3.05);
  recordBackgroundTaskStarted();

  const armedAt = getBackgroundSyncDiagnostics().lastDistanceAdvanceAtMs;
  assert.ok(typeof armedAt === 'number', 'the advance clock is armed when tracking starts');

  // What routeAccumulator does for a DROP acc-high fix: same distance, refreshed pace only.
  commitSnapshot({ ...snapshot(3.05), currentPace: '06:12/km' });

  const afterReject = getBackgroundSyncDiagnostics();
  assert.ok(typeof afterReject.lastSnapshotAtMs === 'number', 'we did hear from the sensor');
  assert.equal(
    afterReject.lastDistanceAdvanceAtMs,
    armedAt,
    'a fix that measured nothing must not claim the run is still measuring',
  );
});

test('an accepted fix that advances distance refreshes the distance-advance clock', () => {
  resetTo(3.05);
  recordBackgroundTaskStarted();
  const armedAt = getBackgroundSyncDiagnostics().lastDistanceAdvanceAtMs as number;

  // Guarantee an observable difference regardless of clock resolution.
  const originalNow = Date.now;
  Date.now = () => originalNow() + 5_000;
  try {
    commitSnapshot(snapshot(3.06));
  } finally {
    Date.now = originalNow;
  }

  const after = getBackgroundSyncDiagnostics();
  assert.ok(
    (after.lastDistanceAdvanceAtMs as number) > armedAt,
    'real movement must refresh the freshness signal',
  );
});

test('distance going backwards or standing still never refreshes the advance clock', () => {
  resetTo(5);
  recordBackgroundTaskStarted();
  const armedAt = getBackgroundSyncDiagnostics().lastDistanceAdvanceAtMs;

  // A cold-start route rewrite can lower the total; a stationary runner repeats it. Neither is
  // evidence that measurement is alive.
  commitSnapshot(snapshot(4.8));
  assert.equal(getBackgroundSyncDiagnostics().lastDistanceAdvanceAtMs, armedAt);

  commitSnapshot(snapshot(4.8));
  assert.equal(getBackgroundSyncDiagnostics().lastDistanceAdvanceAtMs, armedAt);
});
