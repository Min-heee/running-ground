import { useEffect, useRef } from 'react';
import type {
  LiveMatchArenaMountDetails,
  LiveMatchArenaMountSignal,
} from '@/components/matches/liveMatchArena/liveMatchArenaMountTypes';

type UseLiveMatchArenaMountRefsInput = {
  onMounted?: (input: LiveMatchArenaMountSignal) => void;
  participantsCount: number;
  shouldDeferHeavyContent: boolean;
};

export function useLiveMatchArenaMountRefs({
  onMounted,
  participantsCount,
  shouldDeferHeavyContent,
}: UseLiveMatchArenaMountRefsInput) {
  const onMountedRef = useRef(onMounted);
  const mountDetailRef = useRef<LiveMatchArenaMountDetails>({
    deferHeavyContent: false,
    participants: 0,
  });

  useEffect(() => {
    onMountedRef.current = onMounted;
  }, [onMounted]);

  useEffect(() => {
    mountDetailRef.current = {
      deferHeavyContent: shouldDeferHeavyContent,
      participants: participantsCount,
    };
  }, [participantsCount, shouldDeferHeavyContent]);

  return {
    mountDetailRef,
    onMountedRef,
  };
}
