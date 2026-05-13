import * as Location from 'expo-location';
import { calculateDistanceBetweenPoints, formatPaceFromSecondsPerKm } from '@/features/runs/tracking';
import type { RunRoutePoint } from '@/domain';
import {
  buildFallbackPaceSecondsPerKm,
  buildRoutePoint,
  calculateElevationGainForSegment,
  calculateRouteWindowDistanceMeters,
  clamp,
  CURRENT_PACE_MIN_DISTANCE_METERS,
  CURRENT_PACE_MIN_WINDOW_MS,
  CURRENT_PACE_SMOOTHING_WINDOW_MS,
  CURRENT_PACE_STALE_AFTER_MS,
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
} from '@/features/runs/tracking/background/locationDistance';
import {
  commitSnapshot,
  getSnapshotState,
} from '@/features/runs/tracking/background/snapshotStore';

let accumulatedDistanceMeters = 0;
let accumulatedElevationGainMeters = 0;
let smoothedCurrentPaceSecondsPerKm: number | null = null;
let smoothedPaceUpdatedAtMs: number | null = null;

export function resetRouteAccumulator() {
  accumulatedDistanceMeters = 0;
  accumulatedElevationGainMeters = 0;
  smoothedCurrentPaceSecondsPerKm = null;
  smoothedPaceUpdatedAtMs = null;
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

export function appendTrackedLocation(location: Location.LocationObject) {
  const snapshotState = getSnapshotState();

  if (snapshotState.status !== 'running') {
    return;
  }

  const locationTimestampMs = resolveLocationTimestampMs(location);

  if (locationTimestampMs === null) {
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

  if (previousPoint) {
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
  }

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
