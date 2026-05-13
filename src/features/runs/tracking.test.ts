import assert from 'node:assert/strict';
import test from 'node:test';

import type { RunRoutePoint } from '@/domain';
import {
  buildAveragePace,
  buildRunDateFromTimestamp,
  calculateCadenceSpm,
  calculateDistanceBetweenPoints,
  calculateElevationGainM,
  formatDuration,
  formatPaceFromSecondsPerKm,
  formatPaceFromSpeedMps,
  getMapRegion,
} from './tracking';

function routePoint(latitude: number, altitude: number | null): RunRoutePoint {
  return {
    latitude,
    longitude: 127,
    altitude,
    timestamp: '2026-05-13T00:00:00.000Z',
  };
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
});

test('running calculations return safe values for zero or invalid inputs', () => {
  assert.equal(calculateDistanceBetweenPoints({ latitude: 37, longitude: 127 }, { latitude: 37, longitude: 127 }), 0);
  assert.equal(buildAveragePace(0, 760), '--:--/km');
  assert.equal(buildAveragePace(Number.NaN, 760), '--:--/km');
  assert.equal(buildAveragePace(5, Number.POSITIVE_INFINITY), '--:--/km');
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

  assert.equal(calculateElevationGainM(route), 2);
  assert.ok(Math.abs((region?.latitude ?? 0) - 37.002) < 0.000001);
  assert.equal(region?.longitude, 127);
  assert.equal(region?.latitudeDelta, 0.008);
  assert.equal(region?.longitudeDelta, 0.008);
});
