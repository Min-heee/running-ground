import * as Location from 'expo-location';
import { calculateDistanceBetweenPoints, formatPaceFromSecondsPerKm } from '@/features/runs/tracking';
import type { RunRoutePoint } from '@/domain';
import {
  buildFallbackPaceSecondsPerKm,
  buildRoutePoint,
  buildStableColdStartRouteCandidate,
  calculateElevationGainForSegment,
  calculateRouteWindowDistanceMeters,
  clamp,
  CURRENT_PACE_MIN_DISTANCE_METERS,
  CURRENT_PACE_MIN_WINDOW_MS,
  CURRENT_PACE_SMOOTHING_WINDOW_MS,
  CURRENT_PACE_STALE_AFTER_MS,
  findColdStartExcursionAnchorIndex,
  MAX_REASONABLE_PACE_SECONDS_PER_KM,
  MAX_REASONABLE_RUNNING_SPEED_MPS,
  MAX_TRACKING_ACCURACY_METERS,
  MIN_LOCATION_TIME_DELTA_MS,
  MIN_REASONABLE_PACE_SECONDS_PER_KM,
  MIN_TELEPORT_FILTER_DISTANCE_METERS,
  normalizeAccuracyMeters,
  normalizeReliableSpeedMps,
  resolveLocationTimestampMs,
  resolveRoutePointTimestampMs,
  shouldIgnoreNoisySegment,
  trimColdStartFixBuffer,
} from '@/features/runs/tracking/background/locationDistance';
import {
  commitSnapshot,
  getSnapshotState,
} from '@/features/runs/tracking/background/snapshotStore';
import {
  buildWarmupLocationSnapshot,
} from '@/features/runs/tracking/background/warmupSnapshotPolicy';

let accumulatedDistanceMeters = 0;
let accumulatedElevationGainMeters = 0;
let smoothedCurrentPaceSecondsPerKm: number | null = null;
let smoothedPaceUpdatedAtMs: number | null = null;
let coldStartFixBuffer: RunRoutePoint[] = [];

export function resetRouteAccumulator() {
  accumulatedDistanceMeters = 0;
  accumulatedElevationGainMeters = 0;
  smoothedCurrentPaceSecondsPerKm = null;
  smoothedPaceUpdatedAtMs = null;
  coldStartFixBuffer = [];
}

export function getAccumulatedDistanceMeters() {
  return accumulatedDistanceMeters;
}

export function setAccumulatedDistanceMeters(value: number) {
  accumulatedDistanceMeters = Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function getAccumulatedElevationGainMeters() {
  return accumulatedElevationGainMeters;
}

export function setAccumulatedElevationGainMeters(value: number) {
  accumulatedElevationGainMeters = Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function resetPaceSmoothing() {
  smoothedCurrentPaceSecondsPerKm = null;
  smoothedPaceUpdatedAtMs = null;
}

function formatSmoothedPaceCandidate(candidateSecondsPerKm: number | null, referenceTimestampMs: number) {
  if (candidateSecondsPerKm === null) {
    if (
      smoothedCurrentPaceSecondsPerKm !== null
      && smoothedPaceUpdatedAtMs !== null
      && referenceTimestampMs - smoothedPaceUpdatedAtMs <= CURRENT_PACE_STALE_AFTER_MS
    ) {
      return formatPaceFromSecondsPerKm(smoothedCurrentPaceSecondsPerKm);
    }

    smoothedCurrentPaceSecondsPerKm = null;
    smoothedPaceUpdatedAtMs = null;
    return '--:--/km';
  }

  const safeCandidateSecondsPerKm = clamp(
    candidateSecondsPerKm,
    MIN_REASONABLE_PACE_SECONDS_PER_KM,
    MAX_REASONABLE_PACE_SECONDS_PER_KM,
  );

  if (smoothedCurrentPaceSecondsPerKm === null) {
    smoothedCurrentPaceSecondsPerKm = safeCandidateSecondsPerKm;
  } else {
    const changeRatio = Math.abs(safeCandidateSecondsPerKm - smoothedCurrentPaceSecondsPerKm)
      / Math.max(1, smoothedCurrentPaceSecondsPerKm);
    const smoothingAlpha = changeRatio > 0.35 ? 0.22 : 0.42;
    smoothedCurrentPaceSecondsPerKm += (
      safeCandidateSecondsPerKm - smoothedCurrentPaceSecondsPerKm
    ) * smoothingAlpha;
  }

  smoothedPaceUpdatedAtMs = referenceTimestampMs;
  return formatPaceFromSecondsPerKm(smoothedCurrentPaceSecondsPerKm);
}

function buildSmoothedCurrentPace(
  route: RunRoutePoint[],
  fallbackSpeedMps?: number | null,
  referenceTimestampMs = Date.now(),
) {
  const fallbackPaceSecondsPerKm = buildFallbackPaceSecondsPerKm(fallbackSpeedMps);

  if (route.length < 2) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  const endPoint = route[route.length - 1];
  const endMs = resolveRoutePointTimestampMs(endPoint);

  if (endMs === null) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  if (referenceTimestampMs - endMs > CURRENT_PACE_STALE_AFTER_MS && fallbackPaceSecondsPerKm === null) {
    return formatSmoothedPaceCandidate(null, referenceTimestampMs);
  }

  let startIndex = route.length - 2;

  while (startIndex > 0) {
    const candidateMs = new Date(route[startIndex].timestamp).getTime();

    if (Number.isNaN(candidateMs) || endMs - candidateMs >= CURRENT_PACE_SMOOTHING_WINDOW_MS) {
      break;
    }

    startIndex -= 1;
  }

  const paceWindow = route.slice(startIndex);
  const startMs = resolveRoutePointTimestampMs(paceWindow[0]);

  if (startMs === null) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  const elapsedMs = endMs - startMs;

  if (elapsedMs < CURRENT_PACE_MIN_WINDOW_MS) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  const distanceMeters = calculateRouteWindowDistanceMeters(paceWindow);

  if (distanceMeters < CURRENT_PACE_MIN_DISTANCE_METERS) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  const secondsPerKm = (elapsedMs / 1000) / (distanceMeters / 1000);
  return formatSmoothedPaceCandidate(secondsPerKm, referenceTimestampMs);
}

function calculateRouteElevationGainMeters(route: RunRoutePoint[]) {
  let elevationGainMeters = 0;
  for (let index = 1; index < route.length; index += 1) {
    elevationGainMeters += calculateElevationGainForSegment(route[index - 1], route[index]);
  }

  return elevationGainMeters;
}

export function appendTrackedLocation(location: Location.LocationObject) {
  const snapshotState = getSnapshotState();

  if (snapshotState.status !== 'running') {
    return;
  }

  const locationTimestampMs = resolveLocationTimestampMs(location);

  if (locationTimestampMs === null) {
    return;
  }

  const warmupSnapshot = buildWarmupLocationSnapshot(snapshotState);
  if (warmupSnapshot) {
    commitSnapshot(warmupSnapshot);
    return;
  }

  const accuracyM = normalizeAccuracyMeters(location.coords.accuracy);
  const reliableSpeedMps = normalizeReliableSpeedMps(location.coords.speed);

  if (accuracyM !== null && accuracyM > MAX_TRACKING_ACCURACY_METERS) {
    commitSnapshot({
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  const nextPoint = buildRoutePoint(location);
  const previousPoint = snapshotState.route.length ? snapshotState.route[snapshotState.route.length - 1] : null;
  let nextAccumulatedDistanceMeters = accumulatedDistanceMeters;

  if (!previousPoint) {
    coldStartFixBuffer = trimColdStartFixBuffer([...coldStartFixBuffer, nextPoint]);
    const stableRoute = buildStableColdStartRouteCandidate(coldStartFixBuffer);

    if (!stableRoute) {
      commitSnapshot({
        ...snapshotState,
        currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
      });
      return;
    }

    accumulatedDistanceMeters = calculateRouteWindowDistanceMeters(stableRoute);
    accumulatedElevationGainMeters = calculateRouteElevationGainMeters(stableRoute);
    coldStartFixBuffer = [];

    commitSnapshot({
      ...snapshotState,
      route: stableRoute,
      startedAt: snapshotState.startedAt ?? stableRoute[0]?.timestamp ?? nextPoint.timestamp,
      distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
      elevationGainM: Math.round(accumulatedElevationGainMeters),
      currentPace: buildSmoothedCurrentPace(stableRoute, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  coldStartFixBuffer = [];

  const excursionAnchorIndex = findColdStartExcursionAnchorIndex(snapshotState.route, nextPoint);
  if (excursionAnchorIndex !== null) {
    const nextRoute = [...snapshotState.route.slice(0, excursionAnchorIndex + 1), nextPoint];
    accumulatedDistanceMeters = calculateRouteWindowDistanceMeters(nextRoute);
    accumulatedElevationGainMeters = calculateRouteElevationGainMeters(nextRoute);

    commitSnapshot({
      ...snapshotState,
      route: nextRoute,
      startedAt: snapshotState.startedAt ?? nextRoute[0]?.timestamp ?? nextPoint.timestamp,
      distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
      elevationGainM: Math.round(accumulatedElevationGainMeters),
      currentPace: buildSmoothedCurrentPace(nextRoute, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  const segmentDistanceMeters = calculateDistanceBetweenPoints(previousPoint, nextPoint);
  const timeDelta = new Date(nextPoint.timestamp).getTime() - new Date(previousPoint.timestamp).getTime();

  if (timeDelta < MIN_LOCATION_TIME_DELTA_MS) {
    commitSnapshot({
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  const segmentSpeedMps = segmentDistanceMeters / (timeDelta / 1000);
  const previousAccuracyM = normalizeAccuracyMeters(previousPoint.accuracyM);
  const worstAccuracyM = Math.max(previousAccuracyM ?? 0, accuracyM ?? 0);

  if (
    segmentDistanceMeters >= MIN_TELEPORT_FILTER_DISTANCE_METERS
    && segmentSpeedMps > MAX_REASONABLE_RUNNING_SPEED_MPS
  ) {
    commitSnapshot({
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  if (
    segmentDistanceMeters > Math.max(MIN_TELEPORT_FILTER_DISTANCE_METERS, worstAccuracyM * 1.8)
    && segmentSpeedMps > 5.8
  ) {
    commitSnapshot({
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  if (shouldIgnoreNoisySegment({
    segmentDistanceMeters,
    segmentSpeedMps,
    worstAccuracyM,
    reliableSpeedMps,
  })) {
    commitSnapshot({
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    });
    return;
  }

  nextAccumulatedDistanceMeters += segmentDistanceMeters;

  const nextRoute = [...snapshotState.route, nextPoint];
  accumulatedDistanceMeters = nextAccumulatedDistanceMeters;
  accumulatedElevationGainMeters += calculateElevationGainForSegment(previousPoint, nextPoint);
  commitSnapshot({
    ...snapshotState,
    route: nextRoute,
    startedAt: snapshotState.startedAt ?? nextPoint.timestamp,
    distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
    elevationGainM: Math.round(accumulatedElevationGainMeters),
    currentPace: buildSmoothedCurrentPace(nextRoute, reliableSpeedMps, locationTimestampMs),
  });
}
