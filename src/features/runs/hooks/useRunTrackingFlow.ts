import { useCallback } from 'react';
import { useElapsedTicker } from '@/features/runs/tracking/useElapsedTicker';
import { useLiveShareHeartbeat } from '@/features/runs/tracking/useLiveShareHeartbeat';
import { useLocationTracking } from '@/features/runs/tracking/useLocationTracking';
import { useMatchProgressHeartbeat } from '@/features/runs/tracking/useMatchProgressHeartbeat';
import { usePedometerTracking } from '@/features/runs/tracking/usePedometerTracking';
import { useTrackingAppStateSync } from '@/features/runs/tracking/useTrackingAppStateSync';
import { useRunTrackingActions } from '@/features/runs/tracking/actions/useRunTrackingActions';
import { useMatchAutoTrackingEffects } from '@/features/runs/tracking/lifecycle/useMatchAutoTrackingEffects';
import { useTrackingSessionSnapshots } from '@/features/runs/tracking/session/useTrackingSessionSnapshots';
import { useSoloStartCountdown } from '@/features/runs/tracking/timers/useSoloStartCountdown';
import type { UseRunTrackingFlowInput } from '@/features/runs/types/runTrackingFlow';

const ANDROID_LIVE_MATCH_GPS_START_DELAY_MS = 1_500;

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
  const lifecycleWarmupMatchId = matchLifecycleController?.gps.warmupMatch?.matchId ?? null;
  const lifecycleActiveMatchId = matchLifecycleController?.gps.activeMatch?.matchId ?? null;
  const lifecycleActiveMatchSlotStartAt = matchLifecycleController?.gps.activeMatch?.slotStartAt ?? null;
  const hasLifecycleController = Boolean(matchLifecycleController);

  const {
    finishSoloStartCountdown,
    runSoloStartCountdown,
  } = useSoloStartCountdown({
    soloStartCountdownTimerRef,
    soloStartCountdownResolveRef,
    setSoloStartCountdownSeconds,
    setStatus,
    soloStartCountdownSeconds,
  });

  const {
    buildDisplayedMatchProgress,
    getDisplayedTrackingSnapshot,
    syncElapsedSeconds,
    syncFromBackgroundTracking,
  } = useTrackingSessionSnapshots({
    routeRef,
    elapsedSecondsRef,
    totalStepsRef,
    preStartWarmupMatchIdRef,
    officialStartBaselineRef,
    roomLinkedMatchContextRef,
    duelMatchStatusRef,
    groupMatchStatusRef,
    matchModeRef,
    setStatus,
    setRoute,
    setDistanceKm,
    setElapsedSeconds,
    setCurrentPace,
    setElevationGainM,
    setCadenceSpm,
    officialStartDistanceNoiseGraceSeconds,
    officialStartDistanceNoiseGraceKm,
    getSyncedNowMs,
  });

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

  const stopForegroundTrackingHelpers = useCallback(() => {
    stopPedometerSubscription();
    clearElapsedTicker();
  }, [
    clearElapsedTicker,
    stopPedometerSubscription,
  ]);

  const resetForegroundTrackingState = useCallback(() => {
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
  }, [
    elapsedSecondsRef,
    finishSoloStartCountdown,
    pedometerStepOffsetRef,
    routeRef,
    setCadenceSpm,
    setCurrentPace,
    setDistanceKm,
    setElapsedSeconds,
    setElevationGainM,
    setLastSyncedMatchProgress,
    setRoute,
    stopForegroundTrackingHelpers,
    totalStepsRef,
  ]);

  const {
    handlePauseTracking,
    handleResumeTracking,
    handleStartTracking,
    skippedAndroidWarmupMatchIdRef,
    startMatchTrackingAutomatically,
  } = useRunTrackingActions({
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
    androidLiveMatchGpsStartDelayMs: ANDROID_LIVE_MATCH_GPS_START_DELAY_MS,
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
  });

  useMatchAutoTrackingEffects({
    autoStartedMatchIdRef,
    preStartWarmupMatchIdRef,
    officialStartBaselineRef,
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
    trackingSubscriptionsEnabled,
    hasLifecycleController,
    lifecycleActiveMatchId,
    lifecycleActiveMatchSlotStartAt,
    lifecycleWarmupMatchId,
    skippedAndroidWarmupMatchIdRef,
    startMatchTrackingAutomatically,
    syncFromBackgroundTracking,
  });

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
