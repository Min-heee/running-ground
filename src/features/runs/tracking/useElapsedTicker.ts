import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';

type UseElapsedTickerInput = {
  timerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  syncFromBackgroundTracking: () => void;
};

export function useElapsedTicker({
  timerRef,
  syncFromBackgroundTracking,
}: UseElapsedTickerInput) {
  const syncFromBackgroundTrackingRef = useRef(syncFromBackgroundTracking);
  syncFromBackgroundTrackingRef.current = syncFromBackgroundTracking;

  const clearElapsedTicker = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [timerRef]);

  const startElapsedTicker = useCallback(() => {
    clearElapsedTicker();
    timerRef.current = setInterval(() => {
      syncFromBackgroundTrackingRef.current();
    }, 1000);
  }, [clearElapsedTicker, timerRef]);

  return {
    clearElapsedTicker,
    startElapsedTicker,
  };
}
