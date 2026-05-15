import { usePauseResumeTrackingActions } from '@/features/runs/tracking/actions/usePauseResumeTrackingActions';
import { useStartTrackingAction } from '@/features/runs/tracking/actions/useStartTrackingAction';
import { useStopTrackingAction } from '@/features/runs/tracking/actions/useStopTrackingAction';
import { useTrackingActionGuards } from '@/features/runs/tracking/actions/useTrackingActionGuards';
import type { UseRunTrackingActionsInput } from '@/features/runs/tracking/actions/types';

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
  const gpsStartGuard = useTrackingActionGuards();
  const { handleStartFailure } = useStopTrackingAction({
    finishSoloStartCountdown,
    setError,
    setStatus,
    stopForegroundTrackingHelpers,
    syncLiveSharing,
  });
  const {
    handleStartTracking,
    startMatchTrackingAutomatically,
  } = useStartTrackingAction({
    appStateRef,
    liveShareEnabledRef,
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
    setError,
    androidLiveMatchGpsStartDelayMs,
    ensureBackgroundLocationPermission,
    ensureLocationPermission,
    gpsStartGuard,
    handleStartFailure,
    resetForegroundTrackingState,
    resolveLiveShareLabel,
    runSoloStartCountdown,
    syncFromBackgroundTracking,
    syncLiveSharing,
  });
  const {
    handlePauseTracking,
    handleResumeTracking,
  } = usePauseResumeTrackingActions({
    appStateRef,
    liveShareEnabledRef,
    liveShareLabelRef,
    matchMode,
    duelMatchStatus,
    groupMatchStatus,
    roomLinkedMatchContext,
    setStatus,
    setError,
    buildDisplayedMatchProgress,
    ensureBackgroundLocationPermission,
    pushRunningMatchProgress,
    resolveLiveShareLabel,
    stopForegroundTrackingHelpers,
    syncFromBackgroundTracking,
    syncLiveSharing,
  });

  return {
    handlePauseTracking,
    handleResumeTracking,
    handleStartTracking,
    skippedAndroidWarmupMatchIdRef: gpsStartGuard.skippedAndroidWarmupMatchIdRef,
    startMatchTrackingAutomatically,
  };
}
