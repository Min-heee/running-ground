import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import type { RunningMatchState } from '@/lib/api/types';
import {
  shouldEnterMatchArenaForLifecycle,
  shouldKeepMatchArenaForceOpen,
} from '@/features/runs/lifecycle/matchStateMachine';

type UseActiveArenaPinEffectInput = {
  livePagerRef: RefObject<ScrollView | null>;
  isResolvingFocusedMatch: boolean;
  forceOpenActiveMatch: boolean;
  shouldKeepRunningMatchArena: boolean;
  showLiveArena: boolean;
  duelState: RunningMatchState;
  groupState: RunningMatchState;
  duelMatchId?: string | null;
  groupMatchId?: string | null;
  duelShouldOpenCountdownArena: boolean;
  groupShouldOpenCountdownArena: boolean;
  roomShouldOpenCountdownArena: boolean;
  onForceOpenActiveMatchChange: (value: boolean) => void;
  onLiveArenaPageChange: (page: number) => void;
};

export function useActiveArenaPinEffect({
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
}: UseActiveArenaPinEffectInput) {
  const lifecycleArenaEntryKeyRef = useRef<string | null>(null);
  const visibleArenaEntryKeyRef = useRef<string | null>(null);
  const callbackRef = useRef({
    onForceOpenActiveMatchChange,
    onLiveArenaPageChange,
  });

  callbackRef.current = {
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
    // STAGE 3 (clean core): this lifecycle entry MOUNTS/SCROLLS the arena page into place
    // but no longer flips forceOpenActiveMatch — useSlotGatedArenaOpen is the single,
    // slot-gated owner of that flag, so the measuring arena can't force-open pre-slot.
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
