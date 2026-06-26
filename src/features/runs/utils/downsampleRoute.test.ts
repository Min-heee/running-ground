import assert from 'node:assert/strict';
import test from 'node:test';

import type { RunRoutePoint } from '@/domain';
import { downsampleRoute, MAX_SAVED_ROUTE_POINTS } from './downsampleRoute';

function buildRoute(length: number): RunRoutePoint[] {
  return Array.from({ length }, (_, index) => ({
    // Spread coordinates so each point is unique and order is checkable.
    latitude: 37 + index * 1e-5,
    longitude: 127 + index * 1e-5,
    altitude: index,
    timestamp: new Date(1_700_000_000_000 + index * 1000).toISOString(),
  }));
}

test('downsampleRoute is a no-op for routes at or under the limit', () => {
  const short = buildRoute(10);
  assert.equal(downsampleRoute(short, MAX_SAVED_ROUTE_POINTS), short, 'returns the same reference');

  const exact = buildRoute(MAX_SAVED_ROUTE_POINTS);
  assert.equal(downsampleRoute(exact), exact, 'a route exactly at the limit is unchanged');
});

test('downsampleRoute never exceeds the max point count for long routes', () => {
  for (const length of [1501, 3000, 10_000, 50_000]) {
    const sampled = downsampleRoute(buildRoute(length));
    assert.ok(
      sampled.length <= MAX_SAVED_ROUTE_POINTS,
      `length ${length} decimated to ${sampled.length} which exceeds ${MAX_SAVED_ROUTE_POINTS}`,
    );
  }
});

test('downsampleRoute always keeps the first and last point', () => {
  const route = buildRoute(12_345);
  const sampled = downsampleRoute(route);

  assert.deepEqual(sampled[0], route[0], 'first point preserved');
  assert.deepEqual(sampled[sampled.length - 1], route[route.length - 1], 'last point preserved');
});

test('downsampleRoute preserves chronological order', () => {
  const sampled = downsampleRoute(buildRoute(8_000));

  for (let i = 1; i < sampled.length; i += 1) {
    const previous = new Date(sampled[i - 1].timestamp).getTime();
    const current = new Date(sampled[i].timestamp).getTime();
    assert.ok(current > previous, `point ${i} is not strictly after the previous point`);
  }
});

test('downsampleRoute keeps a custom-limit short route untouched and bounds a long one', () => {
  const route = buildRoute(100);
  assert.equal(downsampleRoute(route, 100).length, 100);
  assert.ok(downsampleRoute(route, 25).length <= 25);
});

test("a representative long route's serialized save body fits under 256KB", () => {
  // Worst case from the bug report: a marathon (~42km, ~4h) at ~1 fix/sec ≈ 14,400 points.
  const route = buildRoute(14_400);
  const sampled = downsampleRoute(route);

  // Mirror the createTrackedRun payload shape so the byte budget reflects the real request.
  const body = JSON.stringify({
    date: '2026-06-27',
    distanceKm: 42.195,
    pace: '5:41/km',
    durationSeconds: 14_400,
    cadenceSpm: 180,
    elevationGainM: 120,
    route: sampled,
    startedAt: route[0].timestamp,
    endedAt: route[route.length - 1].timestamp,
    matchResult: null,
  });

  const bytes = Buffer.byteLength(body, 'utf8');
  assert.ok(
    bytes < 256 * 1024,
    `serialized body was ${bytes} bytes, expected under ${256 * 1024}`,
  );
});
