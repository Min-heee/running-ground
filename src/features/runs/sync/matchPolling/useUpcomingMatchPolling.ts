import { useRef } from 'react';
import type {
  RunningMatchState,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

type UseUpcomingMatchPollingInput = {
  duelMatchId?: string | null;
  duelMatchState?: RunningMatchState | null;
  groupMatchId?: string | null;
  groupMatchState?: RunningMatchState | null;
  loadUpcomingMatches: () => Promise<UpcomingRunningMatchItem[]>;
  onUpcomingMatchesFallback: (matches: UpcomingRunningMatchItem[]) => void;
};

export function useUpcomingMatchPolling({
  duelMatchId,
  duelMatchState,
  groupMatchId,
  groupMatchState,
  loadUpcomingMatches,
  onUpcomingMatchesFallback,
}: UseUpcomingMatchPollingInput) {
  const callbackRef = useRef({
    loadUpcomingMatches,
    onUpcomingMatchesFallback,
  });

  callbackRef.current = {
    loadUpcomingMatches,
    onUpcomingMatchesFallback,
  };

  useAndroidDeferredEffect(() => {
    let canceled = false;

    void callbackRef.current.loadUpcomingMatches().catch(() => {
      if (!canceled) {
        callbackRef.current.onUpcomingMatchesFallback([]);
      }
    });

    return () => {
      canceled = true;
    };
  }, [duelMatchId, duelMatchState, groupMatchId, groupMatchState]);
}
