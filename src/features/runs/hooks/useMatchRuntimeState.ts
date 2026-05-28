import { useMemo } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  buildMatchLifecycleController,
  type MatchLifecycleTrackingStatus,
} from '@/features/runs/lifecycle/matchLifecycleController';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import {
  isLiveMatchState,
  type PartyRunFlowSnapshot,
  type PartyRunLinkedMatchContext,
} from '@/features/runs/lifecycle/matchStateMachine';
import type {
  RunningMatchRoom,
  RunningMatchState,
  RunningMatchStatusResponse,
} from '@/lib/api/types';

type UseMatchRuntimeStateInput = {
  matchMode: RunMatchMode;
  trackingStatus: MatchLifecycleTrackingStatus;
  isRunning: boolean;
  isCurrentUserForfeited: boolean;
  isCurrentUserDoneWithMatch: boolean;
  liveMatchHeavyWorkReady: boolean;
  visiblePartyRunFlow: PartyRunFlowSnapshot;
  matchRoomFlow: PartyRunFlowSnapshot;
  matchRoom: RunningMatchRoom | null;
  visibleMatchRoom: RunningMatchRoom | null;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  duelMatchState: RunningMatchState;
  groupMatchState: RunningMatchState;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  duelStartCountdownSeconds: number | null;
  groupStartCountdownSeconds: number | null;
  fallbackMatchId: string | null;
  duelArenaParticipants: ArenaParticipantViewModel[];
  roomLinkedDuelPlaceholderParticipants: ArenaParticipantViewModel[];
  groupArenaParticipants: ArenaParticipantViewModel[];
  roomLinkedGroupPlaceholderParticipants: ArenaParticipantViewModel[];
  hasRoomLinkedDuelContext: boolean;
  hasRoomLinkedGroupContext: boolean;
  duelShouldOpenCountdownArena: boolean;
  groupShouldOpenCountdownArena: boolean;
  roomShouldOpenCountdownArena: boolean;
  duelShouldHoldArenaDuringActivation: boolean;
  groupShouldHoldArenaDuringActivation: boolean;
  hasMatchResultPage: boolean;
  forceOpenActiveMatch: boolean;
  isDuelTestFlow: boolean;
  isGroupTestFlow: boolean;
  isDuelOpponentForfeited: boolean;
  isLeavingDuelMatch: boolean;
  isLeavingGroupMatch: boolean;
};

export function useMatchRuntimeState({
  matchMode,
  trackingStatus,
  isRunning,
  isCurrentUserForfeited,
  isCurrentUserDoneWithMatch,
  liveMatchHeavyWorkReady,
  visiblePartyRunFlow,
  matchRoomFlow,
  matchRoom,
  visibleMatchRoom,
  roomLinkedMatchContext,
  duelMatchState,
  groupMatchState,
  duelMatchStatus,
  groupMatchStatus,
  duelStartCountdownSeconds,
  groupStartCountdownSeconds,
  fallbackMatchId,
  duelArenaParticipants,
  roomLinkedDuelPlaceholderParticipants,
  groupArenaParticipants,
  roomLinkedGroupPlaceholderParticipants,
  hasRoomLinkedDuelContext,
  hasRoomLinkedGroupContext,
  duelShouldOpenCountdownArena,
  groupShouldOpenCountdownArena,
  roomShouldOpenCountdownArena,
  duelShouldHoldArenaDuringActivation,
  groupShouldHoldArenaDuringActivation,
  hasMatchResultPage,
  forceOpenActiveMatch,
  isDuelTestFlow,
  isGroupTestFlow,
  isDuelOpponentForfeited,
  isLeavingDuelMatch,
  isLeavingGroupMatch,
}: UseMatchRuntimeStateInput) {
  const matchLifecycleController = useMemo(() => buildMatchLifecycleController({
    matchMode,
    trackingStatus,
    isRunning,
    isCurrentUserForfeited,
    liveMatchHeavyWorkReady,
    visiblePartyRunFlow,
    matchRoomFlow,
    matchRoom,
    visibleMatchRoom,
    roomLinkedMatchContext,
    duelMatchState,
    groupMatchState,
    duelMatchStatus,
    groupMatchStatus,
    duelStartCountdownSeconds,
    groupStartCountdownSeconds,
    fallbackMatchId,
  }), [
    duelMatchState,
    duelMatchStatus,
    duelStartCountdownSeconds,
    fallbackMatchId,
    groupMatchState,
    groupMatchStatus,
    groupStartCountdownSeconds,
    isCurrentUserForfeited,
    isRunning,
    liveMatchHeavyWorkReady,
    matchMode,
    matchRoom,
    matchRoomFlow,
    roomLinkedMatchContext,
    trackingStatus,
    visibleMatchRoom,
    visiblePartyRunFlow,
  ]);

  return useMemo(() => {
    const canRenderLiveArena =
      (matchMode === 'duel'
        && isLiveMatchState(duelMatchState)
        && duelArenaParticipants.length === 2
        && (duelMatchState === 'active' || duelShouldOpenCountdownArena || duelShouldHoldArenaDuringActivation))
      || (matchMode === 'duel'
        && hasRoomLinkedDuelContext
        && roomLinkedDuelPlaceholderParticipants.length === 2
        && roomShouldOpenCountdownArena)
      || (matchMode === 'group'
        && isLiveMatchState(groupMatchState)
        && groupArenaParticipants.length > 0
        && (groupMatchState === 'active' || groupShouldOpenCountdownArena || groupShouldHoldArenaDuringActivation))
      || (matchMode === 'group'
        && hasRoomLinkedGroupContext
        && roomLinkedGroupPlaceholderParticipants.length > 0
        && roomShouldOpenCountdownArena);

    const shouldKeepRunningMatchArena = Boolean(
      isRunning
      && fallbackMatchId
      && matchMode !== 'solo'
      && matchMode !== 'room'
      && !isCurrentUserForfeited,
    );
    const hasDuelMatchExitTarget = Boolean(
      duelMatchStatus?.matchId
      || roomLinkedMatchContext?.mode === 'duel',
    );
    const hasGroupMatchExitTarget = Boolean(
      groupMatchStatus?.matchId
      || roomLinkedMatchContext?.mode === 'group',
    );
    const selfForfeitedResultSource = (
      isCurrentUserForfeited
      && hasMatchResultPage
      && isRunning
    )
      ? matchMode === 'duel' && hasDuelMatchExitTarget
        ? 'duel' as const
        : matchMode === 'group' && hasGroupMatchExitTarget
          ? 'group' as const
          : null
      : null;
    const shouldSuppressDoneMatchAutoOpen = isCurrentUserDoneWithMatch && !isRunning;

    const showLiveArena =
      !shouldSuppressDoneMatchAutoOpen
      && (
        (canRenderLiveArena || shouldKeepRunningMatchArena || Boolean(selfForfeitedResultSource))
        && (!isCurrentUserForfeited || Boolean(selfForfeitedResultSource))
        && (
          isRunning
          || hasMatchResultPage
          || forceOpenActiveMatch
          || (trackingStatus === 'idle' && (
            duelShouldOpenCountdownArena
            || groupShouldOpenCountdownArena
            || roomShouldOpenCountdownArena
            || (matchMode === 'duel' && isDuelTestFlow)
            || (matchMode === 'group' && isGroupTestFlow)
          ))
        )
      );

    const activeMatchExitSource = selfForfeitedResultSource
      ?? (isCurrentUserForfeited
        ? null
        : isRunning && matchMode === 'duel'
        ? (
            (duelMatchStatus?.matchId && isLiveMatchState(duelMatchState))
            || roomLinkedMatchContext?.mode === 'duel'
              ? 'duel' as const
              : null
          )
        : isRunning && matchMode === 'group'
          ? (
              (groupMatchStatus?.matchId && isLiveMatchState(groupMatchState))
              || roomLinkedMatchContext?.mode === 'group'
                ? 'group' as const
                : null
            )
          : null);

    return {
      activeMatchExitCounterpartForfeited: activeMatchExitSource === 'duel'
        ? Boolean(
            isDuelOpponentForfeited
            || roomLinkedDuelPlaceholderParticipants.some((participant) => !participant.isCurrentUser && participant.liveStatus === 'forfeited'),
          )
        : false,
      activeMatchExitIsLeaving: activeMatchExitSource === 'duel'
        ? isLeavingDuelMatch
        : activeMatchExitSource === 'group'
          ? isLeavingGroupMatch
          : false,
      activeMatchExitIsTest: activeMatchExitSource === 'duel'
        ? isDuelTestFlow
        : activeMatchExitSource === 'group'
          ? isGroupTestFlow
          : false,
      activeMatchExitSource,
      canRenderLiveArena,
      matchLifecycleController,
      shouldEnableMatchProgressHeartbeat: Boolean(matchLifecycleController.effects.shouldRunHeartbeat),
      shouldKeepRunningMatchArena,
      showLiveArena,
    };
  }, [
    duelArenaParticipants.length,
    duelMatchState,
    duelMatchStatus?.matchId,
    duelShouldHoldArenaDuringActivation,
    duelShouldOpenCountdownArena,
    fallbackMatchId,
    forceOpenActiveMatch,
    groupArenaParticipants.length,
    groupMatchState,
    groupMatchStatus?.matchId,
    groupShouldHoldArenaDuringActivation,
    groupShouldOpenCountdownArena,
    hasMatchResultPage,
    hasRoomLinkedDuelContext,
    hasRoomLinkedGroupContext,
    isCurrentUserForfeited,
    isCurrentUserDoneWithMatch,
    isDuelOpponentForfeited,
    isDuelTestFlow,
    isGroupTestFlow,
    isLeavingDuelMatch,
    isLeavingGroupMatch,
    isRunning,
    matchLifecycleController,
    matchMode,
    roomLinkedDuelPlaceholderParticipants,
    roomLinkedGroupPlaceholderParticipants.length,
    roomLinkedMatchContext?.mode,
    roomShouldOpenCountdownArena,
    trackingStatus,
  ]);
}
