import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  getBackgroundRunTrackingSnapshot,
  pauseBackgroundRunTracking,
  resetBackgroundRunTracking,
  resumeBackgroundRunTracking,
  startBackgroundRunTracking,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import {
  isLiveMatchState,
  resolveActiveMatchId,
} from '@/features/runs/lifecycle/matchStateMachine';
import type {
  DisplayedMatchProgress,
  SyncLiveSharingInput,
  UseRunTrackingFlowInput,
} from '@/features/runs/types/runTrackingFlow';
import type { UpdateRunningMatchProgressInput } from '@/lib/api/types';
import { getApiErrorMessage } from '@/services/apiError';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type StartTrackingOptions = {
  allowCountdownWarmup?: boolean;
  matchId?: string;
};

type UseRunTrackingActionsInput = Pick<
  UseRunTrackingFlowInput,
  | 'appStateRef'
  | 'liveShareEnabledRef'
  | 'liveShareLabelRef'
  | 'officialStartBaselineRef'
  | 'autoStartingMatchTrackingRef'
  | 'autoStartedMatchIdRef'
  | 'preStartWarmupMatchIdRef'
  | 'matchMode'
  | 'duelMatchState'
  | 'groupMatchState'
  | 'duelMatchStatus'
  | 'groupMatchStatus'
  | 'roomLinkedMatchContext'
  | 'setStatus'
  | 'setError'
> & {
  androidLiveMatchGpsStartDelayMs: number;
  buildDisplayedMatchProgress: (snapshot?: BackgroundRunTrackingSnapshot) => DisplayedMatchProgress;
  ensureBackgroundLocationPermission: (options?: { required?: boolean }) => Promise<boolean>;
  ensureLocationPermission: () => Promise<void>;
  finishSoloStartCountdown: (completed: boolean) => void;
  pushRunningMatchProgress: (input: UpdateRunningMatchProgressInput) => Promise<unknown>;
  resetForegroundTrackingState: () => void;
  resolveLiveShareLabel: (coordinate?: Coordinate) => Promise<string>;
  runSoloStartCountdown: () => Promise<boolean>;
  stopForegroundTrackingHelpers: () => void;
  syncFromBackgroundTracking: (snapshot?: BackgroundRunTrackingSnapshot) => void;
  syncLiveSharing: (input: SyncLiveSharingInput) => Promise<unknown>;
};

export function useRunTrackingActions({
  appStateRef,
  liveShareEnabledRef,
  liveShareLabelRef,
  officialStartBaselineRef,
  autoStartingMatchTrackingRef,
  autoStartedMatchIdRef,
  preStartWarmupMatchIdRef,
  matchMode,
  duelMatchState,
  groupMatchState,
  duelMatchStatus,
  groupMatchStatus,
  roomLinkedMatchContext,
  setStatus,
  setError,
  androidLiveMatchGpsStartDelayMs,
  buildDisplayedMatchProgress,
  ensureBackgroundLocationPermission,
  ensureLocationPermission,
  finishSoloStartCountdown,
  pushRunningMatchProgress,
  resetForegroundTrackingState,
  resolveLiveShareLabel,
  runSoloStartCountdown,
  stopForegroundTrackingHelpers,
  syncFromBackgroundTracking,
  syncLiveSharing,
}: UseRunTrackingActionsInput) {
  const gpsTrackingStartKeyRef = useRef<string | null>(null);
  const gpsTrackingStartPromiseRef = useRef<Promise<void> | null>(null);
  const delayedGpsStartKeyRef = useRef<string | null>(null);
  const delayedGpsStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skippedAndroidWarmupMatchIdRef = useRef<string | null>(null);

  const clearDelayedGpsStart = useCallback(() => {
    if (delayedGpsStartTimerRef.current) {
      clearTimeout(delayedGpsStartTimerRef.current);
      delayedGpsStartTimerRef.current = null;
    }
    delayedGpsStartKeyRef.current = null;
  }, []);

  const handleStartTrackingInternal = useCallback(async (options?: StartTrackingOptions) => {
    if (Platform.OS === 'web') {
      setError('실시간 러닝 측정은 iPhone이나 Android 앱에서 사용할 수 있어.');
      return;
    }

    const roomLinkedStartContext = roomLinkedMatchContext?.mode === matchMode
      ? roomLinkedMatchContext
      : null;

    if (matchMode === 'duel' && !isLiveMatchState(duelMatchState) && roomLinkedStartContext?.mode !== 'duel') {
      setError('1대1 매칭이 잡힌 뒤에만 시작할 수 있어요.');
      return;
    }

    if (matchMode === 'group' && !isLiveMatchState(groupMatchState) && roomLinkedStartContext?.mode !== 'group') {
      setError('그룹 매칭이 잡힌 뒤에만 시작할 수 있어요.');
      return;
    }

    if (
      matchMode === 'duel'
      && duelMatchState === 'matched'
      && !duelMatchStatus?.readyToStart
      && roomLinkedStartContext?.state !== 'active'
      && !options?.allowCountdownWarmup
    ) {
      setError('예약된 시작 시간이 되면 1대1 대결을 시작할 수 있어요.');
      return;
    }

    if (
      matchMode === 'group'
      && groupMatchState === 'matched'
      && !groupMatchStatus?.readyToStart
      && roomLinkedStartContext?.state !== 'active'
      && !options?.allowCountdownWarmup
    ) {
      setError('예약된 시작 시간이 되면 그룹 대결을 시작할 수 있어요.');
      return;
    }

    const endGpsStartTrace = rgPerfMeasureStart('GPS tracking start', {
      allowCountdownWarmup: Boolean(options?.allowCountdownWarmup),
      matchMode,
    });
    const trackingStartKey = options?.matchId ?? (matchMode === 'solo' ? 'solo' : `${matchMode}:manual`);

    try {
      setError(null);
      const shouldUseSoloStartCountdown = matchMode === 'solo' && !options?.allowCountdownWarmup;
      await ensureLocationPermission();
      await ensureBackgroundLocationPermission();
      resetForegroundTrackingState();
      await resetBackgroundRunTracking();

      if (options?.allowCountdownWarmup) {
        const warmupMatchId = matchMode === 'duel'
          ? duelMatchStatus?.matchId ?? roomLinkedStartContext?.matchId
          : groupMatchStatus?.matchId ?? roomLinkedStartContext?.matchId;
        preStartWarmupMatchIdRef.current = warmupMatchId ?? null;
        officialStartBaselineRef.current = null;
      } else {
        preStartWarmupMatchIdRef.current = null;
      }

      if (shouldUseSoloStartCountdown) {
        const countdownCompleted = await runSoloStartCountdown();

        if (!countdownCompleted) {
          endGpsStartTrace({ canceled: true, success: false });
          return;
        }
      }

      const shouldDetachLocationTask = Platform.OS === 'android' && matchMode !== 'solo';
      if (shouldDetachLocationTask) {
        rgPerfMark('GPS tracking start UI detached', {
          allowCountdownWarmup: Boolean(options?.allowCountdownWarmup),
          matchId: options?.matchId ?? null,
          matchMode,
          source: 'handleStartTrackingInternal',
        });
      }
      await startBackgroundRunTracking(undefined, {
        appState: appStateRef.current,
        detachLocationTask: shouldDetachLocationTask,
        trackingKey: trackingStartKey,
      });
      syncFromBackgroundTracking();
      endGpsStartTrace({
        detachedLocationTask: shouldDetachLocationTask,
        success: true,
        status: 'running',
      });

      try {
        if (liveShareEnabledRef.current) {
          const initialLabel = await resolveLiveShareLabel();
          await syncLiveSharing({
            enabled: true,
            status: 'running',
            locationLabel: initialLabel,
          });
        } else {
          await syncLiveSharing({
            enabled: false,
            status: 'idle',
          });
        }
      } catch {
        setError('러닝은 시작됐지만 위치 공유 상태를 반영하지 못했어요.');
      }
    } catch (trackingError) {
      endGpsStartTrace({ success: false });
      finishSoloStartCountdown(false);
      setError(getApiErrorMessage(trackingError, '러닝 측정을 시작하지 못했어.'));
      stopForegroundTrackingHelpers();
      await resetBackgroundRunTracking();
      void syncLiveSharing({
        enabled: false,
        status: 'idle',
      }).catch(() => {});
      setStatus('idle');
    }
  }, [
    appStateRef,
    duelMatchState,
    duelMatchStatus,
    ensureBackgroundLocationPermission,
    ensureLocationPermission,
    finishSoloStartCountdown,
    groupMatchState,
    groupMatchStatus,
    liveShareEnabledRef,
    matchMode,
    officialStartBaselineRef,
    preStartWarmupMatchIdRef,
    resetForegroundTrackingState,
    resolveLiveShareLabel,
    roomLinkedMatchContext,
    runSoloStartCountdown,
    setError,
    setStatus,
    stopForegroundTrackingHelpers,
    syncFromBackgroundTracking,
    syncLiveSharing,
  ]);

  const handleStartTracking = useCallback((options?: StartTrackingOptions) => {
    const trackingStartKey = options?.matchId ?? (matchMode === 'solo' ? 'solo' : `${matchMode}:manual`);

    if (gpsTrackingStartKeyRef.current === trackingStartKey && gpsTrackingStartPromiseRef.current) {
      rgPerfMark('GPS tracking start skipped duplicate', {
        matchId: options?.matchId ?? null,
        trackingStartKey,
      });
      return gpsTrackingStartPromiseRef.current;
    }

    const startPromise = handleStartTrackingInternal(options).finally(() => {
      if (gpsTrackingStartKeyRef.current === trackingStartKey) {
        gpsTrackingStartKeyRef.current = null;
        gpsTrackingStartPromiseRef.current = null;
      }
    });

    gpsTrackingStartKeyRef.current = trackingStartKey;
    gpsTrackingStartPromiseRef.current = startPromise;
    return startPromise;
  }, [handleStartTrackingInternal, matchMode]);

  const startMatchTrackingAutomatically = useCallback((
    matchId: string,
    options?: { allowCountdownWarmup?: boolean },
  ) => {
    if (autoStartingMatchTrackingRef.current) {
      return;
    }

    const isAndroidLiveMatchAutoStart = Platform.OS === 'android' && matchMode !== 'solo';
    if (isAndroidLiveMatchAutoStart && options?.allowCountdownWarmup) {
      preStartWarmupMatchIdRef.current = matchId;
      skippedAndroidWarmupMatchIdRef.current = matchId;
      rgPerfMark('GPS tracking start delayed after mount', {
        delayMs: androidLiveMatchGpsStartDelayMs,
        matchId,
        matchMode,
        reason: 'android-countdown-warmup-disabled',
        source: 'match auto warmup',
      });
      rgPerfMark('GPS tracking start UI detached', {
        matchId,
        matchMode,
        reason: 'countdown warmup disabled on android',
        source: 'match auto warmup',
      });
      return;
    }

    autoStartingMatchTrackingRef.current = true;
    autoStartedMatchIdRef.current = matchId;

    if (isAndroidLiveMatchAutoStart) {
      const delayedKey = `${matchMode}:${matchId}:active`;
      if (delayedGpsStartKeyRef.current === delayedKey && delayedGpsStartTimerRef.current) {
        rgPerfMark('GPS tracking start skipped duplicate', {
          delayed: true,
          matchId,
          trackingStartKey: delayedKey,
        });
        return;
      }

      clearDelayedGpsStart();
      delayedGpsStartKeyRef.current = delayedKey;
      rgPerfMark('GPS tracking start delayed after mount', {
        delayMs: androidLiveMatchGpsStartDelayMs,
        matchId,
        matchMode,
        source: 'match auto start',
      });
      delayedGpsStartTimerRef.current = setTimeout(() => {
        delayedGpsStartTimerRef.current = null;
        if (delayedGpsStartKeyRef.current !== delayedKey) {
          rgPerfMark('GPS result ignored without screen change', {
            matchId,
            matchMode,
            reason: 'stale delayed start',
            source: 'match auto start',
          });
          return;
        }

        rgPerfMark('GPS tracking start UI detached', {
          matchId,
          matchMode,
          source: 'match auto start',
        });
        void handleStartTracking({ ...options, matchId })
          .catch(() => {
            rgPerfMark('GPS result ignored without screen change', {
              matchId,
              matchMode,
              reason: 'detached start failed',
              source: 'match auto start',
            });
          })
          .finally(() => {
            if (delayedGpsStartKeyRef.current === delayedKey) {
              delayedGpsStartKeyRef.current = null;
            }
            autoStartingMatchTrackingRef.current = false;
            if (getBackgroundRunTrackingSnapshot({ cloneRoute: false }).status !== 'running') {
              autoStartedMatchIdRef.current = null;
            }
          });
      }, androidLiveMatchGpsStartDelayMs);
      return;
    }

    void handleStartTracking({ ...options, matchId })
      .finally(() => {
        autoStartingMatchTrackingRef.current = false;
        if (getBackgroundRunTrackingSnapshot({ cloneRoute: false }).status !== 'running') {
          autoStartedMatchIdRef.current = null;
        }
      });
  }, [
    androidLiveMatchGpsStartDelayMs,
    autoStartedMatchIdRef,
    autoStartingMatchTrackingRef,
    clearDelayedGpsStart,
    handleStartTracking,
    matchMode,
    preStartWarmupMatchIdRef,
  ]);

  const handlePauseTracking = useCallback(async () => {
    await pauseBackgroundRunTracking();
    stopForegroundTrackingHelpers();
    syncFromBackgroundTracking();

    const activeMatchId = resolveActiveMatchId({
      matchMode,
      duelMatchId: duelMatchStatus?.matchId,
      groupMatchId: groupMatchStatus?.matchId,
      roomLinkedMatchContext,
    });

    if (activeMatchId) {
      try {
        const progress = buildDisplayedMatchProgress();
        await pushRunningMatchProgress({
          matchId: activeMatchId,
          distanceKm: progress.distanceKm,
          elapsedSeconds: progress.elapsedSeconds,
          currentPace: progress.currentPace,
          status: 'paused',
        });
      } catch {
        setError('러닝은 멈췄지만 경쟁 상태를 업데이트하지 못했어요.');
      }
    }

    try {
      await syncLiveSharing({
        enabled: liveShareEnabledRef.current,
        status: liveShareEnabledRef.current ? 'paused' : 'idle',
        locationLabel: liveShareLabelRef.current,
      });
    } catch {
      setError('측정은 멈췄지만 위치 공유 상태를 업데이트하지 못했어요.');
    }
  }, [
    buildDisplayedMatchProgress,
    duelMatchStatus?.matchId,
    groupMatchStatus?.matchId,
    liveShareEnabledRef,
    liveShareLabelRef,
    matchMode,
    pushRunningMatchProgress,
    roomLinkedMatchContext,
    setError,
    stopForegroundTrackingHelpers,
    syncFromBackgroundTracking,
    syncLiveSharing,
  ]);

  const handleResumeTracking = useCallback(async () => {
    try {
      setError(null);
      const resumeMatchId = resolveActiveMatchId({
        matchMode,
        duelMatchId: duelMatchStatus?.matchId,
        groupMatchId: groupMatchStatus?.matchId,
        roomLinkedMatchContext,
      });
      await ensureBackgroundLocationPermission();
      await resumeBackgroundRunTracking({
        appState: appStateRef.current,
        trackingKey: resumeMatchId ?? (matchMode === 'solo' ? 'solo' : `${matchMode}:resume`),
      });
      syncFromBackgroundTracking();

      if (liveShareEnabledRef.current) {
        const currentSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
        const latestTrackedPoint = currentSnapshot.route[currentSnapshot.route.length - 1];
        const nextLocationLabel = liveShareLabelRef.current ?? await resolveLiveShareLabel(
          latestTrackedPoint
            ? { latitude: latestTrackedPoint.latitude, longitude: latestTrackedPoint.longitude }
            : undefined,
        );
        await syncLiveSharing({
          enabled: true,
          status: 'running',
          locationLabel: nextLocationLabel,
        });
      }

      const activeMatchId = resumeMatchId;

      if (activeMatchId) {
        const currentSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
        const progress = buildDisplayedMatchProgress(currentSnapshot);
        await pushRunningMatchProgress({
          matchId: activeMatchId,
          distanceKm: progress.distanceKm,
          elapsedSeconds: progress.elapsedSeconds,
          currentPace: progress.currentPace,
          status: 'running',
        });
      }
    } catch (resumeError) {
      setError(getApiErrorMessage(resumeError, '러닝 측정을 다시 시작하지 못했어.'));
      stopForegroundTrackingHelpers();
      setStatus('paused');
    }
  }, [
    appStateRef,
    buildDisplayedMatchProgress,
    duelMatchStatus?.matchId,
    ensureBackgroundLocationPermission,
    groupMatchStatus?.matchId,
    liveShareEnabledRef,
    liveShareLabelRef,
    matchMode,
    pushRunningMatchProgress,
    resolveLiveShareLabel,
    roomLinkedMatchContext,
    setError,
    setStatus,
    stopForegroundTrackingHelpers,
    syncFromBackgroundTracking,
    syncLiveSharing,
  ]);

  useEffect(() => () => {
    clearDelayedGpsStart();
  }, [clearDelayedGpsStart]);

  return {
    handlePauseTracking,
    handleResumeTracking,
    handleStartTracking,
    skippedAndroidWarmupMatchIdRef,
    startMatchTrackingAutomatically,
  };
}
