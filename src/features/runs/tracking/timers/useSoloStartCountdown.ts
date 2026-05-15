import { useCallback } from 'react';
import type { UseRunTrackingFlowInput } from '@/features/runs/types/runTrackingFlow';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseSoloStartCountdownInput = Pick<
  UseRunTrackingFlowInput,
  | 'soloStartCountdownTimerRef'
  | 'soloStartCountdownResolveRef'
  | 'setSoloStartCountdownSeconds'
  | 'setStatus'
  | 'soloStartCountdownSeconds'
>;

export function useSoloStartCountdown({
  soloStartCountdownTimerRef,
  soloStartCountdownResolveRef,
  setSoloStartCountdownSeconds,
  setStatus,
  soloStartCountdownSeconds,
}: UseSoloStartCountdownInput) {
  const finishSoloStartCountdown = useCallback((completed: boolean) => {
    if (soloStartCountdownResolveRef.current) {
      rgPerfMark('countdown end', {
        completed,
        source: 'solo',
      });
    }

    if (soloStartCountdownTimerRef.current) {
      clearInterval(soloStartCountdownTimerRef.current);
      soloStartCountdownTimerRef.current = null;
    }

    setSoloStartCountdownSeconds(null);
    soloStartCountdownResolveRef.current?.(completed);
    soloStartCountdownResolveRef.current = null;
  }, [
    setSoloStartCountdownSeconds,
    soloStartCountdownResolveRef,
    soloStartCountdownTimerRef,
  ]);

  const runSoloStartCountdown = useCallback(() => new Promise<boolean>((resolve) => {
    finishSoloStartCountdown(false);

    soloStartCountdownResolveRef.current = resolve;
    let remainingSeconds = soloStartCountdownSeconds;
    rgPerfMark('countdown begin', {
      remainingSeconds,
      source: 'solo',
    });
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
  }), [
    finishSoloStartCountdown,
    setSoloStartCountdownSeconds,
    setStatus,
    soloStartCountdownResolveRef,
    soloStartCountdownSeconds,
    soloStartCountdownTimerRef,
  ]);

  return {
    finishSoloStartCountdown,
    runSoloStartCountdown,
  };
}
