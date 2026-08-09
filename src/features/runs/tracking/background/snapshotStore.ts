import type { RunRoutePoint } from '@/domain';
import { recordBackgroundSnapshotUpdate } from '@/features/runs/tracking/background/backgroundSyncDiagnostics';

export type BackgroundTrackingStatus = 'idle' | 'running' | 'paused';

export type SnapshotCloneOptions = {
  cloneRoute?: boolean;
};

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

export const INITIAL_SNAPSHOT: BackgroundRunTrackingSnapshot = {
  status: 'idle',
  route: [],
  distanceKm: 0,
  elevationGainM: 0,
  currentPace: '--:--/km',
  startedAt: null,
  pausedAt: null,
  accumulatedPausedMs: 0,
};

type BackgroundTrackingListener = {
  listener: (snapshot: BackgroundRunTrackingSnapshot) => void;
  options?: SnapshotCloneOptions;
};

const listeners = new Set<BackgroundTrackingListener>();
let snapshotState: BackgroundRunTrackingSnapshot = { ...INITIAL_SNAPSHOT };

function cloneRoute(route: RunRoutePoint[]) {
  return route.map((point) => ({ ...point }));
}

export function buildSnapshotClone(
  snapshot: BackgroundRunTrackingSnapshot,
  options?: SnapshotCloneOptions,
): BackgroundRunTrackingSnapshot {
  return {
    ...snapshot,
    route: options?.cloneRoute === false ? snapshot.route : cloneRoute(snapshot.route),
  };
}

export function getSnapshotState() {
  return snapshotState;
}

export function setSnapshotState(snapshot: BackgroundRunTrackingSnapshot) {
  snapshotState = snapshot;
}

export function emitSnapshot() {
  listeners.forEach((subscription) => {
    subscription.listener(buildSnapshotClone(snapshotState, subscription.options));
  });
}

export function commitSnapshot(snapshot: BackgroundRunTrackingSnapshot) {
  // Compare BEFORE swapping the state in: a fix the filters rejected still lands here (it carries
  // a refreshed pace) but leaves distanceKm untouched, and only a genuine advance may refresh the
  // distance-freshness clock the screen-off native gap-fill keys on.
  const previousDistanceKm = Number.isFinite(snapshotState.distanceKm) ? snapshotState.distanceKm : 0;
  const nextDistanceKm = Number.isFinite(snapshot.distanceKm) ? snapshot.distanceKm : 0;
  const distanceAdvanced = nextDistanceKm > previousDistanceKm;

  setSnapshotState(snapshot);
  recordBackgroundSnapshotUpdate(distanceAdvanced);
  emitSnapshot();
}

export function subscribeSnapshot(
  listener: (snapshot: BackgroundRunTrackingSnapshot) => void,
  options?: SnapshotCloneOptions,
) {
  const subscription = { listener, options };
  listeners.add(subscription);

  return () => {
    listeners.delete(subscription);
  };
}

export function resolveSnapshotElapsedMs(snapshot: BackgroundRunTrackingSnapshot, nowMs = Date.now()) {
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

  return Math.max(0, referenceMs - startedAtMs - snapshot.accumulatedPausedMs);
}
