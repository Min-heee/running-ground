import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import {
  getBackgroundRunTrackingSnapshot,
  subscribeBackgroundRunTracking,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import type { TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import type { UpdateRunningMatchProgressInput } from '@/lib/api/types';

type UseTrackingAppStateSyncInput = {
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

  useEffect(() => {
    const unsubscribe = subscribeBackgroundRunTracking(
      (snapshot) => {
        callbackRef.current.syncFromBackgroundTracking(snapshot);
        callbackRef.current.refreshLiveSharingHeartbeat(snapshot);
        callbackRef.current.refreshMatchProgressHeartbeat(snapshot);

        if (snapshot.status === 'running') {
          callbackRef.current.startElapsedTicker();
        } else {
          callbackRef.current.clearElapsedTicker();
        }
      },
      { cloneRoute: false },
    );
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active') {
        const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
        callbackRef.current.syncFromBackgroundTracking(snapshot);
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
        void callbackRef.current.syncMatchLifecycleStatus('background').catch(() => {
          // Keep the run going even if the optional lifecycle heartbeat fails.
        });
      }
    });

    return () => {
      unsubscribe();
      appStateSubscription.remove();
      callbackRef.current.finishSoloStartCountdown(false);
      callbackRef.current.stopForegroundTrackingHelpers();
    };
  }, [appStateRef, trackerStatusRef]);
}
