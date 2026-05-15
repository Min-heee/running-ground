import { useCallback, useRef } from 'react';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import type { GpsTrackingStartGuard } from './types';

export function useTrackingActionGuards(): GpsTrackingStartGuard {
  const gpsTrackingStartKeyRef = useRef<string | null>(null);
  const gpsTrackingStartPromiseRef = useRef<Promise<void> | null>(null);
  const delayedGpsStartKeyRef = useRef<string | null>(null);
  const delayedGpsStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skippedAndroidWarmupMatchIdRef = useRef<string | null>(null);

  const clearDelayedGpsStart = useCallback(() => {
    if (delayedGpsStartTimerRef.current) {
      clearTimeout(delayedGpsStartTimerRef.current);
      delayedGpsStartTimerRef.current = null;
    }
    delayedGpsStartKeyRef.current = null;
  }, []);

  const runSingleFlightStart = useCallback((
    trackingStartKey: string,
    detail: { matchId?: string | null },
    startWork: () => Promise<void>,
  ) => {
    if (gpsTrackingStartKeyRef.current === trackingStartKey && gpsTrackingStartPromiseRef.current) {
      rgPerfMark('GPS tracking start skipped duplicate', {
        matchId: detail.matchId ?? null,
        trackingStartKey,
      });
      return gpsTrackingStartPromiseRef.current;
    }

    const startPromise = startWork().finally(() => {
      if (gpsTrackingStartKeyRef.current === trackingStartKey) {
        gpsTrackingStartKeyRef.current = null;
        gpsTrackingStartPromiseRef.current = null;
      }
    });

    gpsTrackingStartKeyRef.current = trackingStartKey;
    gpsTrackingStartPromiseRef.current = startPromise;
    return startPromise;
  }, []);

  return {
    delayedGpsStartKeyRef,
    delayedGpsStartTimerRef,
    skippedAndroidWarmupMatchIdRef,
    clearDelayedGpsStart,
    runSingleFlightStart,
  };
}
