import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLastFreshJsAuthoritativeKm,
  NATIVE_DISTANCE_ACCUMULATOR_OPTIONS,
  recordFreshJsAuthoritativeMeters,
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

// ---- PURE MERGE DECISION (the safety-critical helper) — FRESH-JS-WINS + native-delta-only ----

// FRESH JS WINS — when JS is fresh, the fully-filtered JS chain is authoritative, so the merge
// returns jsKm EXACTLY even when the (noisier) native total is AHEAD. This is the core of the fix:
// the over-counting native path can NEVER win an interval the JS chain already filtered. The OLD
// unconditional max() would have taken the 1.5km native total here; it no longer can.
test('resolveMergedDistanceKm returns jsKm EXACTLY when fresh, even if native is ahead (no max)', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 1.0,
    nativeMeters: 1500, // 1.5 km — would have WON under the old max()
    nativeAvailable: true,
    jsIsFresh: true,
    lastFreshJsKm: 1.0,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 1.0, 'fresh JS is authoritative — native cannot win the interval');
});

// FOREGROUND UNCHANGED: foreground is always fresh and JS is ahead, so the merge is the JS value.
test('resolveMergedDistanceKm returns jsKm when fresh and js >= native (foreground unchanged)', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 2.4,
    nativeMeters: 2000, // 2.0 km < 2.4
    nativeAvailable: true,
    jsIsFresh: true,
    lastFreshJsKm: 2.4,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 2.4);
});

// STALE → native fills the gap additively from the last fresh JS baseline. nativeMeters here is the
// last fresh JS total (3.0km) PLUS a screen-off GPS delta (→ 3.4km), so the merge advances to 3.4 —
// no freeze, no under-count while the screen is off.
test('resolveMergedDistanceKm takes the native gap-fill when STALE (screen off advances distance)', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 3.0, // frozen JS snapshot (screen off)
    nativeMeters: 3400, // last fresh JS (3.0km) + 0.4km native delta
    nativeAvailable: true,
    jsIsFresh: false,
    lastFreshJsKm: 3.0,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 3.4, 'native delta fills the screen-off gap from the last fresh baseline');
});

// NO DOUBLE-COUNT: native is seeded to the JS total, so when stale with no delta yet the native
// total equals the last fresh baseline → merges to that total, never a sum.
test('resolveMergedDistanceKm never sums (no double-count) — stale with no delta merges to baseline', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 3.0,
    nativeMeters: 3000, // == last fresh JS, no screen-off delta yet
    nativeAvailable: true,
    jsIsFresh: false,
    lastFreshJsKm: 3.0,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 3.0);
});

// FLAG OFF = jsKm: the OTA kill-switch forces the pure-JS path (today's behavior) without a rebuild,
// even when stale and native is far ahead.
test('resolveMergedDistanceKm returns jsKm exactly when the merge flag is off', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 1.0,
    nativeMeters: 9999, // would dominate if merged
    nativeAvailable: true,
    jsIsFresh: false,
    lastFreshJsKm: 1.0,
    nativeMergeEnabled: false,
  });
  assert.equal(merged, 1.0);
});

// NO-OP WHEN UNAVAILABLE: native unavailable → jsKm === today's behavior, fresh or stale.
test('resolveMergedDistanceKm returns jsKm exactly when native is unavailable', () => {
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: 1.23,
    nativeMeters: 9999,
    nativeAvailable: false,
    jsIsFresh: false,
    lastFreshJsKm: 1.23,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 1.23);
});

// NEVER A BACKWARD JUMP / NEVER A FREEZE-TO-ZERO: a smaller/zero/garbage native total when stale can
// never drag the merged value below the last fresh JS baseline (the floor).
test('resolveMergedDistanceKm never drops below the last fresh baseline for a smaller/invalid native total', () => {
  assert.equal(
    resolveMergedDistanceKm({
      jsDistanceKm: 2.0, nativeMeters: 0, nativeAvailable: true, jsIsFresh: false, lastFreshJsKm: 2.0,
    }),
    2.0,
  );
  assert.equal(
    resolveMergedDistanceKm({
      jsDistanceKm: 2.0, nativeMeters: Number.NaN, nativeAvailable: true, jsIsFresh: false, lastFreshJsKm: 2.0,
    }),
    2.0,
  );
  assert.equal(
    resolveMergedDistanceKm({
      jsDistanceKm: 2.0, nativeMeters: -500, nativeAvailable: true, jsIsFresh: false, lastFreshJsKm: 2.0,
    }),
    2.0,
  );
});

// STALE with no explicit baseline → floors to the (frozen but equal) JS total, never a drop.
test('resolveMergedDistanceKm falls back to the frozen JS total when no baseline is provided (stale)', () => {
  assert.equal(
    resolveMergedDistanceKm({
      jsDistanceKm: 2.0, nativeMeters: 0, nativeAvailable: true, jsIsFresh: false,
    }),
    2.0,
  );
});

// A negative/garbage JS total is floored to 0 so the merge can never produce a negative distance.
test('resolveMergedDistanceKm floors a non-finite jsKm to 0', () => {
  assert.equal(
    resolveMergedDistanceKm({
      jsDistanceKm: Number.NaN, nativeMeters: 0, nativeAvailable: false, jsIsFresh: true,
    }),
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

  // Screen-off / STALE: native fills the gap and can cross the goal as a live-gap floor.
  const merged = resolveMergedDistanceKm({
    jsDistanceKm: jsSnapshotKm,
    nativeMeters,
    nativeAvailable: true,
    jsIsFresh: false,
    lastFreshJsKm: jsSnapshotKm,
    nativeMergeEnabled: true,
  });
  assert.equal(merged, 5.0, 'stale merge takes the native goal-crossing total (live-gap floor)');

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

// ---- LAST-FRESH BASELINE PLUMBING (drives the stale-branch floor) ----

// The flush records the JS authoritative total on every FRESH flush; the stale merge then fills the
// gap from that baseline. This proves the recorded baseline + the stale merge advance distance
// screen-off WITHOUT freezing and WITHOUT dropping below the last fresh total.
test('last-fresh baseline + stale merge advances screen-off without freezing or dropping', () => {
  resetNativeDistanceAccumulatorForTest();

  // FRESH flush at 2.0km — recorded as the baseline.
  recordFreshJsAuthoritativeMeters(2000);
  assert.equal(getLastFreshJsAuthoritativeKm(), 2.0);

  // Fresh tick: native is (briefly) ahead at 2.05km, but FRESH JS wins → 2.0km exactly (no max).
  assert.equal(
    resolveMergedDistanceKm({
      jsDistanceKm: 2.0, nativeMeters: 2050, nativeAvailable: true, jsIsFresh: true,
      lastFreshJsKm: getLastFreshJsAuthoritativeKm(), nativeMergeEnabled: true,
    }),
    2.0,
  );

  // Screen goes OFF → JS freezes at 2.0km, native keeps accumulating its delta from the 2.0km seed.
  // The stale merge advances: 2.0 → 2.3 → 2.6 (never frozen, never below the 2.0km baseline).
  assert.equal(
    resolveMergedDistanceKm({
      jsDistanceKm: 2.0, nativeMeters: 2300, nativeAvailable: true, jsIsFresh: false,
      lastFreshJsKm: getLastFreshJsAuthoritativeKm(), nativeMergeEnabled: true,
    }),
    2.3,
  );
  assert.equal(
    resolveMergedDistanceKm({
      jsDistanceKm: 2.0, nativeMeters: 2600, nativeAvailable: true, jsIsFresh: false,
      lastFreshJsKm: getLastFreshJsAuthoritativeKm(), nativeMergeEnabled: true,
    }),
    2.6,
  );

  // A momentary native read BELOW the baseline cannot drag the distance backward (no freeze-to-zero).
  assert.equal(
    resolveMergedDistanceKm({
      jsDistanceKm: 2.0, nativeMeters: 1000, nativeAvailable: true, jsIsFresh: false,
      lastFreshJsKm: getLastFreshJsAuthoritativeKm(), nativeMergeEnabled: true,
    }),
    2.0,
  );

  // A new run clears the baseline so it cannot floor off a previous run's total.
  resetNativeDistanceAccumulatorForTest();
  assert.equal(getLastFreshJsAuthoritativeKm(), 0);
});

// ---- STEP 4: NEW WIRE-FORMAT FIELDS ON THE NATIVE OPTIONS (OTA-safe) ----

// The native options object carries the full filter chain so the native build can mirror JS exactly.
// A binary that predates these fields ignores the extra keys (OTA-safe); this just locks the wire.
test('NATIVE_DISTANCE_ACCUMULATOR_OPTIONS carries the new step-4 wire-format fields', () => {
  const options = NATIVE_DISTANCE_ACCUMULATOR_OPTIONS;
  assert.equal(options.minTimeDeltaMs, 900);
  assert.equal(options.teleportMaxSpeedMps, 5.8);
  assert.equal(options.teleportAccuracyScale, 1.8);
  // Cold-start gate mirrors the (now tightened) JS constants.
  assert.equal(options.coldStartStableFixCount, 3);
  assert.equal(options.coldStartMaxClusterRadiusMeters, 30);
  assert.equal(options.coldStartMaxAccuracyMeters, 20);
  assert.equal(options.coldStartMaxWindowMs, 10_000);
  // The tightened tracking-accuracy + distance-gate base flow through too.
  assert.equal(options.maxAccuracyMeters, 40);
  assert.equal(options.distanceGateBaseMeters, 3.0);
});
