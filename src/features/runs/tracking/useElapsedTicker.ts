import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';

type UseElapsedTickerInput = {
  timerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  shouldRunTick?: () => boolean;
  syncFromBackgroundTracking: () => void;
};

const alwaysRunTick = () => true;

export function useElapsedTicker({
  timerRef,
  shouldRunTick,
  syncFromBackgroundTracking,
}: UseElapsedTickerInput) {
  const shouldRunTickRef = useRef(shouldRunTick ?? alwaysRunTick);
  const syncFromBackgroundTrackingRef = useRef(syncFromBackgroundTracking);
  shouldRunTickRef.current = shouldRunTick ?? alwaysRunTick;
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
      if (!shouldRunTickRef.current()) {
        return;
      }
      syncFromBackgroundTrackingRef.current();
    }, 1000);
  }, [clearElapsedTicker, timerRef]);

  return {
    clearElapsedTicker,
    startElapsedTicker,
  };
}
