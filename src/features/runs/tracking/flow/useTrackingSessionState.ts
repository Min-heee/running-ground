import { useCallback } from 'react';
import type { UseRunTrackingFlowInput } from '@/features/runs/types/runTrackingFlow';

export function useTrackingSessionState({
  flow,
  finishSoloStartCountdown,
  stopForegroundTrackingHelpers,
}: {
  flow: UseRunTrackingFlowInput;
  finishSoloStartCountdown: (completed: boolean) => void;
  stopForegroundTrackingHelpers: () => void;
}) {
  const {
    elapsedSecondsRef,
    totalStepsRef,
    pedometerStepOffsetRef,
    routeRef,
    setRoute,
    setDistanceKm,
    setElapsedSeconds,
    setCurrentPace,
    setLastSyncedMatchProgress,
    setElevationGainM,
    setCadenceSpm,
  } = flow;

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

  return {
    resetForegroundTrackingState,
  };
}
