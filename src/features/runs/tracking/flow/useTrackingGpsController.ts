import { useLocationTracking } from '@/features/runs/tracking/useLocationTracking';
import { usePedometerTracking } from '@/features/runs/tracking/usePedometerTracking';
import type { UseRunTrackingFlowInput } from '@/features/runs/types/runTrackingFlow';

export function useTrackingGpsController({
  status,
  trackerStatusRef,
  matchModeRef,
  pedometerSubscriptionRef,
  pedometerStepOffsetRef,
  pedometerSensorRef,
  elapsedSecondsRef,
  totalStepsRef,
  setMotionPermissionGranted,
  setCadenceSpm,
  setBackgroundLocationPermissionGranted,
  setLiveShareLabel,
  setLocationPermissionGranted,
}: UseRunTrackingFlowInput) {
  const { stopPedometerSubscription } = usePedometerTracking({
    status,
    trackerStatusRef,
    matchModeRef,
    pedometerSubscriptionRef,
    pedometerStepOffsetRef,
    pedometerSensorRef,
    elapsedSecondsRef,
    totalStepsRef,
    setMotionPermissionGranted,
    setCadenceSpm,
  });

  const locationTracking = useLocationTracking({
    setBackgroundLocationPermissionGranted,
    setLiveShareLabel,
    setLocationPermissionGranted,
  });

  return {
    stopPedometerSubscription,
    ...locationTracking,
  };
}
