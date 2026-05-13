import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Pedometer } from 'expo-sensors';
import type { TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import { calculateCadenceSpm } from '@/features/runs/tracking';

type PedometerSubscription = {
  remove: () => void;
};

type UsePedometerTrackingInput = {
  status: TrackerStatus;
  trackerStatusRef: MutableRefObject<TrackerStatus>;
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

      pedometerSubscriptionRef.current = Pedometer.watchStepCount((result) => {
        const totalSteps = pedometerStepOffsetRef.current + result.steps;
        totalStepsRef.current = totalSteps;
        setCadenceSpm(calculateCadenceSpm(totalSteps, elapsedSecondsRef.current));
      });
    } catch {
      setMotionPermissionGranted(false);
    }
  }, [
    elapsedSecondsRef,
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
