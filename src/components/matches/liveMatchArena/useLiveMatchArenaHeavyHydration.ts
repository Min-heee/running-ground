import { useEffect, useRef, useState } from 'react';
import type { LiveMatchArenaMode } from '@/components/matches/liveMatchArena/liveMatchArenaMountTypes';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseLiveMatchArenaHeavyHydrationInput = {
  arenaIdentity: string;
  deferHeavyContent: boolean;
  matchId?: string | null;
  mode: LiveMatchArenaMode;
};

export function useLiveMatchArenaHeavyHydration({
  arenaIdentity,
  deferHeavyContent,
  matchId,
  mode,
}: UseLiveMatchArenaHeavyHydrationInput) {
  const hydrationLoggedIdentityRef = useRef<string | null>(null);
  const [hydratedHeavyContentIdentity, setHydratedHeavyContentIdentity] = useState<string | null>(null);
  const isHeavyContentHydrated = hydratedHeavyContentIdentity === arenaIdentity;
  const shouldDeferHeavyContent = deferHeavyContent && !isHeavyContentHydrated;

  useEffect(() => {
    if (!deferHeavyContent && !isHeavyContentHydrated) {
      setHydratedHeavyContentIdentity(arenaIdentity);

      if (hydrationLoggedIdentityRef.current !== arenaIdentity) {
        hydrationLoggedIdentityRef.current = arenaIdentity;
        rgPerfMark('heavy content hydrated without remount', {
          matchId: matchId ?? null,
          mode,
        });
      }
    }
  }, [arenaIdentity, deferHeavyContent, isHeavyContentHydrated, matchId, mode]);

  return {
    isHeavyContentHydrated,
    shouldDeferHeavyContent,
  };
}
