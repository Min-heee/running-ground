import { useEffect, useRef } from 'react';
import type { LiveMatchArenaMode } from '@/components/matches/liveMatchArena/liveMatchArenaMountTypes';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseLiveMatchArenaPreservationTraceInput = {
  arenaIdentity: string;
  deferHeavyContent: boolean;
  isHeavyContentHydrated: boolean;
  matchId?: string | null;
  mode: LiveMatchArenaMode;
};

export function useLiveMatchArenaPreservationTrace({
  arenaIdentity,
  deferHeavyContent,
  isHeavyContentHydrated,
  matchId,
  mode,
}: UseLiveMatchArenaPreservationTraceInput) {
  const lastDeferHeavyContentRef = useRef(deferHeavyContent);
  const preservedRoadMotionIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastDeferHeavyContentRef.current !== deferHeavyContent) {
      rgPerfMark('live match remount prevented same match', {
        deferHeavyContent,
        matchId: matchId ?? null,
        mode,
        reason: 'defer state changed',
      });
      lastDeferHeavyContentRef.current = deferHeavyContent;
    }
  }, [deferHeavyContent, matchId, mode]);

  useEffect(() => {
    if (
      deferHeavyContent
      && isHeavyContentHydrated
      && preservedRoadMotionIdentityRef.current !== arenaIdentity
    ) {
      preservedRoadMotionIdentityRef.current = arenaIdentity;
      rgPerfMark('RoadMotion preserved same match', {
        matchId: matchId ?? null,
        mode,
      });
    }
  }, [arenaIdentity, deferHeavyContent, isHeavyContentHydrated, matchId, mode]);
}
