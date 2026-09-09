import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PedometerSensorState, TrackerStatus } from '@/features/runs/hooks/useRunTracking';
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
  // 케이던스 워치독 재료 — 센서 가용 여부와 구독 생존 여부를 여기서만 쓴다.
  pedometerSensorRef: MutableRefObject<PedometerSensorState>;
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
  pedometerSensorRef,
  elapsedSecondsRef,
  totalStepsRef,
  setMotionPermissionGranted,
  setCadenceSpm,
}: UsePedometerTrackingInput) {
  const stopPedometerSubscription = useCallback(() => {
    pedometerSubscriptionRef.current?.remove();
    pedometerSubscriptionRef.current = null;
    pedometerSensorRef.current = { ...pedometerSensorRef.current, active: false };
  }, [pedometerSensorRef, pedometerSubscriptionRef]);

  const startPedometerUpdates = useCallback(async () => {
    if (pedometerSubscriptionRef.current) {
      return;
    }

    try {
      const isAvailable = await Pedometer.isAvailableAsync();

      if (!isAvailable) {
        setMotionPermissionGranted(false);
        pedometerSensorRef.current = { available: false, active: false };
        return;
      }

      const permission = await Pedometer.requestPermissionsAsync();
      const granted = permission.granted || permission.status === 'granted';
      setMotionPermissionGranted(granted);

      if (!granted) {
        pedometerSensorRef.current = { available: false, active: false };
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
        // totalSteps도 같이 발행한다 — 케이던스 워치독은 평균 spm이 아니라 창 단위 걸음
        // 델타로 판정하므로 누적 걸음 원본이 필요하다.
        publishLiveTrackingMetricFrame({ cadenceSpm, totalSteps });
        if (!(Platform.OS === 'android' && matchModeRef.current !== 'solo')) {
          setCadenceSpm(cadenceSpm);
        }
      });
      pedometerSensorRef.current = { available: true, active: true };
    } catch {
      setMotionPermissionGranted(false);
      pedometerSensorRef.current = { available: false, active: false };
    }
  }, [
    elapsedSecondsRef,
    matchModeRef,
    pedometerSensorRef,
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
