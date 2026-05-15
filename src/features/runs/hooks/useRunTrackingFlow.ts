import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  getBackgroundRunElapsedSeconds,
  getBackgroundRunTrackingSnapshot,
  pauseBackgroundRunTracking,
  resetBackgroundRunTracking,
  resumeBackgroundRunTracking,
  startBackgroundRunTracking,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import {
  buildAveragePace,
  calculateCadenceSpm,
} from '@/features/runs/tracking';
import {
  buildOfficialStartBaseline,
} from '@/features/runs/tracking/trackingSession';
import { buildDisplayedTrackingSnapshot } from '@/features/runs/viewModels/trackingDisplayModel';
import {
  normalizeMatchProgressPace,
} from '@/features/runs/viewModels/matchProgress';
import {
  isLiveMatchState,
  resolveActiveMatchId,
} from '@/features/runs/lifecycle/matchStateMachine';
import { useElapsedTicker } from '@/features/runs/tracking/useElapsedTicker';
import { useLiveShareHeartbeat } from '@/features/runs/tracking/useLiveShareHeartbeat';
import { useLocationTracking } from '@/features/runs/tracking/useLocationTracking';
import { useMatchProgressHeartbeat } from '@/features/runs/tracking/useMatchProgressHeartbeat';
import { usePedometerTracking } from '@/features/runs/tracking/usePedometerTracking';
import { useTrackingAppStateSync } from '@/features/runs/tracking/useTrackingAppStateSync';
import { LIVE_MATCH_UI_DISPLAY_INTERVAL_MS } from '@/features/runs/sync/liveMatchCadence';
import type {
  DisplayedMatchProgress,
  DisplayedTrackingSnapshot,
  UseRunTrackingFlowInput,
} from '@/features/runs/types/runTrackingFlow';
import { shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import { getApiErrorMessage } from '@/services/apiError';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type TrackingUiFrame = {
  currentPace: string;
  distanceKm: number;
  elapsedSeconds: number;
  elevationGainM: number;
  status: BackgroundRunTrackingSnapshot['status'];
};

const ANDROID_LIVE_MATCH_GPS_START_DELAY_MS = 1_500;

function buildTrackingUiFrame(
  snapshot: BackgroundRunTrackingSnapshot,
  displayedSnapshot: DisplayedTrackingSnapshot,
): TrackingUiFrame {
  return {
    currentPace: displayedSnapshot.currentPace,
    distanceKm: displayedSnapshot.distanceKm,
    elapsedSeconds: displayedSnapshot.elapsedSeconds,
    elevationGainM: displayedSnapshot.elevationGainM,
    status: snapshot.status,
  };
}

function hasCriticalTrackingUiChange(
  previousFrame: TrackingUiFrame | null,
  nextFrame: TrackingUiFrame,
) {
  if (!previousFrame) {
    return true;
  }

  return previousFrame.status !== nextFrame.status
    || nextFrame.elapsedSeconds < previousFrame.elapsedSeconds
    || nextFrame.distanceKm < previousFrame.distanceKm;
}

export function useRunTrackingFlow({
  pedometerSubscriptionRef,
  timerRef,
  soloStartCountdownTimerRef,
  soloStartCountdownResolveRef,
  routeRef,
  elapsedSecondsRef,
  totalStepsRef,
  pedometerStepOffsetRef,
  liveShareEnabledRef,
  liveShareLabelRef,
  liveShareHeartbeatRef,
  matchProgressHeartbeatRef,
  appStateRef,
  trackerStatusRef,
  officialStartBaselineRef,
  matchModeRef,
  roomLinkedMatchContextRef,
  duelMatchStatusRef,
  groupMatchStatusRef,
  autoStartingMatchTrackingRef,
  autoStartedMatchIdRef,
  preStartWarmupMatchIdRef,
  matchMode,
  duelMatchState,
  groupMatchState,
  duelMatchStatus,
  groupMatchStatus,
  roomLinkedMatchContext,
  status,
  visiblePartyRunShouldOpenArena,
  duelStartCountdownSeconds,
  groupStartCountdownSeconds,
  setStatus,
  setSoloStartCountdownSeconds,
  setRoute,
  setDistanceKm,
  setElapsedSeconds,
  setCurrentPace,
  setLastSyncedMatchProgress,
  setDuelMatchStatus,
  setGroupMatchStatus,
  setElevationGainM,
  setCadenceSpm,
  setLocationPermissionGranted,
  setBackgroundLocationPermissionGranted,
  setMotionPermissionGranted,
  setLiveShareLabel,
  setError,
  officialStartDistanceNoiseGraceSeconds,
  officialStartDistanceNoiseGraceKm,
  soloStartCountdownSeconds,
  getSyncedNowMs,
  refreshStaleMatchArtifacts,
  matchProgressHeartbeatEnabled = true,
  matchLifecycleController,
  trackingSubscriptionsEnabled = true,
}: UseRunTrackingFlowInput) {
  const gpsTrackingStartKeyRef = useRef<string | null>(null);
  const gpsTrackingStartPromiseRef = useRef<Promise<void> | null>(null);
  const delayedGpsStartKeyRef = useRef<string | null>(null);
  const delayedGpsStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skippedAndroidWarmupMatchIdRef = useRef<string | null>(null);
  const lastTrackingUiFlushMsRef = useRef(0);
  const lastTrackingUiFrameRef = useRef<TrackingUiFrame | null>(null);
  const lifecycleWarmupMatchId = matchLifecycleController?.gps.warmupMatch?.matchId ?? null;
  const lifecycleActiveMatchId = matchLifecycleController?.gps.activeMatch?.matchId ?? null;
  const lifecycleActiveMatchSlotStartAt = matchLifecycleController?.gps.activeMatch?.slotStartAt ?? null;
  const hasLifecycleController = Boolean(matchLifecycleController);

  const syncElapsedSeconds = (nextElapsedSeconds: number, options?: { commitState?: boolean }) => {
    const commitState = options?.commitState ?? true;
    elapsedSecondsRef.current = nextElapsedSeconds;

    if (commitState) {
      setElapsedSeconds(nextElapsedSeconds);
      setCadenceSpm(calculateCadenceSpm(totalStepsRef.current, nextElapsedSeconds));
    }
  };

  const finishSoloStartCountdown = (completed: boolean) => {
    if (soloStartCountdownResolveRef.current) {
      rgPerfMark('countdown end', {
        completed,
        source: 'solo',
      });
    }

    if (soloStartCountdownTimerRef.current) {
      clearInterval(soloStartCountdownTimerRef.current);
      soloStartCountdownTimerRef.current = null;
    }

    setSoloStartCountdownSeconds(null);
    soloStartCountdownResolveRef.current?.(completed);
    soloStartCountdownResolveRef.current = null;
  };

  const runSoloStartCountdown = () => new Promise<boolean>((resolve) => {
    finishSoloStartCountdown(false);

    soloStartCountdownResolveRef.current = resolve;
    let remainingSeconds = soloStartCountdownSeconds;
    rgPerfMark('countdown begin', {
      remainingSeconds,
      source: 'solo',
    });
    setSoloStartCountdownSeconds(remainingSeconds);
    setStatus('starting');

    soloStartCountdownTimerRef.current = setInterval(() => {
      remainingSeconds -= 1;

      if (remainingSeconds <= 0) {
        finishSoloStartCountdown(true);
        return;
      }

      setSoloStartCountdownSeconds(remainingSeconds);
    }, 1000);
  });

  const resolveWarmupOfficialStartTarget = () => {
    const warmupMatchId = preStartWarmupMatchIdRef.current;
    if (!warmupMatchId) {
      return null;
    }

    const roomContext = roomLinkedMatchContextRef.current;
    if (roomContext?.matchId === warmupMatchId) {
      return {
        matchId: roomContext.matchId,
        slotStartAt: roomContext.slotStartAt,
        isActive: roomContext.state === 'active',
      };
    }

    const duelStatus = duelMatchStatusRef.current;
    if (duelStatus?.matchId === warmupMatchId) {
      return {
        matchId: duelStatus.matchId,
        slotStartAt: duelStatus.slotStartAt,
        isActive: duelStatus.state === 'active',
      };
    }

    const groupStatus = groupMatchStatusRef.current;
    if (groupStatus?.matchId === warmupMatchId) {
      return {
        matchId: groupStatus.matchId,
        slotStartAt: groupStatus.slotStartAt,
        isActive: groupStatus.state === 'active',
      };
    }

    return null;
  };

  const ensureOfficialStartBaseline = (snapshot: BackgroundRunTrackingSnapshot) => {
    if (!preStartWarmupMatchIdRef.current || officialStartBaselineRef.current) {
      return;
    }

    const target = resolveWarmupOfficialStartTarget();
    if (!target) {
      return;
    }

    const officialStartMs = new Date(target.slotStartAt).getTime();
    if (!Number.isFinite(officialStartMs)) {
      return;
    }

    if (!target.isActive && officialStartMs > getSyncedNowMs()) {
      return;
    }

    officialStartBaselineRef.current = buildOfficialStartBaseline(
      snapshot,
      target.matchId,
      target.slotStartAt,
    );
    preStartWarmupMatchIdRef.current = null;
  };

  const getDisplayedTrackingSnapshot = (
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
  ): DisplayedTrackingSnapshot => {
    ensureOfficialStartBaseline(snapshot);
    return buildDisplayedTrackingSnapshot({
      snapshot,
      rawElapsedSeconds: getBackgroundRunElapsedSeconds(snapshot),
      officialStartBaseline: officialStartBaselineRef.current,
      hasPreStartWarmup: Boolean(preStartWarmupMatchIdRef.current),
      startNoiseGraceSeconds: officialStartDistanceNoiseGraceSeconds,
      startNoiseGraceKm: officialStartDistanceNoiseGraceKm,
    });
  };

  const buildDisplayedMatchProgress = (
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
  ): DisplayedMatchProgress => {
    const displayedSnapshot = getDisplayedTrackingSnapshot(snapshot);
    const displayedAveragePace = buildAveragePace(displayedSnapshot.distanceKm, displayedSnapshot.elapsedSeconds);
    return {
      distanceKm: displayedSnapshot.distanceKm,
      elapsedSeconds: displayedSnapshot.elapsedSeconds,
      currentPace: normalizeMatchProgressPace(displayedSnapshot.currentPace, displayedAveragePace),
    };
  };

  const {
    pushRunningMatchProgress,
    refreshMatchProgressHeartbeat,
    syncMatchLifecycleStatus,
  } = useMatchProgressHeartbeat({
    matchModeRef,
    duelMatchStatusRef,
    groupMatchStatusRef,
    roomLinkedMatchContextRef,
    matchProgressHeartbeatRef,
    buildDisplayedMatchProgress,
    setLastSyncedMatchProgress,
    setDuelMatchStatus,
    setGroupMatchStatus,
    heartbeatEnabled: matchProgressHeartbeatEnabled,
  });

  const syncFromBackgroundTracking = (
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
  ) => {
    const displayedSnapshot = getDisplayedTrackingSnapshot(snapshot);
    // Route points are needed for saving, but rendering the growing array every tick is expensive on Android.
    routeRef.current = displayedSnapshot.route;

    const nextUiFrame = buildTrackingUiFrame(snapshot, displayedSnapshot);
    const shouldThrottleLiveMatchUi = Platform.OS === 'android'
      && matchModeRef.current !== 'solo'
      && snapshot.status === 'running';
    const nowMs = Date.now();
    const shouldCommitUiState = !shouldThrottleLiveMatchUi
      || hasCriticalTrackingUiChange(lastTrackingUiFrameRef.current, nextUiFrame)
      || nowMs - lastTrackingUiFlushMsRef.current >= LIVE_MATCH_UI_DISPLAY_INTERVAL_MS;

    if (!shouldCommitUiState) {
      syncElapsedSeconds(displayedSnapshot.elapsedSeconds, { commitState: false });
      return;
    }

    lastTrackingUiFlushMsRef.current = nowMs;
    lastTrackingUiFrameRef.current = nextUiFrame;
    setDistanceKm(displayedSnapshot.distanceKm);
    setElevationGainM(displayedSnapshot.elevationGainM);
    setCurrentPace(displayedSnapshot.currentPace);
    setStatus(snapshot.status);
    syncElapsedSeconds(displayedSnapshot.elapsedSeconds);
  };

  const {
    clearElapsedTicker,
    startElapsedTicker,
  } = useElapsedTicker({
    timerRef,
    syncFromBackgroundTracking,
  });

  const { stopPedometerSubscription } = usePedometerTracking({
    status,
    trackerStatusRef,
    pedometerSubscriptionRef,
    pedometerStepOffsetRef,
    elapsedSecondsRef,
    totalStepsRef,
    setMotionPermissionGranted,
    setCadenceSpm,
  });

  const {
    ensureBackgroundLocationPermission,
    ensureLocationPermission,
    resolveLiveShareLabel,
  } = useLocationTracking({
    setBackgroundLocationPermissionGranted,
    setLiveShareLabel,
    setLocationPermissionGranted,
  });

  const {
    refreshLiveSharingHeartbeat,
    syncLiveSharing,
  } = useLiveShareHeartbeat({
    liveShareEnabledRef,
    liveShareLabelRef,
    liveShareHeartbeatRef,
    setLiveShareLabel,
  });

  const stopForegroundTrackingHelpers = () => {
    stopPedometerSubscription();
    clearElapsedTicker();
  };

  const resetForegroundTrackingState = () => {
    stopForegroundTrackingHelpers();
    finishSoloStartCountdown(false);
    elapsedSecondsRef.current = 0;
    totalStepsRef.current = 0;
    pedometerStepOffsetRef.current = 0;
    routeRef.current = [];
    setRoute([]);
    setDistanceKm(0);
    setElapsedSeconds(0);
    setCurrentPace('--:--/km');
    setLastSyncedMatchProgress(null);
    setElevationGainM(0);
    setCadenceSpm(null);
  };

  const clearDelayedGpsStart = () => {
    if (delayedGpsStartTimerRef.current) {
      clearTimeout(delayedGpsStartTimerRef.current);
      delayedGpsStartTimerRef.current = null;
    }
    delayedGpsStartKeyRef.current = null;
  };

  const startMatchTrackingAutomatically = (
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
        delayMs: ANDROID_LIVE_MATCH_GPS_START_DELAY_MS,
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
        delayMs: ANDROID_LIVE_MATCH_GPS_START_DELAY_MS,
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
      }, ANDROID_LIVE_MATCH_GPS_START_DELAY_MS);
      return;
    }

    void handleStartTracking({ ...options, matchId })
      .finally(() => {
        autoStartingMatchTrackingRef.current = false;
        if (getBackgroundRunTrackingSnapshot({ cloneRoute: false }).status !== 'running') {
          autoStartedMatchIdRef.current = null;
        }
      });
  };

  const handleStartTrackingInternal = async (options?: { allowCountdownWarmup?: boolean; matchId?: string }) => {
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
  };

  const handleStartTracking = (options?: { allowCountdownWarmup?: boolean; matchId?: string }) => {
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
  };

  useEffect(() => () => {
    clearDelayedGpsStart();
  }, []);

  const handlePauseTracking = async () => {
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
  };

  const handleResumeTracking = async () => {
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
  };

  useEffect(() => {
    if (!trackingSubscriptionsEnabled) {
      return;
    }

    const roomWarmupMatchId = !hasLifecycleController
      && roomLinkedMatchContext
      && roomLinkedMatchContext.mode === matchMode
      && roomLinkedMatchContext.state === 'matched'
      && visiblePartyRunShouldOpenArena
        ? roomLinkedMatchContext.matchId
        : null;
    const warmupMatchId = lifecycleWarmupMatchId
      ?? (matchMode === 'duel'
        ? duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds)
          ? duelMatchStatus?.matchId ?? roomWarmupMatchId
          : roomWarmupMatchId
        : matchMode === 'group'
          ? groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds)
            ? groupMatchStatus?.matchId ?? roomWarmupMatchId
            : roomWarmupMatchId
          : roomWarmupMatchId);

    if (!warmupMatchId) {
      if (!officialStartBaselineRef.current) {
        preStartWarmupMatchIdRef.current = null;
      }
      return;
    }

    if (status !== 'idle') {
      return;
    }

    if (autoStartedMatchIdRef.current === warmupMatchId) {
      return;
    }

    if (skippedAndroidWarmupMatchIdRef.current === warmupMatchId) {
      return;
    }

    startMatchTrackingAutomatically(warmupMatchId, { allowCountdownWarmup: true });
  }, [
    duelMatchState,
    duelMatchStatus?.matchId,
    duelStartCountdownSeconds,
    groupMatchState,
    groupMatchStatus?.matchId,
    groupStartCountdownSeconds,
    hasLifecycleController,
    lifecycleWarmupMatchId,
    matchMode,
    roomLinkedMatchContext,
    status,
    trackingSubscriptionsEnabled,
    visiblePartyRunShouldOpenArena,
  ]);

  useEffect(() => {
    if (!trackingSubscriptionsEnabled) {
      return;
    }

    const roomActiveMatch =
      !hasLifecycleController
      && roomLinkedMatchContext
      && roomLinkedMatchContext.mode === matchMode
      && roomLinkedMatchContext.state === 'active'
        ? {
            matchId: roomLinkedMatchContext.matchId,
            slotStartAt: roomLinkedMatchContext.slotStartAt,
          }
        : null;
    const fallbackActiveMatch = matchMode === 'duel'
      ? duelMatchStatus?.state === 'active' && duelMatchStatus.matchId
        ? { matchId: duelMatchStatus.matchId, slotStartAt: duelMatchStatus.slotStartAt }
        : roomActiveMatch
      : matchMode === 'group'
        ? groupMatchStatus?.state === 'active' && groupMatchStatus.matchId
          ? { matchId: groupMatchStatus.matchId, slotStartAt: groupMatchStatus.slotStartAt }
          : roomActiveMatch
        : roomActiveMatch;
    const activeMatch = lifecycleActiveMatchId && lifecycleActiveMatchSlotStartAt
      ? {
          matchId: lifecycleActiveMatchId,
          slotStartAt: lifecycleActiveMatchSlotStartAt,
        }
      : fallbackActiveMatch;
    const activeMatchId = activeMatch?.matchId ?? null;

    if (!activeMatchId) {
      autoStartedMatchIdRef.current = null;
      skippedAndroidWarmupMatchIdRef.current = null;
      if (!preStartWarmupMatchIdRef.current) {
        officialStartBaselineRef.current = null;
      }
      return;
    }

    if (skippedAndroidWarmupMatchIdRef.current === activeMatchId) {
      skippedAndroidWarmupMatchIdRef.current = null;
    }

    if (
      preStartWarmupMatchIdRef.current === activeMatchId
      && status === 'running'
      && !officialStartBaselineRef.current
    ) {
      const currentSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      officialStartBaselineRef.current = buildOfficialStartBaseline(
        currentSnapshot,
        activeMatchId,
        activeMatch?.slotStartAt ?? new Date().toISOString(),
      );
      preStartWarmupMatchIdRef.current = null;
      syncFromBackgroundTracking(currentSnapshot);
      return;
    }

    if (status !== 'idle') {
      return;
    }

    if (autoStartedMatchIdRef.current === activeMatchId) {
      return;
    }

    startMatchTrackingAutomatically(activeMatchId);
  }, [
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    duelMatchStatus?.slotStartAt,
    groupMatchStatus?.matchId,
    groupMatchStatus?.state,
    groupMatchStatus?.slotStartAt,
    hasLifecycleController,
    lifecycleActiveMatchId,
    lifecycleActiveMatchSlotStartAt,
    matchMode,
    roomLinkedMatchContext,
    status,
    trackingSubscriptionsEnabled,
  ]);

  useTrackingAppStateSync({
    enabled: trackingSubscriptionsEnabled,
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
  });

  return {
    buildDisplayedMatchProgress,
    getDisplayedTrackingSnapshot,
    handlePauseTracking,
    handleResumeTracking,
    handleStartTracking,
    pushRunningMatchProgress,
    resetForegroundTrackingState,
    stopForegroundTrackingHelpers,
    syncElapsedSeconds,
    syncFromBackgroundTracking,
    syncLiveSharing,
  };
}
