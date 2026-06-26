import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NATIVE_DISTANCE_ACCUMULATOR_OPTIONS,
  resetNativeDistanceAccumulatorForTest,
  resolveMergedDistanceKm,
  startNativeDistanceAccumulator,
  stopNativeDistanceAccumulator,
} from '@/features/runs/tracking/background/distanceAccumulatorController';
import { resolveBackgroundHeartbeatStatus } from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import { MATCH_GOAL_DISTANCE_TOLERANCE_KM } from '@/features/runs/sync/matchProgressSync';

type FakeNativeModule = {
  isNativeDistanceAccumulatorAvailable(): boolean;
  startDistanceAccumulator(options: typeof NATIVE_DISTANCE_ACCUMULATOR_OPTIONS): boolean;
  seedDistanceAccumulator(startMeters: number): void;
  getAccumulatedDistanceMeters(): number;
  resetDistanceAccumulator(): void;
  stopDistanceAccumulator(): void;
};

type Recorder = {
  startCalls: (typeof NATIVE_DISTANCE_ACCUMULATOR_OPTIONS)[];
  seedCalls: number[];
  stopCalls: number;
  resetCalls: number;
};

function buildFakeModule(available: boolean): { module: FakeNativeModule; recorder: Recorder } {
  const recorder: Recorder = { startCalls: [], seedCalls: [], stopCalls: 0, resetCalls: 0 };
  const module: FakeNativeModule = {
    isNativeDistanceAccumulatorAvailable: () => available,
    startDistanceAccumulator: (options) => {
      recorder.startCalls.push(options);
      return true;
    },
    seedDistanceAccumulator: (startMeters) => {
      recorder.seedCalls.push(startMeters);
    },
    getAccumulatedDistanceMeters: () => 0,
    resetDistanceAccumulator: () => {
      recorder.resetCalls += 1;
    },
    stopDistanceAccumulator: () => {
      recorder.stopCalls += 1;
    },
  };
  return { module, recorder };
}

// ---- PURE MERGE DECISION (the safety-critical helper) ----

// max(js, native): when native is ahead (screen-off advance JS missed), the merge takes the native
// total — this is the whole point of the feature.
test('resolveMergedDistanceKm takes the larger of js and native when both enabled and available', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 1.0,
    nativeMeters: 1500, // 1.5 km
    nativeAvailable: true,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 1.5);
});

// FOREGROUND UNCHANGED: when JS is ahead (foreground, JS pipeline authoritative), max() === jsKm so
// the foreground path is byte-for-byte the JS value.
test('resolveMergedDistanceKm returns jsKm when js >= native (foreground unchanged)', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 2.4,
    nativeMeters: 2000, // 2.0 km < 2.4
    nativeAvailable: true,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 2.4);
});

// NO DOUBLE-COUNT: native is seeded to the JS total, so an equal native total merges to the SAME
// value (max of two equal same-origin totals) — never a sum.
test('resolveMergedDistanceKm never sums (no double-count) — equal totals merge to that total', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 3.0,
    nativeMeters: 3000, // 3.0 km == js
    nativeAvailable: true,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 3.0);
});

// FLAG OFF = jsKm: the OTA kill-switch forces the pure-JS path (today's behavior) without a rebuild.
test('resolveMergedDistanceKm returns jsKm exactly when the merge flag is off', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 1.0,
    nativeMeters: 9999, // would dominate if merged
    nativeAvailable: true,
    nativeMergeEnabled: false,
  });
  assert.equal(merged, 1.0);
});

// NO-OP WHEN UNAVAILABLE: native unavailable → max(jsKm, 0) === jsKm === today's behavior.
test('resolveMergedDistanceKm returns jsKm exactly when native is unavailable', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 1.23,
    nativeMeters: 9999,
    nativeAvailable: false,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 1.23);
});

// NEVER A BACKWARD JUMP: a smaller/zero/garbage native total can never drag the merged value below
// the JS total.
test('resolveMergedDistanceKm never drops below jsKm for a smaller or invalid native total', () => {
  assert.equal(
    resolveMergedDistanceKm({ jsDistanceKm: 2.0, nativeMeters: 0, nativeAvailable: true }),
    2.0,
  );
  assert.equal(
    resolveMergedDistanceKm({ jsDistanceKm: 2.0, nativeMeters: Number.NaN, nativeAvailable: true }),
    2.0,
  );
  assert.equal(
    resolveMergedDistanceKm({ jsDistanceKm: 2.0, nativeMeters: -500, nativeAvailable: true }),
    2.0,
  );
});

// A negative/garbage JS total is floored to 0 so the merge can never produce a negative distance.
test('resolveMergedDistanceKm floors a non-finite jsKm to 0', () => {
  assert.equal(
    resolveMergedDistanceKm({ jsDistanceKm: Number.NaN, nativeMeters: 0, nativeAvailable: false }),
    0,
  );
});

// ---- LIFECYCLE WIRING (start/seed/stop), no-op when unavailable ----

// SEED ALIGNMENT: start hands the JS filter constants AND immediately seeds the native total to the
// JS authoritative total at that instant, so native and JS share one origin.
test('startNativeDistanceAccumulator starts with the JS filter constants and seeds the JS total', async () => {
  resetNativeDistanceAccumulatorForTest();
  const { module, recorder } = buildFakeModule(true);

  const started = await startNativeDistanceAccumulator('m-1', 1234, async () => module);

  assert.equal(started, true);
  assert.equal(recorder.startCalls.length, 1);
  assert.deepEqual(recorder.startCalls[0], NATIVE_DISTANCE_ACCUMULATOR_OPTIONS);
  // Seeded to the JS total at start (one origin).
  assert.deepEqual(recorder.seedCalls, [1234]);

  await stopNativeDistanceAccumulator(async () => module);
});

// IDEMPOTENT FOR THE SAME MATCH: a re-start just re-seeds (keeps native aligned) without restarting
// the GPS session.
test('startNativeDistanceAccumulator re-seeds (no restart) for the same match', async () => {
  resetNativeDistanceAccumulatorForTest();
  const { module, recorder } = buildFakeModule(true);

  await startNativeDistanceAccumulator('m-1', 1000, async () => module);
  await startNativeDistanceAccumulator('m-1', 1800, async () => module);

  assert.equal(recorder.startCalls.length, 1, 'GPS session not restarted for the same match');
  assert.deepEqual(recorder.seedCalls, [1000, 1800], 'baseline re-seeded to the fresh JS total');

  await stopNativeDistanceAccumulator(async () => module);
});

// NO-OP WHEN UNAVAILABLE: every lifecycle call no-ops on a binary lacking the native fns.
test('startNativeDistanceAccumulator is a no-op (returns false) when unavailable', async () => {
  resetNativeDistanceAccumulatorForTest();
  const { module, recorder } = buildFakeModule(false);

  const started = await startNativeDistanceAccumulator('m-1', 1000, async () => module);

  assert.equal(started, false);
  assert.equal(recorder.startCalls.length, 0);
  assert.equal(recorder.seedCalls.length, 0);
});

test('stopNativeDistanceAccumulator is a no-op (returns false) when unavailable', async () => {
  resetNativeDistanceAccumulatorForTest();
  const { module, recorder } = buildFakeModule(false);

  const stopped = await stopNativeDistanceAccumulator(async () => module);

  assert.equal(stopped, false);
  assert.equal(recorder.stopCalls, 0);
});

test('stopNativeDistanceAccumulator stops the native consumer when available', async () => {
  resetNativeDistanceAccumulatorForTest();
  const { module, recorder } = buildFakeModule(true);

  await startNativeDistanceAccumulator('m-1', 500, async () => module);
  const stopped = await stopNativeDistanceAccumulator(async () => module);

  assert.equal(stopped, true);
  assert.equal(recorder.stopCalls, 1);
});

// NO-OP WHEN NO MODULE RESOLVES (Expo Go / web / old binary): start returns false, no throw.
test('startNativeDistanceAccumulator no-ops when no native module resolves', async () => {
  resetNativeDistanceAccumulatorForTest();
  const started = await startNativeDistanceAccumulator('m-1', 1000, async () => null);
  assert.equal(started, false);
});

// ---- COMPETITIVE-INTEGRITY: FINISH FROM JS ONLY ----

// COMPETITIVE-INTEGRITY GUARD — the finish status must come from the JS snapshot ONLY, never the
// merged distance. The native accumulator omits some JS jitter filters and can OVER-COUNT, so if the
// merged distance fed the finish status, a native goal-crossing while the JS pipeline lags could flip
// a runner to 'finished' BEFORE they actually reached the goal (a premature/unfair finish). This
// asserts the helper-level contract that drives the flush: status derives from the JS snapshot.
test('finish status comes from the JS snapshot, never the merged distance (native over-count cannot finish)', () => {
  const goalKm = 5;
  const jsSnapshotKm = 4.8; // JS frozen while screen-off, clearly under the goal
  const nativeMeters = 5000; // native OVER-COUNTED screen-off to the goal (jitter, missing filters)

  const merged = resolveMergedDistanceKm({
    jsDistanceKm: jsSnapshotKm,
    nativeMeters,
    nativeAvailable: true,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 5.0, 'merge takes the native goal-crossing total (live-gap floor)');

  // The OLD (vulnerable) wiring derived the status from the merged value → 'finished' prematurely.
  assert.equal(
    resolveBackgroundHeartbeatStatus(merged, goalKm),
    'finished',
    'merged-distance status WOULD be a premature finish — which is why the flush no longer uses it',
  );

  // The fixed wiring derives the status from the JS snapshot ONLY → still running, no premature
  // finish from native over-count.
  assert.equal(
    resolveBackgroundHeartbeatStatus(jsSnapshotKm, goalKm),
    'running',
    'JS-snapshot status stays running — native over-count cannot flip the finish',
  );

  // A legit finish: once the JS snapshot itself crosses the goal-tolerance, the status is finished.
  assert.equal(
    resolveBackgroundHeartbeatStatus(goalKm - MATCH_GOAL_DISTANCE_TOLERANCE_KM, goalKm),
    'finished',
  );
});
