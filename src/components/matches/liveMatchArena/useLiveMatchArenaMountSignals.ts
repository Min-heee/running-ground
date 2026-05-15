import { useMemo } from 'react';
import { buildLiveMatchScreenIdentity } from '@/components/matches/liveMatchArena/liveMatchArenaMountIdentity';
import type {
  LiveMatchArenaMode,
  LiveMatchArenaMountSignal,
} from '@/components/matches/liveMatchArena/liveMatchArenaMountTypes';
import { useLiveMatchArenaHeavyHydration } from '@/components/matches/liveMatchArena/useLiveMatchArenaHeavyHydration';
import { useLiveMatchArenaMountRefs } from '@/components/matches/liveMatchArena/useLiveMatchArenaMountRefs';
import { useLiveMatchArenaMountTrace } from '@/components/matches/liveMatchArena/useLiveMatchArenaMountTrace';
import { useLiveMatchArenaPreservationTrace } from '@/components/matches/liveMatchArena/useLiveMatchArenaPreservationTrace';

type UseLiveMatchArenaMountSignalsInput = {
  matchId?: string | null;
  mode: LiveMatchArenaMode;
  participantsCount: number;
  deferHeavyContent: boolean;
  onMounted?: (input: LiveMatchArenaMountSignal) => void;
};

export function useLiveMatchArenaMountSignals({
  matchId,
  mode,
  participantsCount,
  deferHeavyContent,
  onMounted,
}: UseLiveMatchArenaMountSignalsInput) {
  const arenaIdentity = useMemo(
    () => buildLiveMatchScreenIdentity({ matchId, mode }),
    [matchId, mode],
  );
  const {
    isHeavyContentHydrated,
    shouldDeferHeavyContent,
  } = useLiveMatchArenaHeavyHydration({
    arenaIdentity,
    deferHeavyContent,
    matchId,
    mode,
  });
  const { mountDetailRef, onMountedRef } = useLiveMatchArenaMountRefs({
    onMounted,
    participantsCount,
    shouldDeferHeavyContent,
  });

  useLiveMatchArenaMountTrace({
    arenaIdentity,
    matchId,
    mode,
    mountDetailRef,
    onMountedRef,
  });
  useLiveMatchArenaPreservationTrace({
    arenaIdentity,
    deferHeavyContent,
    isHeavyContentHydrated,
    matchId,
    mode,
  });

  return {
    shouldDeferHeavyContent,
  };
}
