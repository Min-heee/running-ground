import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunRoutePoint } from '@/domain';
import type { BackgroundRunTrackingSnapshot } from './background';
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
  // 30초 간격 — 신호 소실 무적립 규칙(MAX_CREDITABLE_FIX_GAP_MS 초과 구간 제외)이 생기면서
  // 60초 간격 픽스처는 갭으로 판정된다. 실제 기록은 1Hz라 이 간격이 나오면 진짜 갭이 맞다.
  const route = [
    point(37, 0),
    point(37.0045, 30),
    point(37.009, 60),
    point(37.018, 120),
  ];
  const officialStartAt = new Date(Date.UTC(2026, 4, 12, 0, 1, 0)).toISOString();
  const baseline = buildOfficialStartBaseline(snapshot(route), 'match-1', officialStartAt);

  assert.equal(baseline.elapsedSeconds, 60);
  assert.equal(baseline.routeStartIndex, 2);
  assert.equal(baseline.routeStartPoint?.timestamp, route[2].timestamp);
  assert.ok(Math.abs(baseline.distanceKm - 1) < 0.03);
});

// 웜업 중 신호 소실 갭의 직선도 기준선에서 제외된다 — 라이브 누적기와 같은 규칙이 아니면
// 공식 시작 시점에 웜업 차감량이 라이브 거리와 어긋난다.
test('buildOfficialStartBaseline excludes signal-loss chords from the warmup baseline', () => {
  const route = [
    point(37, 0),
    point(37.0045, 30),
    // 90초 갭 + 1km 점프 — 적립 대상이 아니다.
    point(37.0135, 120),
    point(37.018, 150),
  ];
  const officialStartAt = new Date(Date.UTC(2026, 4, 12, 0, 2, 30)).toISOString();
  const baseline = buildOfficialStartBaseline(snapshot(route), 'match-1', officialStartAt);

  // 0.5km(0→30s) + [갭 제외] + 0.5km(120→150s) = 1.0km
  assert.ok(Math.abs(baseline.distanceKm - 1) < 0.03, `baseline ${baseline.distanceKm}`);
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
