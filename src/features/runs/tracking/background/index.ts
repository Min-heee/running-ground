import * as Location from 'expo-location';
import type { AppStateStatus } from 'react-native';
import '@/features/runs/tracking/background/locationTask';
import {
  appendTrackedLocation,
  resetPaceSmoothing,
  resetRouteAccumulator,
} from '@/features/runs/tracking/background/routeAccumulator';
import {
  clearBackgroundRunSnapshot,
  persistBackgroundRunSnapshot,
  restoreBackgroundRunSnapshot,
} from '@/features/runs/tracking/background/backgroundRunPersistence';
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
  startManagedLocationTask,
  stopManagedLocationTask,
  syncManagedLocationTaskAppState,
  type ManagedLocationTaskOptions,
} from '@/features/runs/tracking/background/locationTaskManager';
import { resolveLocationTimestampMs } from '@/features/runs/tracking/background/locationDistance';
import {
  buildWarmupBaselineSnapshot,
} from '@/features/runs/tracking/background/warmupSnapshotPolicy';

export type {
  BackgroundRunTrackingSnapshot,
  BackgroundTrackingStatus,
  SnapshotCloneOptions,
} from '@/features/runs/tracking/background/snapshotStore';
export {
  isBackgroundRunWarmupSnapshot,
} from '@/features/runs/tracking/background/warmupSnapshotPolicy';

export type StartBackgroundRunTrackingOptions = {
  appState?: AppStateStatus;
  detachLocationTask?: boolean;
  persistenceMatchId?: string | null;
  trackingKey?: string | null;
  warmupMode?: boolean;
};

const ABANDONED_TRACKING_MAX_ELAPSED_MS = 8 * 60 * 60 * 1000;
const ABANDONED_LOW_DISTANCE_MAX_ELAPSED_MS = 2 * 60 * 60 * 1000;
const ABANDONED_LOW_DISTANCE_KM = 1;
const BACKGROUND_RUN_PERSISTENCE_INTERVAL_MS = 5_000;

let abandonedTrackingStopRequested = false;
let persistenceMatchId: string | null = null;
let persistenceTimer: ReturnType<typeof setInterval> | null = null;

function stopBackgroundRunPersistence() {
  const previousMatchId = persistenceMatchId;

  if (persistenceTimer) {
    clearInterval(persistenceTimer);
    persistenceTimer = null;
  }

  persistenceMatchId = null;
  return previousMatchId;
}

function startBackgroundRunPersistence(matchId: string | null | undefined) {
  if (!matchId) {
    stopBackgroundRunPersistence();
    return;
  }

  if (persistenceMatchId === matchId && persistenceTimer) {
    return;
  }

  stopBackgroundRunPersistence();
  persistenceMatchId = matchId;
  void persistBackgroundRunSnapshot(matchId);
  persistenceTimer = setInterval(() => {
    void persistBackgroundRunSnapshot(matchId);
  }, BACKGROUND_RUN_PERSISTENCE_INTERVAL_MS);
}

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
  const previousMatchId = stopBackgroundRunPersistence();
  void clearBackgroundRunSnapshot(previousMatchId);
  resetRouteAccumulator();
  setSnapshotState({ ...INITIAL_SNAPSHOT });
}

function stopAbandonedLocationTasksBestEffort() {
  if (abandonedTrackingStopRequested) {
    return;
  }

  abandonedTrackingStopRequested = true;
  void stopManagedLocationTask().finally(() => {
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
  const {
    persistenceMatchId,
    warmupMode = false,
    ...locationTaskOptions
  } = options ?? {};
  resetRouteAccumulator();
  const initialTimestampMs = initialLocation ? resolveLocationTimestampMs(initialLocation) : null;
  setSnapshotState({
    ...INITIAL_SNAPSHOT,
    status: 'running',
    startedAt: warmupMode ? null : new Date(initialTimestampMs ?? Date.now()).toISOString(),
  });

  if (initialLocation && !warmupMode) {
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
  startBackgroundRunPersistence(persistenceMatchId);
  await startManagedLocationTask(locationTaskOptions);
}

export function commitWarmupBaseline(nowMs = Date.now()) {
  const snapshotState = getSnapshotState();
  const nextSnapshot = buildWarmupBaselineSnapshot(snapshotState, nowMs);

  if (!nextSnapshot) {
    return false;
  }

  resetRouteAccumulator();
  resetPaceSmoothing();
  setSnapshotState(nextSnapshot);
  emitSnapshot();
  return true;
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
  await stopManagedLocationTask();
}

export async function resumeBackgroundRunTracking(options?: StartBackgroundRunTrackingOptions) {
  const {
    persistenceMatchId,
    ...locationTaskOptions
  } = options ?? {};
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
  startBackgroundRunPersistence(persistenceMatchId);
  await startManagedLocationTask(locationTaskOptions);
}

export async function resetBackgroundRunTracking() {
  const previousMatchId = stopBackgroundRunPersistence();
  await stopManagedLocationTask();
  resetTrackingStateOnly();
  emitSnapshot();
  await clearBackgroundRunSnapshot(previousMatchId);
}

export async function syncBackgroundRunTrackingAppState(appState: AppStateStatus) {
  if (getSnapshotState().status !== 'running') {
    return;
  }

  await syncManagedLocationTaskAppState(appState);
}

export async function restorePersistedBackgroundRunTracking(
  matchId: string,
  options?: ManagedLocationTaskOptions,
) {
  const restored = await restoreBackgroundRunSnapshot(matchId);
  if (!restored) {
    return false;
  }

  startBackgroundRunPersistence(matchId);
  try {
    await startManagedLocationTask({
      ...options,
      trackingKey: options?.trackingKey ?? matchId,
    });
  } catch {
    // Restored distance is still useful even if native GPS re-attach fails briefly.
  }
  return true;
}
