import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import type {
  RunningMatchState,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  shouldAutoFocusMatchArena,
  shouldEnterMatchArenaForLifecycle,
  shouldKeepMatchArenaForceOpen,
} from '@/features/runs/matchStateMachine';

type FocusRunningMatchInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId?: string;
  distanceKm?: number;
  slotStartAt?: string;
  isTestMatch?: boolean;
  preferArena?: boolean;
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
  const countdownAutoOpenMatchIdRef = useRef<string | null>(null);
  const activeAutoOpenMatchIdRef = useRef<string | null>(null);
  const lifecycleArenaEntryKeyRef = useRef<string | null>(null);
  const visibleArenaEntryKeyRef = useRef<string | null>(null);
  const callbackRef = useRef({
    focusRunningMatch,
    onForceOpenActiveMatchChange,
    onLiveArenaPageChange,
  });

  callbackRef.current = {
    focusRunningMatch,
    onForceOpenActiveMatchChange,
    onLiveArenaPageChange,
  };

  useEffect(() => {
    if (isResolvingFocusedMatch) {
      return;
    }

    if (!shouldKeepMatchArenaForceOpen({
      isResolvingFocusedMatch,
      duelState,
      groupState,
      duelShouldOpenCountdownArena,
      groupShouldOpenCountdownArena,
      roomShouldOpenCountdownArena,
      forceOpenActiveMatch,
      shouldKeepRunningMatchArena,
    })) {
      callbackRef.current.onForceOpenActiveMatchChange(false);
    }
  }, [
    duelState,
    duelShouldOpenCountdownArena,
    forceOpenActiveMatch,
    groupState,
    groupShouldOpenCountdownArena,
    isResolvingFocusedMatch,
    roomShouldOpenCountdownArena,
    shouldKeepRunningMatchArena,
  ]);

  useEffect(() => {
    if (!shouldEnterMatchArenaForLifecycle({
      duelState,
      groupState,
      duelShouldOpenCountdownArena,
      groupShouldOpenCountdownArena,
    })) {
      return;
    }

    const nextEntryKey = [
      duelMatchId ?? 'no-duel',
      groupMatchId ?? 'no-group',
      duelState,
      groupState,
      duelShouldOpenCountdownArena ? 'duel-countdown' : 'no-duel-countdown',
      groupShouldOpenCountdownArena ? 'group-countdown' : 'no-group-countdown',
    ].join(':');

    if (lifecycleArenaEntryKeyRef.current === nextEntryKey) {
      return;
    }

    lifecycleArenaEntryKeyRef.current = nextEntryKey;
    callbackRef.current.onForceOpenActiveMatchChange(true);
    callbackRef.current.onLiveArenaPageChange(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [
    duelMatchId,
    duelState,
    duelShouldOpenCountdownArena,
    groupMatchId,
    groupState,
    groupShouldOpenCountdownArena,
    livePagerRef,
  ]);

  useEffect(() => {
    if (!hasMatchResultPage) {
      return;
    }

    callbackRef.current.onLiveArenaPageChange(3);
    livePagerRef.current?.scrollTo({ x: liveArenaPageWidth * 3, animated: true });
  }, [hasMatchResultPage, liveArenaPageWidth, livePagerRef]);

  useEffect(() => {
    if (!nextStartingMatch || !shouldAutoFocusMatchArena(isIdle, nextStartingMatch.remainingSeconds)) {
      countdownAutoOpenMatchIdRef.current = null;
      return;
    }

    if (countdownAutoOpenMatchIdRef.current === nextStartingMatch.match.matchId) {
      return;
    }

    countdownAutoOpenMatchIdRef.current = nextStartingMatch.match.matchId;

    void callbackRef.current.focusRunningMatch({
      mode: nextStartingMatch.match.mode,
      matchId: nextStartingMatch.match.matchId,
      distanceKm: nextStartingMatch.match.distanceKm,
      slotStartAt: nextStartingMatch.match.slotStartAt,
      isTestMatch: nextStartingMatch.match.isTestMatch,
      preferArena: true,
    }).catch(() => {});
  }, [isIdle, nextStartingMatch]);

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

  useEffect(() => {
    if (!showLiveArena) {
      visibleArenaEntryKeyRef.current = null;
      return;
    }

    const nextVisibleKey = `${duelMatchId ?? 'no-duel'}:${groupMatchId ?? 'no-group'}`;
    if (visibleArenaEntryKeyRef.current === nextVisibleKey) {
      return;
    }

    visibleArenaEntryKeyRef.current = nextVisibleKey;
    callbackRef.current.onLiveArenaPageChange(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [duelMatchId, groupMatchId, livePagerRef, showLiveArena]);
}
