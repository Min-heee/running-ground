import * as Location from 'expo-location';
import type { AppStateStatus } from 'react-native';
import '@/features/runs/tracking/background/locationTask';
import {
  appendTrackedLocation,
  resetPaceSmoothing,
  resetRouteAccumulator,
} from '@/features/runs/tracking/background/routeAccumulator';
import {
  buildSnapshotClone,
  emitSnapshot,
  getSnapshotState,
  INITIAL_SNAPSHOT,
  resolveSnapshotElapsedMs,
  setSnapshotState,
  subscribeSnapshot,
  type BackgroundRunTrackingSnapshot,
  type SnapshotCloneOptions,
} from '@/features/runs/tracking/background/snapshotStore';
import {
  startLocationTask,
  stopLocationTaskIfNeeded,
} from '@/features/runs/tracking/background/subscriptions';
import { resolveLocationTimestampMs } from '@/features/runs/tracking/background/locationDistance';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

export type {
  BackgroundRunTrackingSnapshot,
  BackgroundTrackingStatus,
  SnapshotCloneOptions,
} from '@/features/runs/tracking/background/snapshotStore';

export type StartBackgroundRunTrackingOptions = {
  appState?: AppStateStatus;
  detachLocationTask?: boolean;
};

const ABANDONED_TRACKING_MAX_ELAPSED_MS = 8 * 60 * 60 * 1000;
const ABANDONED_LOW_DISTANCE_MAX_ELAPSED_MS = 2 * 60 * 60 * 1000;
const ABANDONED_LOW_DISTANCE_KM = 1;

let abandonedTrackingStopRequested = false;

function shouldResetAbandonedTracking(snapshot: BackgroundRunTrackingSnapshot, nowMs = Date.now()) {
  if (snapshot.status === 'idle') {
    return false;
  }

  const elapsedMs = resolveSnapshotElapsedMs(snapshot, nowMs);
  if (elapsedMs >= ABANDONED_TRACKING_MAX_ELAPSED_MS) {
    return true;
  }

  return elapsedMs >= ABANDONED_LOW_DISTANCE_MAX_ELAPSED_MS
    && snapshot.distanceKm <= ABANDONED_LOW_DISTANCE_KM;
}

function resetTrackingStateOnly() {
  resetRouteAccumulator();
  setSnapshotState({ ...INITIAL_SNAPSHOT });
}

function stopAbandonedLocationTasksBestEffort() {
  if (abandonedTrackingStopRequested) {
    return;
  }

  abandonedTrackingStopRequested = true;
  void stopLocationTaskIfNeeded().finally(() => {
    abandonedTrackingStopRequested = false;
  });
}

function resetAbandonedTrackingIfNeeded(nowMs = Date.now()) {
  if (!shouldResetAbandonedTracking(getSnapshotState(), nowMs)) {
    return false;
  }

  resetTrackingStateOnly();
  stopAbandonedLocationTasksBestEffort();
  emitSnapshot();
  return true;
}

async function startLocationTaskWithTrace(options?: StartBackgroundRunTrackingOptions) {
  const endBackgroundTaskStartTrace = rgPerfMeasureStart('background task start', {
    appState: options?.appState ?? null,
    detached: Boolean(options?.detachLocationTask),
  });

  try {
    await startLocationTask({ appState: options?.appState });
    endBackgroundTaskStartTrace({ success: true });
  } catch (taskError) {
    endBackgroundTaskStartTrace({ success: false });
    throw taskError;
  }
}

function startLocationTaskDetached(options?: StartBackgroundRunTrackingOptions) {
  rgPerfMark('GPS tracking start detached from navigation', {
    appState: options?.appState ?? null,
  });
  void startLocationTaskWithTrace(options).catch(() => {
    // Location task startup is best-effort after the UI has already become interactive.
  });
}

export function getBackgroundRunTrackingSnapshot(options?: SnapshotCloneOptions) {
  resetAbandonedTrackingIfNeeded();
  return buildSnapshotClone(getSnapshotState(), options);
}

export function getBackgroundRunElapsedSeconds(snapshot = getSnapshotState(), nowMs = Date.now()) {
  return Math.floor(resolveSnapshotElapsedMs(snapshot, nowMs) / 1000);
}

export function subscribeBackgroundRunTracking(
  listener: (snapshot: BackgroundRunTrackingSnapshot) => void,
  options?: SnapshotCloneOptions,
) {
  const unsubscribe = subscribeSnapshot(listener, options);
  listener(getBackgroundRunTrackingSnapshot(options));
  return unsubscribe;
}

export async function startBackgroundRunTracking(
  initialLocation?: Location.LocationObject | null,
  options?: StartBackgroundRunTrackingOptions,
) {
  resetRouteAccumulator();
  const initialTimestampMs = initialLocation ? resolveLocationTimestampMs(initialLocation) : null;
  setSnapshotState({
    ...INITIAL_SNAPSHOT,
    status: 'running',
    startedAt: new Date(initialTimestampMs ?? Date.now()).toISOString(),
  });

  if (initialLocation) {
    appendTrackedLocation(initialLocation);
  } else {
    emitSnapshot();
  }

  setSnapshotState({
    ...getSnapshotState(),
    status: 'running',
    pausedAt: null,
  });
  emitSnapshot();
  if (options?.detachLocationTask) {
    startLocationTaskDetached(options);
    return;
  }

  await startLocationTaskWithTrace(options);
}

export async function pauseBackgroundRunTracking() {
  const snapshotState = getSnapshotState();
  if (snapshotState.status !== 'running') {
    return;
  }

  setSnapshotState({
    ...snapshotState,
    status: 'paused',
    pausedAt: new Date().toISOString(),
    currentPace: '--:--/km',
  });
  resetPaceSmoothing();
  emitSnapshot();
  await stopLocationTaskIfNeeded();
}

export async function resumeBackgroundRunTracking(options?: StartBackgroundRunTrackingOptions) {
  const snapshotState = getSnapshotState();
  if (snapshotState.status !== 'paused') {
    return;
  }

  const resumedAtMs = Date.now();
  const pausedAtMs = snapshotState.pausedAt ? new Date(snapshotState.pausedAt).getTime() : resumedAtMs;
  const additionalPausedMs = Number.isNaN(pausedAtMs) ? 0 : Math.max(0, resumedAtMs - pausedAtMs);

  setSnapshotState({
    ...snapshotState,
    status: 'running',
    pausedAt: null,
    accumulatedPausedMs: snapshotState.accumulatedPausedMs + additionalPausedMs,
  });
  emitSnapshot();
  if (options?.detachLocationTask) {
    startLocationTaskDetached(options);
    return;
  }

  await startLocationTaskWithTrace(options);
}

export async function resetBackgroundRunTracking() {
  await stopLocationTaskIfNeeded();
  resetTrackingStateOnly();
  emitSnapshot();
}

export async function syncBackgroundRunTrackingAppState(appState: AppStateStatus) {
  if (getSnapshotState().status !== 'running') {
    return;
  }

  await startLocationTaskWithTrace({ appState });
}
