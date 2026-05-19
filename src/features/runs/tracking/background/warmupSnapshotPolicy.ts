import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background/snapshotStore';

export function isBackgroundRunWarmupSnapshot(snapshot: BackgroundRunTrackingSnapshot) {
  return snapshot.status === 'running' && !snapshot.startedAt;
}

export function buildWarmupLocationSnapshot(snapshot: BackgroundRunTrackingSnapshot) {
  if (!isBackgroundRunWarmupSnapshot(snapshot)) {
    return null;
  }

  return {
    ...snapshot,
    route: [],
    distanceKm: 0,
    elevationGainM: 0,
    currentPace: '--:--/km',
  };
}

export function buildWarmupBaselineSnapshot(
  snapshot: BackgroundRunTrackingSnapshot,
  nowMs = Date.now(),
) {
  if (!isBackgroundRunWarmupSnapshot(snapshot)) {
    return null;
  }

  return {
    ...snapshot,
    route: [],
    distanceKm: 0,
    elevationGainM: 0,
    currentPace: '--:--/km',
    startedAt: new Date(nowMs).toISOString(),
    pausedAt: null,
    accumulatedPausedMs: 0,
  };
}
