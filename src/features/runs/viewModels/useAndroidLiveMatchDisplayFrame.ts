import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { LIVE_MATCH_UI_DISPLAY_INTERVAL_MS } from '@/features/runs/sync/liveMatchCadence';
import { rgPerfMark } from '@/utils/rgPerfTrace';

const ANDROID_LIVE_MATCH_UI_INTERVAL_MS = LIVE_MATCH_UI_DISPLAY_INTERVAL_MS;

export type LiveMatchDisplayFrame = {
  distanceKm: number;
  elapsedSeconds: number;
  currentPace: string;
  averagePace: string;
  cadenceSpm: number | null;
  elevationGainM: number;
};

export type LiveMatchDisplayFrames = {
  frame: LiveMatchDisplayFrame;
  metricFrame: LiveMatchDisplayFrame;
};

function areLiveMatchDisplayFramesEqual(left: LiveMatchDisplayFrame, right: LiveMatchDisplayFrame) {
  return left.distanceKm === right.distanceKm
    && left.elapsedSeconds === right.elapsedSeconds
    && left.currentPace === right.currentPace
    && left.averagePace === right.averagePace
    && left.cadenceSpm === right.cadenceSpm
    && left.elevationGainM === right.elevationGainM;
}

export function useAndroidLiveMatchDisplayFrames(
  frame: LiveMatchDisplayFrame,
  enabled: boolean,
  intervalMs = ANDROID_LIVE_MATCH_UI_INTERVAL_MS,
): LiveMatchDisplayFrames {
  const shouldThrottle = Platform.OS === 'android' && enabled;
  const latestFrameRef = useRef(frame);
  const lastFlushMsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasThrottlingRef = useRef(false);
  const [displayFrame, setDisplayFrame] = useState(frame);

  latestFrameRef.current = frame;

  useEffect(() => {
    if (!shouldThrottle) {
      return;
    }

    rgPerfMark('android live match display throttle enabled', {
      intervalMs,
    });
  }, [intervalMs, shouldThrottle]);

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
      setDisplayFrame((currentFrame) => (
        areLiveMatchDisplayFramesEqual(currentFrame, latestFrameRef.current)
          ? currentFrame
          : latestFrameRef.current
      ));
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

  return useMemo(() => {
    if (!shouldThrottle) {
      return {
        frame,
        metricFrame: frame,
      };
    }

    return {
      frame: {
        ...displayFrame,
        // The slot ticker owns elapsed time, so keep it visibly 1Hz while
        // Android still throttles noisier GPS-derived fields.
        elapsedSeconds: frame.elapsedSeconds,
      },
      // Heavy arena/raceboard view models should not churn on the 1Hz elapsed
      // override; use the throttled metric frame for derived pace labels.
      metricFrame: displayFrame,
    };
  }, [displayFrame, frame, shouldThrottle]);
}

export function useAndroidLiveMatchDisplayFrame(
  frame: LiveMatchDisplayFrame,
  enabled: boolean,
  intervalMs = ANDROID_LIVE_MATCH_UI_INTERVAL_MS,
) {
  return useAndroidLiveMatchDisplayFrames(frame, enabled, intervalMs).frame;
}
