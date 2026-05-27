import { useSyncExternalStore } from 'react';

type BackgroundSyncDiagnosticsState = {
  taskStartAttemptCount: number;
  taskStartAttemptInFlight: boolean;
  taskStartedAtMs: number | null;
  taskFailedReason: string | null;
  lastSnapshotAtMs: number | null;
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
  state = {
    ...state,
    taskFailedReason: null,
    taskStartedAtMs: Date.now(),
    taskStartAttemptInFlight: false,
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

export function recordBackgroundSnapshotUpdate() {
  state = {
    ...state,
    lastSnapshotAtMs: Date.now(),
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
