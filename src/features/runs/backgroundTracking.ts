import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { RunRoutePoint } from '@/domain/types';
import {
  calculateDistanceBetweenPoints,
  calculateElevationGainM,
  calculateRouteDistanceKm,
  formatPaceFromSpeedMps,
} from '@/features/runs/tracking';

const BACKGROUND_RUN_TASK_NAME = 'runnigapp-background-run-location';

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

function buildRoutePoint(location: Location.LocationObject): RunRoutePoint {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    altitude: typeof location.coords.altitude === 'number' ? Number(location.coords.altitude.toFixed(1)) : null,
    timestamp: new Date(location.timestamp).toISOString(),
  };
}

function appendTrackedLocation(location: Location.LocationObject) {
  const nextPoint = buildRoutePoint(location);
  const previousPoint = snapshotState.route.length ? snapshotState.route[snapshotState.route.length - 1] : null;

  if (previousPoint) {
    const segmentDistanceMeters = calculateDistanceBetweenPoints(previousPoint, nextPoint);
    const timeDelta = new Date(nextPoint.timestamp).getTime() - new Date(previousPoint.timestamp).getTime();

    if (segmentDistanceMeters < 2 && timeDelta < 4000) {
      snapshotState = {
        ...snapshotState,
        currentPace: formatPaceFromSpeedMps(location.coords.speed),
      };
      emitSnapshot();
      return;
    }
  }

  const nextRoute = [...snapshotState.route, nextPoint];
  snapshotState = {
    ...snapshotState,
    route: nextRoute,
    startedAt: snapshotState.startedAt ?? nextPoint.timestamp,
    distanceKm: calculateRouteDistanceKm(nextRoute),
    elevationGainM: calculateElevationGainM(nextRoute),
    currentPace: formatPaceFromSpeedMps(location.coords.speed),
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
            notificationTitle: 'RUNNIGAPP가 러닝을 측정 중이에요',
            notificationBody: '백그라운드에서도 거리와 경로를 계속 기록하고 있어요.',
          },
        }
      : {}),
  };
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(BACKGROUND_RUN_TASK_NAME)) {
  TaskManager.defineTask(BACKGROUND_RUN_TASK_NAME, async ({ data, error }) => {
    if (error || !data) {
      return;
    }

    const locations = Array.isArray((data as { locations?: Location.LocationObject[] }).locations)
      ? (data as { locations?: Location.LocationObject[] }).locations ?? []
      : [];

    locations.forEach(appendTrackedLocation);
  });
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

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME);

  if (started) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME);
  }
}

async function startLocationTask() {
  if (Platform.OS === 'web') {
    return;
  }

  await stopLocationTaskIfNeeded();
  await Location.startLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME, buildLocationTaskOptions());
}

export async function startBackgroundRunTracking(initialLocation: Location.LocationObject) {
  snapshotState = {
    ...INITIAL_SNAPSHOT,
    status: 'running',
  };
  appendTrackedLocation(initialLocation);
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
  snapshotState = { ...INITIAL_SNAPSHOT };
  emitSnapshot();
}
