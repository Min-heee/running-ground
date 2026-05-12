import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

const ANDROID_LIVE_MATCH_UI_INTERVAL_MS = 1000;

export type LiveMatchDisplayFrame = {
  distanceKm: number;
  elapsedSeconds: number;
  currentPace: string;
  averagePace: string;
  cadenceSpm: number | null;
  elevationGainM: number;
};

export function useAndroidLiveMatchDisplayFrame(
  frame: LiveMatchDisplayFrame,
  enabled: boolean,
  intervalMs = ANDROID_LIVE_MATCH_UI_INTERVAL_MS,
) {
  const shouldThrottle = Platform.OS === 'android' && enabled;
  const latestFrameRef = useRef(frame);
  const lastFlushMsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasThrottlingRef = useRef(false);
  const [displayFrame, setDisplayFrame] = useState(frame);

  latestFrameRef.current = frame;

  useEffect(() => {
    if (!shouldThrottle) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      lastFlushMsRef.current = Date.now();
      if (wasThrottlingRef.current) {
        setDisplayFrame(frame);
      }
      wasThrottlingRef.current = false;
      return;
    }

    wasThrottlingRef.current = true;

    const flush = () => {
      timerRef.current = null;
      lastFlushMsRef.current = Date.now();
      setDisplayFrame(latestFrameRef.current);
    };

    const nowMs = Date.now();
    const elapsedMs = nowMs - lastFlushMsRef.current;

    if (!lastFlushMsRef.current || elapsedMs >= intervalMs) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flush();
      return;
    }

    if (!timerRef.current) {
      timerRef.current = setTimeout(flush, Math.max(0, intervalMs - elapsedMs));
    }
  }, [frame, intervalMs, shouldThrottle]);

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return useMemo(
    () => (shouldThrottle ? displayFrame : frame),
    [displayFrame, frame, shouldThrottle],
  );
}
