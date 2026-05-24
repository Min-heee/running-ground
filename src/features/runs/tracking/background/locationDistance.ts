import * as Location from 'expo-location';
import type { RunRoutePoint } from '@/domain';
import { calculateDistanceBetweenPoints } from '@/features/runs/tracking';

export const CURRENT_PACE_SMOOTHING_WINDOW_MS = 35000;
export const CURRENT_PACE_MIN_WINDOW_MS = 12000;
export const CURRENT_PACE_MIN_DISTANCE_METERS = 28;
export const CURRENT_PACE_STALE_AFTER_MS = 14000;
export const MAX_TRACKING_ACCURACY_METERS = 60;
export const MAX_REASONABLE_RUNNING_SPEED_MPS = 8.5;
export const MIN_RELIABLE_RUNNING_SPEED_MPS = 0.7;
export const MIN_LOCATION_TIME_DELTA_MS = 900;
export const MIN_MOVEMENT_DISTANCE_METERS = 2.5;
export const MAX_LOCATION_AGE_MS = 15000;
export const MAX_FUTURE_LOCATION_MS = 3000;
export const MIN_TELEPORT_FILTER_DISTANCE_METERS = 35;
export const STATIONARY_SPEED_MPS = 0.9;
export const POOR_ACCURACY_METERS = 25;
export const MIN_REASONABLE_PACE_SECONDS_PER_KM = 150;
export const MAX_REASONABLE_PACE_SECONDS_PER_KM = 1200;

export function normalizeAccuracyMeters(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Number(value.toFixed(1))
    : null;
}

export function normalizeReliableSpeedMps(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value < MIN_RELIABLE_RUNNING_SPEED_MPS || value > MAX_REASONABLE_RUNNING_SPEED_MPS) {
    return null;
  }

  return value;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function resolveLocationTimestampMs(location: Location.LocationObject) {
  const timestampMs = typeof location.timestamp === 'number' ? location.timestamp : NaN;

  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  const nowMs = Date.now();
  if (nowMs - timestampMs > MAX_LOCATION_AGE_MS || timestampMs - nowMs > MAX_FUTURE_LOCATION_MS) {
    return null;
  }

  return timestampMs;
}

export function buildRoutePoint(location: Location.LocationObject): RunRoutePoint {
  const accuracyM = normalizeAccuracyMeters(location.coords.accuracy);

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    altitude: typeof location.coords.altitude === 'number' ? Number(location.coords.altitude.toFixed(1)) : null,
    ...(accuracyM !== null ? { accuracyM } : {}),
    timestamp: new Date(location.timestamp).toISOString(),
  };
}

export function calculateElevationGainForSegment(previousPoint: RunRoutePoint | null, nextPoint: RunRoutePoint) {
  if (!previousPoint) {
    return 0;
  }

  if (typeof previousPoint.altitude !== 'number' || typeof nextPoint.altitude !== 'number') {
    return 0;
  }

  const altitudeDelta = nextPoint.altitude - previousPoint.altitude;
  return altitudeDelta > 0.8 ? altitudeDelta : 0;
}

export function resolveRoutePointTimestampMs(point: RunRoutePoint) {
  const timestampMs = new Date(point.timestamp).getTime();
  return Number.isNaN(timestampMs) ? null : timestampMs;
}

export function buildFallbackPaceSecondsPerKm(speedMps?: number | null) {
  const reliableFallbackSpeedMps = normalizeReliableSpeedMps(speedMps);

  if (reliableFallbackSpeedMps === null) {
    return null;
  }

  return 1000 / reliableFallbackSpeedMps;
}

export function resolveDynamicMinMovementMeters(worstAccuracyM: number) {
  return Math.max(
    MIN_MOVEMENT_DISTANCE_METERS,
    Math.min(4.5, worstAccuracyM * 0.1),
  );
}

export function shouldIgnoreNoisySegment({
  segmentDistanceMeters,
  segmentSpeedMps,
  worstAccuracyM,
  reliableSpeedMps,
}: {
  segmentDistanceMeters: number;
  segmentSpeedMps: number;
  worstAccuracyM: number;
  reliableSpeedMps: number | null;
}) {
  if (segmentDistanceMeters < resolveDynamicMinMovementMeters(worstAccuracyM)) {
    return true;
  }

  const looksStationary = (
    (reliableSpeedMps !== null && reliableSpeedMps < STATIONARY_SPEED_MPS)
    || segmentSpeedMps < STATIONARY_SPEED_MPS
  );
  const stationaryNoiseRadiusMeters = Math.max(4, Math.min(12, worstAccuracyM * 0.35));

  if (looksStationary && segmentDistanceMeters < stationaryNoiseRadiusMeters) {
    return true;
  }

  const hasPoorAccuracy = worstAccuracyM >= POOR_ACCURACY_METERS;
  const poorAccuracyNoiseRadiusMeters = Math.min(12, worstAccuracyM * 0.25);

  return hasPoorAccuracy
    && segmentSpeedMps < 1.4
    && segmentDistanceMeters < poorAccuracyNoiseRadiusMeters;
}

export function calculateRouteWindowDistanceMeters(route: RunRoutePoint[]) {
  let distanceMeters = 0;
  for (let index = 1; index < route.length; index += 1) {
    distanceMeters += calculateDistanceBetweenPoints(route[index - 1], route[index]);
  }

  return distanceMeters;
}
