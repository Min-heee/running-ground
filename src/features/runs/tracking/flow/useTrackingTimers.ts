import { useElapsedTicker } from '@/features/runs/tracking/useElapsedTicker';
import { useSoloStartCountdown } from '@/features/runs/tracking/timers/useSoloStartCountdown';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import type { UseRunTrackingFlowInput } from '@/features/runs/types/runTrackingFlow';

export function useTrackingTimers({
  flow,
  syncFromBackgroundTracking,
}: {
  flow: UseRunTrackingFlowInput;
  syncFromBackgroundTracking: (snapshot?: BackgroundRunTrackingSnapshot) => void;
}) {
  const {
    timerRef,
    soloStartCountdownTimerRef,
    soloStartCountdownResolveRef,
    setSoloStartCountdownSeconds,
    setStatus,
    soloStartCountdownSeconds,
  } = flow;

  const soloCountdown = useSoloStartCountdown({
    soloStartCountdownTimerRef,
    soloStartCountdownResolveRef,
    setSoloStartCountdownSeconds,
    setStatus,
    soloStartCountdownSeconds,
  });

  const elapsedTicker = useElapsedTicker({
    timerRef,
    syncFromBackgroundTracking,
  });

  return {
    ...soloCountdown,
    ...elapsedTicker,
  };
}
