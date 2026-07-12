import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import { calculateCadenceSpm } from '@/features/runs/tracking';
import { publishLiveTrackingMetricFrame } from '@/features/runs/tracking/liveTrackingMetricStore';

type PedometerSubscription = {
  remove: () => void;
};

type UsePedometerTrackingInput = {
  status: TrackerStatus;
  trackerStatusRef: MutableRefObject<TrackerStatus>;
  matchModeRef: MutableRefObject<RunMatchMode>;
  pedometerSubscriptionRef: MutableRefObject<PedometerSubscription | null>;
  pedometerStepOffsetRef: MutableRefObject<number>;
  elapsedSecondsRef: MutableRefObject<number>;
  totalStepsRef: MutableRefObject<number>;
  setMotionPermissionGranted: Dispatch<SetStateAction<boolean | null>>;
  setCadenceSpm: Dispatch<SetStateAction<number | null>>;
};

export function usePedometerTracking({
  status,
  trackerStatusRef,
  matchModeRef,
  pedometerSubscriptionRef,
  pedometerStepOffsetRef,
  elapsedSecondsRef,
  totalStepsRef,
  setMotionPermissionGranted,
  setCadenceSpm,
}: UsePedometerTrackingInput) {
  const stopPedometerSubscription = useCallback(() => {
    pedometerSubscriptionRef.current?.remove();
    pedometerSubscriptionRef.current = null;
  }, [pedometerSubscriptionRef]);

  const startPedometerUpdates = useCallback(async () => {
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

      // A fresh watchStepCount subscription restarts result.steps at 0. The offset must
      // absorb everything already counted, or a pause/resume snaps the running total
      // DOWN and the saved whole-run average cadence collapses — which the server-side
      // vehicle classifier would read as a cheating signature on a real run. (Run start
      // is unaffected: totalStepsRef is 0 there.)
      pedometerStepOffsetRef.current = totalStepsRef.current;

      pedometerSubscriptionRef.current = Pedometer.watchStepCount((result) => {
        const totalSteps = pedometerStepOffsetRef.current + result.steps;
        totalStepsRef.current = totalSteps;
        const cadenceSpm = calculateCadenceSpm(totalSteps, elapsedSecondsRef.current);
        publishLiveTrackingMetricFrame({ cadenceSpm });
        if (!(Platform.OS === 'android' && matchModeRef.current !== 'solo')) {
          setCadenceSpm(cadenceSpm);
        }
      });
    } catch {
      setMotionPermissionGranted(false);
    }
  }, [
    elapsedSecondsRef,
    matchModeRef,
    pedometerStepOffsetRef,
    pedometerSubscriptionRef,
    setCadenceSpm,
    setMotionPermissionGranted,
    totalStepsRef,
    trackerStatusRef,
  ]);

  useEffect(() => {
    if (status !== 'running') {
      stopPedometerSubscription();
      return;
    }

    void startPedometerUpdates();

    return () => {
      stopPedometerSubscription();
    };
  }, [startPedometerUpdates, status, stopPedometerSubscription]);

  return {
    startPedometerUpdates,
    stopPedometerSubscription,
  };
}
