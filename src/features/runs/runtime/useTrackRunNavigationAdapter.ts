import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { type Href, router } from 'expo-router';
import { useRunningMatchFocus } from '@/features/runs/lifecycle/hooks/useRunningMatchFocus';
import type { UseRunningMatchFocusInput } from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { RunningMatchRoom } from '@/lib/api/types';
import { hydrateOptimisticMatchRoom } from '@/features/match/hooks/lobby/optimisticRoomHydration';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type LiveMatchMountedRef = MutableRefObject<{
  matchId: string | null;
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  mountedAtMs: number;
} | null>;

type LiveMatchViewConfirmationRef = MutableRefObject<{
  matchId: string | null;
  mode: Extract<RunMatchMode, 'duel' | 'group'> | null;
  showLiveArena: boolean;
}>;

type UseTrackRunNavigationAdapterInput = Omit<UseRunningMatchFocusInput, 'isLiveMatchViewConfirmed'> & {
  liveMatchMountedRef: LiveMatchMountedRef;
  liveMatchViewConfirmationRef: LiveMatchViewConfirmationRef;
};

export function useTrackRunNavigationAdapter({
  liveMatchMountedRef,
  liveMatchViewConfirmationRef,
  ...focusInput
}: UseTrackRunNavigationAdapterInput) {
  useEffect(() => {
    rgPerfMark('track run runtime adapter selected', {
      adapter: 'navigation',
      source: 'track-run runtime',
    });
  }, []);

  const isLiveMatchViewConfirmed = useCallback((input: {
    matchId: string;
    mode: Extract<RunMatchMode, 'duel' | 'group'>;
  }) => {
    const mountedMatch = liveMatchMountedRef.current;
    if (mountedMatch?.matchId === input.matchId && mountedMatch.mode === input.mode) {
      return true;
    }

    const visibleLiveMatch = liveMatchViewConfirmationRef.current;
    return Boolean(
      visibleLiveMatch.showLiveArena
      && visibleLiveMatch.matchId === input.matchId
      && visibleLiveMatch.mode === input.mode,
    );
  }, [liveMatchMountedRef, liveMatchViewConfirmationRef]);

  const {
    focusRoomLinkedMatch,
    focusRunningMatch,
    markLiveMatchMounted,
    resetLiveMatchNavigationOwner,
  } = useRunningMatchFocus({
    ...focusInput,
    isLiveMatchViewConfirmed,
  });

  const handleLiveMatchMounted = useCallback((input: {
    matchId?: string | null;
    mode: Extract<RunMatchMode, 'duel' | 'group'>;
    source: string;
  }) => {
    rgPerfMark('live match screen mount signal received', {
      matchId: input.matchId ?? null,
      mode: input.mode,
      source: input.source,
    });
    liveMatchMountedRef.current = {
      matchId: input.matchId ?? null,
      mode: input.mode,
      mountedAtMs: Date.now(),
    };
    markLiveMatchMounted(input);
  }, [liveMatchMountedRef, markLiveMatchMounted]);

  const navigateToMatchRoomWithTrace = useCallback((
    source: string,
    room?: RunningMatchRoom | null,
    serverNow?: string,
    timingSource?: unknown,
  ) => {
    const roomId = room?.roomId ?? null;
    if (isMatchRoomDeleted(roomId)) {
      rgPerfMark('room entry skipped deleted room', {
        roomId,
        source,
      });
      rgPerfMark('room hydrate skipped deleted room', {
        roomId,
        source,
        state: room?.state ?? null,
      });
      return;
    }

    if (room) {
      hydrateOptimisticMatchRoom({
        room,
        serverNow,
        timingSource,
        source,
      });
    }

    const endNavigationTrace = rgPerfMeasureStart('navigation to lobby', {
      roomId,
      source,
    });
    router.push('/match-room' as Href);
    endNavigationTrace({ success: true });
  }, []);

  return {
    focusRoomLinkedMatch,
    focusRunningMatch,
    handleLiveMatchMounted,
    navigateToMatchRoomWithTrace,
    resetLiveMatchNavigationOwner,
  };
}
