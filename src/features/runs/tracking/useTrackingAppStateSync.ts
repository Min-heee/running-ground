import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { AppState, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';
import {
  getBackgroundRunTrackingSnapshot,
  subscribeBackgroundRunTracking,
  syncBackgroundRunTrackingAppState,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import {
  setAppBackgroundState,
} from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import {
  startBackgroundMatchProgressTimer,
  stopBackgroundMatchProgressTimer,
} from '@/features/runs/tracking/background/backgroundMatchProgressTimer';
import {
  stopPeriodicMatchUpload,
} from '@/features/runs/tracking/background/periodicMatchUploadController';
import {
  stopNativeDistanceAccumulator,
} from '@/features/runs/tracking/background/distanceAccumulatorController';
import {
  captureScreenOffGapOnWake,
  discardScreenOffGapCapture,
} from '@/features/runs/tracking/background/screenOffGapReconcile';
import type { TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import type { UpdateRunningMatchProgressInput } from '@/lib/api/types';
import {
  resolveTrackingAppStateSyncPlan,
  shouldRunBackgroundElapsedTicker,
} from '@/features/runs/tracking/trackingAppStatePolicy';

type UseTrackingAppStateSyncInput = {
  enabled?: boolean;
  elapsedTickerEnabled?: boolean;
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
  elapsedTickerEnabled = true,
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
  const elapsedTickerActiveRef = useRef(false);
  const trackerStatus = trackerStatusRef.current;
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

    const shouldRunElapsedTicker = shouldRunBackgroundElapsedTicker(snapshot, {
      enabled: elapsedTickerEnabled,
    });

    if (shouldRunElapsedTicker) {
      if (elapsedTickerActiveRef.current) {
        return;
      }

      callbackRef.current.startElapsedTicker();
      elapsedTickerActiveRef.current = true;
      return;
    }

    if (elapsedTickerActiveRef.current) {
      callbackRef.current.clearElapsedTicker();
      elapsedTickerActiveRef.current = false;
    }
  }, [elapsedTickerEnabled]);

  useEffect(() => {
    if (!elapsedTickerEnabled && elapsedTickerActiveRef.current) {
      callbackRef.current.clearElapsedTicker();
      elapsedTickerActiveRef.current = false;
    }
  }, [elapsedTickerEnabled]);

  const handleAppStateChange = useCallback((nextState: AppStateStatus) => {
    const previousState = appStateRef.current;
    appStateRef.current = nextState;
    setAppBackgroundState(nextState !== 'active');

    // Double-POST bound: the native periodic cadence only ever STARTS from a background flush, but
    // once running it keeps re-POSTing on its own (iOS CLLocationManager fixes / Android executor)
    // even after returning to foreground — where the foreground heartbeat already POSTs. On
    // foreground resume, stop the native cadence so exactly ONE path owns the channel while active;
    // it re-starts automatically on the next background flush. No-op on current binaries (gate).
    if (nextState === 'active') {
      // 화면꺼짐 갭 포획 — 반드시 아래의 stopNativeDistanceAccumulator **전에**. 저 호출이
      // 네이티브 총거리를 지우므로, JS가 잠든 사이 네이티브만 알고 있는 거리는 이 순간이
      // 지나면 영영 사라진다. 실제 이관은 재생 판별이 끝난 뒤(위치 태스크/타이머)에 한다.
      captureScreenOffGapOnWake();
      void stopPeriodicMatchUpload().catch(() => undefined);
      // Stop the native distance accumulator on foreground resume too: in the foreground the JS
      // pipeline is authoritative (JS >= native via the merge's max()), so the native GPS consumer
      // is redundant and only burns battery. It re-starts + re-seeds to the JS total on the next
      // background flush. No-op on current binaries (availability gate).
      void stopNativeDistanceAccumulator().catch(() => undefined);
    }
    const plan = resolveTrackingAppStateSyncPlan({
      nextState,
      previousState,
      trackerStatus: trackerStatusRef.current,
    });

    if (plan.shouldSyncBackgroundSnapshot) {
      const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      callbackRef.current.syncFromBackgroundTracking(snapshot);
      // JS can be suspended while the native background task keeps tracking.
      // Push progress immediately on foreground resume instead of waiting for
      // the next GPS subscription emit to catch server-side views up.
      callbackRef.current.refreshLiveSharingHeartbeat(snapshot);
      callbackRef.current.refreshMatchProgressHeartbeat(snapshot);
      if (plan.locationTaskAppState && plan.locationTaskDelayMs !== null) {
        scheduleLocationTaskAppStateSync(plan.locationTaskAppState, plan.locationTaskDelayMs);
      }
      if (plan.shouldRefreshStaleArtifacts) {
        void callbackRef.current.refreshStaleMatchArtifacts().catch(() => {});
      }

      if (plan.lifecycleStatus) {
        void callbackRef.current.syncMatchLifecycleStatus(plan.lifecycleStatus, snapshot).catch(() => {
          // Keep the run going even if the optional lifecycle heartbeat fails.
        });
      }
      return;
    }

    if (plan.locationTaskAppState && plan.locationTaskDelayMs !== null) {
      scheduleLocationTaskAppStateSync(plan.locationTaskAppState, plan.locationTaskDelayMs);
    }

    if (plan.lifecycleStatus) {
      void callbackRef.current.syncMatchLifecycleStatus(plan.lifecycleStatus).catch(() => {
        // Keep the run going even if the optional lifecycle heartbeat fails.
      });
    }
  }, [appStateRef, scheduleLocationTaskAppStateSync, trackerStatusRef]);

  useEffect(() => {
    if (!enabled || trackerStatus !== 'running') {
      stopBackgroundMatchProgressTimer();
      // Belt-and-braces: a non-running tracker must never leave the native periodic cadence (and
      // its iOS second-location consumer) alive. No-op on current binaries (availability gate).
      void stopPeriodicMatchUpload().catch(() => undefined);
      // Likewise the native distance accumulator: a non-running tracker must never leave its GPS
      // consumer alive (no battery drain after the run). No-op on current binaries.
      void stopNativeDistanceAccumulator().catch(() => undefined);
      // 끝난 런의 화면꺼짐 갭 포획본도 함께 버린다 — 다음 런에 이관되면 안 된다.
      discardScreenOffGapCapture();
      return undefined;
    }

    startBackgroundMatchProgressTimer({ platformOS: Platform.OS });
    return () => {
      stopBackgroundMatchProgressTimer();
      void stopPeriodicMatchUpload().catch(() => undefined);
      void stopNativeDistanceAccumulator().catch(() => undefined);
      discardScreenOffGapCapture();
    };
  }, [enabled, trackerStatus]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const unsubscribe = subscribeBackgroundRunTracking(
      handleBackgroundTrackingSnapshot,
      { cloneRoute: false },
    );
    setAppBackgroundState(appStateRef.current !== 'active');
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
      elapsedTickerActiveRef.current = false;
    };
  }, [appStateRef, enabled, handleAppStateChange, handleBackgroundTrackingSnapshot]);
}
