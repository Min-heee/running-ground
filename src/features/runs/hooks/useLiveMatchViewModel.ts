import { useMemo } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import type {
  LiveMatchArenaPageProps,
} from '@/features/runs/components/LiveMatchArenaPage';
import type {
  LiveMatchPagesProps,
} from '@/features/runs/components/LiveMatchPages';
import type {
  LiveMatchRaceBoardPageProps,
} from '@/features/runs/components/LiveMatchRaceBoardPage';
import type {
  LiveMatchResultPageProps,
} from '@/features/runs/components/LiveMatchResultPage';
import type {
  LiveMatchMetricLabels,
  LiveMatchTrackingPageProps,
} from '@/features/runs/components/LiveMatchTrackingPage';
import { formatDuration } from '@/features/runs/tracking';
import {
  formatCadence,
  formatElevation,
  formatMetricDistance,
} from '@/features/runs/trackingSession';
import {
  buildLiveMatchArenaViewModel,
  type LiveMatchArenaViewModelInput,
} from '@/features/runs/liveMatchArenaViewModel';
import {
  buildLiveMatchRaceBoardViewModel,
  type LiveMatchRaceBoardViewModelInput,
} from '@/features/runs/liveMatchRaceBoardViewModel';

type LiveMatchTrackingInputProps = Omit<LiveMatchTrackingPageProps, 'includeMatchCards' | 'metricLabels'>;
type LiveMatchTrackingViewProps = Omit<LiveMatchTrackingPageProps, 'includeMatchCards'>;

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

  const arenaProps = useMemo<LiveMatchArenaPageProps>(() => ({
    viewModel: arenaViewModel,
    onLiveMatchMounted,
  }), [arenaViewModel, onLiveMatchMounted]);

  const raceBoardViewModel = useMemo(() => buildLiveMatchRaceBoardViewModel({
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
  }), [
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
    roomLinkedDuelPlaceholderParticipants,
    roomLinkedGroupPlaceholderParticipants,
    syncedDuelDistanceKm,
    syncedDuelOpponentDistanceKm,
    visibleMatchRoom,
  ]);

  const raceBoardProps = useMemo<LiveMatchRaceBoardPageProps>(() => ({
    matchMode,
    viewModel: raceBoardViewModel,
  }), [matchMode, raceBoardViewModel]);

  const metricLabels = useMemo<LiveMatchMetricLabels>(() => ({
    elapsedLabel: formatDuration(elapsedSeconds),
    distanceLabel: formatMetricDistance(distanceKm),
    averagePaceLabel: averagePace,
    currentPaceLabel: currentPace,
    cadenceLabel: formatCadence(cadenceSpm),
    elevationLabel: formatElevation(elevationGainM),
  }), [
    averagePace,
    cadenceSpm,
    currentPace,
    distanceKm,
    elapsedSeconds,
    elevationGainM,
  ]);

  const trackingPageProps = useMemo<LiveMatchTrackingViewProps>(() => ({
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
    metricLabels,
    onContinueSoloFromMatch,
  }), [
    averagePace,
    cadenceSpm,
    currentGroupLeader,
    currentGroupStanding,
    currentPace,
    distanceKm,
    duelDistanceKm,
    duelLiveSummary,
    duelLiveTitle,
    duelStatusAlert,
    effectiveDuelOpponent,
    effectiveGroupParticipantCount,
    elapsedSeconds,
    elevationGainM,
    groupAheadParticipant,
    groupBehindParticipant,
    groupLiveStandings,
    groupStatusAlert,
    isLeavingDuelMatch,
    isLeavingGroupMatch,
    liveMatchText,
    liveMatchTitle,
    matchMode,
    metricLabels,
    onContinueSoloFromMatch,
  ]);

  const resultProps = useMemo<LiveMatchResultPageProps>(() => ({
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

  const livePagesProps = useMemo<Omit<LiveMatchPagesProps, 'exitAction'>>(() => ({
    scrollRef,
    page,
    pageWidth,
    hasResultPage,
    arenaProps,
    raceBoardProps: page === 1 ? raceBoardProps : null,
    trackingProps: page === 2 ? { ...trackingPageProps, includeMatchCards: false } : null,
    resultProps: page === 3 ? resultProps : null,
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
    trackingPageProps,
  ]);

  return {
    livePagesProps,
    trackingPageProps,
  };
}
