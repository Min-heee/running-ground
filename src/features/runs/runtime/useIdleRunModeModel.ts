import { useMemo } from 'react';
import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShells';
import type { UseIdleRunRuntimeModelInput } from '@/features/runs/runtime/idleRunRuntimeTypes';

type UseIdleRunModeModelInput = Pick<
  UseIdleRunRuntimeModelInput,
  | 'activeDuelSlotStartAt'
  | 'activeGroupSlotStartAt'
  | 'blockingMatchHelperText'
  | 'canCreateDuelMatch'
  | 'canCreateGroupMatch'
  | 'duelDateOptions'
  | 'duelDistanceKm'
  | 'duelDistanceText'
  | 'duelExpiryCountdownLabel'
  | 'duelLiveGapKm'
  | 'duelMatchNotice'
  | 'duelMatchState'
  | 'duelMatchStatus'
  | 'duelNeedsManualRematch'
  | 'duelReservationLocked'
  | 'duelSelectedSlotStartAt'
  | 'duelStartCountdownSeconds'
  | 'duelWaitingTitle'
  | 'effectiveDuelOpponent'
  | 'effectiveDuelOpponentStatusLabel'
  | 'effectiveDuelSlotLabel'
  | 'effectiveGroupParticipantCount'
  | 'effectiveGroupParticipants'
  | 'effectiveGroupSeedRank'
  | 'effectiveGroupSlotLabel'
  | 'groupDateOptions'
  | 'groupDemandSummary'
  | 'groupDistanceKm'
  | 'groupDistanceText'
  | 'groupExpiryCountdownLabel'
  | 'groupMatchNotice'
  | 'groupMatchState'
  | 'groupMatchStatus'
  | 'groupNeedsManualRematch'
  | 'groupReservationLocked'
  | 'groupSelectedSlotStartAt'
  | 'groupStartCountdownSeconds'
  | 'isCancelingDuelMatch'
  | 'isCancelingGroupMatch'
  | 'isCreatingMatchRoom'
  | 'isGroupTestFlow'
  | 'isJoiningMatchRoom'
  | 'isLeavingMatchRoom'
  | 'isLoadingGroupDemandSummary'
  | 'isRequestingDuelMatch'
  | 'isRequestingGroupMatch'
  | 'matchMode'
  | 'matchOptions'
  | 'matchRoom'
  | 'onCancelDuelMatch'
  | 'onCancelGroupMatch'
  | 'onDistanceTextChangeDuel'
  | 'onDistanceTextChangeGroup'
  | 'onRequestDuelMatch'
  | 'onRequestDuelRematch'
  | 'onRequestGroupMatch'
  | 'onRequestGroupRematch'
  | 'onSelectDuelDate'
  | 'onSelectDuelSlot'
  | 'onSelectDuelTimeSection'
  | 'onSelectGroupDate'
  | 'onSelectGroupSlot'
  | 'onSelectGroupTimeSection'
  | 'onSelectMatchOption'
  | 'onShowCustomDistanceInputChangeDuel'
  | 'onShowCustomDistanceInputChangeGroup'
  | 'roomInviteTokenInput'
  | 'selectedDuelDateKey'
  | 'selectedDuelTimeSection'
  | 'selectedGroupDateKey'
  | 'selectedGroupTimeSection'
  | 'shouldShowReadyScreen'
  | 'showDuelCustomDistanceInput'
  | 'showGroupCustomDistanceInput'
  | 'slotDuelCounts'
  | 'visibleDuelSlotOptions'
  | 'visibleGroupSlotOptions'
  | 'visibleMatchRoom'
  | 'visibleUpcomingMatches'
>;

export function useIdleRunModeModel(input: UseIdleRunModeModelInput) {
  const readyMatchOptionProps = useMemo(() => ({
    options: input.matchOptions,
    selectedMode: input.matchMode,
    onSelect: input.onSelectMatchOption,
  }), [input.matchMode, input.matchOptions, input.onSelectMatchOption]);

  const readyDuelSetupProps = useMemo(() => (input.matchMode === 'duel'
    ? {
        distanceKm: input.duelDistanceKm,
        distanceText: input.duelDistanceText,
        showCustomDistanceInput: input.showDuelCustomDistanceInput,
        dateOptions: input.duelDateOptions,
        selectedDateKey: input.selectedDuelDateKey,
        selectedTimeSection: input.selectedDuelTimeSection,
        slotOptions: input.visibleDuelSlotOptions,
        selectedSlotStartAt: input.duelSelectedSlotStartAt,
        isRequesting: input.isRequestingDuelMatch,
        matchState: input.duelMatchState,
        matchStatus: input.duelMatchStatus,
        activeSlotStartAt: input.activeDuelSlotStartAt,
        effectiveSlotLabel: input.effectiveDuelSlotLabel,
        startCountdownSeconds: input.duelStartCountdownSeconds,
        matchNotice: input.duelMatchNotice,
        needsManualRematch: input.duelNeedsManualRematch,
        isCancelingMatch: input.isCancelingDuelMatch,
        reservationLocked: input.duelReservationLocked,
        canCreateMatch: input.canCreateDuelMatch,
        blockingMatchHelperText: input.blockingMatchHelperText,
        expiryCountdownLabel: input.duelExpiryCountdownLabel,
        opponent: input.effectiveDuelOpponent,
        waitingTitle: input.duelWaitingTitle,
        opponentStatusLabel: input.effectiveDuelOpponentStatusLabel,
        liveGapKm: input.duelLiveGapKm,
        slotDuelCounts: input.slotDuelCounts,
        onDistanceTextChange: input.onDistanceTextChangeDuel,
        onShowCustomDistanceInputChange: input.onShowCustomDistanceInputChangeDuel,
        onSelectDate: input.onSelectDuelDate,
        onSelectTimeSection: input.onSelectDuelTimeSection,
        onSelectSlot: input.onSelectDuelSlot,
        onCancelMatch: input.onCancelDuelMatch,
        onRequestMatch: input.onRequestDuelMatch,
        onRequestRematch: input.onRequestDuelRematch,
      }
    : null), [input]);

  const readyGroupSetupProps = useMemo(() => (input.matchMode === 'group'
    ? {
        distanceKm: input.groupDistanceKm,
        distanceText: input.groupDistanceText,
        showCustomDistanceInput: input.showGroupCustomDistanceInput,
        dateOptions: input.groupDateOptions,
        selectedDateKey: input.selectedGroupDateKey,
        selectedTimeSection: input.selectedGroupTimeSection,
        slotOptions: input.visibleGroupSlotOptions,
        selectedSlotStartAt: input.groupSelectedSlotStartAt,
        isRequesting: input.isRequestingGroupMatch,
        matchState: input.groupMatchState,
        matchStatus: input.groupMatchStatus,
        activeSlotStartAt: input.activeGroupSlotStartAt,
        effectiveSlotLabel: input.effectiveGroupSlotLabel,
        startCountdownSeconds: input.groupStartCountdownSeconds,
        matchNotice: input.groupMatchNotice,
        needsManualRematch: input.groupNeedsManualRematch,
        isCancelingMatch: input.isCancelingGroupMatch,
        reservationLocked: input.groupReservationLocked,
        canCreateMatch: input.canCreateGroupMatch,
        blockingMatchHelperText: input.blockingMatchHelperText,
        expiryCountdownLabel: input.groupExpiryCountdownLabel,
        isTestFlow: input.isGroupTestFlow,
        isLoadingDemandSummary: input.isLoadingGroupDemandSummary,
        demandSummary: input.groupDemandSummary,
        effectiveParticipantCount: input.effectiveGroupParticipantCount,
        effectiveSeedRank: input.effectiveGroupSeedRank,
        participants: input.effectiveGroupParticipants,
        onDistanceTextChange: input.onDistanceTextChangeGroup,
        onShowCustomDistanceInputChange: input.onShowCustomDistanceInputChangeGroup,
        onSelectDate: input.onSelectGroupDate,
        onSelectTimeSection: input.onSelectGroupTimeSection,
        onSelectSlot: input.onSelectGroupSlot,
        onCancelMatch: input.onCancelGroupMatch,
        onRequestMatch: input.onRequestGroupMatch,
        onRequestRematch: input.onRequestGroupRematch,
      }
    : null), [input]);

  const trackRunShellKind = useMemo<TrackRunShellKind>(() => {
    if (!input.shouldShowReadyScreen) {
      return 'live';
    }

    const hasLobbyState = Boolean(
      input.matchMode === 'room'
      || input.visibleMatchRoom
      || input.matchRoom
      || input.duelMatchStatus
      || input.groupMatchStatus
      || input.visibleUpcomingMatches.length > 0
      || input.roomInviteTokenInput.trim()
      || input.isCreatingMatchRoom
      || input.isJoiningMatchRoom
      || input.isLeavingMatchRoom
      || input.isRequestingDuelMatch
      || input.isRequestingGroupMatch
    );

    return hasLobbyState ? 'lobby' : 'idle';
  }, [input]);

  return {
    readyDuelSetupProps,
    readyGroupSetupProps,
    readyMatchOptionProps,
    trackRunShellKind,
  };
}
