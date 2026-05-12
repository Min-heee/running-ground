import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { recordLiveMatchPerfSample } from '@/components/matches/liveMatchPerfQaLog';

export const LIVE_MATCH_PERF_QA_ENABLED = __DEV__ && Platform.OS === 'android';

type LiveMatchPerfProbeInput = {
  label: string;
  mode: 'duel' | 'group';
  participants: number;
  visibleParticipants?: number;
  targetDistanceKm: number;
};

export function useAndroidLiveMatchPerfProbe({
  label,
  mode,
  participants,
  visibleParticipants,
  targetDistanceKm,
}: LiveMatchPerfProbeInput) {
  const renderCountRef = useRef(0);
  const detailRef = useRef({
    mode,
    participants,
    visibleParticipants,
    targetDistanceKm,
  });

  renderCountRef.current += 1;
  detailRef.current = {
    mode,
    participants,
    visibleParticipants,
    targetDistanceKm,
  };

  useEffect(() => {
    if (!LIVE_MATCH_PERF_QA_ENABLED) {
      return undefined;
    }

    let frameCount = 0;
    let frameRef = 0;
    let windowStartedAt = Date.now();
    let renderCountAtStart = renderCountRef.current;

    const tick = () => {
      frameCount += 1;
      const now = Date.now();
      const elapsedMs = now - windowStartedAt;

      if (elapsedMs >= 5000) {
        const fps = Math.round((frameCount * 1000) / Math.max(1, elapsedMs));
        const renders = renderCountRef.current - renderCountAtStart;
        const details = detailRef.current;
        recordLiveMatchPerfSample({
          label,
          mode: details.mode,
          fps,
          renders,
          windowMs: elapsedMs,
          participants: details.participants,
          visibleParticipants: details.visibleParticipants,
          targetDistanceKm: details.targetDistanceKm,
          capturedAt: now,
        });

        // eslint-disable-next-line no-console
        console.debug(
          `[LiveMatchPerf] ${label} fps=${fps} renders=${renders}/5s `
          + `participants=${details.participants}`
          + (typeof details.visibleParticipants === 'number' ? ` visible=${details.visibleParticipants}` : '')
          + ` target=${details.targetDistanceKm}`,
        );
        frameCount = 0;
        windowStartedAt = now;
        renderCountAtStart = renderCountRef.current;
      }

      frameRef = requestAnimationFrame(tick);
    };

    frameRef = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef);
    };
  }, [label]);
}
