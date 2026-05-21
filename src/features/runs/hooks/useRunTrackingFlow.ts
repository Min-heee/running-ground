import { useCallback } from 'react';
import { useLiveShareHeartbeat } from '@/features/runs/tracking/useLiveShareHeartbeat';
import { useMatchProgressHeartbeat } from '@/features/runs/tracking/useMatchProgressHeartbeat';
import { useTrackingGpsController } from '@/features/runs/tracking/flow/useTrackingGpsController';
import { useTrackingLifecycleActions } from '@/features/runs/tracking/flow/useTrackingLifecycleActions';
import { useTrackingSessionState } from '@/features/runs/tracking/flow/useTrackingSessionState';
import { useTrackingSnapshotBuilder } from '@/features/runs/tracking/flow/useTrackingSnapshotBuilder';
import { useTrackingTimers } from '@/features/runs/tracking/flow/useTrackingTimers';
import type { UseRunTrackingFlowInput } from '@/features/runs/types/runTrackingFlow';

export function useRunTrackingFlow(flow: UseRunTrackingFlowInput) {
  const {
    duelMatchStatusRef,
    groupMatchStatusRef,
    liveShareEnabledRef,
    liveShareHeartbeatRef,
    liveShareLabelRef,
    matchModeRef,
    matchProgressHeartbeatEnabled = true,
    matchProgressHeartbeatRef,
    roomLinkedMatchContextRef,
    setDuelMatchStatus,
    setGroupMatchStatus,
    setLastSyncedMatchProgress,
    setLiveShareLabel,
  } = flow;

  const {
    buildDisplayedMatchProgress,
    getDisplayedTrackingSnapshot,
    shouldUseBackgroundElapsedTicker,
    syncElapsedSeconds,
    syncFromBackgroundTracking,
  } = useTrackingSnapshotBuilder(flow);

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
    finishSoloStartCountdown,
    runSoloStartCountdown,
    startElapsedTicker,
  } = useTrackingTimers({
    flow,
    shouldUseBackgroundElapsedTicker,
    syncFromBackgroundTracking,
  });

  const {
    ensureBackgroundLocationPermission,
    ensureLocationPermission,
    resolveLiveShareLabel,
    stopPedometerSubscription,
  } = useTrackingGpsController(flow);

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

  const {
    resetForegroundTrackingState,
  } = useTrackingSessionState({
    flow,
    finishSoloStartCountdown,
    stopForegroundTrackingHelpers,
  });

  const {
    handlePauseTracking,
    handleResumeTracking,
    handleStartTracking,
  } = useTrackingLifecycleActions({
    buildDisplayedMatchProgress,
    clearElapsedTicker,
    ensureBackgroundLocationPermission,
    ensureLocationPermission,
    finishSoloStartCountdown,
    flow,
    pushRunningMatchProgress,
    refreshLiveSharingHeartbeat,
    refreshMatchProgressHeartbeat,
    resetForegroundTrackingState,
    resolveLiveShareLabel,
    runSoloStartCountdown,
    shouldUseBackgroundElapsedTicker,
    startElapsedTicker,
    stopForegroundTrackingHelpers,
    syncFromBackgroundTracking,
    syncLiveSharing,
    syncMatchLifecycleStatus,
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
