import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type {
  LiveMatchArenaMode,
  LiveMatchArenaMountDetails,
  LiveMatchArenaMountSignal,
} from '@/components/matches/liveMatchArena/liveMatchArenaMountTypes';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseLiveMatchArenaMountTraceInput = {
  arenaIdentity: string;
  matchId?: string | null;
  mode: LiveMatchArenaMode;
  mountDetailRef: MutableRefObject<LiveMatchArenaMountDetails>;
  onMountedRef: MutableRefObject<((input: LiveMatchArenaMountSignal) => void) | undefined>;
};

export function useLiveMatchArenaMountTrace({
  arenaIdentity,
  matchId,
  mode,
  mountDetailRef,
  onMountedRef,
}: UseLiveMatchArenaMountTraceInput) {
  const mountedSignalIdentityRef = useRef<string | null>(null);

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
  }, [arenaIdentity, matchId, mode, mountDetailRef, onMountedRef]);
}
