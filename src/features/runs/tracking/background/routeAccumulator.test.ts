import assert from 'node:assert/strict';
import test from 'node:test';
import type * as Location from 'expo-location';
import {
  appendTrackedLocation,
  getAccumulatedDistanceMeters,
  resetRouteAccumulator,
} from '@/features/runs/tracking/background/routeAccumulator';
import {
  INITIAL_SNAPSHOT,
  getSnapshotState,
  setSnapshotState,
} from '@/features/runs/tracking/background/snapshotStore';

const BASE_LATITUDE = 37.5;
const BASE_LONGITUDE = 127;

function longitudeOffsetForMeters(meters: number, latitude = BASE_LATITUDE) {
  return meters / (111_320 * Math.cos(latitude * Math.PI / 180));
}

function locationAt({
  metersEast,
  timestampMs,
  accuracyM = 8,
  speedMps = 2.5,
}: {
  metersEast: number;
  timestampMs: number;
  accuracyM?: number;
  speedMps?: number;
}) {
  return {
    coords: {
      latitude: BASE_LATITUDE,
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

  appendTrackedLocation(locationAt({ metersEast: 0, timestampMs: baseMs, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 8, timestampMs: baseMs + 1_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 16, timestampMs: baseMs + 2_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 28, timestampMs: baseMs + 3_200, speedMps: 3 }));

  const snapshot = getSnapshotState();
  assert.equal(snapshot.route.length, 4);
  assert.ok(getAccumulatedDistanceMeters() >= 24);
  assert.ok(getAccumulatedDistanceMeters() <= 34);
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
  appendTrackedLocation(locationAt({ metersEast: 8, timestampMs: baseMs + 1_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 16, timestampMs: baseMs + 2_000, speedMps: 3 }));
  appendTrackedLocation(locationAt({ metersEast: 220, timestampMs: baseMs + 3_200, speedMps: 3 }));

  const snapshot = getSnapshotState();
  assert.equal(snapshot.route.length, 3);
  assert.ok(getAccumulatedDistanceMeters() < 25);
});
