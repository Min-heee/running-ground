import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunRoutePoint } from '@/domain';
import type { BackgroundRunTrackingSnapshot } from './backgroundTracking';
import {
  buildOfficialStartBaseline,
  buildRouteFromOfficialStart,
  formatCadence,
  formatElevation,
  formatMetricDistance,
  getTrackingSnapshotElapsedSeconds,
} from './trackingSession';

function point(latitude: number, seconds: number): RunRoutePoint {
  return {
    latitude,
    longitude: 127,
    altitude: 10 + seconds / 60,
    timestamp: new Date(Date.UTC(2026, 4, 12, 0, 0, seconds)).toISOString(),
  };
}

function snapshot(route: RunRoutePoint[]): BackgroundRunTrackingSnapshot {
  return {
    status: 'running',
    route,
    distanceKm: 1,
    elevationGainM: 0,
    currentPace: '--:--/km',
    startedAt: new Date(Date.UTC(2026, 4, 12, 0, 0, 0)).toISOString(),
    pausedAt: null,
    accumulatedPausedMs: 0,
  };
}

test('getTrackingSnapshotElapsedSeconds respects paused time and paused reference', () => {
  const runningSnapshot = {
    ...snapshot([]),
    accumulatedPausedMs: 10_000,
  };
  const elapsed = getTrackingSnapshotElapsedSeconds(
    runningSnapshot,
    Date.UTC(2026, 4, 12, 0, 2, 0),
  );

  assert.equal(elapsed, 110);

  const pausedElapsed = getTrackingSnapshotElapsedSeconds({
    ...runningSnapshot,
    status: 'paused',
    pausedAt: new Date(Date.UTC(2026, 4, 12, 0, 1, 30)).toISOString(),
  });

  assert.equal(pausedElapsed, 80);
});

test('buildOfficialStartBaseline interpolates official start inside an existing route segment', () => {
  const route = [
    point(37, 0),
    point(37.009, 60),
    point(37.018, 120),
  ];
  const officialStartAt = new Date(Date.UTC(2026, 4, 12, 0, 0, 30)).toISOString();
  const baseline = buildOfficialStartBaseline(snapshot(route), 'match-1', officialStartAt);

  assert.equal(baseline.matchId, 'match-1');
  assert.equal(baseline.elapsedSeconds, 30);
  assert.equal(baseline.routeStartIndex, 1);
  assert.equal(baseline.startedAt, officialStartAt);
  assert.equal(baseline.routeStartPoint?.timestamp, officialStartAt);
  assert.ok(Math.abs((baseline.routeStartPoint?.latitude ?? 0) - 37.0045) < 0.00001);
  assert.ok(Math.abs(baseline.distanceKm - 0.5) < 0.02);
});

test('buildOfficialStartBaseline ignores pre-countdown distance before the official start', () => {
  const route = [
    point(37, 0),
    point(37.009, 60),
    point(37.018, 120),
  ];
  const officialStartAt = new Date(Date.UTC(2026, 4, 12, 0, 1, 0)).toISOString();
  const baseline = buildOfficialStartBaseline(snapshot(route), 'match-1', officialStartAt);

  assert.equal(baseline.elapsedSeconds, 60);
  assert.equal(baseline.routeStartIndex, 1);
  assert.equal(baseline.routeStartPoint?.timestamp, route[1].timestamp);
  assert.ok(Math.abs(baseline.distanceKm - 1) < 0.03);
});

test('buildOfficialStartBaseline clamps to last known route when official start is after all points', () => {
  const route = [
    point(37, 0),
    point(37.009, 60),
  ];
  const officialStartAt = new Date(Date.UTC(2026, 4, 12, 0, 2, 0)).toISOString();
  const baseline = buildOfficialStartBaseline(snapshot(route), 'match-1', officialStartAt);

  assert.equal(baseline.routeStartIndex, route.length);
  assert.equal(baseline.routeStartPoint?.timestamp, officialStartAt);
  assert.equal(baseline.distanceKm, 1);
  assert.equal(baseline.elapsedSeconds, 120);
});

test('buildRouteFromOfficialStart starts route at the interpolated official point', () => {
  const route = [
    point(37, 0),
    point(37.009, 60),
    point(37.018, 120),
  ];
  const officialStartAt = new Date(Date.UTC(2026, 4, 12, 0, 0, 30)).toISOString();
  const baseline = buildOfficialStartBaseline(snapshot(route), 'match-1', officialStartAt);
  const officialRoute = buildRouteFromOfficialStart(snapshot(route), baseline);

  assert.equal(officialRoute.length, 3);
  assert.equal(officialRoute[0].timestamp, officialStartAt);
  assert.equal(officialRoute[1].timestamp, route[1].timestamp);
});

test('tracking metric formatters keep display precision stable', () => {
  assert.equal(formatMetricDistance(1.234), '1.23km');
  assert.equal(formatElevation(12.6), '13m');
  assert.equal(formatCadence(172), '172spm');
  assert.equal(formatCadence(null), '--');
});
