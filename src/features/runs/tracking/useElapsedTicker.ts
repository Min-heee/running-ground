import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';

type UseElapsedTickerInput = {
  timerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  syncFromBackgroundTracking: () => void;
};

const ELAPSED_TICKER_INTERVAL_MS = 2500;

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
    // Slot ticker updates elapsed every second; this ticker is only a GPS safety net.
    timerRef.current = setInterval(() => {
      syncFromBackgroundTrackingRef.current();
    }, ELAPSED_TICKER_INTERVAL_MS);
  }, [clearElapsedTicker, timerRef]);

  return {
    clearElapsedTicker,
    startElapsedTicker,
  };
}
