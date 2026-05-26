import { useSyncExternalStore } from 'react';

type BackgroundSyncDiagnosticsState = {
  taskStartedAtMs: number | null;
  taskFailedReason: string | null;
  lastSnapshotAtMs: number | null;
  lastHeartbeatAtMs: number | null;
  isAppBackground: boolean;
};

let state: BackgroundSyncDiagnosticsState = {
  taskStartedAtMs: null,
  taskFailedReason: null,
  lastSnapshotAtMs: null,
  lastHeartbeatAtMs: null,
  isAppBackground: false,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function recordBackgroundTaskStarted() {
  state = {
    ...state,
    taskFailedReason: null,
    taskStartedAtMs: Date.now(),
  };
  emit();
}

export function recordBackgroundTaskFailed(reason: string) {
  state = {
    ...state,
    taskFailedReason: reason,
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

export function recordBackgroundHeartbeatSent() {
  state = {
    ...state,
    lastHeartbeatAtMs: Date.now(),
  };
  emit();
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
