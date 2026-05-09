import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { RunRoutePoint } from '@/domain/types';
import {
  calculateDistanceBetweenPoints,
  calculateElevationGainM,
  formatPaceFromSecondsPerKm,
} from '@/features/runs/tracking';

const BACKGROUND_RUN_TASK_NAME = 'runningground-background-run-location';
const LEGACY_BACKGROUND_RUN_TASK_NAME = 'runnigapp-background-run-location';
const CURRENT_PACE_SMOOTHING_WINDOW_MS = 35000;
const CURRENT_PACE_MIN_WINDOW_MS = 12000;
const CURRENT_PACE_MIN_DISTANCE_METERS = 28;
const CURRENT_PACE_STALE_AFTER_MS = 14000;
const MAX_TRACKING_ACCURACY_METERS = 45;
const MAX_REASONABLE_RUNNING_SPEED_MPS = 8.5;
const MIN_RELIABLE_RUNNING_SPEED_MPS = 0.7;
const MIN_LOCATION_TIME_DELTA_MS = 900;
const MIN_MOVEMENT_DISTANCE_METERS = 2.5;
const MAX_LOCATION_AGE_MS = 15000;
const MAX_FUTURE_LOCATION_MS = 3000;
const MIN_TELEPORT_FILTER_DISTANCE_METERS = 35;
const STATIONARY_SPEED_MPS = 0.9;
const POOR_ACCURACY_METERS = 25;
const MIN_REASONABLE_PACE_SECONDS_PER_KM = 150;
const MAX_REASONABLE_PACE_SECONDS_PER_KM = 1200;

type BackgroundTrackingStatus = 'idle' | 'running' | 'paused';

export type BackgroundRunTrackingSnapshot = {
  status: BackgroundTrackingStatus;
  route: RunRoutePoint[];
  distanceKm: number;
  elevationGainM: number;
  currentPace: string;
  startedAt: string | null;
  pausedAt: string | null;
  accumulatedPausedMs: number;
};

const INITIAL_SNAPSHOT: BackgroundRunTrackingSnapshot = {
  status: 'idle',
  route: [],
  distanceKm: 0,
  elevationGainM: 0,
  currentPace: '--:--/km',
  startedAt: null,
  pausedAt: null,
  accumulatedPausedMs: 0,
};

const listeners = new Set<(snapshot: BackgroundRunTrackingSnapshot) => void>();
let snapshotState: BackgroundRunTrackingSnapshot = { ...INITIAL_SNAPSHOT };
let foregroundLocationSubscription: { remove: () => void } | null = null;
let accumulatedDistanceMeters = 0;
let smoothedCurrentPaceSecondsPerKm: number | null = null;
let smoothedPaceUpdatedAtMs: number | null = null;

function cloneRoute(route: RunRoutePoint[]) {
  return route.map((point) => ({ ...point }));
}

function buildSnapshotClone(snapshot: BackgroundRunTrackingSnapshot): BackgroundRunTrackingSnapshot {
  return {
    ...snapshot,
    route: cloneRoute(snapshot.route),
  };
}

function emitSnapshot() {
  const nextSnapshot = buildSnapshotClone(snapshotState);
  listeners.forEach((listener) => listener(nextSnapshot));
}

function normalizeAccuracyMeters(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Number(value.toFixed(1))
    : null;
}

function normalizeReliableSpeedMps(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value < MIN_RELIABLE_RUNNING_SPEED_MPS || value > MAX_REASONABLE_RUNNING_SPEED_MPS) {
    return null;
  }

  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function resolveLocationTimestampMs(location: Location.LocationObject) {
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

function buildRoutePoint(location: Location.LocationObject): RunRoutePoint {
  const accuracyM = normalizeAccuracyMeters(location.coords.accuracy);

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    altitude: typeof location.coords.altitude === 'number' ? Number(location.coords.altitude.toFixed(1)) : null,
    ...(accuracyM !== null ? { accuracyM } : {}),
    timestamp: new Date(location.timestamp).toISOString(),
  };
}

function resolveRoutePointTimestampMs(point: RunRoutePoint) {
  const timestampMs = new Date(point.timestamp).getTime();
  return Number.isNaN(timestampMs) ? null : timestampMs;
}

function buildFallbackPaceSecondsPerKm(speedMps?: number | null) {
  const reliableFallbackSpeedMps = normalizeReliableSpeedMps(speedMps);

  if (reliableFallbackSpeedMps === null) {
    return null;
  }

  return 1000 / reliableFallbackSpeedMps;
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

  let distanceMeters = 0;
  for (let index = 1; index < paceWindow.length; index += 1) {
    distanceMeters += calculateDistanceBetweenPoints(paceWindow[index - 1], paceWindow[index]);
  }

  if (distanceMeters < CURRENT_PACE_MIN_DISTANCE_METERS) {
    return formatSmoothedPaceCandidate(fallbackPaceSecondsPerKm, referenceTimestampMs);
  }

  const secondsPerKm = (elapsedMs / 1000) / (distanceMeters / 1000);
  return formatSmoothedPaceCandidate(secondsPerKm, referenceTimestampMs);
}

function resolveDynamicMinMovementMeters(worstAccuracyM: number) {
  return Math.max(
    MIN_MOVEMENT_DISTANCE_METERS,
    Math.min(4.5, worstAccuracyM * 0.1),
  );
}

function shouldIgnoreNoisySegment({
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

function appendTrackedLocation(location: Location.LocationObject) {
  const locationTimestampMs = resolveLocationTimestampMs(location);

  if (locationTimestampMs === null) {
    return;
  }

  const accuracyM = normalizeAccuracyMeters(location.coords.accuracy);
  const reliableSpeedMps = normalizeReliableSpeedMps(location.coords.speed);

  if (accuracyM !== null && accuracyM > MAX_TRACKING_ACCURACY_METERS) {
    snapshotState = {
      ...snapshotState,
      currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
    };
    emitSnapshot();
    return;
  }

  const nextPoint = buildRoutePoint(location);
  const previousPoint = snapshotState.route.length ? snapshotState.route[snapshotState.route.length - 1] : null;
  let nextAccumulatedDistanceMeters = accumulatedDistanceMeters;

  if (previousPoint) {
    const segmentDistanceMeters = calculateDistanceBetweenPoints(previousPoint, nextPoint);
    const timeDelta = new Date(nextPoint.timestamp).getTime() - new Date(previousPoint.timestamp).getTime();

    if (timeDelta < MIN_LOCATION_TIME_DELTA_MS) {
      snapshotState = {
        ...snapshotState,
        currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
      };
      emitSnapshot();
      return;
    }

    const segmentSpeedMps = segmentDistanceMeters / (timeDelta / 1000);
    const previousAccuracyM = normalizeAccuracyMeters(previousPoint.accuracyM);
    const worstAccuracyM = Math.max(previousAccuracyM ?? 0, accuracyM ?? 0);

    if (
      segmentDistanceMeters >= MIN_TELEPORT_FILTER_DISTANCE_METERS
      && segmentSpeedMps > MAX_REASONABLE_RUNNING_SPEED_MPS
    ) {
      snapshotState = {
        ...snapshotState,
        currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
      };
      emitSnapshot();
      return;
    }

    if (
      segmentDistanceMeters > Math.max(MIN_TELEPORT_FILTER_DISTANCE_METERS, worstAccuracyM * 1.8)
      && segmentSpeedMps > 5.8
    ) {
      snapshotState = {
        ...snapshotState,
        currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
      };
      emitSnapshot();
      return;
    }

    if (shouldIgnoreNoisySegment({
      segmentDistanceMeters,
      segmentSpeedMps,
      worstAccuracyM,
      reliableSpeedMps,
    })) {
      snapshotState = {
        ...snapshotState,
        currentPace: buildSmoothedCurrentPace(snapshotState.route, reliableSpeedMps, locationTimestampMs),
      };
      emitSnapshot();
      return;
    }

    nextAccumulatedDistanceMeters += segmentDistanceMeters;
  }

  const nextRoute = [...snapshotState.route, nextPoint];
  accumulatedDistanceMeters = nextAccumulatedDistanceMeters;
  snapshotState = {
    ...snapshotState,
    route: nextRoute,
    startedAt: snapshotState.startedAt ?? nextPoint.timestamp,
    distanceKm: Number((accumulatedDistanceMeters / 1000).toFixed(2)),
    elevationGainM: calculateElevationGainM(nextRoute),
    currentPace: buildSmoothedCurrentPace(nextRoute, reliableSpeedMps, locationTimestampMs),
  };
  emitSnapshot();
}

function buildLocationTaskOptions(): Location.LocationTaskOptions {
  return {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    distanceInterval: 4,
    mayShowUserSettingsDialog: true,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    ...(Platform.OS === 'android'
      ? {
          foregroundService: {
            notificationTitle: 'RunningGround가 러닝을 측정 중이에요',
            notificationBody: '백그라운드에서도 거리와 경로를 계속 기록하고 있어요.',
          },
        }
      : {}),
  };
}

function buildForegroundLocationOptions(): Location.LocationOptions {
  return {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    distanceInterval: 4,
    mayShowUserSettingsDialog: true,
  };
}

function defineBackgroundRunTask(taskName: string) {
  if (TaskManager.isTaskDefined(taskName)) {
    return;
  }

  TaskManager.defineTask(taskName, async ({ data, error }) => {
    if (error || !data) {
      return;
    }

    const locations = Array.isArray((data as { locations?: Location.LocationObject[] }).locations)
      ? (data as { locations?: Location.LocationObject[] }).locations ?? []
      : [];

    locations.forEach(appendTrackedLocation);
  });
}

if (Platform.OS !== 'web') {
  defineBackgroundRunTask(BACKGROUND_RUN_TASK_NAME);
  defineBackgroundRunTask(LEGACY_BACKGROUND_RUN_TASK_NAME);
}

export function getBackgroundRunTrackingSnapshot() {
  return buildSnapshotClone(snapshotState);
}

export function getBackgroundRunElapsedSeconds(snapshot = snapshotState, nowMs = Date.now()) {
  if (!snapshot.startedAt) {
    return 0;
  }

  const startedAtMs = new Date(snapshot.startedAt).getTime();

  if (Number.isNaN(startedAtMs)) {
    return 0;
  }

  const referenceMs = snapshot.status === 'paused' && snapshot.pausedAt
    ? new Date(snapshot.pausedAt).getTime()
    : nowMs;

  if (Number.isNaN(referenceMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((referenceMs - startedAtMs - snapshot.accumulatedPausedMs) / 1000));
}

export function subscribeBackgroundRunTracking(listener: (snapshot: BackgroundRunTrackingSnapshot) => void) {
  listeners.add(listener);
  listener(getBackgroundRunTrackingSnapshot());

  return () => {
    listeners.delete(listener);
  };
}

async function stopLocationTaskIfNeeded() {
  if (Platform.OS === 'web') {
    return;
  }

  foregroundLocationSubscription?.remove();
  foregroundLocationSubscription = null;

  for (const taskName of [BACKGROUND_RUN_TASK_NAME, LEGACY_BACKGROUND_RUN_TASK_NAME]) {
    const started = await Location.hasStartedLocationUpdatesAsync(taskName);

    if (started) {
      await Location.stopLocationUpdatesAsync(taskName);
    }
  }
}

async function startLocationTask() {
  if (Platform.OS === 'web') {
    return;
  }

  await stopLocationTaskIfNeeded();

  try {
    foregroundLocationSubscription = await Location.watchPositionAsync(
      buildForegroundLocationOptions(),
      appendTrackedLocation,
    );
  } catch {
    foregroundLocationSubscription = null;
  }

  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME, buildLocationTaskOptions());
  } catch {
    // Foreground tracking is enough while the race screen is open; background updates are best-effort.
  }
}

export async function startBackgroundRunTracking(initialLocation?: Location.LocationObject | null) {
  accumulatedDistanceMeters = 0;
  smoothedCurrentPaceSecondsPerKm = null;
  smoothedPaceUpdatedAtMs = null;
  const initialTimestampMs = initialLocation ? resolveLocationTimestampMs(initialLocation) : null;
  snapshotState = {
    ...INITIAL_SNAPSHOT,
    status: 'running',
    startedAt: new Date(initialTimestampMs ?? Date.now()).toISOString(),
  };

  if (initialLocation) {
    appendTrackedLocation(initialLocation);
  } else {
    emitSnapshot();
  }

  snapshotState = {
    ...snapshotState,
    status: 'running',
    pausedAt: null,
  };
  emitSnapshot();
  await startLocationTask();
}

export async function pauseBackgroundRunTracking() {
  if (snapshotState.status !== 'running') {
    return;
  }

  snapshotState = {
    ...snapshotState,
    status: 'paused',
    pausedAt: new Date().toISOString(),
    currentPace: '--:--/km',
  };
  smoothedCurrentPaceSecondsPerKm = null;
  smoothedPaceUpdatedAtMs = null;
  emitSnapshot();
  await stopLocationTaskIfNeeded();
}

export async function resumeBackgroundRunTracking() {
  if (snapshotState.status !== 'paused') {
    return;
  }

  const resumedAtMs = Date.now();
  const pausedAtMs = snapshotState.pausedAt ? new Date(snapshotState.pausedAt).getTime() : resumedAtMs;
  const additionalPausedMs = Number.isNaN(pausedAtMs) ? 0 : Math.max(0, resumedAtMs - pausedAtMs);

  snapshotState = {
    ...snapshotState,
    status: 'running',
    pausedAt: null,
    accumulatedPausedMs: snapshotState.accumulatedPausedMs + additionalPausedMs,
  };
  emitSnapshot();
  await startLocationTask();
}

export async function resetBackgroundRunTracking() {
  await stopLocationTaskIfNeeded();
  accumulatedDistanceMeters = 0;
  smoothedCurrentPaceSecondsPerKm = null;
  smoothedPaceUpdatedAtMs = null;
  snapshotState = { ...INITIAL_SNAPSHOT };
  emitSnapshot();
}
