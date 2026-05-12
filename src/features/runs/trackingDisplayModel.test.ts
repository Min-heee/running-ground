import assert from 'node:assert/strict';
import test from 'node:test';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/backgroundTracking';
import { buildDisplayedTrackingSnapshot } from './trackingDisplayModel';

const baseSnapshot: BackgroundRunTrackingSnapshot = {
  status: 'running',
  route: [
    { latitude: 37.1, longitude: 127.1, altitude: 10, timestamp: '2026-05-12T00:00:00.000Z' },
    { latitude: 37.1001, longitude: 127.1001, altitude: 12, timestamp: '2026-05-12T00:00:10.000Z' },
  ],
  distanceKm: 0.08,
  elevationGainM: 2,
  currentPace: '06:10/km',
  startedAt: '2026-05-12T00:00:00.000Z',
  pausedAt: null,
  accumulatedPausedMs: 0,
};

test('displayed tracking snapshot hides pre-start warmup distance', () => {
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: baseSnapshot,
    rawElapsedSeconds: 10,
    officialStartBaseline: null,
    hasPreStartWarmup: true,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
  });

  assert.equal(displayed.distanceKm, 0);
  assert.equal(displayed.elapsedSeconds, 0);
  assert.deepEqual(displayed.route, []);
});

test('displayed tracking snapshot suppresses official-start GPS noise briefly', () => {
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: { ...baseSnapshot, distanceKm: 0.04 },
    rawElapsedSeconds: 12,
    officialStartBaseline: {
      matchId: 'match-1',
      distanceKm: 0,
      elapsedSeconds: 8,
      routeStartIndex: 0,
      routeStartPoint: baseSnapshot.route[0],
      startedAt: '2026-05-12T00:00:08.000Z',
    },
    hasPreStartWarmup: false,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
  });

  assert.equal(displayed.distanceKm, 0);
  assert.equal(displayed.elevationGainM, 0);
  assert.equal(displayed.elapsedSeconds, 4);
});

test('displayed tracking snapshot shows adjusted match distance after noise window', () => {
  const displayed = buildDisplayedTrackingSnapshot({
    snapshot: { ...baseSnapshot, distanceKm: 0.25 },
    rawElapsedSeconds: 40,
    officialStartBaseline: {
      matchId: 'match-1',
      distanceKm: 0.04,
      elapsedSeconds: 8,
      routeStartIndex: 0,
      routeStartPoint: baseSnapshot.route[0],
      startedAt: '2026-05-12T00:00:08.000Z',
    },
    hasPreStartWarmup: false,
    startNoiseGraceSeconds: 5,
    startNoiseGraceKm: 0.05,
  });

  assert.equal(displayed.distanceKm, 0.21);
  assert.equal(displayed.elapsedSeconds, 32);
});
