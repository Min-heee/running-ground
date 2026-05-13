import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import {
  getBackgroundRunElapsedSeconds,
  getBackgroundRunTrackingSnapshot,
  pauseBackgroundRunTracking,
  resetBackgroundRunTracking,
  resumeBackgroundRunTracking,
  startBackgroundRunTracking,
  subscribeBackgroundRunTracking,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/backgroundTracking';
import {
  buildAveragePace,
  calculateCadenceSpm,
} from '@/features/runs/tracking';
import {
  buildLiveShareFallbackLabel,
  buildLiveShareLabelFromAddress,
  buildOfficialStartBaseline,
} from '@/features/runs/trackingSession';
import { buildDisplayedTrackingSnapshot } from '@/features/runs/trackingDisplayModel';
import {
  normalizeMatchProgressPace,
} from '@/features/runs/matchProgress';
import {
  isLiveMatchState,
  resolveActiveMatchId,
} from '@/features/runs/matchStateMachine';
import { useMatchProgressSync } from '@/features/runs/hooks/useMatchProgressSync';
import type {
  DisplayedMatchProgress,
  DisplayedTrackingSnapshot,
  SyncLiveSharingInput,
  UseRunTrackingFlowInput,
} from '@/features/runs/types/runTrackingFlow';
import { shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import { updateRunningLiveShare } from '@/services/runningService';
import type {
  UpdateRunningMatchProgressInput,
} from '@/lib/api/types';

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
}: UseRunTrackingFlowInput) {
  const callbackRef = useRef({
    refreshStaleMatchArtifacts,
    refreshMatchProgressHeartbeat: (_snapshot: BackgroundRunTrackingSnapshot) => {},
    syncMatchLifecycleStatus: async (
      _nextStatus: Extract<UpdateRunningMatchProgressInput['status'], 'running' | 'background'>,
      _snapshot?: BackgroundRunTrackingSnapshot,
    ) => {},
  });

  const syncElapsedSeconds = (nextElapsedSeconds: number) => {
    elapsedSecondsRef.current = nextElapsedSeconds;
    setElapsedSeconds(nextElapsedSeconds);
    setCadenceSpm(calculateCadenceSpm(totalStepsRef.current, nextElapsedSeconds));
  };

  const clearElapsedTicker = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const finishSoloStartCountdown = (completed: boolean) => {
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

  const stopPedometerSubscription = () => {
    pedometerSubscriptionRef.current?.remove();
    pedometerSubscriptionRef.current = null;
  };

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
  } = useMatchProgressSync({
    matchModeRef,
    duelMatchStatusRef,
    groupMatchStatusRef,
    roomLinkedMatchContextRef,
    matchProgressHeartbeatRef,
    buildDisplayedMatchProgress,
    setLastSyncedMatchProgress,
    setDuelMatchStatus,
    setGroupMatchStatus,
  });

  callbackRef.current = {
    refreshStaleMatchArtifacts,
    refreshMatchProgressHeartbeat,
    syncMatchLifecycleStatus,
  };

  const syncFromBackgroundTracking = (
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
  ) => {
    const displayedSnapshot = getDisplayedTrackingSnapshot(snapshot);
    // Route points are needed for saving, but rendering the growing array every tick is expensive on Android.
    routeRef.current = displayedSnapshot.route;
    setDistanceKm(displayedSnapshot.distanceKm);
    setElevationGainM(displayedSnapshot.elevationGainM);
    setCurrentPace(displayedSnapshot.currentPace);
    setStatus(snapshot.status);
    syncElapsedSeconds(displayedSnapshot.elapsedSeconds);
  };

  const startElapsedTicker = () => {
    clearElapsedTicker();
    timerRef.current = setInterval(() => {
      syncFromBackgroundTracking();
    }, 1000);
  };

  const startMatchTrackingAutomatically = (
    matchId: string,
    options?: { allowCountdownWarmup?: boolean },
  ) => {
    if (autoStartingMatchTrackingRef.current) {
      return;
    }

    autoStartingMatchTrackingRef.current = true;
    autoStartedMatchIdRef.current = matchId;

    void handleStartTracking(options)
      .finally(() => {
        autoStartingMatchTrackingRef.current = false;
        if (getBackgroundRunTrackingSnapshot({ cloneRoute: false }).status !== 'running') {
          autoStartedMatchIdRef.current = null;
        }
      });
  };

  const startPedometerUpdates = async () => {
    if (pedometerSubscriptionRef.current) {
      return;
    }

    try {
      const isAvailable = await Pedometer.isAvailableAsync();

      if (!isAvailable) {
        setMotionPermissionGranted(false);
        return;
      }

      const permission = await Pedometer.requestPermissionsAsync();
      const granted = permission.granted || permission.status === 'granted';
      setMotionPermissionGranted(granted);

      if (!granted) {
        return;
      }

      if (trackerStatusRef.current !== 'running' || pedometerSubscriptionRef.current) {
        return;
      }

      pedometerSubscriptionRef.current = Pedometer.watchStepCount((result) => {
        const totalSteps = pedometerStepOffsetRef.current + result.steps;
        totalStepsRef.current = totalSteps;
        setCadenceSpm(calculateCadenceSpm(totalSteps, elapsedSecondsRef.current));
      });
    } catch {
      setMotionPermissionGranted(false);
    }
  };

  const ensureLocationPermission = async () => {
    const foregroundPermission = await Location.requestForegroundPermissionsAsync();
    const granted = foregroundPermission.granted || foregroundPermission.status === 'granted';
    setLocationPermissionGranted(granted);

    if (!granted) {
      throw new Error('위치 권한을 허용해야 지도와 거리 측정이 가능해.');
    }
  };

  const ensureBackgroundLocationPermission = async (options?: { required?: boolean }) => {
    const currentBackgroundPermission = await Location.getBackgroundPermissionsAsync();
    let granted = currentBackgroundPermission.granted || currentBackgroundPermission.status === 'granted';

    if (!granted && options?.required) {
      const requestedBackgroundPermission = await Location.requestBackgroundPermissionsAsync();
      granted = requestedBackgroundPermission.granted || requestedBackgroundPermission.status === 'granted';
    }

    setBackgroundLocationPermissionGranted(granted);

    if (!granted && options?.required) {
      throw new Error(
        Platform.OS === 'ios'
          ? '백그라운드에서도 계속 측정하려면 설정 > RunningGround > 위치에서 `항상 허용`을 켜주세요.'
          : '백그라운드에서도 계속 측정하려면 RunningGround 위치 권한을 `항상 허용`으로 바꿔주세요.',
      );
    }

    return granted;
  };

  const resolveLiveShareLabel = async (coordinate?: { latitude: number; longitude: number }) => {
    if (!coordinate) {
      const fallbackLabel = buildLiveShareFallbackLabel();
      setLiveShareLabel(fallbackLabel);
      return fallbackLabel;
    }

    try {
      const [address] = await Location.reverseGeocodeAsync(coordinate);
      const nextLabel = buildLiveShareLabelFromAddress(address) || buildLiveShareFallbackLabel();
      setLiveShareLabel(nextLabel);
      return nextLabel;
    } catch {
      const fallbackLabel = buildLiveShareFallbackLabel();
      setLiveShareLabel(fallbackLabel);
      return fallbackLabel;
    }
  };

  const syncLiveSharing = async ({
    enabled,
    status: nextStatus,
    locationLabel,
  }: SyncLiveSharingInput) => {
    const payload = await updateRunningLiveShare({
      enabled,
      status: nextStatus,
      ...(locationLabel ? { locationLabel } : {}),
    });

    setLiveShareLabel(payload.locationLabel ?? null);
    liveShareHeartbeatRef.current = payload.isRunningNow ? Date.now() : 0;
    return payload;
  };

  const refreshLiveSharingHeartbeat = (snapshot: BackgroundRunTrackingSnapshot) => {
    if (!liveShareEnabledRef.current || snapshot.status !== 'running') {
      return;
    }

    const now = Date.now();

    if (now - liveShareHeartbeatRef.current < 25000) {
      return;
    }

    liveShareHeartbeatRef.current = now;
    void syncLiveSharing({
      enabled: true,
      status: 'running',
      locationLabel: liveShareLabelRef.current,
    }).catch(() => {
      // Keep the run going even if the optional live-share heartbeat fails.
    });
  };

  const handleStartTracking = async (options?: { allowCountdownWarmup?: boolean }) => {
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
          return;
        }
      }

      await startBackgroundRunTracking();
      syncFromBackgroundTracking();

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
      finishSoloStartCountdown(false);
      setError(trackingError instanceof Error ? trackingError.message : '러닝 측정을 시작하지 못했어.');
      stopForegroundTrackingHelpers();
      await resetBackgroundRunTracking();
      void syncLiveSharing({
        enabled: false,
        status: 'idle',
      }).catch(() => {});
      setStatus('idle');
    }
  };

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
      await ensureBackgroundLocationPermission();
      await resumeBackgroundRunTracking();
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

      const activeMatchId = resolveActiveMatchId({
        matchMode,
        duelMatchId: duelMatchStatus?.matchId,
        groupMatchId: groupMatchStatus?.matchId,
        roomLinkedMatchContext,
      });

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
      setError(resumeError instanceof Error ? resumeError.message : '러닝 측정을 다시 시작하지 못했어.');
      stopForegroundTrackingHelpers();
      setStatus('paused');
    }
  };

  useEffect(() => {
    const roomWarmupMatchId =
      roomLinkedMatchContext
      && roomLinkedMatchContext.mode === matchMode
      && roomLinkedMatchContext.state === 'matched'
      && visiblePartyRunShouldOpenArena
        ? roomLinkedMatchContext.matchId
        : null;
    const warmupMatchId = matchMode === 'duel'
      ? duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds)
        ? duelMatchStatus?.matchId ?? roomWarmupMatchId
        : roomWarmupMatchId
      : matchMode === 'group'
        ? groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds)
          ? groupMatchStatus?.matchId ?? roomWarmupMatchId
          : roomWarmupMatchId
        : roomWarmupMatchId;

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

    startMatchTrackingAutomatically(warmupMatchId, { allowCountdownWarmup: true });
  }, [
    duelMatchState,
    duelMatchStatus?.matchId,
    duelStartCountdownSeconds,
    groupMatchState,
    groupMatchStatus?.matchId,
    groupStartCountdownSeconds,
    matchMode,
    roomLinkedMatchContext,
    status,
    visiblePartyRunShouldOpenArena,
  ]);

  useEffect(() => {
    const roomActiveMatch =
      roomLinkedMatchContext
      && roomLinkedMatchContext.mode === matchMode
      && roomLinkedMatchContext.state === 'active'
        ? {
            matchId: roomLinkedMatchContext.matchId,
            slotStartAt: roomLinkedMatchContext.slotStartAt,
          }
        : null;
    const activeMatch = matchMode === 'duel'
      ? duelMatchStatus?.state === 'active' && duelMatchStatus.matchId
        ? { matchId: duelMatchStatus.matchId, slotStartAt: duelMatchStatus.slotStartAt }
        : roomActiveMatch
      : matchMode === 'group'
        ? groupMatchStatus?.state === 'active' && groupMatchStatus.matchId
          ? { matchId: groupMatchStatus.matchId, slotStartAt: groupMatchStatus.slotStartAt }
          : roomActiveMatch
        : roomActiveMatch;
    const activeMatchId = activeMatch?.matchId ?? null;

    if (!activeMatchId) {
      autoStartedMatchIdRef.current = null;
      if (!preStartWarmupMatchIdRef.current) {
        officialStartBaselineRef.current = null;
      }
      return;
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
    matchMode,
    roomLinkedMatchContext,
    status,
  ]);

  useEffect(() => {
    const unsubscribe = subscribeBackgroundRunTracking(
      (snapshot) => {
        syncFromBackgroundTracking(snapshot);
        refreshLiveSharingHeartbeat(snapshot);
        callbackRef.current.refreshMatchProgressHeartbeat(snapshot);

        if (snapshot.status === 'running') {
          startElapsedTicker();
        } else {
          clearElapsedTicker();
        }
      },
      { cloneRoute: false },
    );
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active') {
        const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
        syncFromBackgroundTracking(snapshot);
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
      finishSoloStartCountdown(false);
      stopForegroundTrackingHelpers();
    };
  }, []);

  useEffect(() => {
    if (status !== 'running') {
      stopPedometerSubscription();
      return;
    }

    void startPedometerUpdates();

    return () => {
      stopPedometerSubscription();
    };
  }, [status]);

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
