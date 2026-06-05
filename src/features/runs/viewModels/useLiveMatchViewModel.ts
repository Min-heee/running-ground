import { useMemo } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import type { LiveMatchResultPageProps } from '@/features/runs/components/LiveMatchResultPage';
import {
  buildLiveMatchArenaViewModel,
  type LiveMatchArenaViewModelInput,
} from '@/features/runs/viewModels/liveMatchArenaViewModel';
import {
  buildLiveMatchArenaPageProps,
  buildLiveMatchPagesProps,
  buildLiveMatchRaceBoardPageProps,
  buildLiveMatchRaceBoardViewModelForPage,
  buildLiveMatchResultPagePropsForPage,
  buildLiveMatchStatsPageProps,
} from '@/features/runs/viewModels/liveMatchPagesViewModel';
import type { LiveMatchRaceBoardViewModelInput } from '@/features/runs/viewModels/liveMatchRaceBoardViewModel';
import {
  type LiveMatchTrackingInputProps,
  useLiveMatchTrackingViewProps,
} from '@/features/runs/viewModels/useLiveMatchTrackingViewProps';

type UseLiveMatchViewModelInput =
  LiveMatchArenaViewModelInput
  & LiveMatchRaceBoardViewModelInput
  & LiveMatchTrackingInputProps
  & LiveMatchResultPageProps
  & {
    scrollRef: RefObject<ScrollView | null>;
    page: number;
    pageWidth: number;
    hasResultPage: boolean;
    onPageChange: (page: number) => void;
    onLiveMatchMounted?: (input: { matchId?: string | null; mode: 'duel' | 'group'; source: string }) => void;
  };

export function useLiveMatchViewModel({
  scrollRef,
  page,
  pageWidth,
  hasResultPage,
  onPageChange,
  activeMatchId,
  matchMode,
  effectiveDuelOpponent,
  duelDistanceKm,
  groupDistanceKm,
  distanceKm,
  duelLiveSummary,
  currentUserArenaPace,
  isDuelOpponentForfeited,
  effectiveDuelOpponentArenaPace,
  duelComparisonSnapshot,
  officialDuelReady,
  duelLiveGapKm,
  duelArenaParticipants,
  syncedDuelDistanceKm,
  syncedDuelOpponentDistanceKm,
  roomLinkedDuelPlaceholderParticipants,
  roomLinkedDuelCurrentParticipant,
  roomLinkedDuelOpponentParticipant,
  roomLinkedGroupPlaceholderParticipants,
  visibleMatchRoom,
  roomCountdownRemainingSeconds,
  duelArenaUsesLivePace,
  hasRoomLinkedDuelLiveProgress,
  roomLinkedDuelGapKm,
  currentGroupStanding,
  effectiveGroupParticipantCount,
  currentGroupLeader,
  groupArenaParticipants,
  groupAheadParticipant,
  groupBehindParticipant,
  shouldKeepRunningMatchArena,
  currentUserDuelLiveStatus,
  currentUserGroupLiveStatus,
  deferHeavyContent,
  onLiveMatchMounted,
  groupLiveStandings,
  groupArenaUsesLivePace,
  liveMatchTitle,
  liveMatchText,
  duelLiveTitle,
  duelStatusAlert,
  isLeavingDuelMatch,
  groupStatusAlert,
  isLeavingGroupMatch,
  elapsedSeconds,
  averagePace,
  currentPace,
  cadenceSpm,
  elevationGainM,
  useLiveTrackingMetrics,
  onContinueSoloFromMatch,
  estimatedBonusPoints,
  estimatedLpDelta,
  duelRows,
  groupRows,
  groupStatusLabel,
}: UseLiveMatchViewModelInput) {
  const arenaViewModel = useMemo(() => buildLiveMatchArenaViewModel({
    activeMatchId,
    matchMode,
    effectiveDuelOpponent,
    duelDistanceKm,
    groupDistanceKm,
    distanceKm,
    duelLiveSummary,
    currentUserArenaPace,
    isDuelOpponentForfeited,
    effectiveDuelOpponentArenaPace,
    duelComparisonSnapshot,
    officialDuelReady,
    duelLiveGapKm,
    duelArenaParticipants,
    syncedDuelDistanceKm,
    syncedDuelOpponentDistanceKm,
    roomLinkedDuelPlaceholderParticipants,
    roomLinkedDuelCurrentParticipant,
    roomLinkedDuelOpponentParticipant,
    roomLinkedGroupPlaceholderParticipants,
    visibleMatchRoom,
    roomCountdownRemainingSeconds,
    duelArenaUsesLivePace,
    hasRoomLinkedDuelLiveProgress,
    roomLinkedDuelGapKm,
    currentGroupStanding,
    effectiveGroupParticipantCount,
    currentGroupLeader,
    groupArenaParticipants,
    groupAheadParticipant,
    groupBehindParticipant,
    shouldKeepRunningMatchArena,
    currentUserDuelLiveStatus,
    currentUserGroupLiveStatus,
    deferHeavyContent,
  }), [
    activeMatchId,
    currentGroupLeader,
    currentGroupStanding,
    currentUserArenaPace,
    currentUserDuelLiveStatus,
    currentUserGroupLiveStatus,
    deferHeavyContent,
    distanceKm,
    duelArenaParticipants,
    duelArenaUsesLivePace,
    duelComparisonSnapshot,
    duelDistanceKm,
    duelLiveGapKm,
    duelLiveSummary,
    effectiveDuelOpponent,
    effectiveDuelOpponentArenaPace,
    effectiveGroupParticipantCount,
    groupAheadParticipant,
    groupArenaParticipants,
    groupBehindParticipant,
    groupDistanceKm,
    hasRoomLinkedDuelLiveProgress,
    isDuelOpponentForfeited,
    matchMode,
    officialDuelReady,
    roomCountdownRemainingSeconds,
    roomLinkedDuelCurrentParticipant,
    roomLinkedDuelGapKm,
    roomLinkedDuelOpponentParticipant,
    roomLinkedDuelPlaceholderParticipants,
    roomLinkedGroupPlaceholderParticipants,
    shouldKeepRunningMatchArena,
    syncedDuelDistanceKm,
    syncedDuelOpponentDistanceKm,
    visibleMatchRoom,
  ]);

  const duelRaceBoardResultLabels = useMemo(() => {
    const participants = roomLinkedDuelPlaceholderParticipants.length > 0
      ? roomLinkedDuelPlaceholderParticipants
      : duelArenaParticipants;

    return {
      currentUserDuelResultLabel: participants.find((participant) => participant.isCurrentUser)?.resultLabel ?? null,
      opponentDuelResultLabel: participants.find((participant) => !participant.isCurrentUser)?.resultLabel ?? null,
    };
  }, [duelArenaParticipants, roomLinkedDuelPlaceholderParticipants]);

  const raceBoardViewModel = useMemo(() => (
    buildLiveMatchRaceBoardViewModelForPage({
      page,
      input: {
        matchMode,
        effectiveDuelOpponent,
        duelLiveGapKm,
        duelDistanceKm,
        groupDistanceKm,
        distanceKm,
        syncedDuelDistanceKm,
        syncedDuelOpponentDistanceKm,
        currentUserDuelLiveStatus,
        currentUserDuelResultLabel: duelRaceBoardResultLabels.currentUserDuelResultLabel,
        currentUserGroupLiveStatus,
        opponentDuelResultLabel: duelRaceBoardResultLabels.opponentDuelResultLabel,
        roomLinkedDuelPlaceholderParticipants,
        roomLinkedGroupPlaceholderParticipants,
        visibleMatchRoom,
        groupLiveStandings,
        currentUserArenaPace,
        groupArenaUsesLivePace,
      },
    })
  ), [
    currentUserArenaPace,
    currentUserDuelLiveStatus,
    currentUserGroupLiveStatus,
    duelRaceBoardResultLabels.currentUserDuelResultLabel,
    duelRaceBoardResultLabels.opponentDuelResultLabel,
    distanceKm,
    duelDistanceKm,
    duelLiveGapKm,
    effectiveDuelOpponent,
    groupArenaUsesLivePace,
    groupDistanceKm,
    groupLiveStandings,
    matchMode,
    page,
    roomLinkedDuelPlaceholderParticipants,
    roomLinkedGroupPlaceholderParticipants,
    syncedDuelDistanceKm,
    syncedDuelOpponentDistanceKm,
    visibleMatchRoom,
  ]);

  const trackingPageProps = useLiveMatchTrackingViewProps({
    matchMode,
    liveMatchTitle,
    liveMatchText,
    effectiveDuelOpponent,
    duelDistanceKm,
    duelLiveTitle,
    duelLiveSummary,
    duelStatusAlert,
    distanceKm,
    isLeavingDuelMatch,
    effectiveGroupParticipantCount,
    currentGroupStanding,
    groupAheadParticipant,
    groupBehindParticipant,
    groupStatusAlert,
    isLeavingGroupMatch,
    groupLiveStandings,
    currentGroupLeader,
    elapsedSeconds,
    averagePace,
    currentPace,
    cadenceSpm,
    elevationGainM,
    useLiveTrackingMetrics,
    onContinueSoloFromMatch,
  });

  const arenaProps = useMemo(() => buildLiveMatchArenaPageProps({
    activeMatchId,
    arenaViewModel,
    onLiveMatchMounted,
  }), [
    activeMatchId,
    arenaViewModel,
    onLiveMatchMounted,
  ]);

  const raceBoardProps = useMemo(() => buildLiveMatchRaceBoardPageProps({
    matchMode,
    raceBoardViewModel,
  }), [
    matchMode,
    raceBoardViewModel,
  ]);

  const trackingStatsSourceProps = page === 2 ? trackingPageProps : null;
  const trackingStatsPageProps = useMemo(() => buildLiveMatchStatsPageProps({
    page,
    trackingPageProps: trackingStatsSourceProps,
  }), [
    page,
    trackingStatsSourceProps,
  ]);

  const resultPageInput = useMemo(() => (
    hasResultPage || page === 3
      ? {
      matchMode,
      estimatedBonusPoints,
      estimatedLpDelta,
      duelRows,
      groupRows,
      groupStatusLabel,
    }
      : null
  ), [
    duelRows,
    estimatedBonusPoints,
    estimatedLpDelta,
    groupRows,
    groupStatusLabel,
    hasResultPage,
    matchMode,
    page,
  ]);
  const resultPagePropsForPager = useMemo(() => buildLiveMatchResultPagePropsForPage({
    hasResultPage,
    page,
    resultPageProps: resultPageInput,
  }), [
    hasResultPage,
    page,
    resultPageInput,
  ]);

  const livePagesProps = useMemo(() => buildLiveMatchPagesProps({
    scrollRef,
    page,
    pageWidth,
    hasResultPage,
    arenaProps,
    raceBoardProps,
    trackingStatsPageProps,
    resultProps: resultPagePropsForPager,
    onPageChange,
  }), [
    arenaProps,
    hasResultPage,
    onPageChange,
    page,
    pageWidth,
    raceBoardProps,
    resultPagePropsForPager,
    scrollRef,
    trackingStatsPageProps,
  ]);

  return {
    livePagesProps,
    trackingPageProps,
  };
}
