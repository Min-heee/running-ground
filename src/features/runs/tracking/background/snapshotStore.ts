import type { RunRoutePoint } from '@/domain';

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
  setSnapshotState(snapshot);
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
