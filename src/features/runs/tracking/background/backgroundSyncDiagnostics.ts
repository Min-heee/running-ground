import { useSyncExternalStore } from 'react';

type BackgroundSyncDiagnosticsState = {
  taskStartAttemptCount: number;
  taskStartAttemptInFlight: boolean;
  taskStartedAtMs: number | null;
  taskFailedReason: string | null;
  lastSnapshotAtMs: number | null;
  // When the tracked distance last actually ADVANCED. Distinct from lastSnapshotAtMs on purpose:
  // a snapshot is committed for every accepted GPS fix AND for every fix the filters REJECT (a
  // dropped fix still refreshes pace/elapsed), so lastSnapshotAtMs answers "did we hear from the
  // sensor", not "are we still measuring". The screen-off freeze lives exactly in that gap —
  // 오너 실기기 대결 2026-08-09: the Galaxy's distance stuck at ~3.05km while every rejected fix
  // kept stamping lastSnapshotAtMs, so the run read as FRESH, the native gap-fill never engaged,
  // and each flush re-seeded the native accumulator back to the frozen JS total.
  lastDistanceAdvanceAtMs: number | null;
  lastHeartbeatAtMs: number | null;
  heartbeatAttemptCount: number;
  isAppBackground: boolean;
};

let state: BackgroundSyncDiagnosticsState = {
  taskStartAttemptCount: 0,
  taskStartAttemptInFlight: false,
  taskStartedAtMs: null,
  taskFailedReason: null,
  lastSnapshotAtMs: null,
  lastDistanceAdvanceAtMs: null,
  lastHeartbeatAtMs: null,
  heartbeatAttemptCount: 0,
  isAppBackground: false,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function recordBackgroundTaskAttempt() {
  state = {
    ...state,
    taskFailedReason: null,
    taskStartAttemptCount: state.taskStartAttemptCount + 1,
    taskStartAttemptInFlight: true,
  };
  emit();
}

export function recordBackgroundTaskStarted() {
  const nowMs = Date.now();
  state = {
    ...state,
    taskFailedReason: null,
    taskStartedAtMs: nowMs,
    taskStartAttemptInFlight: false,
    // Arm the distance-advance clock at start. Leaving it null through the warmup would read as
    // "never advanced" and hand the merge to the native accumulator before the JS cold-start
    // filter has settled — exactly the over-count the fresh-path re-seed exists to suppress.
    lastDistanceAdvanceAtMs: nowMs,
  };
  emit();
}

export function recordBackgroundTaskFailed(reason: string) {
  state = {
    ...state,
    taskFailedReason: reason,
    taskStartAttemptInFlight: false,
  };
  emit();
}

// `distanceAdvanced` must be true ONLY when the committed snapshot's distance is greater than the
// previous one — a rejected fix commits a snapshot (pace/elapsed still move) but measures nothing.
export function recordBackgroundSnapshotUpdate(distanceAdvanced = false) {
  const nowMs = Date.now();
  state = {
    ...state,
    lastSnapshotAtMs: nowMs,
    ...(distanceAdvanced ? { lastDistanceAdvanceAtMs: nowMs } : {}),
  };
  emit();
}


export function recordBackgroundHeartbeatAttempt() {
  state = {
    ...state,
    heartbeatAttemptCount: state.heartbeatAttemptCount + 1,
    lastHeartbeatAtMs: Date.now(),
  };
  emit();
}

export function recordBackgroundHeartbeatSent() {
  recordBackgroundHeartbeatAttempt();
}

export function setAppBackgroundState(isBackground: boolean) {
  if (state.isAppBackground === isBackground) {
    return;
  }

  state = {
    ...state,
    isAppBackground: isBackground,
  };
  emit();
}

export function getBackgroundSyncDiagnostics() {
  return state;
}

function subscribeBackgroundSyncDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBackgroundSyncDiagnostics() {
  return useSyncExternalStore(
    subscribeBackgroundSyncDiagnostics,
    getBackgroundSyncDiagnostics,
    getBackgroundSyncDiagnostics,
  );
}
