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
// pace/elapsed move on) and the only freshness signal was "a snapshot was committed". Freshness
// must instead track "are we still MEASURING", which is what lastDistanceAdvanceAtMs answers.
//
// NOTE: the consumer (backgroundMatchProgressSync.buildRunningProgressInput) is currently gated OFF
// behind ENABLE_DISTANCE_ADVANCE_FRESHNESS until a native binary carries the signal-loss gap rule.
// These tests pin the SIGNAL, which is what the gate will switch on.
//
// Every assertion below pins the clock explicitly. Without that, recordBackgroundTaskStarted() and
// commitSnapshot() call Date.now() microseconds apart and land in the SAME millisecond, so an
// implementation that stamps on every commit still satisfies `=== armedAt` — 적대 검증 2026-08-09
// measured that mutant surviving ~95% of runs.
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

// Run `body` with Date.now() pinned to `atMs` so a stamp is attributable to an exact instant.
function atClock<T>(atMs: number, body: () => T): T {
  const originalNow = Date.now;
  Date.now = () => atMs;
  try {
    return body();
  } finally {
    Date.now = originalNow;
  }
}

const ARMED_AT = 1_700_000_000_000;
const LATER = ARMED_AT + 5_000;

function armAt(distanceKm: number) {
  setSnapshotState(snapshot(distanceKm));
  atClock(ARMED_AT, recordBackgroundTaskStarted);
  assert.equal(
    getBackgroundSyncDiagnostics().lastDistanceAdvanceAtMs,
    ARMED_AT,
    'the advance clock is armed when tracking starts',
  );
}

test('a rejected fix advances the snapshot clock but NOT the distance-advance clock', () => {
  armAt(3.05);

  // What routeAccumulator does for a DROP acc-high fix: same distance, refreshed pace only.
  atClock(LATER, () => commitSnapshot({ ...snapshot(3.05), currentPace: '06:12/km' }));

  const after = getBackgroundSyncDiagnostics();
  assert.equal(after.lastSnapshotAtMs, LATER, 'we did hear from the sensor');
  assert.equal(
    after.lastDistanceAdvanceAtMs,
    ARMED_AT,
    'a fix that measured nothing must not claim the run is still measuring',
  );
});

test('an accepted fix that advances distance refreshes the distance-advance clock', () => {
  armAt(3.05);

  atClock(LATER, () => commitSnapshot(snapshot(3.06)));

  assert.equal(
    getBackgroundSyncDiagnostics().lastDistanceAdvanceAtMs,
    LATER,
    'real movement must refresh the freshness signal',
  );
});

test('distance going backwards or standing still never refreshes the advance clock', () => {
  armAt(5);

  // A cold-start route rewrite can LOWER the total; a stationary runner repeats it. Neither is
  // evidence that measurement is alive.
  atClock(LATER, () => commitSnapshot(snapshot(4.8)));
  assert.equal(getBackgroundSyncDiagnostics().lastDistanceAdvanceAtMs, ARMED_AT, 'a lower total is not progress');

  atClock(LATER + 5_000, () => commitSnapshot(snapshot(4.8)));
  assert.equal(getBackgroundSyncDiagnostics().lastDistanceAdvanceAtMs, ARMED_AT, 'an unchanged total is not progress');
});
