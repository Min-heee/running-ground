import { useEffect, useMemo, useRef, useState } from 'react';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type LiveMatchArenaMode = 'duel' | 'group';

type UseLiveMatchArenaMountSignalsInput = {
  matchId?: string | null;
  mode: LiveMatchArenaMode;
  participantsCount: number;
  deferHeavyContent: boolean;
  onMounted?: (input: { matchId?: string | null; mode: LiveMatchArenaMode; source: string }) => void;
};

function buildLiveMatchScreenIdentity({
  matchId,
  mode,
}: {
  matchId?: string | null;
  mode: LiveMatchArenaMode;
}) {
  return `${mode}:${matchId ?? 'pending'}`;
}

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
  const onMountedRef = useRef(onMounted);
  const mountedSignalIdentityRef = useRef<string | null>(null);
  const lastDeferHeavyContentRef = useRef(deferHeavyContent);
  const hydrationLoggedIdentityRef = useRef<string | null>(null);
  const preservedRoadMotionIdentityRef = useRef<string | null>(null);
  const mountDetailRef = useRef({
    deferHeavyContent: false,
    participants: 0,
  });
  const [hydratedHeavyContentIdentity, setHydratedHeavyContentIdentity] = useState<string | null>(null);
  const isHeavyContentHydrated = hydratedHeavyContentIdentity === arenaIdentity;
  const shouldDeferHeavyContent = deferHeavyContent && !isHeavyContentHydrated;

  useEffect(() => {
    onMountedRef.current = onMounted;
  }, [onMounted]);

  useEffect(() => {
    mountDetailRef.current = {
      deferHeavyContent: shouldDeferHeavyContent,
      participants: participantsCount,
    };
  }, [participantsCount, shouldDeferHeavyContent]);

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

  useEffect(() => {
    if (mountedSignalIdentityRef.current === arenaIdentity) {
      rgPerfMark('live match remount prevented same match', {
        matchId: matchId ?? null,
        mode,
        reason: 'duplicate mount signal',
      });
      return undefined;
    }

    mountedSignalIdentityRef.current = arenaIdentity;
    onMountedRef.current?.({
      matchId,
      mode,
      source: 'LiveMatchArena',
    });
    rgPerfMark('live match screen mount', {
      deferHeavyContent: mountDetailRef.current.deferHeavyContent,
      matchId: matchId ?? null,
      mode,
      participants: mountDetailRef.current.participants,
    });

    return () => {
      rgPerfMark('live match screen unmount', {
        matchId: matchId ?? null,
        mode,
      });
      if (mountedSignalIdentityRef.current === arenaIdentity) {
        mountedSignalIdentityRef.current = null;
      }
    };
  }, [arenaIdentity, matchId, mode]);

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

  return {
    shouldDeferHeavyContent,
  };
}
