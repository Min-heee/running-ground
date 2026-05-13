import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

type UseElapsedTickerInput = {
  timerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  syncFromBackgroundTracking: () => void;
};

export function useElapsedTicker({
  timerRef,
  syncFromBackgroundTracking,
}: UseElapsedTickerInput) {
  const clearElapsedTicker = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [timerRef]);

  const startElapsedTicker = useCallback(() => {
    clearElapsedTicker();
    timerRef.current = setInterval(() => {
      syncFromBackgroundTracking();
    }, 1000);
  }, [clearElapsedTicker, syncFromBackgroundTracking, timerRef]);

  return {
    clearElapsedTicker,
    startElapsedTicker,
  };
}
