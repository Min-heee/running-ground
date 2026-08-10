import assert from 'node:assert/strict';
import test from 'node:test';
import type * as Location from 'expo-location';
import {
  appendTrackedLocation,
  getAccumulatedDistanceMeters,
  getAccumulatedElevationGainMeters,
  resetRouteAccumulator,
} from '@/features/runs/tracking/background/routeAccumulator';
import {
  INITIAL_SNAPSHOT,
  getSnapshotState,
  setSnapshotState,
} from '@/features/runs/tracking/background/snapshotStore';
import {
  MAX_CREDITABLE_FIX_GAP_MS,
  MAX_REASONABLE_RUNNING_SPEED_MPS,
  isSignalLossGapMs,
} from '@/features/runs/tracking/background/locationDistance';
import { NATIVE_DISTANCE_ACCUMULATOR_OPTIONS } from '@/features/runs/tracking/background/distanceAccumulatorController';

const BASE_LATITUDE = 37.5;
const BASE_LONGITUDE = 127;

function longitudeOffsetForMeters(meters: number, latitude = BASE_LATITUDE) {
  return meters / (111_320 * Math.cos(latitude * Math.PI / 180));
}

function latitudeOffsetForMeters(meters: number) {
  return meters / 111_320;
}

function locationAt({
  metersEast,
  metersNorth = 0,
  timestampMs,
  accuracyM = 8,
  speedMps = 2.5,
}: {
  metersEast: number;
  metersNorth?: number;
  timestampMs: number;
  accuracyM?: number;
  speedMps?: number;
}) {
  return {
    coords: {
      latitude: BASE_LATITUDE + latitudeOffsetForMeters(metersNorth),
      longitude: BASE_LONGITUDE + longitudeOffsetForMeters(metersEast),
      altitude: 15,
      accuracy: accuracyM,
      altitudeAccuracy: 4,
      heading: null,
      speed: speedMps,
    },
    timestamp: timestampMs,
  } as Location.LocationObject;
}

function locationFromCoordinate({
  latitude,
  longitude,
  timestampMs,
  accuracyM = 8,
  speedMps = 3,
}: {
  latitude: number;
  longitude: number;
  timestampMs: number;
  accuracyM?: number;
  speedMps?: number;
}) {
  return {
    coords: {
      latitude,
      longitude,
      altitude: 15,
      accuracy: accuracyM,
      altitudeAccuracy: 4,
      heading: null,
      speed: speedMps,
    },
    timestamp: timestampMs,
  } as Location.LocationObject;
}

function resetRunningSnapshot(baseMs: number) {
  resetRouteAccumulator();
  setSnapshotState({
    ...INITIAL_SNAPSHOT,
    status: 'running',
    startedAt: new Date(baseMs).toISOString(),
  });
}

test('route accumulator waits for stable cold-start fixes before anchoring distance', () => {
  const baseMs = Date.now() - 6_000;
  resetRunningSnapshot(baseMs);

  appendTrackedLocation(locationAt({ metersEast: 250, timestampMs: baseMs, speedMps: 1.5 }));
  appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: baseMs + 1_000, speedMps: 1.5 }));
  appendTrackedLocation(locationAt({ metersEast: 4, timestampMs: baseMs + 2_000, speedMps: 1.5 }));

  assert.equal(getSnapshotState().route.length, 0);
  assert.equal(getAccumulatedDistanceMeters(), 0);

  appendTrackedLocation(locationAt({ metersEast: 8, timestampMs: baseMs + 3_000, speedMps: 1.5 }));

  const snapshot = getSnapshotState();
  assert.equal(snapshot.route.length, 3);
  assert.ok(Math.abs(snapshot.route[0].longitude - BASE_LONGITUDE) < longitudeOffsetForMeters(2));
  assert.ok(getAccumulatedDistanceMeters() < 20);
});

test('route accumulator keeps normal straight-line movement after cold-start stabilization', () => {
  const baseMs = Date.now() - 7_000;
  resetRunningSnapshot(baseMs);

  // Tight warmup cluster (<= COLD_START_MAX_STABLE_CLUSTER_RADIUS_METERS = 15) anchors at the 3rd fix
  // with seed=0 (no intra-cluster path banked); the last warmup fix (8m) becomes lastCounted.
  appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: baseMs, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 4, timestampMs: baseMs + 1_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 8, timestampMs: baseMs + 2_000, speedMps: 3 }));
  // Then a clean straight run: each +12m segment is above the distance gate and is counted in full.
  appendTrackedLocation(locationAt({ metersEast: 20, timestampMs: baseMs + 3_200, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 32, timestampMs: baseMs + 4_400, speedMps: 3 }));

  const snapshot = getSnapshotState();
  assert.equal(snapshot.route.length, 5);
  // 8 -> 20 -> 32 from the anchor: ~24m of real movement counted, none under-counted.
  assert.ok(getAccumulatedDistanceMeters() >= 22);
  assert.ok(getAccumulatedDistanceMeters() <= 26);
});

test('route accumulator gates sub-threshold movement without increasing distance', () => {
  const baseMs = Date.now() - 8_000;
  resetRunningSnapshot(baseMs);

  appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: baseMs, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 4, timestampMs: baseMs + 1_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 8, timestampMs: baseMs + 2_000, speedMps: 3 }));
  // Move clearly past the anchor so lastCounted = 20m and there is real banked distance.
  appendTrackedLocation(locationAt({ metersEast: 20, timestampMs: baseMs + 3_200, speedMps: 3 }));

  const beforeGateDistanceMeters = getAccumulatedDistanceMeters();
  assert.ok(beforeGateDistanceMeters > 0);

  // A +3m wobble (< MIN_MOVEMENT_DISTANCE_METERS = 5.0) is rejected as sub-noise jitter — it adds
  // NOTHING and is not even appended to the route. This is the raised 5m noise floor at work.
  appendTrackedLocation(locationAt({
    metersEast: 23,
    timestampMs: baseMs + 4_400,
    accuracyM: 20,
    speedMps: 3,
  }));

  const snapshot = getSnapshotState();
  assert.equal(snapshot.route.length, 4);
  assert.equal(getAccumulatedDistanceMeters(), beforeGateDistanceMeters);
});

test('route accumulator adds displacement from the last counted point once the gate is crossed', () => {
  const baseMs = Date.now() - 9_000;
  resetRunningSnapshot(baseMs);

  appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: baseMs, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 4, timestampMs: baseMs + 1_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 8, timestampMs: baseMs + 2_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 20, timestampMs: baseMs + 3_200, speedMps: 3 }));

  const beforeGateDistanceMeters = getAccumulatedDistanceMeters();

  // A +3m wobble is rejected as sub-noise (not even routed), then a real segment to 33m is counted as
  // the displacement FROM THE LAST COUNTED POINT (20m, not the dropped wobble at 23m): 33 - 20 = 13m.
  appendTrackedLocation(locationAt({
    metersEast: 23,
    timestampMs: baseMs + 4_400,
    accuracyM: 20,
    speedMps: 3,
  }));
  appendTrackedLocation(locationAt({
    metersEast: 33,
    timestampMs: baseMs + 5_600,
    accuracyM: 20,
    speedMps: 3,
  }));

  const snapshot = getSnapshotState();
  const addedDistanceMeters = getAccumulatedDistanceMeters() - beforeGateDistanceMeters;
  assert.equal(snapshot.route.length, 5);
  // Displacement measured from the last COUNTED point (20m), so the gated 23m wobble does not shorten
  // it: 33 - 20 = 13m added, NOT 33 - 23 = 10m. Real movement is never under-counted.
  assert.ok(addedDistanceMeters >= 12);
  assert.ok(addedDistanceMeters <= 14);
});

test('route accumulator collapses small cold-start GPS loops before normal movement', () => {
  const baseMs = Date.now() - 12_000;
  resetRunningSnapshot(baseMs);

  const startLoopCoordinates = [
    [37.565112, 126.981717],
    [37.565112, 126.981717],
    [37.565084, 126.981728],
    [37.565071, 126.981770],
    [37.565111, 126.981790],
    [37.565092, 126.981740],
    [37.565055, 126.981714],
    [37.565011, 126.981677],
    [37.564972, 126.981648],
    [37.564922, 126.981623],
  ];

  startLoopCoordinates.forEach(([latitude, longitude], index) => {
    appendTrackedLocation(locationFromCoordinate({
      latitude,
      longitude,
      timestampMs: baseMs + index * 1_000,
    }));
  });

  const snapshot = getSnapshotState();
  assert.ok(getAccumulatedDistanceMeters() < 30);
  assert.ok(snapshot.route.length <= 6);
  assert.equal(
    snapshot.route.some((point) => point.longitude > 126.981750),
    false,
  );
});

test('route accumulator collapses mid-run lateral GPS jitter on a straight road', () => {
  const baseMs = Date.now() - 14_000;
  resetRunningSnapshot(baseMs);

  appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: baseMs, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 5, timestampMs: baseMs + 1_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 10, timestampMs: baseMs + 2_000, speedMps: 3 }));

  const jitterPoints = [
    { metersEast: 18, metersNorth: 11 },
    { metersEast: 26, metersNorth: -11 },
    { metersEast: 34, metersNorth: 11 },
    { metersEast: 42, metersNorth: -11 },
    { metersEast: 50, metersNorth: 11 },
    { metersEast: 58, metersNorth: -11 },
    { metersEast: 66, metersNorth: 11 },
    { metersEast: 74, metersNorth: -11 },
    { metersEast: 82, metersNorth: 11 },
    { metersEast: 90, metersNorth: -11 },
    { metersEast: 98, metersNorth: 11 },
    { metersEast: 106, metersNorth: -11 },
  ];

  jitterPoints.forEach((point, index) => {
    appendTrackedLocation(locationAt({
      ...point,
      accuracyM: 8,
      speedMps: 3,
      timestampMs: baseMs + 3_000 + index * 1_000,
    }));
  });

  const snapshot = getSnapshotState();
  assert.ok(getAccumulatedDistanceMeters() >= 98);
  assert.ok(getAccumulatedDistanceMeters() <= 122);
  assert.ok(snapshot.route.length <= 6);
});

test('route accumulator trims early out-and-back GPS excursions', () => {
  const baseMs = Date.now() - 13_000;
  resetRunningSnapshot(baseMs);

  appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: baseMs, speedMps: 2 }));
  appendTrackedLocation(locationAt({ metersEast: 5, timestampMs: baseMs + 1_000, speedMps: 2 }));
  appendTrackedLocation(locationAt({ metersEast: 10, timestampMs: baseMs + 2_000, speedMps: 2 }));
  appendTrackedLocation(locationAt({ metersEast: 45, timestampMs: baseMs + 7_000, speedMps: 2 }));
  appendTrackedLocation(locationAt({ metersEast: 75, timestampMs: baseMs + 10_000, speedMps: 2 }));
  appendTrackedLocation(locationAt({ metersEast: 12, timestampMs: baseMs + 12_000, speedMps: 2 }));

  const snapshot = getSnapshotState();
  assert.equal(snapshot.route.length, 4);
  assert.ok(getAccumulatedDistanceMeters() < 25);
  assert.equal(
    snapshot.route.some((point) => point.longitude > BASE_LONGITUDE + longitudeOffsetForMeters(40)),
    false,
  );
});

test('route accumulator still rejects large teleport jumps after stabilization', () => {
  const baseMs = Date.now() - 7_000;
  resetRunningSnapshot(baseMs);

  appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: baseMs, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 4, timestampMs: baseMs + 1_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 8, timestampMs: baseMs + 2_000, speedMps: 3 }));
  // 212m in 1.2s after a tight warmup cluster is a teleport (>> MAX_REASONABLE_RUNNING_SPEED_MPS) — dropped.
  appendTrackedLocation(locationAt({ metersEast: 220, timestampMs: baseMs + 3_200, speedMps: 3 }));

  const snapshot = getSnapshotState();
  assert.equal(snapshot.route.length, 3);
  assert.ok(getAccumulatedDistanceMeters() < 25);
});

// STEP 1 — the cold-start cluster must bank ZERO intra-cluster path (seed = 0). A tight 3-fix warmup
// cluster (spread within the radius gate) anchors at the cluster centroid/last fix; NONE of the
// intra-cluster warmup jitter is counted, so the start spike (~30-60m banked at t0) is gone.
test('route accumulator banks ZERO intra-cluster path at cold start (seed 0)', () => {
  const baseMs = Date.now() - 6_000;
  resetRunningSnapshot(baseMs);

  // Three fixes scattered ~10m apart inside the cold-start cluster (still <= 15m radius). Pre-fix the
  // seed banked calculateRouteWindowDistanceMeters over these (~20m of jitter); now it must be 0.
  appendTrackedLocation(locationAt({ metersEast: 0, metersNorth: 0, timestampMs: baseMs, speedMps: 1.2 }));
  appendTrackedLocation(locationAt({ metersEast: 9, metersNorth: 4, timestampMs: baseMs + 1_000, speedMps: 1.2 }));
  appendTrackedLocation(locationAt({ metersEast: 3, metersNorth: 8, timestampMs: baseMs + 2_000, speedMps: 1.2 }));

  const snapshot = getSnapshotState();
  assert.equal(snapshot.route.length, 3, 'the cluster is anchored as the baseline route');
  assert.equal(
    getAccumulatedDistanceMeters(),
    0,
    'NO intra-cluster warmup path is banked — distance accumulates only after the anchor',
  );
});

// DO-NOT-UNDER-COUNT proof — a straight synthetic ~5km track must still read ~5km under the new,
// tighter gates (MAX_TRACKING_ACCURACY_METERS=40, MIN_MOVEMENT_DISTANCE_METERS=5.0, gate base 5.0).
// A genuine runner moving well above the 5m floor between fixes is NEVER dropped, so the competitive
// distance is not shortened. (The old loose gates also read ~5km; this guards against regression.)
test('route accumulator does not materially under-count a straight 5km track under the new gates', () => {
  // The location-freshness gate (MAX_LOCATION_AGE_MS) rejects fixes far from "now", so to drive a
  // realistic multi-minute track we advance a mocked clock in lockstep with each fix timestamp — the
  // same wall-clock relationship a real run has. Real Date.now is restored in finally.
  const realDateNow = Date.now;
  const stepMeters = 12; // each segment is well above MIN_MOVEMENT_DISTANCE_METERS = 5.0
  const stepMs = 2_000; // 12m / 2s = 6 m/s, a normal running pace (below the teleport ceiling)
  const stepCount = 420; // 420 * 12 = 5040m from the anchor — a straight ~5km track
  const startMs = realDateNow();

  try {
    let mockNowMs = startMs;
    Date.now = () => mockNowMs;

    resetRunningSnapshot(startMs);

    // Tight warmup cluster anchors at the 3rd fix (seed 0), lastCounted ~ 0m east.
    appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: startMs, speedMps: 3 }));
    mockNowMs = startMs + 1_000;
    appendTrackedLocation(locationAt({ metersEast: 4, timestampMs: mockNowMs, speedMps: 3 }));
    mockNowMs = startMs + 2_000;
    appendTrackedLocation(locationAt({ metersEast: 8, timestampMs: mockNowMs, speedMps: 3 }));

    for (let stepIndex = 1; stepIndex <= stepCount; stepIndex += 1) {
      mockNowMs = startMs + 2_000 + stepIndex * stepMs;
      appendTrackedLocation(locationAt({
        metersEast: 8 + stepIndex * stepMeters,
        timestampMs: mockNowMs,
        accuracyM: 8,
        speedMps: 6,
      }));
    }

    const realDistanceMeters = stepCount * stepMeters; // 5040m straight-line from the anchor
    const measuredMeters = getAccumulatedDistanceMeters();
    // Must read essentially the full distance — no material under-count (tiny rounding margin only).
    assert.ok(
      measuredMeters >= realDistanceMeters * 0.99,
      `5km track under-counted: measured ${measuredMeters.toFixed(0)}m vs real ${realDistanceMeters}m`,
    );
    assert.ok(
      measuredMeters <= realDistanceMeters * 1.01,
      `5km track over-counted: measured ${measuredMeters.toFixed(0)}m vs real ${realDistanceMeters}m`,
    );
  } finally {
    Date.now = realDateNow;
  }
});

// CROSS-DEVICE PARITY CAP — an accuracy-20 fix (typical inflated Galaxy estimate) must use the
// CAPPED distance gate (3.0 + 15 * 0.15 = 5.25m), not the uncapped 6.0m. A 5.6m real segment sits
// between the two, so it discriminates: pre-cap it was gated (distance frozen), now it is counted.
test('route accumulator counts a 5.6m segment at accuracy 20 through the capped distance gate', () => {
  const baseMs = Date.now() - 6_000;
  resetRunningSnapshot(baseMs);

  // Tight warmup cluster anchors at the 3rd fix (seed 0); lastCounted = 8m east.
  appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: baseMs, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 4, timestampMs: baseMs + 1_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 8, timestampMs: baseMs + 2_000, speedMps: 3 }));
  assert.equal(getAccumulatedDistanceMeters(), 0);

  // +5.6m at accuracy 20: worstAccuracy 20 is capped to 15 for the gate → 5.25m < 5.6m → counted.
  // With the old uncapped gate (3.0 + 20 * 0.15 = 6.0m) this exact segment was silently gated.
  appendTrackedLocation(locationAt({
    metersEast: 13.6,
    timestampMs: baseMs + 3_200,
    accuracyM: 20,
    speedMps: 3,
  }));

  const snapshot = getSnapshotState();
  assert.equal(snapshot.route.length, 4);
  assert.ok(getAccumulatedDistanceMeters() >= 5.2, `capped gate should count 5.6m, got ${getAccumulatedDistanceMeters().toFixed(2)}m`);
  assert.ok(getAccumulatedDistanceMeters() <= 6.0);
});

// The hard accuracy REJECT is intentionally UNCAPPED and unchanged: a fix reporting accuracy 41
// (> MAX_TRACKING_ACCURACY_METERS = 40) is still dropped outright — not routed, not counted — even
// though the parity cap clamps the scaled thresholds at 15.
test('route accumulator still hard-rejects fixes at accuracy 41', () => {
  const baseMs = Date.now() - 6_000;
  resetRunningSnapshot(baseMs);

  appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: baseMs, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 4, timestampMs: baseMs + 1_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 8, timestampMs: baseMs + 2_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 20, timestampMs: baseMs + 3_200, speedMps: 3 }));

  const beforeRejectDistanceMeters = getAccumulatedDistanceMeters();
  const beforeRejectRouteLength = getSnapshotState().route.length;
  assert.ok(beforeRejectDistanceMeters > 0);

  appendTrackedLocation(locationAt({
    metersEast: 32,
    timestampMs: baseMs + 4_400,
    accuracyM: 41,
    speedMps: 3,
  }));

  const snapshot = getSnapshotState();
  assert.equal(snapshot.route.length, beforeRejectRouteLength);
  assert.equal(getAccumulatedDistanceMeters(), beforeRejectDistanceMeters);
});

// ELEVATION NOISE SUPPRESSION through the accumulator's live commit path — a straight run whose GPS
// ALTITUDE oscillates +/-15m every fix (the Android sawtooth that fabricated hundreds of meters)
// must accumulate ~0 elevation gain now that the commit path recomputes through the shared EMA +
// deadband reducer instead of summing per-sample positive deltas.
test('route accumulator suppresses fabricated elevation from noisy altitude', () => {
  // The location-freshness gate (MAX_LOCATION_AGE_MS) rejects fixes far from "now", so drive a
  // mocked clock in lockstep with each fix timestamp (same pattern as the 5km track test).
  const realDateNow = Date.now;
  const startMs = realDateNow();

  function noisyAltitudeLocation(metersEast: number, timestampMs: number, altitude: number) {
    return {
      coords: {
        latitude: BASE_LATITUDE,
        longitude: BASE_LONGITUDE + longitudeOffsetForMeters(metersEast),
        altitude,
        accuracy: 8,
        altitudeAccuracy: 4, // good horizontal+vertical accuracy: the noise is NOT gated, EMA kills it
        heading: null,
        speed: 3,
      },
      timestamp: timestampMs,
    } as Location.LocationObject;
  }

  try {
    let mockNowMs = startMs;
    Date.now = () => mockNowMs;

    resetRunningSnapshot(startMs);

    // Warmup cluster anchors at the 3rd fix; then a clean straight eastward run of +12m segments,
    // each above the distance gate, while altitude sawtooths +/-15m around 100m the entire time.
    const easts = [0, 4, 8, 20, 32, 44, 56, 68, 80, 92, 104, 116, 128];
    easts.forEach((metersEast, index) => {
      mockNowMs = startMs + index * 1_200;
      const altitude = 100 + (index % 2 === 0 ? 15 : -15);
      appendTrackedLocation(noisyAltitudeLocation(metersEast, mockNowMs, altitude));
    });

    // Real horizontal distance was counted (proves the run actually progressed)...
    assert.ok(getAccumulatedDistanceMeters() > 100);
    // ...but the +/-15m altitude sawtooth accumulated ~0 elevation gain (was hundreds of m before).
    assert.ok(
      getAccumulatedElevationGainMeters() <= 2,
      `noisy altitude fabricated elevation: ${getAccumulatedElevationGainMeters()}m`,
    );
  } finally {
    Date.now = realDateNow;
  }
});

// 오너 2026-07-31 (나이키런 대조 사건): 고가 밑에서 GPS가 2분 죽었다 700m 떨어진 곳에서
// 다시 잡히면 chord의 암묵 속도(≈5.8m/s 미만)가 순간이동 필터를 통과해 직선이 통째로
// 적립됐다 — 같은 러닝이 나이키 3.0km vs 우리 3.8km로 갈린 원인.
//
// 픽스 나이 게이트(MAX_LOCATION_AGE_MS, 실제 Date.now() 기준)가 15초보다 오래된 픽스를
// 버리므로 과거 타임스탬프로는 분 단위 갭을 재현할 수 없다 — 가짜 시계로 시간을 민다.
function withFakeClock(run: (clock: { setNow: (ms: number) => void }) => void) {
  const realNow = Date.now;
  let virtualNowMs = realNow();
  Date.now = () => virtualNowMs;

  try {
    run({ setNow: (ms: number) => { virtualNowMs = ms; } });
  } finally {
    Date.now = realNow;
  }
}

test('route accumulator does not credit the chord across a signal-loss gap', () => {
  withFakeClock(({ setNow }) => {
    const baseMs = Date.now();
    resetRunningSnapshot(baseMs);

    for (const [metersEast, offsetMs] of [[0, 0], [4, 1_000], [8, 2_000], [20, 3_200]] as const) {
      setNow(baseMs + offsetMs);
      appendTrackedLocation(locationAt({ metersEast, timestampMs: baseMs + offsetMs, speedMps: 3 }));
    }
    const beforeGapMeters = getAccumulatedDistanceMeters();

    // 2분간 픽스 없음 → 700m 떨어진 곳에서 재획득 (암묵 속도 5.8m/s: 기존 필터는 전부 통과시켰다).
    setNow(baseMs + 123_200);
    appendTrackedLocation(locationAt({ metersEast: 720, timestampMs: baseMs + 123_200, speedMps: 3 }));

    const afterGapMeters = getAccumulatedDistanceMeters();
    assert.ok(afterGapMeters - beforeGapMeters < 1, `gap chord credited: +${(afterGapMeters - beforeGapMeters).toFixed(1)}m`);
    // 경로에는 점이 남는다 — 지도는 나이키처럼 직선으로 이어져 보이되 거리만 빠진다.
    assert.equal(getSnapshotState().route.length, 5);

    // 재획득 이후의 실제 주행은 새 앵커에서 정상 적립된다.
    for (const [metersEast, offsetMs] of [[732, 124_400], [744, 125_600]] as const) {
      setNow(baseMs + offsetMs);
      appendTrackedLocation(locationAt({ metersEast, timestampMs: baseMs + offsetMs, speedMps: 3 }));
    }
    assert.ok(getAccumulatedDistanceMeters() - afterGapMeters >= 20);
  });
});

test('route accumulator still credits short bridge dropouts as before', () => {
  withFakeClock(({ setNow }) => {
    const baseMs = Date.now();
    resetRunningSnapshot(baseMs);

    for (const [metersEast, offsetMs] of [[0, 0], [4, 1_000], [8, 2_000]] as const) {
      setNow(baseMs + offsetMs);
      appendTrackedLocation(locationAt({ metersEast, timestampMs: baseMs + offsetMs, speedMps: 3 }));
    }
    const beforeMeters = getAccumulatedDistanceMeters();

    // 20초 끊김 + 60m 전진 (3m/s) — 다리/건물 밑 수준의 짧은 끊김은 실제 주행으로 적립.
    setNow(baseMs + 22_000);
    appendTrackedLocation(locationAt({ metersEast: 68, timestampMs: baseMs + 22_000, speedMps: 3 }));

    assert.ok(getAccumulatedDistanceMeters() - beforeMeters >= 55, `credited only ${(getAccumulatedDistanceMeters() - beforeMeters).toFixed(1)}m`);
  });
});

// 적대 검증 2026-08-09가 지목한 정확한 시나리오. 위 테스트(720m/120s = 6.0m/s)의 chord는
// 순간이동 게이트 2(5.8m/s)에 걸리므로 갭 규칙이 없어도 일부는 막힌다 — 이 테스트는 **어떤
// 속도 필터에도 걸리지 않는** chord를 쓴다: 3분 블랙아웃 + 990m = 5.5m/s는 순간이동 게이트
// 둘(8.5 / 5.8m/s)과 서버 속도 제한을 전부 통과한다. 즉 갭 규칙이 유일한 방어선이며, 그것을
// 지우면 chord가 통째로 적립된다.
//
// (순서 — 갭 검사가 순간이동 게이트보다 앞에 와야 한다는 것 — 은 위 720m 테스트가 지킨다:
// 순간이동이 먼저 걸리면 픽스가 통째로 버려져 앵커가 옛 위치에 남고, 이후 모든 픽스가 같은
// 이유로 거부되어 거리가 남은 러닝 내내 얼어붙는다. 그래서 route.length + 재개 적립을 본다.)
test('signal-loss gap rule is the ONLY defense against a plausible-speed blackout chord', () => {
  withFakeClock(({ setNow }) => {
    const baseMs = Date.now();
    resetRunningSnapshot(baseMs);

    for (const [metersEast, offsetMs] of [[0, 0], [4, 1_000], [8, 2_000], [20, 3_200]] as const) {
      setNow(baseMs + offsetMs);
      appendTrackedLocation(locationAt({ metersEast, timestampMs: baseMs + offsetMs, speedMps: 3 }));
    }
    const beforeGapMeters = getAccumulatedDistanceMeters();

    const gapMs = 180_000;
    const chordMeters = 990;
    const chordSpeedMps = chordMeters / (gapMs / 1000);

    // 방어선이 갭 규칙 하나뿐임을 먼저 증명한다: chord는 두 순간이동 게이트를 모두 통과한다.
    assert.ok(chordSpeedMps < MAX_REASONABLE_RUNNING_SPEED_MPS, 'chord would trip teleport gate 1');
    assert.ok(chordSpeedMps < 5.8, 'chord would trip teleport gate 2');
    // 그리고 이 갭은 신호 소실로 판정된다.
    assert.ok(isSignalLossGapMs(gapMs));

    const reacquiredAtMs = baseMs + 3_200 + gapMs;
    setNow(reacquiredAtMs);
    appendTrackedLocation(locationAt({
      metersEast: 20 + chordMeters,
      timestampMs: reacquiredAtMs,
      speedMps: 3,
    }));

    assert.equal(
      getAccumulatedDistanceMeters(),
      beforeGapMeters,
      `blackout chord banked ${(getAccumulatedDistanceMeters() - beforeGapMeters).toFixed(1)}m`,
    );

    // 앵커는 재획득 지점으로 옮겨졌다 — 거리는 얼지 않고 이후 실제 주행부터 다시 적립된다.
    for (const extraMeters of [12, 24]) {
      const atMs = reacquiredAtMs + extraMeters * 100;
      setNow(atMs);
      appendTrackedLocation(locationAt({
        metersEast: 20 + chordMeters + extraMeters,
        timestampMs: atMs,
        speedMps: 3,
      }));
    }
    assert.ok(
      getAccumulatedDistanceMeters() - beforeGapMeters >= 20,
      'accumulator froze after the blackout instead of re-anchoring',
    );
  });
});

// 갭 상한은 네이티브 누적기에 그대로 전달되어야 한다 (JS만 막고 네이티브가 뚫리면 서버의
// Math.max(previousDistanceKm, …) 때문에 부풀려진 총합을 되돌릴 수 없다). 키가 사라지면
// undefined !== 30_000 으로 이 테스트가 깨진다.
test('the signal-loss gap ceiling is handed to the native accumulators on the same wire', () => {
  assert.equal(NATIVE_DISTANCE_ACCUMULATOR_OPTIONS.maxCreditableFixGapMs, MAX_CREDITABLE_FIX_GAP_MS);
  assert.equal(MAX_CREDITABLE_FIX_GAP_MS, 30_000);
});
