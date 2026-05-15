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
  buildLiveMatchResultPageProps,
  buildLiveMatchStatsPageProps,
} from '@/features/runs/viewModels/liveMatchPagesViewModel';
import {
  buildLiveMatchRaceBoardViewModel,
  type LiveMatchRaceBoardViewModelInput,
} from '@/features/runs/viewModels/liveMatchRaceBoardViewModel';
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
  onContinueSoloFromMatch,
  estimatedBonusPoints,
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

  const arenaProps = useMemo(() => buildLiveMatchArenaPageProps({
    activeMatchId,
    arenaViewModel,
    onLiveMatchMounted,
  }), [activeMatchId, arenaViewModel, onLiveMatchMounted]);

  const raceBoardViewModel = useMemo(() => {
    if (page !== 1) {
      return null;
    }

    return buildLiveMatchRaceBoardViewModel({
      matchMode,
      effectiveDuelOpponent,
      duelLiveGapKm,
      duelDistanceKm,
      groupDistanceKm,
      distanceKm,
      syncedDuelDistanceKm,
      syncedDuelOpponentDistanceKm,
      currentUserDuelLiveStatus,
      currentUserGroupLiveStatus,
      roomLinkedDuelPlaceholderParticipants,
      roomLinkedGroupPlaceholderParticipants,
      visibleMatchRoom,
      groupLiveStandings,
      currentUserArenaPace,
      groupArenaUsesLivePace,
    });
  }, [
    currentUserArenaPace,
    currentUserDuelLiveStatus,
    currentUserGroupLiveStatus,
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

  const raceBoardProps = useMemo(() => buildLiveMatchRaceBoardPageProps({
    matchMode,
    raceBoardViewModel,
  }), [matchMode, raceBoardViewModel]);

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
    onContinueSoloFromMatch,
  });

  const resultProps = useMemo(() => buildLiveMatchResultPageProps({
    matchMode,
    estimatedBonusPoints,
    duelRows,
    groupRows,
    groupStatusLabel,
  }), [
    duelRows,
    estimatedBonusPoints,
    groupRows,
    groupStatusLabel,
    matchMode,
  ]);

  const trackingStatsPageProps = useMemo(() => buildLiveMatchStatsPageProps({
    page,
    trackingPageProps,
  }), [page, trackingPageProps]);

  const livePagesProps = useMemo(() => buildLiveMatchPagesProps({
    scrollRef,
    page,
    pageWidth,
    hasResultPage,
    arenaProps,
    raceBoardProps,
    trackingStatsPageProps,
    resultProps,
    onPageChange,
  }), [
    arenaProps,
    hasResultPage,
    onPageChange,
    page,
    pageWidth,
    raceBoardProps,
    resultProps,
    scrollRef,
    trackingStatsPageProps,
  ]);

  return {
    livePagesProps,
    trackingPageProps,
  };
}
