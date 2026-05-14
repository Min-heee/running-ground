import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import type {
  RunningMatchState,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { useActiveArenaPinEffect } from '@/features/runs/lifecycle/hooks/useActiveArenaPinEffect';
import { useCountdownHandoffEffect } from '@/features/runs/lifecycle/hooks/useCountdownHandoffEffect';

type FocusRunningMatchInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId?: string;
  distanceKm?: number;
  slotStartAt?: string;
  isTestMatch?: boolean;
  preferArena?: boolean;
  roomId?: string;
};

type NextStartingMatch = {
  match: UpcomingRunningMatchItem;
  remainingSeconds: number;
} | null;

type UseLiveMatchNavigationEffectsInput = {
  livePagerRef: RefObject<ScrollView | null>;
  isResolvingFocusedMatch: boolean;
  isIdle: boolean;
  forceOpenActiveMatch: boolean;
  shouldKeepRunningMatchArena: boolean;
  showLiveArena: boolean;
  hasMatchResultPage: boolean;
  liveArenaPageWidth: number;
  duelState: RunningMatchState;
  groupState: RunningMatchState;
  duelMatchId?: string | null;
  groupMatchId?: string | null;
  duelShouldOpenCountdownArena: boolean;
  groupShouldOpenCountdownArena: boolean;
  roomShouldOpenCountdownArena: boolean;
  nextStartingMatch: NextStartingMatch;
  activeUpcomingMatch: UpcomingRunningMatchItem | null;
  onForceOpenActiveMatchChange: (value: boolean) => void;
  onLiveArenaPageChange: (page: number) => void;
  focusRunningMatch: (input: FocusRunningMatchInput) => Promise<unknown>;
};

export function useLiveMatchNavigationEffects({
  livePagerRef,
  isResolvingFocusedMatch,
  isIdle,
  forceOpenActiveMatch,
  shouldKeepRunningMatchArena,
  showLiveArena,
  hasMatchResultPage,
  liveArenaPageWidth,
  duelState,
  groupState,
  duelMatchId,
  groupMatchId,
  duelShouldOpenCountdownArena,
  groupShouldOpenCountdownArena,
  roomShouldOpenCountdownArena,
  nextStartingMatch,
  activeUpcomingMatch,
  onForceOpenActiveMatchChange,
  onLiveArenaPageChange,
  focusRunningMatch,
}: UseLiveMatchNavigationEffectsInput) {
  const activeAutoOpenMatchIdRef = useRef<string | null>(null);
  const callbackRef = useRef({
    focusRunningMatch,
    onLiveArenaPageChange,
  });

  callbackRef.current = {
    focusRunningMatch,
    onLiveArenaPageChange,
  };

  useActiveArenaPinEffect({
    livePagerRef,
    isResolvingFocusedMatch,
    forceOpenActiveMatch,
    shouldKeepRunningMatchArena,
    showLiveArena,
    duelState,
    groupState,
    duelMatchId,
    groupMatchId,
    duelShouldOpenCountdownArena,
    groupShouldOpenCountdownArena,
    roomShouldOpenCountdownArena,
    onForceOpenActiveMatchChange,
    onLiveArenaPageChange,
  });

  useEffect(() => {
    if (!hasMatchResultPage) {
      return;
    }

    callbackRef.current.onLiveArenaPageChange(3);
    livePagerRef.current?.scrollTo({ x: liveArenaPageWidth * 3, animated: true });
  }, [hasMatchResultPage, liveArenaPageWidth, livePagerRef]);

  useCountdownHandoffEffect({
    isIdle,
    nextStartingMatch,
    focusRunningMatch,
  });

  useEffect(() => {
    if (!isIdle || !activeUpcomingMatch) {
      activeAutoOpenMatchIdRef.current = null;
      return;
    }

    if (activeAutoOpenMatchIdRef.current === activeUpcomingMatch.matchId) {
      return;
    }

    activeAutoOpenMatchIdRef.current = activeUpcomingMatch.matchId;

    void callbackRef.current.focusRunningMatch({
      mode: activeUpcomingMatch.mode,
      matchId: activeUpcomingMatch.matchId,
      distanceKm: activeUpcomingMatch.distanceKm,
      slotStartAt: activeUpcomingMatch.slotStartAt,
      isTestMatch: activeUpcomingMatch.isTestMatch,
      preferArena: true,
    }).catch(() => {});
  }, [activeUpcomingMatch, isIdle]);

}
