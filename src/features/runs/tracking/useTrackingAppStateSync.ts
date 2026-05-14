import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import {
  getBackgroundRunTrackingSnapshot,
  subscribeBackgroundRunTracking,
  syncBackgroundRunTrackingAppState,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import type { TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import type { UpdateRunningMatchProgressInput } from '@/lib/api/types';

type UseTrackingAppStateSyncInput = {
  enabled?: boolean;
  appStateRef: MutableRefObject<AppStateStatus>;
  trackerStatusRef: MutableRefObject<TrackerStatus>;
  syncFromBackgroundTracking: (snapshot?: BackgroundRunTrackingSnapshot) => void;
  refreshLiveSharingHeartbeat: (snapshot: BackgroundRunTrackingSnapshot) => void;
  refreshMatchProgressHeartbeat: (snapshot: BackgroundRunTrackingSnapshot) => void;
  refreshStaleMatchArtifacts: () => Promise<unknown>;
  syncMatchLifecycleStatus: (
    nextStatus: Extract<UpdateRunningMatchProgressInput['status'], 'running' | 'background'>,
    snapshot?: BackgroundRunTrackingSnapshot,
  ) => Promise<unknown>;
  startElapsedTicker: () => void;
  clearElapsedTicker: () => void;
  finishSoloStartCountdown: (completed: boolean) => void;
  stopForegroundTrackingHelpers: () => void;
};

export function useTrackingAppStateSync({
  enabled = true,
  appStateRef,
  trackerStatusRef,
  syncFromBackgroundTracking,
  refreshLiveSharingHeartbeat,
  refreshMatchProgressHeartbeat,
  refreshStaleMatchArtifacts,
  syncMatchLifecycleStatus,
  startElapsedTicker,
  clearElapsedTicker,
  finishSoloStartCountdown,
  stopForegroundTrackingHelpers,
}: UseTrackingAppStateSyncInput) {
  const appStateLocationSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocationTaskAppStateRef = useRef<AppStateStatus | null>(null);
  const callbackRef = useRef({
    clearElapsedTicker,
    finishSoloStartCountdown,
    refreshLiveSharingHeartbeat,
    refreshMatchProgressHeartbeat,
    refreshStaleMatchArtifacts,
    startElapsedTicker,
    stopForegroundTrackingHelpers,
    syncFromBackgroundTracking,
    syncMatchLifecycleStatus,
  });

  callbackRef.current = {
    clearElapsedTicker,
    finishSoloStartCountdown,
    refreshLiveSharingHeartbeat,
    refreshMatchProgressHeartbeat,
    refreshStaleMatchArtifacts,
    startElapsedTicker,
    stopForegroundTrackingHelpers,
    syncFromBackgroundTracking,
    syncMatchLifecycleStatus,
  };

  const scheduleLocationTaskAppStateSync = useCallback((nextState: AppStateStatus, delayMs: number) => {
    if (appStateLocationSyncTimerRef.current) {
      clearTimeout(appStateLocationSyncTimerRef.current);
      appStateLocationSyncTimerRef.current = null;
    }

    if (lastLocationTaskAppStateRef.current === nextState) {
      return;
    }

    appStateLocationSyncTimerRef.current = setTimeout(() => {
      appStateLocationSyncTimerRef.current = null;

      if (trackerStatusRef.current !== 'running') {
        return;
      }

      lastLocationTaskAppStateRef.current = nextState;
      void syncBackgroundRunTrackingAppState(nextState).catch(() => {});
    }, delayMs);
  }, [trackerStatusRef]);

  const handleBackgroundTrackingSnapshot = useCallback((snapshot: BackgroundRunTrackingSnapshot) => {
    callbackRef.current.syncFromBackgroundTracking(snapshot);
    callbackRef.current.refreshLiveSharingHeartbeat(snapshot);
    callbackRef.current.refreshMatchProgressHeartbeat(snapshot);

    if (snapshot.status === 'running') {
      callbackRef.current.startElapsedTicker();
    } else {
      callbackRef.current.clearElapsedTicker();
    }
  }, []);

  const handleAppStateChange = useCallback((nextState: AppStateStatus) => {
    const previousState = appStateRef.current;
    appStateRef.current = nextState;

    if (nextState === 'active') {
      const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      callbackRef.current.syncFromBackgroundTracking(snapshot);
      if (trackerStatusRef.current === 'running') {
        scheduleLocationTaskAppStateSync('active', 0);
      }
      void callbackRef.current.refreshStaleMatchArtifacts().catch(() => {});

      if (trackerStatusRef.current === 'running') {
        void callbackRef.current.syncMatchLifecycleStatus('running', snapshot).catch(() => {
          // Keep the run going even if the optional lifecycle heartbeat fails.
        });
      }
      return;
    }

    if (
      previousState === 'active'
      && (nextState === 'inactive' || nextState === 'background')
      && trackerStatusRef.current === 'running'
    ) {
      scheduleLocationTaskAppStateSync(nextState, 400);
      void callbackRef.current.syncMatchLifecycleStatus('background').catch(() => {
        // Keep the run going even if the optional lifecycle heartbeat fails.
      });
    }
  }, [appStateRef, scheduleLocationTaskAppStateSync, trackerStatusRef]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const unsubscribe = subscribeBackgroundRunTracking(
      handleBackgroundTrackingSnapshot,
      { cloneRoute: false },
    );
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      unsubscribe();
      appStateSubscription.remove();
      if (appStateLocationSyncTimerRef.current) {
        clearTimeout(appStateLocationSyncTimerRef.current);
        appStateLocationSyncTimerRef.current = null;
      }
      callbackRef.current.finishSoloStartCountdown(false);
      callbackRef.current.stopForegroundTrackingHelpers();
    };
  }, [enabled, handleAppStateChange, handleBackgroundTrackingSnapshot]);
}
