import assert from 'node:assert/strict';
import test from 'node:test';

import type { RunRoutePoint } from '@/domain';
import {
  buildAveragePace,
  buildAveragePaceForFinishedRun,
  buildRunDateFromTimestamp,
  calculateCadenceSpm,
  calculateDistanceBetweenPoints,
  calculateElevationGainM,
  formatDuration,
  formatPaceFromSecondsPerKm,
  formatPaceFromSpeedMps,
  getMapRegion,
} from './index';

function routePoint(latitude: number, altitude: number | null): RunRoutePoint {
  return {
    latitude,
    longitude: 127,
    altitude,
    timestamp: '2026-05-13T00:00:00.000Z',
  };
}

// A route point carrying vertical accuracy, for exercising the elevation accuracy gate. When
// altitudeAccuracyM is omitted entirely (routePoint above) the whole route reports no accuracy and
// the reducer falls back to EMA + deadband only (iOS / old-route behavior).
function altitudePoint(altitude: number | null, altitudeAccuracyM: number): RunRoutePoint {
  return {
    latitude: 37,
    longitude: 127,
    altitude,
    altitudeAccuracyM,
    timestamp: '2026-05-13T00:00:00.000Z',
  };
}

function buildAltitudeRoute(
  sampleCount: number,
  altitudeAt: (index: number) => number,
  altitudeAccuracyM: number,
): RunRoutePoint[] {
  return Array.from({ length: sampleCount }, (_unused, index) => altitudePoint(altitudeAt(index), altitudeAccuracyM));
}

test('running format helpers handle normal and zero values', () => {
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(3661), '01:01:01');
  assert.equal(formatDuration(-5), '00:00');
  assert.equal(formatPaceFromSecondsPerKm(380), '06:20/km');
  assert.equal(formatPaceFromSecondsPerKm(379.6), '06:20/km');
  assert.equal(formatPaceFromSecondsPerKm(0), '--:--/km');
  assert.equal(formatPaceFromSpeedMps(1000 / 380), '06:20/km');
  assert.equal(formatPaceFromSpeedMps(0.3), '--:--/km');
});

test('running distance and pace calculations are stable for normal routes', () => {
  const distanceMeters = calculateDistanceBetweenPoints(
    { latitude: 37, longitude: 127 },
    { latitude: 37.009, longitude: 127 },
  );

  assert.ok(Math.abs(distanceMeters - 1000.75) < 1);
  assert.equal(buildAveragePace(2, 760), '06:20/km');
  assert.equal(calculateCadenceSpm(860, 300), 172);
  assert.equal(buildRunDateFromTimestamp('2026-05-13T12:34:56.000Z'), '2026-05-13');

  // 자정 직후(로컬) 러닝 — UTC 슬라이스였다면 KST에서 전날로 밀리던 케이스.
  // 입력을 로컬 성분으로 만들어 어느 시간대에서 돌려도 기대값이 성립한다.
  const localMidnightRun = new Date(2026, 4, 14, 0, 30);
  assert.equal(buildRunDateFromTimestamp(localMidnightRun.toISOString()), '2026-05-14');

  // 못 읽는 문자열은 기존 폴백(앞 10글자) 유지.
  assert.equal(buildRunDateFromTimestamp('not-a-date'), 'not-a-date');
});

test('cadence plausibility floor hides a dead-sensor cadence but keeps real ones', () => {
  // Galaxy dead-sensor case: ~81 steps over a ~27min run computes to ~3spm — below the 30spm
  // floor on a run past a minute, so it is hidden (null → '--') instead of saving a bogus 3spm.
  assert.equal(calculateCadenceSpm(81, 1_625), null);
  // iPhone same run: ~4170 steps → ~154spm, a real cadence, untouched by the floor.
  assert.equal(calculateCadenceSpm(4_170, 1_625), 154);
  // Zero steps is still null regardless of the floor.
  assert.equal(calculateCadenceSpm(0, 100), null);
  // >60s guard: a 60s sprint start (elapsed not > 60) is NOT nulled even at exactly 60spm, so a
  // legit short burst is preserved; only runs strictly longer than a minute get the floor.
  assert.equal(calculateCadenceSpm(60, 60), 60);
  // A real slow jog well above the floor is never nulled, even on a long run.
  assert.equal(calculateCadenceSpm(3_600, 1_625), 133);
});

test('running calculations return safe values for zero or invalid inputs', () => {
  assert.equal(calculateDistanceBetweenPoints({ latitude: 37, longitude: 127 }, { latitude: 37, longitude: 127 }), 0);
  assert.equal(buildAveragePace(0, 760), '--:--/km');
  assert.equal(buildAveragePace(Number.NaN, 760), '--:--/km');
  assert.equal(buildAveragePace(5, Number.POSITIVE_INFINITY), '--:--/km');
  // Below the min-distance floor (cold-start GPS jitter while stationary): suppress, don't
  // show a misleading inflating average pace. At/above the floor it computes normally.
  assert.equal(buildAveragePace(0.03, 120), '--:--/km');
  assert.equal(buildAveragePace(0.05, 300), '--:--/km');
  assert.equal(buildAveragePace(0.1, 36), '06:00/km');
  // The finished/saved variant has NO movement floor: a short forfeit (0.05km) still shows
  // its true pace, only suppressing genuinely empty distance.
  assert.equal(buildAveragePaceForFinishedRun(0.05, 90), '30:00/km');
  assert.equal(buildAveragePaceForFinishedRun(0, 90), '--:--/km');
  assert.equal(formatPaceFromSpeedMps(Number.POSITIVE_INFINITY), '--:--/km');
  assert.equal(calculateCadenceSpm(Number.NaN, 300), null);
  assert.equal(calculateCadenceSpm(100, 0), null);
  assert.equal(getMapRegion([]), null);
});

test('elevation and map region helpers keep route summaries predictable', () => {
  const route = [
    routePoint(37, 10),
    routePoint(37.001, 10.5),
    routePoint(37.002, 12),
    routePoint(37.003, null),
    routePoint(37.004, 12.4),
  ];
  const region = getMapRegion(route);

  // With the 2.0m deadband, a route that only wobbles ~2.4m total (and never sustains a >=2m rise
  // above the committed altitude through the EMA) yields 0 gain — the tiny sawtooth is smoothed
  // away rather than summed. (Was 2 under the old bare `delta > 0.8` per-sample gate.)
  assert.equal(calculateElevationGainM(route), 0);
  assert.ok(Math.abs((region?.latitude ?? 0) - 37.002) < 0.000001);
  assert.equal(region?.longitude, 127);
  assert.equal(region?.latitudeDelta, 0.008);
  assert.equal(region?.longitudeDelta, 0.008);
});

test('elevation gain suppresses flat GPS noise but still measures a genuine hill', () => {
  // FLAT-NOISY ANDROID (the 410m regression pin): altitude oscillates +/-15m around a mean with a
  // POOR vertical accuracy of 20m. Every sample fails the <=8m accuracy gate, so the fabricated
  // sawtooth contributes nothing -> ~0 gain. This is exactly what produced the phantom 410m before.
  const flatNoisyAndroid = buildAltitudeRoute(40, (index) => 100 + (index % 2 === 0 ? 15 : -15), 20);
  assert.equal(calculateElevationGainM(flatNoisyAndroid), 0);

  // FLAT-CLEAN iOS: altitude wobbles only +/-1m with GOOD accuracy (4m). It passes the gate, but the
  // wobble never crosses the 2.0m deadband through the EMA -> ~0 gain. Proves no over-correction:
  // the clean-but-flat iOS case that used to read ~56m now reads ~0, without inventing elevation.
  const flatCleanIos = buildAltitudeRoute(40, (index) => 100 + (index % 2 === 0 ? 1 : -1), 4);
  assert.equal(calculateElevationGainM(flatCleanIos), 0);

  // Even a LARGE +/-15m sawtooth with GOOD accuracy (so it is NOT gated out) is killed by the EMA +
  // deadband alone -> ~0. This is the smoothing half of the filter doing its job without the gate.
  const noisySawtoothGoodAccuracy = buildAltitudeRoute(40, (index) => 100 + (index % 2 === 0 ? 15 : -15), 4);
  assert.equal(calculateElevationGainM(noisySawtoothGoodAccuracy), 0);

  // REAL SUSTAINED CLIMB: a monotonic +40m rise over many good-accuracy samples. The filter must
  // still measure a genuine hill. It reads a touch under 40 (EMA lag + the sub-deadband residual at
  // the very top are not committed) but clearly captures the bulk of the climb -- never crushed to 0.
  const realClimb = buildAltitudeRoute(81, (index) => 100 + index * 0.5, 4); // 100 -> 140
  const realClimbGain = calculateElevationGainM(realClimb);
  assert.ok(realClimbGain >= 30, `real +40m climb under-measured: ${realClimbGain}`);
  assert.ok(realClimbGain <= 40, `real +40m climb over-measured: ${realClimbGain}`);

  // MIXED noise-on-a-hill: a real +30m climb with +/-12m noise superimposed (good accuracy, so the
  // noise is not gated -- only smoothing separates signal from noise). The reducer still reports a
  // substantial climb (well above 0) while the EMA discards most of the superimposed wobble.
  const noisyHill = buildAltitudeRoute(
    120,
    (index) => 100 + (30 * index) / 119 + (index % 2 === 0 ? 12 : -12),
    5,
  );
  const noisyHillGain = calculateElevationGainM(noisyHill);
  assert.ok(noisyHillGain >= 8, `noise-on-a-hill lost the real climb: ${noisyHillGain}`);
  assert.ok(noisyHillGain <= 30, `noise-on-a-hill over-counted the wobble: ${noisyHillGain}`);
});

test('elevation gain falls back to EMA + deadband when the route reports no vertical accuracy', () => {
  // Older saved routes and devices that never surface altitudeAccuracy carry NO altitudeAccuracyM at
  // all. The gate is disabled for such routes (so iOS / historical data never regress); the EMA +
  // deadband still suppress a +/-15m flat sawtooth to ~0.
  const flatNoisyNoAccuracy = Array.from({ length: 40 }, (_unused, index) => routePoint(37, 100 + (index % 2 === 0 ? 15 : -15)));
  assert.equal(calculateElevationGainM(flatNoisyNoAccuracy), 0);

  // A real sustained climb with NO accuracy still measures the hill through the fallback path.
  const climbNoAccuracy = Array.from({ length: 81 }, (_unused, index) => routePoint(37, 100 + index * 0.5));
  const climbGain = calculateElevationGainM(climbNoAccuracy);
  assert.ok(climbGain >= 30 && climbGain <= 40, `no-accuracy climb mis-measured: ${climbGain}`);
});

test('elevation gain returns 0 without throwing for missing or too-short altitude data', () => {
  assert.equal(calculateElevationGainM([]), 0);
  assert.equal(calculateElevationGainM([altitudePoint(100, 4)]), 0);
  assert.equal(calculateElevationGainM([routePoint(37, null), routePoint(37.001, null), routePoint(37.002, null)]), 0);
  // A poor-accuracy sample interleaved with good ones is skipped without poisoning the series or throwing.
  const withGap = [altitudePoint(100, 4), altitudePoint(500, 30), altitudePoint(101, 4)];
  assert.equal(calculateElevationGainM(withGap), 0);
});
