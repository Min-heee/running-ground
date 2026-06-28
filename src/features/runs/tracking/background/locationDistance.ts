import * as Location from 'expo-location';
import type { RunRoutePoint } from '@/domain';
import { calculateDistanceBetweenPoints } from '@/features/runs/tracking';

export const CURRENT_PACE_SMOOTHING_WINDOW_MS = 35000;
export const CURRENT_PACE_MIN_WINDOW_MS = 12000;
export const CURRENT_PACE_MIN_DISTANCE_METERS = 28;
export const CURRENT_PACE_STALE_AFTER_MS = 14000;
export const MAX_TRACKING_ACCURACY_METERS = 40;
export const MAX_REASONABLE_RUNNING_SPEED_MPS = 8.5;
export const MIN_RELIABLE_RUNNING_SPEED_MPS = 0.7;
export const MIN_LOCATION_TIME_DELTA_MS = 900;
export const MIN_MOVEMENT_DISTANCE_METERS = 3.0;
export const MAX_LOCATION_AGE_MS = 15000;
export const MAX_FUTURE_LOCATION_MS = 3000;
export const MIN_TELEPORT_FILTER_DISTANCE_METERS = 35;
export const STATIONARY_SPEED_MPS = 0.9;
export const POOR_ACCURACY_METERS = 25;
export const MIN_REASONABLE_PACE_SECONDS_PER_KM = 150;
export const MAX_REASONABLE_PACE_SECONDS_PER_KM = 1200;
export const COLD_START_STABLE_FIX_COUNT = 3;
export const COLD_START_MAX_STABLE_ACCURACY_METERS = 20;
export const COLD_START_MAX_STABLE_CLUSTER_RADIUS_METERS = 30;
export const COLD_START_MAX_STABLE_WINDOW_MS = 10_000;
export const COLD_START_MAX_BUFFER_FIXES = 8;
export const COLD_START_EXCURSION_WINDOW_MS = 45_000;
export const COLD_START_EXCURSION_LOOKBACK_POINTS = 5;
export const COLD_START_EXCURSION_DIRECT_RADIUS_METERS = 22;
export const COLD_START_EXCURSION_MIN_PATH_METERS = 24;
export const COLD_START_EXCURSION_MIN_EXTRA_METERS = 12;
export const COLD_START_EXCURSION_MIN_INTERNAL_POINTS = 2;
export const MID_RUN_LATERAL_JITTER_LOOKBACK_POINTS = 5;
export const MID_RUN_LATERAL_JITTER_MAX_WINDOW_MS = 18_000;
export const MID_RUN_LATERAL_JITTER_MIN_DIRECT_METERS = 22;
export const MID_RUN_LATERAL_JITTER_MIN_PATH_METERS = 45;
export const MID_RUN_LATERAL_JITTER_MIN_EXTRA_METERS = 14;
export const MID_RUN_LATERAL_JITTER_MIN_EXTRA_RATIO = 0.24;
export const MID_RUN_LATERAL_JITTER_MIN_SIDE_METERS = 6;
export const DISTANCE_GATE_BASE_METERS = 3.0;
export const DISTANCE_GATE_ACCURACY_SCALE = 0.15;

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

export function resolveDistanceGateMeters(worstAccuracyM: number) {
  return DISTANCE_GATE_BASE_METERS + Math.max(0, worstAccuracyM) * DISTANCE_GATE_ACCURACY_SCALE;
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

function hasStableColdStartAccuracy(point: RunRoutePoint) {
  const accuracyM = normalizeAccuracyMeters(point.accuracyM);
  return accuracyM === null || accuracyM <= COLD_START_MAX_STABLE_ACCURACY_METERS;
}

export function buildStableColdStartRouteCandidate(points: RunRoutePoint[]) {
  if (points.length < COLD_START_STABLE_FIX_COUNT) {
    return null;
  }

  const recentPoints = points.slice(-COLD_START_STABLE_FIX_COUNT);
  const firstTimestampMs = resolveRoutePointTimestampMs(recentPoints[0]);
  const lastTimestampMs = resolveRoutePointTimestampMs(recentPoints[recentPoints.length - 1]);

  if (
    firstTimestampMs === null
    || lastTimestampMs === null
    || lastTimestampMs <= firstTimestampMs
    || lastTimestampMs - firstTimestampMs > COLD_START_MAX_STABLE_WINDOW_MS
  ) {
    return null;
  }

  if (!recentPoints.every(hasStableColdStartAccuracy)) {
    return null;
  }

  let maxPairDistanceMeters = 0;
  for (let leftIndex = 0; leftIndex < recentPoints.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < recentPoints.length; rightIndex += 1) {
      maxPairDistanceMeters = Math.max(
        maxPairDistanceMeters,
        calculateDistanceBetweenPoints(recentPoints[leftIndex], recentPoints[rightIndex]),
      );
    }
  }

  return maxPairDistanceMeters <= COLD_START_MAX_STABLE_CLUSTER_RADIUS_METERS
    ? recentPoints
    : null;
}

export function trimColdStartFixBuffer(points: RunRoutePoint[]) {
  if (points.length <= COLD_START_MAX_BUFFER_FIXES) {
    return points;
  }

  return points.slice(-COLD_START_MAX_BUFFER_FIXES);
}

export function findColdStartExcursionAnchorIndex(route: RunRoutePoint[], nextPoint: RunRoutePoint) {
  if (route.length < 2) {
    return null;
  }

  const firstTimestampMs = resolveRoutePointTimestampMs(route[0]);
  const nextTimestampMs = resolveRoutePointTimestampMs(nextPoint);

  if (
    firstTimestampMs === null
    || nextTimestampMs === null
    || nextTimestampMs - firstTimestampMs > COLD_START_EXCURSION_WINDOW_MS
  ) {
    return null;
  }

  const minAnchorIndex = Math.max(0, route.length - COLD_START_EXCURSION_LOOKBACK_POINTS);

  for (let anchorIndex = route.length - 2; anchorIndex >= minAnchorIndex; anchorIndex -= 1) {
    const anchorPoint = route[anchorIndex];
    const directDistanceMeters = calculateDistanceBetweenPoints(anchorPoint, nextPoint);

    if (directDistanceMeters > COLD_START_EXCURSION_DIRECT_RADIUS_METERS) {
      continue;
    }

    const candidatePath = [...route.slice(anchorIndex), nextPoint];
    const internalPointCount = candidatePath.length - 2;
    const candidatePathDistanceMeters = calculateRouteWindowDistanceMeters(candidatePath);

    if (
      internalPointCount >= COLD_START_EXCURSION_MIN_INTERNAL_POINTS
      && candidatePathDistanceMeters >= COLD_START_EXCURSION_MIN_PATH_METERS
      && candidatePathDistanceMeters - directDistanceMeters >= COLD_START_EXCURSION_MIN_EXTRA_METERS
    ) {
      return anchorIndex;
    }
  }

  return null;
}

function calculateLocalVectorMeters(origin: RunRoutePoint, point: RunRoutePoint) {
  const averageLatitudeRadians = ((origin.latitude + point.latitude) / 2) * Math.PI / 180;
  const metersPerLatitudeDegree = 111_320;
  const metersPerLongitudeDegree = metersPerLatitudeDegree * Math.cos(averageLatitudeRadians);

  return {
    east: (point.longitude - origin.longitude) * metersPerLongitudeDegree,
    north: (point.latitude - origin.latitude) * metersPerLatitudeDegree,
  };
}

function calculateSignedLateralDistanceMeters(
  anchorPoint: RunRoutePoint,
  endPoint: RunRoutePoint,
  candidatePoint: RunRoutePoint,
) {
  const endVector = calculateLocalVectorMeters(anchorPoint, endPoint);
  const candidateVector = calculateLocalVectorMeters(anchorPoint, candidatePoint);
  const directMagnitude = Math.hypot(endVector.east, endVector.north);

  if (directMagnitude <= 0) {
    return 0;
  }

  return (
    endVector.east * candidateVector.north
    - endVector.north * candidateVector.east
  ) / directMagnitude;
}

function findOpposingLateralJitterSides(
  anchorPoint: RunRoutePoint,
  endPoint: RunRoutePoint,
  candidatePoints: RunRoutePoint[],
  lateralThresholdMeters: number,
) {
  let hasPositiveSide = false;
  let hasNegativeSide = false;

  for (const point of candidatePoints) {
    const signedLateralMeters = calculateSignedLateralDistanceMeters(anchorPoint, endPoint, point);

    if (signedLateralMeters >= lateralThresholdMeters) {
      hasPositiveSide = true;
    }

    if (signedLateralMeters <= -lateralThresholdMeters) {
      hasNegativeSide = true;
    }

    if (hasPositiveSide && hasNegativeSide) {
      return true;
    }
  }

  return false;
}

function resolveRouteWindowMaxAccuracyMeters(points: RunRoutePoint[]) {
  return points.reduce((maxAccuracyM, point) => {
    const accuracyM = normalizeAccuracyMeters(point.accuracyM);
    return Math.max(maxAccuracyM, accuracyM ?? 0);
  }, 0);
}

export function findMidRunLateralJitterAnchorIndex(route: RunRoutePoint[], nextPoint: RunRoutePoint) {
  if (route.length < 3) {
    return null;
  }

  const nextTimestampMs = resolveRoutePointTimestampMs(nextPoint);

  if (nextTimestampMs === null) {
    return null;
  }

  const minAnchorIndex = Math.max(0, route.length - MID_RUN_LATERAL_JITTER_LOOKBACK_POINTS);

  for (let anchorIndex = route.length - 3; anchorIndex >= minAnchorIndex; anchorIndex -= 1) {
    const anchorPoint = route[anchorIndex];
    const anchorTimestampMs = resolveRoutePointTimestampMs(anchorPoint);

    if (
      anchorTimestampMs === null
      || nextTimestampMs <= anchorTimestampMs
      || nextTimestampMs - anchorTimestampMs > MID_RUN_LATERAL_JITTER_MAX_WINDOW_MS
    ) {
      continue;
    }

    const candidatePath = [...route.slice(anchorIndex), nextPoint];
    const internalPoints = candidatePath.slice(1, -1);

    if (internalPoints.length < 2) {
      continue;
    }

    const directDistanceMeters = calculateDistanceBetweenPoints(anchorPoint, nextPoint);
    const candidatePathDistanceMeters = calculateRouteWindowDistanceMeters(candidatePath);

    if (
      directDistanceMeters < MID_RUN_LATERAL_JITTER_MIN_DIRECT_METERS
      || candidatePathDistanceMeters < MID_RUN_LATERAL_JITTER_MIN_PATH_METERS
    ) {
      continue;
    }

    const maxAccuracyM = resolveRouteWindowMaxAccuracyMeters(candidatePath);
    const extraDistanceMeters = candidatePathDistanceMeters - directDistanceMeters;
    const minExtraDistanceMeters = Math.max(
      MID_RUN_LATERAL_JITTER_MIN_EXTRA_METERS,
      maxAccuracyM * 1.4,
    );

    if (
      extraDistanceMeters < minExtraDistanceMeters
      || extraDistanceMeters / candidatePathDistanceMeters < MID_RUN_LATERAL_JITTER_MIN_EXTRA_RATIO
    ) {
      continue;
    }

    const lateralThresholdMeters = Math.max(
      MID_RUN_LATERAL_JITTER_MIN_SIDE_METERS,
      Math.min(14, maxAccuracyM * 0.75),
    );

    if (findOpposingLateralJitterSides(anchorPoint, nextPoint, internalPoints, lateralThresholdMeters)) {
      return anchorIndex;
    }
  }

  return null;
}
