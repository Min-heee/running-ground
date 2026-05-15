import { useMemo } from 'react';
import type { ComponentProps } from 'react';
import type { MatchOptionItem } from '@/features/runs/components/MatchOptionSelector';
import { PartyRunHomePanel } from '@/features/runs/components/PartyRunHomePanel';
import {
  DuelMatchSetupCard,
  GroupMatchSetupCard,
} from '@/features/runs/components/MatchSetupCards';
import { RunningReadyScreen } from '@/features/runs/components/RunningReadyScreen';
import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShells';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type {
  RunningMatchRoom,
  RunningMatchStatusResponse,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';

type DuelSetupProps = ComponentProps<typeof DuelMatchSetupCard>;
type GroupSetupProps = ComponentProps<typeof GroupMatchSetupCard>;
type PartyRunProps = ComponentProps<typeof PartyRunHomePanel>;

type UseIdleRunRuntimeModelInput = {
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  blockingMatchHelperText: string | null;
  bottomInset: number;
  canCreateDuelMatch: boolean;
  canCreateGroupMatch: boolean;
  cancelingUpcomingMatchId: string | null;
  duelDateOptions: DuelSetupProps['dateOptions'];
  duelDistanceKm: number;
  duelDistanceText: string;
  duelExpiryCountdownLabel: string | null;
  duelLiveGapKm: number | null;
  duelMatchNotice: string | null;
  duelMatchState: DuelSetupProps['matchState'];
  duelMatchStatus: RunningMatchStatusResponse | null;
  duelNeedsManualRematch: boolean;
  duelReservationLocked: boolean;
  duelSelectedSlotStartAt: string;
  duelStartCountdownSeconds: number | null;
  duelWaitingHint: string;
  duelWaitingMeta: string;
  duelWaitingTitle: string;
  effectiveDuelOpponent: DuelSetupProps['opponent'];
  effectiveDuelOpponentStatusLabel: string | null;
  effectiveDuelSlotLabel: string;
  effectiveGroupParticipantCount: number;
  effectiveGroupParticipants: GroupSetupProps['participants'];
  effectiveGroupSeedRank: number | null;
  effectiveGroupSlotLabel: string;
  groupDateOptions: GroupSetupProps['dateOptions'];
  groupDemandSummary: GroupSetupProps['demandSummary'];
  groupDistanceKm: number;
  groupDistanceText: string;
  groupExpiryCountdownLabel: string | null;
  groupMatchNotice: string | null;
  groupMatchState: GroupSetupProps['matchState'];
  groupMatchStatus: RunningMatchStatusResponse | null;
  groupNeedsManualRematch: boolean;
  groupReservationLocked: boolean;
  groupSelectedSlotStartAt: string;
  groupStartCountdownSeconds: number | null;
  hasLinkedRuntimeRoom: boolean;
  isCancelingDuelMatch: boolean;
  isCancelingGroupMatch: boolean;
  isCreatingMatchRoom: boolean;
  isGroupTestFlow: boolean;
  isIdle: boolean;
  isJoiningMatchRoom: boolean;
  isLeavingMatchRoom: boolean;
  isLoadingGroupDemandSummary: boolean;
  isRequestingDuelMatch: boolean;
  isRequestingGroupMatch: boolean;
  matchMode: RunMatchMode;
  matchOptions: MatchOptionItem[];
  matchRoom: RunningMatchRoom | null;
  onAcceptRoomInvite: () => void;
  onCancelDuelMatch: () => void;
  onCancelGroupMatch: () => void;
  onCancelUpcomingMatch: (match: UpcomingRunningMatchItem) => void;
  onDeclineRoomInvite: () => void;
  onDistanceTextChangeDuel: DuelSetupProps['onDistanceTextChange'];
  onDistanceTextChangeGroup: GroupSetupProps['onDistanceTextChange'];
  onJoinRoom: () => void;
  onOpenUpcomingMatch: (match: UpcomingRunningMatchItem) => void;
  onReadyAction: () => void;
  onRequestDuelMatch: () => void;
  onRequestDuelRematch: () => void;
  onRequestDuelTestMatch: () => void;
  onRequestGroupMatch: () => void;
  onRequestGroupRematch: () => void;
  onRequestGroupTestMatch: () => void;
  onSelectDuelDate: (dateKey: string) => void;
  onSelectDuelSlot: DuelSetupProps['onSelectSlot'];
  onSelectDuelTimeSection: DuelSetupProps['onSelectTimeSection'];
  onSelectGroupDate: (dateKey: string) => void;
  onSelectGroupSlot: GroupSetupProps['onSelectSlot'];
  onSelectGroupTimeSection: GroupSetupProps['onSelectTimeSection'];
  onSelectMatchOption: (option: MatchOptionItem) => void;
  onShowCustomDistanceInputChangeDuel: DuelSetupProps['onShowCustomDistanceInputChange'];
  onShowCustomDistanceInputChangeGroup: GroupSetupProps['onShowCustomDistanceInputChange'];
  readyActionLabel: string | null;
  roomInviteTokenInput: string;
  roomMatchMode: PartyRunProps['roomMode'];
  selectedDuelDateKey: string;
  selectedDuelTimeSection: DuelSetupProps['selectedTimeSection'];
  selectedGroupDateKey: string;
  selectedGroupTimeSection: GroupSetupProps['selectedTimeSection'];
  setRoomInviteTokenInput: PartyRunProps['onInviteTokenChange'];
  setRoomMatchMode: PartyRunProps['onRoomModeChange'];
  shouldShowReadyScreen: boolean;
  showDuelCustomDistanceInput: boolean;
  showGroupCustomDistanceInput: boolean;
  visibleDuelSlotOptions: DuelSetupProps['slotOptions'];
  visibleGroupSlotOptions: GroupSetupProps['slotOptions'];
  visibleMatchRoom: RunningMatchRoom | null;
  visibleMatchRoomIsInviteOnly: boolean;
  visibleUpcomingMatches: UpcomingRunningMatchItem[];
  visibleUpcomingMatchesNowMs: number;
};

export function useIdleRunRuntimeModel({
  activeDuelSlotStartAt,
  activeGroupSlotStartAt,
  blockingMatchHelperText,
  bottomInset,
  canCreateDuelMatch,
  canCreateGroupMatch,
  cancelingUpcomingMatchId,
  duelDateOptions,
  duelDistanceKm,
  duelDistanceText,
  duelExpiryCountdownLabel,
  duelLiveGapKm,
  duelMatchNotice,
  duelMatchState,
  duelMatchStatus,
  duelNeedsManualRematch,
  duelReservationLocked,
  duelSelectedSlotStartAt,
  duelStartCountdownSeconds,
  duelWaitingHint,
  duelWaitingMeta,
  duelWaitingTitle,
  effectiveDuelOpponent,
  effectiveDuelOpponentStatusLabel,
  effectiveDuelSlotLabel,
  effectiveGroupParticipantCount,
  effectiveGroupParticipants,
  effectiveGroupSeedRank,
  effectiveGroupSlotLabel,
  groupDateOptions,
  groupDemandSummary,
  groupDistanceKm,
  groupDistanceText,
  groupExpiryCountdownLabel,
  groupMatchNotice,
  groupMatchState,
  groupMatchStatus,
  groupNeedsManualRematch,
  groupReservationLocked,
  groupSelectedSlotStartAt,
  groupStartCountdownSeconds,
  hasLinkedRuntimeRoom,
  isCancelingDuelMatch,
  isCancelingGroupMatch,
  isCreatingMatchRoom,
  isGroupTestFlow,
  isIdle,
  isJoiningMatchRoom,
  isLeavingMatchRoom,
  isLoadingGroupDemandSummary,
  isRequestingDuelMatch,
  isRequestingGroupMatch,
  matchMode,
  matchOptions,
  matchRoom,
  onAcceptRoomInvite,
  onCancelDuelMatch,
  onCancelGroupMatch,
  onCancelUpcomingMatch,
  onDeclineRoomInvite,
  onDistanceTextChangeDuel,
  onDistanceTextChangeGroup,
  onJoinRoom,
  onOpenUpcomingMatch,
  onReadyAction,
  onRequestDuelMatch,
  onRequestDuelRematch,
  onRequestDuelTestMatch,
  onRequestGroupMatch,
  onRequestGroupRematch,
  onRequestGroupTestMatch,
  onSelectDuelDate,
  onSelectDuelSlot,
  onSelectDuelTimeSection,
  onSelectGroupDate,
  onSelectGroupSlot,
  onSelectGroupTimeSection,
  onSelectMatchOption,
  onShowCustomDistanceInputChangeDuel,
  onShowCustomDistanceInputChangeGroup,
  readyActionLabel,
  roomInviteTokenInput,
  roomMatchMode,
  selectedDuelDateKey,
  selectedDuelTimeSection,
  selectedGroupDateKey,
  selectedGroupTimeSection,
  setRoomInviteTokenInput,
  setRoomMatchMode,
  shouldShowReadyScreen,
  showDuelCustomDistanceInput,
  showGroupCustomDistanceInput,
  visibleDuelSlotOptions,
  visibleGroupSlotOptions,
  visibleMatchRoom,
  visibleMatchRoomIsInviteOnly,
  visibleUpcomingMatches,
  visibleUpcomingMatchesNowMs,
}: UseIdleRunRuntimeModelInput) {
  const readyUpcomingMatchesProps = useMemo(() => ({
    matches: visibleUpcomingMatches,
    nowMs: visibleUpcomingMatchesNowMs,
    cancelingMatchId: cancelingUpcomingMatchId,
    onOpenMatch: onOpenUpcomingMatch,
    onCancelMatch: onCancelUpcomingMatch,
  }), [
    cancelingUpcomingMatchId,
    onCancelUpcomingMatch,
    onOpenUpcomingMatch,
    visibleUpcomingMatches,
    visibleUpcomingMatchesNowMs,
  ]);

  const readyMatchOptionProps = useMemo(() => ({
    options: matchOptions,
    selectedMode: matchMode,
    onSelect: onSelectMatchOption,
  }), [matchMode, matchOptions, onSelectMatchOption]);
  const readyPartyRunProps = useMemo(() => ({
    visibleRoom: visibleMatchRoom,
    currentRoom: matchRoom,
    isSelected: matchMode === 'room',
    isInviteOnly: visibleMatchRoomIsInviteOnly,
    isJoining: isJoiningMatchRoom,
    isLeaving: isLeavingMatchRoom,
    roomMode: roomMatchMode,
    inviteTokenInput: roomInviteTokenInput,
    onRoomModeChange: setRoomMatchMode,
    onInviteTokenChange: setRoomInviteTokenInput,
    onAcceptInvite: onAcceptRoomInvite,
    onDeclineInvite: onDeclineRoomInvite,
    onJoinRoom,
  }), [
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    matchMode,
    matchRoom,
    onAcceptRoomInvite,
    onDeclineRoomInvite,
    onJoinRoom,
    roomInviteTokenInput,
    roomMatchMode,
    setRoomInviteTokenInput,
    setRoomMatchMode,
    visibleMatchRoom,
    visibleMatchRoomIsInviteOnly,
  ]);
  const readyDuelSetupProps = useMemo(() => (matchMode === 'duel'
    ? {
        distanceKm: duelDistanceKm,
        distanceText: duelDistanceText,
        showCustomDistanceInput: showDuelCustomDistanceInput,
        dateOptions: duelDateOptions,
        selectedDateKey: selectedDuelDateKey,
        selectedTimeSection: selectedDuelTimeSection,
        slotOptions: visibleDuelSlotOptions,
        selectedSlotStartAt: duelSelectedSlotStartAt,
        isRequesting: isRequestingDuelMatch,
        matchState: duelMatchState,
        matchStatus: duelMatchStatus,
        activeSlotStartAt: activeDuelSlotStartAt,
        effectiveSlotLabel: effectiveDuelSlotLabel,
        startCountdownSeconds: duelStartCountdownSeconds,
        matchNotice: duelMatchNotice,
        needsManualRematch: duelNeedsManualRematch,
        isCancelingMatch: isCancelingDuelMatch,
        reservationLocked: duelReservationLocked,
        canCreateMatch: canCreateDuelMatch,
        blockingMatchHelperText,
        expiryCountdownLabel: duelExpiryCountdownLabel,
        opponent: effectiveDuelOpponent,
        waitingTitle: duelWaitingTitle,
        waitingMeta: duelWaitingMeta,
        waitingHint: duelWaitingHint,
        opponentStatusLabel: effectiveDuelOpponentStatusLabel,
        liveGapKm: duelLiveGapKm,
        onDistanceTextChange: onDistanceTextChangeDuel,
        onShowCustomDistanceInputChange: onShowCustomDistanceInputChangeDuel,
        onSelectDate: onSelectDuelDate,
        onSelectTimeSection: onSelectDuelTimeSection,
        onSelectSlot: onSelectDuelSlot,
        onCancelMatch: onCancelDuelMatch,
        onRequestMatch: onRequestDuelMatch,
        onRequestTestMatch: onRequestDuelTestMatch,
        onRequestRematch: onRequestDuelRematch,
      }
    : null), [
    activeDuelSlotStartAt,
    blockingMatchHelperText,
    canCreateDuelMatch,
    duelDateOptions,
    duelDistanceKm,
    duelDistanceText,
    duelExpiryCountdownLabel,
    duelLiveGapKm,
    duelMatchNotice,
    duelMatchState,
    duelMatchStatus,
    duelNeedsManualRematch,
    duelReservationLocked,
    duelSelectedSlotStartAt,
    duelStartCountdownSeconds,
    duelWaitingHint,
    duelWaitingMeta,
    duelWaitingTitle,
    effectiveDuelOpponent,
    effectiveDuelOpponentStatusLabel,
    effectiveDuelSlotLabel,
    isCancelingDuelMatch,
    isRequestingDuelMatch,
    matchMode,
    onCancelDuelMatch,
    onDistanceTextChangeDuel,
    onRequestDuelMatch,
    onRequestDuelRematch,
    onRequestDuelTestMatch,
    onSelectDuelDate,
    onSelectDuelSlot,
    onSelectDuelTimeSection,
    onShowCustomDistanceInputChangeDuel,
    selectedDuelDateKey,
    selectedDuelTimeSection,
    showDuelCustomDistanceInput,
    visibleDuelSlotOptions,
  ]);
  const readyGroupSetupProps = useMemo(() => (matchMode === 'group'
    ? {
        distanceKm: groupDistanceKm,
        distanceText: groupDistanceText,
        showCustomDistanceInput: showGroupCustomDistanceInput,
        dateOptions: groupDateOptions,
        selectedDateKey: selectedGroupDateKey,
        selectedTimeSection: selectedGroupTimeSection,
        slotOptions: visibleGroupSlotOptions,
        selectedSlotStartAt: groupSelectedSlotStartAt,
        isRequesting: isRequestingGroupMatch,
        matchState: groupMatchState,
        matchStatus: groupMatchStatus,
        activeSlotStartAt: activeGroupSlotStartAt,
        effectiveSlotLabel: effectiveGroupSlotLabel,
        startCountdownSeconds: groupStartCountdownSeconds,
        matchNotice: groupMatchNotice,
        needsManualRematch: groupNeedsManualRematch,
        isCancelingMatch: isCancelingGroupMatch,
        reservationLocked: groupReservationLocked,
        canCreateMatch: canCreateGroupMatch,
        blockingMatchHelperText,
        expiryCountdownLabel: groupExpiryCountdownLabel,
        isTestFlow: isGroupTestFlow,
        isLoadingDemandSummary: isLoadingGroupDemandSummary,
        demandSummary: groupDemandSummary,
        effectiveParticipantCount: effectiveGroupParticipantCount,
        effectiveSeedRank: effectiveGroupSeedRank,
        participants: effectiveGroupParticipants,
        onDistanceTextChange: onDistanceTextChangeGroup,
        onShowCustomDistanceInputChange: onShowCustomDistanceInputChangeGroup,
        onSelectDate: onSelectGroupDate,
        onSelectTimeSection: onSelectGroupTimeSection,
        onSelectSlot: onSelectGroupSlot,
        onCancelMatch: onCancelGroupMatch,
        onRequestMatch: onRequestGroupMatch,
        onRequestTestMatch: onRequestGroupTestMatch,
        onRequestRematch: onRequestGroupRematch,
      }
    : null), [
    activeGroupSlotStartAt,
    blockingMatchHelperText,
    canCreateGroupMatch,
    effectiveGroupParticipantCount,
    effectiveGroupParticipants,
    effectiveGroupSeedRank,
    effectiveGroupSlotLabel,
    groupDateOptions,
    groupDemandSummary,
    groupDistanceKm,
    groupDistanceText,
    groupExpiryCountdownLabel,
    groupMatchNotice,
    groupMatchState,
    groupMatchStatus,
    groupNeedsManualRematch,
    groupReservationLocked,
    groupSelectedSlotStartAt,
    groupStartCountdownSeconds,
    isCancelingGroupMatch,
    isGroupTestFlow,
    isLoadingGroupDemandSummary,
    isRequestingGroupMatch,
    matchMode,
    onCancelGroupMatch,
    onDistanceTextChangeGroup,
    onRequestGroupMatch,
    onRequestGroupRematch,
    onRequestGroupTestMatch,
    onSelectGroupDate,
    onSelectGroupSlot,
    onSelectGroupTimeSection,
    onShowCustomDistanceInputChangeGroup,
    selectedGroupDateKey,
    selectedGroupTimeSection,
    showGroupCustomDistanceInput,
    visibleGroupSlotOptions,
  ]);
  const readyActionLoadingLabel = matchMode === 'room' && isCreatingMatchRoom ? '방 만드는 중...' : undefined;
  const readyActionDisabled = matchMode === 'room' ? isCreatingMatchRoom : false;
  const readyScreenProps: ComponentProps<typeof RunningReadyScreen> = useMemo(() => ({
    bottomInset,
    upcomingMatchesProps: readyUpcomingMatchesProps,
    matchSetupProps: {
      matchOptionProps: readyMatchOptionProps,
      partyRunProps: readyPartyRunProps,
      duelSetupProps: readyDuelSetupProps,
      groupSetupProps: readyGroupSetupProps,
    },
    readyActionLabel,
    readyActionLoadingLabel,
    readyActionDisabled,
    onReadyAction,
  }), [
    bottomInset,
    onReadyAction,
    readyActionDisabled,
    readyActionLabel,
    readyActionLoadingLabel,
    readyDuelSetupProps,
    readyGroupSetupProps,
    readyMatchOptionProps,
    readyPartyRunProps,
    readyUpcomingMatchesProps,
  ]);

  const trackRunShellKind = useMemo<TrackRunShellKind>(() => {
    if (!shouldShowReadyScreen) {
      return 'live';
    }

    const hasLobbyState = Boolean(
      matchMode === 'room'
      || visibleMatchRoom
      || matchRoom
      || duelMatchStatus
      || groupMatchStatus
      || visibleUpcomingMatches.length > 0
      || roomInviteTokenInput.trim()
      || isCreatingMatchRoom
      || isJoiningMatchRoom
      || isLeavingMatchRoom
      || isRequestingDuelMatch
      || isRequestingGroupMatch
    );

    return hasLobbyState ? 'lobby' : 'idle';
  }, [
    duelMatchStatus,
    groupMatchStatus,
    isCreatingMatchRoom,
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    isRequestingDuelMatch,
    isRequestingGroupMatch,
    matchMode,
    matchRoom,
    roomInviteTokenInput,
    shouldShowReadyScreen,
    visibleMatchRoom,
    visibleUpcomingMatches.length,
  ]);

  return {
    readyScreenProps,
    trackRunShellKind: isIdle ? trackRunShellKind : 'live',
  };
}
