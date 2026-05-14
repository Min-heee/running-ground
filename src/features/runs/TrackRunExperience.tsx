import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { type Href, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { MatchStartCountdownOverlay } from '@/components/matches/MatchStartCountdownOverlay';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { LiveMatchContainer } from '@/features/runs/components/LiveMatchContainer';
import { LiveMatchExitActionCard } from '@/features/runs/components/LiveMatchExitActionCard';
import type { MatchOptionItem } from '@/features/runs/components/MatchOptionSelector';
import { RunningReadyScreen } from '@/features/runs/components/RunningReadyScreen';
import { useRunTrackingController } from '@/features/runs/hooks/useRunTrackingController';
import { useRunSaveFlow } from '@/features/runs/hooks/useRunSaveFlow';
import { usePartyRunRoom } from '@/features/runs/hooks/usePartyRunRoom';
import {
  useMatchLifecycle,
  type RunMatchMode,
} from '@/features/runs/hooks/useMatchLifecycle';
import { useMatchResultController } from '@/features/runs/hooks/useMatchResultController';
import { useLiveMatchProgress } from '@/features/runs/hooks/useLiveMatchProgress';
import { useForfeitController } from '@/features/runs/hooks/useForfeitController';
import { useAndroidLiveMatchDisplayFrame } from '@/features/runs/hooks/useAndroidLiveMatchDisplayFrame';
import { useAndroidLiveMatchStartupGate } from '@/features/runs/hooks/useAndroidLiveMatchStartupGate';
import { usePartyRunSync } from '@/features/runs/hooks/usePartyRunSync';
import { useMatchRoomSelectionSync } from '@/features/runs/hooks/useMatchRoomSelectionSync';
import { useLiveMatchNavigationEffects } from '@/features/runs/hooks/useLiveMatchNavigationEffects';
import { useMatchSelectionModel } from '@/features/runs/hooks/useMatchSelectionModel';
import { useMatchEntryEffects } from '@/features/runs/hooks/useMatchEntryEffects';
import { useMatchCountdownModel } from '@/features/runs/hooks/useMatchCountdownModel';
import { useRunTrackingFlow } from '@/features/runs/hooks/useRunTrackingFlow';
import { useRunningMatchFocus } from '@/features/runs/hooks/useRunningMatchFocus';
import { useBlockingMatchStatusPolling } from '@/features/runs/hooks/matchPolling/useBlockingMatchStatusPolling';
import { useStaleMatchCleanup } from '@/features/runs/hooks/matchPolling/useStaleMatchCleanup';
import { useUpcomingMatchPolling } from '@/features/runs/hooks/matchPolling/useUpcomingMatchPolling';
import { useSyncedCountdownTicker } from '@/features/runs/hooks/navigationEffects/useSyncedCountdownTicker';
import { useTrackRunNotificationSync } from '@/features/runs/hooks/useTrackRunNotificationSync';
import {
  acknowledgeRunningMatchRoomCountdown,
  cancelRunningMatch,
  createRunningMatchRoom,
  fetchFriendLeaderboard,
  fetchMatchDemandSummary,
  fetchUpcomingRunningMatches,
  fetchRunningMatchStatus,
  getApiErrorMessage,
  joinRunningMatchRoom,
  leaveRunningMatchRoom,
  requestDuelMatch,
  requestGroupMatch,
} from '@/services';
import {
  getRunningMatchBlockerFromError,
  runStaleRoomCleanupWithTimeout,
} from '@/features/runs/staleRoomCleanup';
import { runActiveRoomCheck } from '@/features/runs/activeRoomCheck';
import {
  buildActiveRoomResultLogDetail,
  buildActiveRoomSnapshotKey,
} from '@/features/runs/activeRoomResult';
import {
  shouldAutoOpenMatchArena,
} from '@/lib/matchCountdown';
import {
  type RunningMatchStatusResponse,
  type UpcomingRunningMatchItem,
} from '@/lib/api/types';
import {
  formatMatchExpiryCountdown,
} from '@/features/runs/matchScheduling';
import {
  buildAverageArenaPaceLabel,
  buildParticipantAveragePaceLabel,
  isMeasuredPaceLabel,
} from '@/features/runs/matchProgress';
import {
  LIVE_MATCH_ROOM_IDLE_POLL_MS,
  LIVE_MATCH_SERVER_SYNC_INTERVAL_MS,
  LIVE_MATCH_STATUS_IDLE_POLL_MS,
} from '@/features/runs/liveMatchCadence';
import {
  buildDuelArenaParticipants,
  buildGroupArenaParticipants,
  buildRoomLinkedDuelPlaceholderParticipants,
  buildRoomLinkedGroupPlaceholderParticipants,
} from '@/features/runs/matchViewModels';
import {
  buildMatchTransitionNotice,
  isLiveMatchState,
  type PartyRunLinkedMatchContext,
  shouldUseCenteredMatchCountdown,
  shouldUseFullscreenMatchCountdown,
} from '@/features/runs/matchStateMachine';
import { isMatchRoomExiting } from '@/features/runs/matchRoomExitGuard';
import { shouldAcceptServerSnapshot } from '@/features/runs/serverClockSync';
import { getCurrentUserProfile } from '@/lib/session';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

const STALE_RENDER_MATCHED_MATCH_MS = 10 * 60 * 1000;
const STALE_RENDER_ACTIVE_MATCH_MS = 8 * 60 * 60 * 1000;
const OFFICIAL_START_DISTANCE_NOISE_GRACE_SECONDS = 5;
const OFFICIAL_START_DISTANCE_NOISE_GRACE_KM = 0.05;
const SOLO_START_COUNTDOWN_SECONDS = 5;
const MATCH_ROOM_FAST_POLL_MS = LIVE_MATCH_SERVER_SYNC_INTERVAL_MS;
const MATCH_ROOM_IDLE_POLL_MS = LIVE_MATCH_ROOM_IDLE_POLL_MS;
const MATCH_STATUS_FAST_POLL_MS = LIVE_MATCH_SERVER_SYNC_INTERVAL_MS;
const MATCH_STATUS_IDLE_POLL_MS = LIVE_MATCH_STATUS_IDLE_POLL_MS;

function shouldHidePastUpcomingMatch(
  match: Pick<UpcomingRunningMatchItem, 'slotStartAt' | 'status'>,
  nowMs: number,
) {
  const slotStartMs = new Date(match.slotStartAt).getTime();

  if (!Number.isFinite(slotStartMs)) {
    return false;
  }

  const elapsedMs = nowMs - slotStartMs;

  if (match.status === 'active') {
    return elapsedMs > STALE_RENDER_ACTIVE_MATCH_MS;
  }

  return elapsedMs > STALE_RENDER_MATCHED_MATCH_MS;
}

type TrackRunMode = 'tab' | 'stack';
type RoomLinkedMatchContext = PartyRunLinkedMatchContext;

export function TrackRunExperience({
  mode,
  focusMatchMode,
  focusMatchId,
  focusMatchDistanceKm,
  focusMatchSlotStartAt,
  focusMatchIsTest,
  focusMatchNonce,
  forceMatchArena,
  roomInviteToken,
}: {
  mode: TrackRunMode;
  focusMatchMode?: Extract<RunMatchMode, 'duel' | 'group'>;
  focusMatchId?: string;
  focusMatchDistanceKm?: number;
  focusMatchSlotStartAt?: string;
  focusMatchIsTest?: boolean;
  focusMatchNonce?: string;
  forceMatchArena?: boolean;
  roomInviteToken?: string;
}) {
  useDevRenderCounter('TrackRunExperience');
  useEffect(() => {
    rgPerfMark('TrackRunExperience mount', {
      focusMatchId: focusMatchId ?? null,
      focusMatchMode: focusMatchMode ?? null,
      mode,
    });

    return () => {
      rgPerfMark('TrackRunExperience unmount', {
        mode,
      });
    };
  }, [focusMatchId, focusMatchMode, mode]);

  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const currentUser = getCurrentUserProfile();
  const currentUserId = currentUser?.publicTag ?? 'mock-current-user';
  const {
    pedometerSubscriptionRef,
    timerRef,
    soloStartCountdownTimerRef,
    soloStartCountdownResolveRef,
    routeRef,
    elapsedSecondsRef,
    totalStepsRef,
    pedometerStepOffsetRef,
    liveShareEnabledRef,
    liveShareLabelRef,
    liveShareHeartbeatRef,
    matchProgressHeartbeatRef,
    appStateRef,
    trackerStatusRef,
    officialStartBaselineRef,
    status,
    setStatus,
    soloStartCountdownSeconds,
    setSoloStartCountdownSeconds,
    setRoute,
    distanceKm,
    setDistanceKm,
    elapsedSeconds,
    setElapsedSeconds,
    currentPace,
    setCurrentPace,
    lastSyncedMatchProgress,
    setLastSyncedMatchProgress,
    elevationGainM,
    setElevationGainM,
    cadenceSpm,
    setCadenceSpm,
    setLocationPermissionGranted,
    setBackgroundLocationPermissionGranted,
    setMotionPermissionGranted,
    error,
    setError,
    liveShareEnabled,
    liveShareLabel,
    setLiveShareLabel,
    averagePace,
    isIdle,
    isStarting,
    isRunning,
    isPaused,
    isSaving,
  } = useRunTrackingController();
  const livePagerRef = useRef<ScrollView | null>(null);
  const matchModeRef = useRef<RunMatchMode>('duel');
  const duelMatchStatusRef = useRef<RunningMatchStatusResponse | null>(null);
  const groupMatchStatusRef = useRef<RunningMatchStatusResponse | null>(null);
  const roomLinkedMatchContextRef = useRef<RoomLinkedMatchContext | null>(null);
  const focusedDuelMatchIdRef = useRef<string | null>(null);
  const focusedGroupMatchIdRef = useRef<string | null>(null);
  const latestDuelStatusServerNowMsRef = useRef(0);
  const latestGroupStatusServerNowMsRef = useRef(0);
  const latestUpcomingServerNowMsRef = useRef(0);
  const latestMatchRoomServerNowMsRef = useRef(0);
  const isMountedRef = useRef(true);

  const {
    matchMode,
    setMatchMode,
    duelDistanceText,
    setDuelDistanceText,
    showDuelCustomDistanceInput,
    setShowDuelCustomDistanceInput,
    selectedDuelSlotStartAt,
    setSelectedDuelSlotStartAt,
    selectedDuelDateKey,
    setSelectedDuelDateKey,
    selectedDuelTimeSection,
    setSelectedDuelTimeSection,
    isRequestingDuelMatch,
    setIsRequestingDuelMatch,
    duelMatchResult,
    setDuelMatchResult,
    duelMatchStatus,
    setDuelMatchStatus,
    isCancelingDuelMatch,
    setIsCancelingDuelMatch,
    isLeavingDuelMatch,
    setIsLeavingDuelMatch,
    setDuelDemandSummary,
    setIsLoadingDuelDemandSummary,
    duelMatchNotice,
    setDuelMatchNotice,
    groupDistanceText,
    setGroupDistanceText,
    showGroupCustomDistanceInput,
    setShowGroupCustomDistanceInput,
    selectedGroupSlotStartAt,
    setSelectedGroupSlotStartAt,
    selectedGroupDateKey,
    setSelectedGroupDateKey,
    selectedGroupTimeSection,
    setSelectedGroupTimeSection,
    isRequestingGroupMatch,
    setIsRequestingGroupMatch,
    groupMatchResult,
    setGroupMatchResult,
    groupMatchStatus,
    setGroupMatchStatus,
    isCancelingGroupMatch,
    setIsCancelingGroupMatch,
    isLeavingGroupMatch,
    setIsLeavingGroupMatch,
    groupDemandSummary,
    setGroupDemandSummary,
    isLoadingGroupDemandSummary,
    setIsLoadingGroupDemandSummary,
    groupMatchNotice,
    setGroupMatchNotice,
    upcomingMatches,
    setUpcomingMatches,
    matchRemindersEnabled,
    setMatchRemindersEnabled,
    cancelingUpcomingMatchId,
    setCancelingUpcomingMatchId,
    nowMs,
    setNowMs,
    syncedNowMs,
    serverClockOffsetMsRef,
    syncServerClock,
    getSyncedNowMs,
    liveArenaPage,
    setLiveArenaPage,
    forceOpenActiveMatch,
    setForceOpenActiveMatch,
    isResolvingFocusedMatch,
    setIsResolvingFocusedMatch,
    duelDistanceKm,
    groupDistanceKm,
    duelDateOptions,
    groupDateOptions,
    selectedDuelSlot,
    selectedGroupSlot,
    visibleDuelSlotOptions,
    visibleGroupSlotOptions,
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    duelMatchState,
    groupMatchState,
    focusRequestedDuelTest,
    focusRequestedGroupTest,
    isDuelTestFlow,
    isGroupTestFlow,
    effectiveGroupParticipants,
    effectiveGroupParticipantCount,
    effectiveGroupSeedRank,
    selectNextDuelSlotForDate,
    selectNextGroupSlotForDate,
    selectDuelTimeSection,
    selectGroupTimeSection,
  } = useMatchLifecycle({ focusMatchMode, focusMatchIsTest });
  const pendingForfeitMatchRef = useRef<string | null>(null);
  const pendingCounterpartForfeitResultRef = useRef(false);
  const autoStartedMatchIdRef = useRef<string | null>(null);
  const autoStartingMatchTrackingRef = useRef(false);
  const preStartWarmupMatchIdRef = useRef<string | null>(null);
  const forfeitedMatchIdsRef = useRef<Set<string>>(new Set());
  const joinMatchRoomInFlightRef = useRef(false);
  const lastHandledActiveRoomSnapshotKeyRef = useRef<string | null>(null);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const {
    matchRoom,
    commitMatchRoom,
    visibleMatchRoom,
    currentRoomParticipant,
    roomMatchMode,
    setRoomMatchMode,
    roomStartMode,
    setRoomStartMode,
    roomMaxParticipants,
    setRoomMaxParticipants,
    roomInviteTokenInput,
    setRoomInviteTokenInput,
    setSelectedRoomFriendIds,
    setFriendLeaderboard,
    isCreatingMatchRoom,
    setIsCreatingMatchRoom,
    isJoiningMatchRoom,
    setIsJoiningMatchRoom,
    isLeavingMatchRoom,
    setIsLeavingMatchRoom,
  } = usePartyRunRoom({
    currentUserId,
    syncedNowMs,
    staleMatchedMatchMs: STALE_RENDER_MATCHED_MATCH_MS,
    staleActiveMatchMs: STALE_RENDER_ACTIVE_MATCH_MS,
  });

  useMatchRoomSelectionSync({
    matchRoom,
    onRoomModeChange: setRoomMatchMode,
    onRoomStartModeChange: setRoomStartMode,
    onRoomMaxParticipantsChange: setRoomMaxParticipants,
    onSelectedRoomFriendIdsChange: setSelectedRoomFriendIds,
    onRoomInviteTokenInputChange: setRoomInviteTokenInput,
    onDuelDistanceTextChange: setDuelDistanceText,
    onDuelSlotStartAtChange: setSelectedDuelSlotStartAt,
    onDuelDateKeyChange: setSelectedDuelDateKey,
    onDuelTimeSectionChange: setSelectedDuelTimeSection,
    onGroupDistanceTextChange: setGroupDistanceText,
    onGroupSlotStartAtChange: setSelectedGroupSlotStartAt,
    onGroupDateKeyChange: setSelectedGroupDateKey,
    onGroupTimeSectionChange: setSelectedGroupTimeSection,
  });

  const visibleUpcomingMatches = useMemo(
    () => upcomingMatches.filter((match) => !shouldHidePastUpcomingMatch(match, syncedNowMs)),
    [syncedNowMs, upcomingMatches],
  );
  const {
    matchOptions,
    canCreateDuelMatch,
    canCreateGroupMatch,
    blockingMatchHelperText,
    duelReservationLocked,
    groupReservationLocked,
    effectiveDuelOpponent,
    effectiveDuelOpponentStatusLabel,
    effectiveDuelSlotLabel,
    effectiveGroupSlotLabel,
    duelNeedsManualRematch,
    groupNeedsManualRematch,
    liveMatchTitle,
    liveMatchText,
    readyActionLabel,
  } = useMatchSelectionModel({
    matchMode,
    duelDistanceKm,
    groupDistanceKm,
    roomMatchMode,
    roomStartMode,
    visibleMatchRoom,
    visibleUpcomingMatches,
    duelMatchState,
    groupMatchState,
    duelMatchStatus,
    groupMatchStatus,
    duelMatchResult,
    groupMatchResult,
    selectedDuelSlot,
    selectedGroupSlot,
    duelMatchNotice,
    groupMatchNotice,
    effectiveGroupParticipantCount,
    effectiveGroupSeedRank,
  });
  const duelExpiryCountdownLabel = formatMatchExpiryCountdown(duelMatchStatus?.expiresInSeconds);
  const groupExpiryCountdownLabel = formatMatchExpiryCountdown(groupMatchStatus?.expiresInSeconds);
  const visibleMatchRoomIsInviteOnly = Boolean(visibleMatchRoom?.joined === false);
  const {
    duelStartCountdownSeconds,
    groupStartCountdownSeconds,
    roomCountdownRemainingSeconds,
    visiblePartyRunFlow,
    matchRoomFlow,
    roomCountdownEntry,
    visibleCountdownEntry,
    nextStartingMatch,
    activeUpcomingMatch,
    shouldShowRoomArmingOverlay,
  } = useMatchCountdownModel({
    matchMode,
    nowMs,
    syncedNowMs,
    visibleUpcomingMatches,
    duelMatchState,
    groupMatchState,
    duelMatchStatus,
    groupMatchStatus,
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    visibleMatchRoom,
    matchRoom,
    currentRoomParticipantIsCountdownReady: currentRoomParticipant?.isCountdownReady,
  });
  const roomLinkedMatchContext = visiblePartyRunFlow.linkedMatchContext;
  const liveMatchStartupIdentity = useMemo(() => {
    if (matchMode === 'duel') {
      return duelMatchStatus?.matchId
        ?? (roomLinkedMatchContext?.mode === 'duel' ? roomLinkedMatchContext.matchId : null)
        ?? null;
    }

    if (matchMode === 'group') {
      return groupMatchStatus?.matchId
        ?? (roomLinkedMatchContext?.mode === 'group' ? roomLinkedMatchContext.matchId : null)
        ?? null;
    }

    return null;
  }, [
    duelMatchStatus?.matchId,
    groupMatchStatus?.matchId,
    matchMode,
    roomLinkedMatchContext?.matchId,
    roomLinkedMatchContext?.mode,
  ]);
  const shouldStageAndroidLiveMatchStartup = Boolean(
    liveMatchStartupIdentity
    && matchMode !== 'solo'
    && matchMode !== 'room'
    && (
      isRunning
      || forceOpenActiveMatch
      || visiblePartyRunFlow.shouldOpenArena
      || (matchMode === 'duel' && (
        duelMatchState === 'active'
        || shouldAutoOpenMatchArena(duelStartCountdownSeconds)
        || roomLinkedMatchContext?.mode === 'duel'
      ))
      || (matchMode === 'group' && (
        groupMatchState === 'active'
        || shouldAutoOpenMatchArena(groupStartCountdownSeconds)
        || roomLinkedMatchContext?.mode === 'group'
      ))
    ),
  );
  const androidLiveMatchStartup = useAndroidLiveMatchStartupGate({
    active: shouldStageAndroidLiveMatchStartup,
    identity: liveMatchStartupIdentity,
  });
  const liveMatchHeavyWorkReady = androidLiveMatchStartup.ready;
  const rawLiveMatchDisplayFrame = useMemo(
    () => ({
      distanceKm,
      elapsedSeconds,
      currentPace,
      averagePace,
      cadenceSpm,
      elevationGainM,
    }),
    [averagePace, cadenceSpm, currentPace, distanceKm, elapsedSeconds, elevationGainM],
  );
  const liveMatchDisplayFrame = useAndroidLiveMatchDisplayFrame(
    rawLiveMatchDisplayFrame,
    isRunning && (matchMode === 'duel' || matchMode === 'group'),
  );
  const liveMatchDisplayDistanceKm = liveMatchDisplayFrame.distanceKm;
  const liveMatchDisplayElapsedSeconds = liveMatchDisplayFrame.elapsedSeconds;
  const {
    groupLiveStandings,
    currentGroupStanding,
    currentUserDuelLiveStatus,
    currentUserGroupLiveStatus,
    currentUserHasForfeitedActiveMatch,
    currentGroupLeader,
    groupAheadParticipant,
    groupBehindParticipant,
    featuredGroupArenaParticipantIds,
    isDuelOpponentForfeited,
    officialDuelReady,
    duelComparisonSnapshot,
    syncedDuelDistanceKm,
    syncedDuelOpponentDistanceKm,
    duelLiveGapKm,
    duelLiveTitle,
    duelStatusAlert,
    groupStatusAlert,
  } = useLiveMatchProgress({
    matchMode,
    duelMatchStatus,
    groupMatchStatus,
    visibleMatchRoom,
    effectiveDuelOpponent,
    effectiveGroupParticipants,
    effectiveGroupSeedRank,
    lastSyncedMatchProgress,
    distanceKm: liveMatchDisplayDistanceKm,
    elapsedSeconds: liveMatchDisplayElapsedSeconds,
    duelDistanceKm,
    groupDistanceKm,
    deferRankingCalculations: !liveMatchHeavyWorkReady,
  });
  const isTabMode = mode === 'tab';
  const liveArenaPageWidth = Math.max(windowWidth - 32, 280);
  const hasRoomLinkedDuelContext = roomLinkedMatchContext?.mode === 'duel';
  const hasRoomLinkedGroupContext = roomLinkedMatchContext?.mode === 'group';
  const duelArenaUsesLivePace = Boolean(
    matchMode === 'duel'
    && (
      duelMatchState === 'active'
      || (roomLinkedMatchContext?.mode === 'duel' && roomLinkedMatchContext.state === 'active')
    ),
  );
  const groupArenaUsesLivePace = Boolean(
    matchMode === 'group'
    && (
      groupMatchState === 'active'
      || (roomLinkedMatchContext?.mode === 'group' && roomLinkedMatchContext.state === 'active')
    ),
  );
  const officialCurrentAveragePace = useMemo(() => (
    matchMode === 'duel'
      ? duelMatchStatus?.officialComparison?.userAveragePace
      : matchMode === 'group'
        ? groupMatchStatus?.officialComparison?.userAveragePace
        : null
  ), [
    duelMatchStatus?.officialComparison?.userAveragePace,
    groupMatchStatus?.officialComparison?.userAveragePace,
    matchMode,
  ]);
  const currentUserArenaPace = useMemo(() => (
    isMeasuredPaceLabel(officialCurrentAveragePace)
      ? officialCurrentAveragePace!
      : buildAverageArenaPaceLabel(
          liveMatchDisplayDistanceKm,
          liveMatchDisplayElapsedSeconds,
          duelArenaUsesLivePace || groupArenaUsesLivePace,
        )
  ), [
    duelArenaUsesLivePace,
    groupArenaUsesLivePace,
    liveMatchDisplayDistanceKm,
    liveMatchDisplayElapsedSeconds,
    officialCurrentAveragePace,
  ]);
  const {
    trackedMatchResult,
    estimatedMatchBonusPoints,
    duelResultRows,
    groupResultRows,
    groupResultStatusLabel,
  } = useMatchResultController({
    matchMode,
    effectiveDuelOpponent,
    currentGroupStanding,
    effectiveGroupParticipantCount,
    groupLiveStandings,
    currentUserArenaPace,
    currentUserDuelLiveStatus,
    distanceKm,
    duelDistanceKm,
    groupDistanceKm,
    elapsedSeconds,
  });
  const hasMatchResultPage = isPaused && matchMode !== 'solo' && Boolean(trackedMatchResult);
  const effectiveDuelOpponentArenaPace = useMemo(
    () => buildParticipantAveragePaceLabel(effectiveDuelOpponent, duelArenaUsesLivePace),
    [duelArenaUsesLivePace, effectiveDuelOpponent],
  );
  const duelLiveSummary = useMemo(() => (
    effectiveDuelOpponent
      ? isDuelOpponentForfeited
        ? `${effectiveDuelOpponent.name}님 · 기권`
        : `${effectiveDuelOpponent.name}님${effectiveDuelOpponentArenaPace ? ` · ${effectiveDuelOpponentArenaPace}` : ''}${effectiveDuelOpponentStatusLabel ? ` · ${effectiveDuelOpponentStatusLabel}` : ''}`
      : '상대 러너 정보를 불러오는 중이에요.'
  ), [
    effectiveDuelOpponent,
    effectiveDuelOpponentArenaPace,
    effectiveDuelOpponentStatusLabel,
    isDuelOpponentForfeited,
  ]);
  const duelArenaParticipants = useMemo(
    () => buildDuelArenaParticipants({
      currentUserPaceLabel: currentUserArenaPace,
      currentUserLiveStatus: currentUserDuelLiveStatus ?? undefined,
      currentDistanceKm: syncedDuelDistanceKm,
      opponent: effectiveDuelOpponent,
      opponentPaceLabel: effectiveDuelOpponentArenaPace,
      opponentDistanceKm: syncedDuelOpponentDistanceKm,
      liveGapKm: duelLiveGapKm,
    }),
    [
      currentUserArenaPace,
      currentUserDuelLiveStatus,
      duelLiveGapKm,
      effectiveDuelOpponent,
      effectiveDuelOpponentArenaPace,
      syncedDuelDistanceKm,
      syncedDuelOpponentDistanceKm,
    ],
  );
  const roomLinkedDuelPlaceholderParticipants = useMemo(() => buildRoomLinkedDuelPlaceholderParticipants({
    room: visibleMatchRoom,
    hasRoomLinkedDuelContext,
    currentUserId,
    currentDistanceKm: liveMatchDisplayDistanceKm,
    currentUserPaceLabel: currentUserArenaPace,
    opponent: effectiveDuelOpponent,
    roomLinkedMatchContext,
  }), [
    currentUserArenaPace,
    currentUserId,
    effectiveDuelOpponent,
    hasRoomLinkedDuelContext,
    liveMatchDisplayDistanceKm,
    roomLinkedMatchContext,
    visibleMatchRoom,
  ]);
  const {
    roomLinkedDuelCurrentParticipant,
    roomLinkedDuelOpponentParticipant,
    roomLinkedDuelGapKm,
    hasRoomLinkedDuelLiveProgress,
  } = useMemo(() => {
    const currentParticipant = roomLinkedDuelPlaceholderParticipants.find((participant) => participant.isCurrentUser) ?? null;
    const opponentParticipant = roomLinkedDuelPlaceholderParticipants.find((participant) => !participant.isCurrentUser) ?? null;
    const gapKm = currentParticipant && opponentParticipant
      ? Number((currentParticipant.distanceKm - opponentParticipant.distanceKm).toFixed(2))
      : null;
    const hasLiveProgress = Boolean(
      currentParticipant
      && opponentParticipant
      && (
        currentParticipant.distanceKm > 0
        || opponentParticipant.distanceKm > 0
      ),
    );

    return {
      roomLinkedDuelCurrentParticipant: currentParticipant,
      roomLinkedDuelOpponentParticipant: opponentParticipant,
      roomLinkedDuelGapKm: gapKm,
      hasRoomLinkedDuelLiveProgress: hasLiveProgress,
    };
  }, [roomLinkedDuelPlaceholderParticipants]);
  const groupArenaParticipants = useMemo(
    () => buildGroupArenaParticipants({
      standings: groupLiveStandings,
      currentUserPaceLabel: currentUserArenaPace,
      hasOfficialStart: groupArenaUsesLivePace,
      featuredParticipantIds: featuredGroupArenaParticipantIds,
    }),
    [currentUserArenaPace, featuredGroupArenaParticipantIds, groupArenaUsesLivePace, groupLiveStandings],
  );
  const roomLinkedGroupPlaceholderParticipants = useMemo(() => buildRoomLinkedGroupPlaceholderParticipants({
    room: visibleMatchRoom,
    hasRoomLinkedGroupContext,
    currentUserId,
    currentDistanceKm: liveMatchDisplayDistanceKm,
    currentUserPaceLabel: currentUserArenaPace,
    effectiveGroupParticipants,
    roomLinkedMatchContext,
  }), [
    currentUserArenaPace,
    currentUserId,
    effectiveGroupParticipants,
    hasRoomLinkedGroupContext,
    liveMatchDisplayDistanceKm,
    roomLinkedMatchContext,
    visibleMatchRoom,
  ]);
  const duelShouldOpenCountdownArena = duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds);
  const groupShouldOpenCountdownArena = groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds);
  const roomShouldOpenCountdownArena = Boolean(
    visibleMatchRoom?.linkedMatchId
    && (visiblePartyRunFlow.shouldOpenArena || forceOpenActiveMatch),
  );
  const duelShouldHoldArenaDuringActivation = duelMatchState === 'matched' && forceOpenActiveMatch;
  const groupShouldHoldArenaDuringActivation = groupMatchState === 'matched' && forceOpenActiveMatch;
  const runningMatchIdentity = matchMode === 'duel'
    ? duelMatchStatus?.matchId
      ?? (roomLinkedMatchContext?.mode === 'duel' ? roomLinkedMatchContext.matchId : null)
      ?? lastSyncedMatchProgress?.matchId
      ?? null
    : matchMode === 'group'
      ? groupMatchStatus?.matchId
        ?? (roomLinkedMatchContext?.mode === 'group' ? roomLinkedMatchContext.matchId : null)
        ?? lastSyncedMatchProgress?.matchId
        ?? null
      : null;
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
    && runningMatchIdentity
    && matchMode !== 'solo'
    && matchMode !== 'room'
    && !currentUserHasForfeitedActiveMatch,
  );
  const showLiveArena =
    (canRenderLiveArena || shouldKeepRunningMatchArena)
    && !currentUserHasForfeitedActiveMatch
    && (
      isRunning
      || hasMatchResultPage
      || forceOpenActiveMatch
      || (status === 'idle' && (
        duelShouldOpenCountdownArena
        || groupShouldOpenCountdownArena
        || roomShouldOpenCountdownArena
        || (matchMode === 'duel' && isDuelTestFlow)
        || (matchMode === 'group' && isGroupTestFlow)
      ))
    );
  const shouldEnableMatchProgressHeartbeat = Boolean(
    liveMatchHeavyWorkReady
    && isRunning
    && runningMatchIdentity
    && (matchMode === 'duel' || matchMode === 'group')
    && !currentUserHasForfeitedActiveMatch,
  );
  const activeMatchExitSource =
    currentUserHasForfeitedActiveMatch
      ? null
      : isRunning && matchMode === 'duel'
      ? (
          (duelMatchStatus?.matchId && isLiveMatchState(duelMatchState))
          || roomLinkedMatchContext?.mode === 'duel'
            ? 'duel'
            : null
        )
      : isRunning && matchMode === 'group'
        ? (
            (groupMatchStatus?.matchId && isLiveMatchState(groupMatchState))
            || roomLinkedMatchContext?.mode === 'group'
              ? 'group'
              : null
          )
        : null;
  const activeMatchExitIsTest = activeMatchExitSource === 'duel'
    ? isDuelTestFlow
    : activeMatchExitSource === 'group'
      ? isGroupTestFlow
      : false;
  const activeMatchExitIsLeaving = activeMatchExitSource === 'duel'
    ? isLeavingDuelMatch
    : activeMatchExitSource === 'group'
      ? isLeavingGroupMatch
      : false;
  const activeMatchExitCounterpartForfeited = activeMatchExitSource === 'duel'
    ? Boolean(
        isDuelOpponentForfeited
        || roomLinkedDuelPlaceholderParticipants.some((participant) => !participant.isCurrentUser && participant.liveStatus === 'forfeited'),
      )
    : false;
  const duelCompatibleCount = duelMatchStatus?.competitiveParticipantsCount ?? 0;
  const duelWaitingHasOtherApplicants = (duelMatchStatus?.participantCount ?? 0) > 1;
  const duelWaitingTitle = isDuelTestFlow
    ? duelWaitingHasOtherApplicants
      ? duelCompatibleCount >= 2
        ? '테스트 상대를 정리하는 중이에요'
        : '테스트 신청은 들어왔지만 아직 세션을 만드는 중이에요'
      : '테스트 상대를 기다리는 중이에요'
    : duelWaitingHasOtherApplicants
    ? duelCompatibleCount >= 2
      ? '지금 바로 붙을 상대를 정리하는 중이에요'
      : '신청은 들어왔지만 아직 바로 붙이진 않았어요'
    : '비슷한 상대를 찾는 중이에요';
  const duelWaitingMeta = isDuelTestFlow
    ? duelWaitingHasOtherApplicants
      ? duelCompatibleCount >= 2
        ? `실제 신청 ${duelMatchStatus?.participantCount ?? 0}/${duelMatchStatus?.capacity ?? 2}명 · 바로 붙을 수 있는 테스트 상대 ${duelCompatibleCount}/${duelMatchStatus?.capacity ?? 2}명`
        : `실제 신청 ${duelMatchStatus?.participantCount ?? 0}/${duelMatchStatus?.capacity ?? 2}명 · 지금 바로 붙을 수 있는 테스트 상대 ${duelCompatibleCount}/${duelMatchStatus?.capacity ?? 2}명`
      : '다른 러너가 테스트 매칭을 누르면 바로 30초 카운트다운이 시작돼요.'
    : duelWaitingHasOtherApplicants
    ? duelCompatibleCount >= 2
      ? `실제 신청 ${duelMatchStatus?.participantCount ?? 0}/${duelMatchStatus?.capacity ?? 2}명 · 바로 붙을 수 있는 상대 ${duelCompatibleCount}/${duelMatchStatus?.capacity ?? 2}명`
      : `실제 신청 ${duelMatchStatus?.participantCount ?? 0}/${duelMatchStatus?.capacity ?? 2}명 · 지금 바로 붙을 수 있는 상대 ${duelCompatibleCount}/${duelMatchStatus?.capacity ?? 2}명`
    : '같은 거리와 시간대에서 먼저 찾기한 러너들 중 페이스와 레벨이 잘 맞는 상대를 찾고 있어요.';
  const duelWaitingHint = isDuelTestFlow
    ? duelWaitingHasOtherApplicants
      ? duelCompatibleCount >= 2
        ? '테스트 상대 세션이 정리되면 바로 30초 카운트다운이 시작돼요.'
        : '테스트 상대 세션을 만들고 있어요. 잠시만 기다리면 자동으로 30초 카운트다운이 시작돼요.'
      : '지금은 테스트 대기열에 들어간 상태예요. 다른 러너가 들어오면 자동으로 30초 카운트다운이 시작돼요.'
    : duelWaitingHasOtherApplicants
    ? duelCompatibleCount >= 2
      ? '잘 맞는 상대가 먼저 잡히면 바로 예약된 1대1로 바뀌어요.'
      : '페이스와 레벨이 실제로 잘 맞는 상대가 잡히면 자동으로 매치가 확정돼요.'
    : '지금은 먼저 대기열에 들어간 상태예요. 잘 맞는 상대가 잡히면 자동으로 매치가 확정돼요.';
  const backHref: Href = '/my-activity';
  const discardRedirectHref: Href | null = isTabMode ? null : '/my-activity';

  useEffect(() => {
    liveShareEnabledRef.current = liveShareEnabled;
  }, [liveShareEnabled]);

  useEffect(() => {
    liveShareLabelRef.current = liveShareLabel;
  }, [liveShareLabel]);

  useEffect(() => {
    trackerStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    matchModeRef.current = matchMode;
  }, [matchMode]);

  useEffect(() => {
    duelMatchStatusRef.current = duelMatchStatus;
  }, [duelMatchStatus]);

  useEffect(() => {
    groupMatchStatusRef.current = groupMatchStatus;
  }, [groupMatchStatus]);

  useEffect(() => {
    roomLinkedMatchContextRef.current = roomLinkedMatchContext;
  }, [roomLinkedMatchContext]);

  useAndroidDeferredEffect(() => {
    if (matchMode !== 'duel') {
      return;
    }

    setDuelMatchResult((current) => {
      if (!current) {
        return null;
      }

      if (current.isTestMatch) {
        return current;
      }

      const activeSlotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt;
      return current.distanceKm === duelDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setDuelMatchStatus((current) => {
      if (!current) {
        return null;
      }

      if (current.isTestMatch) {
        return current;
      }

      const activeSlotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt;
      return current.distanceKm === duelDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setDuelMatchNotice(null);
  }, [duelDistanceKm, matchMode, selectedDuelSlot, selectedDuelSlotStartAt]);

  useAndroidDeferredEffect(() => {
    if (matchMode !== 'group') {
      return;
    }

    setGroupMatchResult((current) => {
      if (!current) {
        return null;
      }

      if (current.isTestMatch) {
        return current;
      }

      const activeSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;
      return current.distanceKm === groupDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setGroupMatchStatus((current) => {
      if (!current) {
        return null;
      }

      if (current.isTestMatch) {
        return current;
      }

      const activeSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;
      return current.distanceKm === groupDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setGroupMatchNotice(null);
  }, [groupDistanceKm, matchMode, selectedGroupSlot, selectedGroupSlotStartAt]);

  useAndroidDeferredEffect(() => {
    if (matchMode !== 'duel') {
      return;
    }

    let canceled = false;
    setIsLoadingDuelDemandSummary(true);

    void fetchMatchDemandSummary({
      mode: 'duel',
      distanceKm: duelDistanceKm,
      slotStartAt: selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt,
    })
      .then((payload) => {
        if (!canceled) {
          setDuelDemandSummary(payload);
        }
      })
      .catch(() => {
        if (!canceled) {
          setDuelDemandSummary(null);
        }
      })
      .finally(() => {
        if (!canceled) {
          setIsLoadingDuelDemandSummary(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [matchMode, duelDistanceKm, selectedDuelSlot, selectedDuelSlotStartAt]);

  useAndroidDeferredEffect(() => {
    if (matchMode !== 'group') {
      return;
    }

    let canceled = false;
    setIsLoadingGroupDemandSummary(true);

    void fetchMatchDemandSummary({
      mode: 'group',
      distanceKm: groupDistanceKm,
      slotStartAt: selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt,
    })
      .then((payload) => {
        if (!canceled) {
          setGroupDemandSummary(payload);
        }
      })
      .catch(() => {
        if (!canceled) {
          setGroupDemandSummary(null);
        }
      })
      .finally(() => {
        if (!canceled) {
          setIsLoadingGroupDemandSummary(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [matchMode, groupDistanceKm, selectedGroupSlot, selectedGroupSlotStartAt]);

  const loadDuelMatchStatus = async (
    slotStartAt = activeDuelSlotStartAt,
    options?: { testMode?: boolean; distanceKm?: number; matchId?: string; forceAccept?: boolean },
  ) => {
    const payload = await fetchRunningMatchStatus({
      mode: 'duel',
      distanceKm: options?.distanceKm ?? duelDistanceKm,
      slotStartAt,
      testMode: options?.testMode ?? isDuelTestFlow,
      matchId: options?.matchId ?? focusedDuelMatchIdRef.current ?? undefined,
    });
    if (!options?.forceAccept && !shouldAcceptServerSnapshot(latestDuelStatusServerNowMsRef, payload.serverNow)) {
      return duelMatchStatus ?? payload;
    }

    syncServerClock(payload.serverNow);
    if (payload.matchId && forfeitedMatchIdsRef.current.has(payload.matchId)) {
      clearLocalDuelMatchState(null);
      return payload;
    }

    focusedDuelMatchIdRef.current = payload.state === 'idle' ? null : (payload.matchId ?? focusedDuelMatchIdRef.current);
    const transitionNotice = duelMatchStatus
      && duelMatchStatus.slotStartAt === payload.slotStartAt
      && Math.abs(duelMatchStatus.distanceKm - payload.distanceKm) < 0.15
      ? buildMatchTransitionNotice('duel', duelMatchStatus.state, payload.state)
      : null;

    if (payload.state === 'idle') {
      setDuelMatchResult(null);
    } else if (payload.state === 'waiting' && duelMatchStatus && duelMatchStatus.state !== 'waiting') {
      setDuelMatchResult(null);
    }

    if (transitionNotice) {
      setDuelMatchNotice(transitionNotice);
    } else if (payload.state !== 'idle') {
      setDuelMatchNotice(null);
    }

    setDuelMatchStatus(payload);
    return payload;
  };

  const loadGroupMatchStatus = async (
    slotStartAt = activeGroupSlotStartAt,
    options?: { testMode?: boolean; distanceKm?: number; matchId?: string; forceAccept?: boolean },
  ) => {
    const payload = await fetchRunningMatchStatus({
      mode: 'group',
      distanceKm: options?.distanceKm ?? groupDistanceKm,
      slotStartAt,
      testMode: options?.testMode ?? isGroupTestFlow,
      matchId: options?.matchId ?? focusedGroupMatchIdRef.current ?? undefined,
    });
    if (!options?.forceAccept && !shouldAcceptServerSnapshot(latestGroupStatusServerNowMsRef, payload.serverNow)) {
      return groupMatchStatus ?? payload;
    }

    syncServerClock(payload.serverNow);
    if (payload.matchId && forfeitedMatchIdsRef.current.has(payload.matchId)) {
      clearLocalGroupMatchState(null);
      return payload;
    }

    focusedGroupMatchIdRef.current = payload.state === 'idle' ? null : (payload.matchId ?? focusedGroupMatchIdRef.current);
    const transitionNotice = groupMatchStatus
      && groupMatchStatus.slotStartAt === payload.slotStartAt
      && Math.abs(groupMatchStatus.distanceKm - payload.distanceKm) < 0.15
      ? buildMatchTransitionNotice('group', groupMatchStatus.state, payload.state)
      : null;

    if (payload.state === 'idle') {
      setGroupMatchResult(null);
    } else if (payload.state === 'waiting' && groupMatchStatus && groupMatchStatus.state !== 'waiting') {
      setGroupMatchResult(null);
    }

    if (transitionNotice) {
      setGroupMatchNotice(transitionNotice);
    } else if (payload.state !== 'idle') {
      setGroupMatchNotice(null);
    }

    setGroupMatchStatus(payload);
    return payload;
  };

  const loadUpcomingMatches = async () => {
    const payload = await fetchUpcomingRunningMatches();
    if (!shouldAcceptServerSnapshot(latestUpcomingServerNowMsRef, payload.serverNow)) {
      return upcomingMatches;
    }

    syncServerClock(payload.serverNow);
    setUpcomingMatches(payload.items);
    return payload.items;
  };

  const loadMatchRoom = async () => {
    try {
      const { payload } = await runActiveRoomCheck({
        source: 'track-run experience',
      });
      if (!isMountedRef.current) {
        rgPerfMark('active room result skipped duplicate', {
          reason: 'unmounted',
          source: 'track-run experience',
        });
        return matchRoom;
      }

      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        rgPerfMark('active room result skipped duplicate', {
          reason: 'stale result',
          source: 'track-run experience',
        });
        return matchRoom;
      }

      if (isMatchRoomExiting(payload.room?.roomId)) {
        const endStaleCleanupTrace = rgPerfMeasureStart('stale room cleanup', {
          roomId: payload.room?.roomId ?? null,
          source: 'track-run exit guard',
        });
        commitMatchRoom(null);
        endStaleCleanupTrace({ success: true });
        return null;
      }

      if (payload.room?.linkedMatchId && forfeitedMatchIdsRef.current.has(payload.room.linkedMatchId)) {
        const endStaleCleanupTrace = rgPerfMeasureStart('stale room cleanup', {
          linkedMatchId: payload.room.linkedMatchId,
          roomId: payload.room.roomId,
          source: 'track-run forfeited match guard',
        });
        commitMatchRoom(null);
        endStaleCleanupTrace({ success: true });
        return null;
      }

      const snapshotKey = buildActiveRoomSnapshotKey({
        room: payload.room,
        userId: currentUserId,
      });
      if (lastHandledActiveRoomSnapshotKeyRef.current === snapshotKey) {
        rgPerfMark('active room result skipped duplicate', buildActiveRoomResultLogDetail({
          reason: 'same room snapshot',
          room: payload.room,
          snapshotKey,
          source: 'track-run experience',
        }));
        return matchRoom;
      }

      lastHandledActiveRoomSnapshotKeyRef.current = snapshotKey;
      rgPerfMark('active room result handled', buildActiveRoomResultLogDetail({
        room: payload.room,
        snapshotKey,
        source: 'track-run experience',
      }));

      syncServerClock(payload.serverNow);
      if (payload.room) {
        rgPerfMark('already joined room detected', {
          roomId: payload.room.roomId,
          source: 'track-run experience',
          state: payload.room.state,
        });
      }

      const nextRoom = payload.room;
      commitMatchRoom(nextRoom);
      return nextRoom;
    } catch (roomError) {
      throw roomError;
    }
  };

  const loadFriendLeaderboardData = async () => {
    const payload = await fetchFriendLeaderboard();
    setFriendLeaderboard(payload);
    return payload;
  };

  const {
    focusRoomLinkedMatch,
    focusRunningMatch,
    markLiveMatchMounted,
  } = useRunningMatchFocus({
    livePagerRef,
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    setMatchMode,
    setDuelDistanceText,
    setGroupDistanceText,
    setSelectedDuelSlotStartAt,
    setSelectedGroupSlotStartAt,
    setSelectedDuelDateKey,
    setSelectedGroupDateKey,
    setSelectedDuelTimeSection,
    setSelectedGroupTimeSection,
    setLiveArenaPage,
    setForceOpenActiveMatch,
    setIsResolvingFocusedMatch,
    getSyncedNowMs,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
  });

  const navigateToMatchRoomWithTrace = (source: string, roomId?: string | null) => {
    const endNavigationTrace = rgPerfMeasureStart('navigation to lobby', {
      roomId: roomId ?? null,
      source,
    });
    router.push('/match-room' as Href);
    endNavigationTrace({ success: true });
  };

  const prepareMatchRoomMutation = async ({
    forceCleanup = false,
    inviteToken,
    source,
  }: {
    forceCleanup?: boolean;
    inviteToken?: string;
    source: string;
  }) => {
    const hasKnownActiveRoom = Boolean(matchRoom?.roomId || visibleMatchRoom?.roomId);
    if (!forceCleanup && !hasKnownActiveRoom) {
      rgPerfMark('stale cleanup skipped no blocker', {
        hasInviteToken: Boolean(inviteToken),
        source,
      });
      return true;
    }

    const cleanupOutcome = await runStaleRoomCleanupWithTimeout({ source });
    if (cleanupOutcome.status === 'timeout') {
      return !forceCleanup;
    }

    if (cleanupOutcome.status === 'error') {
      return !forceCleanup;
    }

    const { payload } = cleanupOutcome;

    if (payload.cleaned) {
      rgPerfMark('local room state cleared', {
        cleanedItems: payload.cleanedItems.join(','),
        source,
      });
      commitMatchRoom(payload.room);
      if (!payload.room) {
        setSelectedRoomFriendIds([]);
      }
    }

    if (payload.blocker && !payload.room) {
      rgPerfMark('already joined room detected', {
        blocker: payload.blocker,
        blockerSource: payload.blockerSource ?? payload.blocker,
        source,
      });
      setError(payload.message ?? '이미 진행 중인 매칭 상태가 있어요. 기존 상태를 먼저 정리한 뒤 다시 시도해주세요.');
      return false;
    }

    if (!payload.room) {
      return true;
    }

    rgPerfMark('already joined room detected', {
      blocker: payload.blocker ?? 'activeRoom',
      roomId: payload.room.roomId,
      source,
      state: payload.room.state,
    });
    commitMatchRoom(payload.room);

    if (
      inviteToken
      && payload.room.joined !== false
      && payload.room.inviteToken.toUpperCase() === inviteToken.toUpperCase()
    ) {
      navigateToMatchRoomWithTrace(`${source} existing room`, payload.room.roomId);
      return false;
    }

    if (inviteToken && payload.room.joined === false && payload.room.inviteToken.toUpperCase() === inviteToken.toUpperCase()) {
      return true;
    }

    setError(payload.message ?? '이미 참여 중인 방이 있어요. 기존 방을 먼저 나간 뒤 다시 시도해주세요.');
    return false;
  };

  const handleCreateMatchRoom = async () => {
    const nextRoomMode = roomMatchMode;
    const nextDistanceKm = nextRoomMode === 'duel' ? duelDistanceKm : groupDistanceKm;

    rgPerfMark('room create button press', {
      distanceKm: nextDistanceKm,
      mode: nextRoomMode,
      source: 'track-run ready action',
    });

    setIsCreatingMatchRoom(true);
    setError(null);

    try {
      if (!matchRoom?.roomId && !visibleMatchRoom?.roomId) {
        rgPerfMark('stale cleanup skipped no blocker', {
          mode: nextRoomMode,
          source: 'room create preflight',
        });
      }

      const canProceed = await prepareMatchRoomMutation({
        source: 'room create preflight',
      });
      if (!canProceed) {
        return;
      }

      const createRoom = async (source: string) => {
        const endCreateApiTrace = rgPerfMeasureStart('room create API', {
          distanceKm: nextDistanceKm,
          mode: nextRoomMode,
          source,
        });
        try {
          const payload = await createRunningMatchRoom({
            mode: nextRoomMode,
            distanceKm: nextDistanceKm,
            startMode: roomStartMode,
            ...(roomStartMode === 'scheduled'
              ? { slotStartAt: nextRoomMode === 'duel' ? activeDuelSlotStartAt : activeGroupSlotStartAt }
              : {}),
            ...(nextRoomMode === 'group' ? { maxParticipants: Number(roomMaxParticipants) || 10 } : {}),
          });
          endCreateApiTrace({
            roomId: payload.room?.roomId ?? null,
            success: true,
          });
          return payload;
        } catch (error) {
          endCreateApiTrace({ success: false });
          throw error;
        }
      };

      let payload: Awaited<ReturnType<typeof createRunningMatchRoom>>;
      try {
        payload = await createRoom('track-run ready action');
      } catch (createError) {
        const blocker = getRunningMatchBlockerFromError(createError);
        if (!blocker) {
          throw createError;
        }

        rgPerfMark('stale cleanup retry after blocker', {
          blocker: blocker.blocker ?? null,
          blockerSource: blocker.blockerSource ?? null,
          source: 'track-run ready action',
        });
        const canRetry = await prepareMatchRoomMutation({
          forceCleanup: true,
          source: 'room create retry after blocker',
        });
        if (!canRetry) {
          throw createError;
        }
        payload = await createRoom('track-run ready action retry');
      }

      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
      if (payload.room) {
        navigateToMatchRoomWithTrace('room create', payload.room.roomId);
      }
    } catch (roomError) {
      const message = getApiErrorMessage(roomError, '방을 만들지 못했어.');
      rgPerfMark('room create API error', {
        message,
        mode: nextRoomMode,
        source: 'track-run ready action',
      });
      setError(message);
    } finally {
      setIsCreatingMatchRoom(false);
    }
  };

  const handleJoinMatchRoom = async () => {
    if (joinMatchRoomInFlightRef.current || isJoiningMatchRoom) {
      return;
    }

    const inviteToken = roomInviteTokenInput.trim();

    rgPerfMark('invite code input submit', {
      hasToken: inviteToken.length > 0,
      source: 'track-run invite code input',
    });

    if (!inviteToken) {
      rgPerfMark('room join API error', {
        reason: 'missing invite token',
        source: 'track-run invite code input',
      });
      setError('방 초대 코드를 입력해줘.');
      return;
    }

    joinMatchRoomInFlightRef.current = true;
    setIsJoiningMatchRoom(true);
    setError(null);

    try {
      if (!matchRoom?.roomId && !visibleMatchRoom?.roomId) {
        rgPerfMark('stale cleanup deferred', {
          reason: 'join-first-no-local-blocker',
          source: 'invite code join preflight',
        });
      }

      const canProceed = await prepareMatchRoomMutation({
        inviteToken,
        source: 'invite code join preflight',
      });
      if (!canProceed) {
        return;
      }

      const joinRoom = async (source: string) => {
        const endJoinApiTrace = rgPerfMeasureStart('room join API', {
          inviteTokenLength: inviteToken.length,
          source,
        });
        let traceClosed = false;
        try {
          const payload = await joinRunningMatchRoom({ inviteToken });
          if (!payload.room?.roomId) {
            endJoinApiTrace({
              reason: 'missing roomId',
              success: false,
            });
            traceClosed = true;
            throw new Error('방 정보를 불러오지 못했습니다. 다시 시도해주세요.');
          }
          endJoinApiTrace({
            roomId: payload.room.roomId,
            success: true,
          });
          return payload;
        } catch (error) {
          if (!traceClosed) {
            endJoinApiTrace({ success: false });
          }
          throw error;
        }
      };

      let payload: Awaited<ReturnType<typeof joinRunningMatchRoom>>;
      try {
        payload = await joinRoom('track-run invite code input');
      } catch (joinError) {
        const blocker = getRunningMatchBlockerFromError(joinError);
        if (!blocker) {
          throw joinError;
        }

        rgPerfMark('stale cleanup retry after blocker', {
          blocker: blocker.blocker ?? null,
          blockerSource: blocker.blockerSource ?? null,
          source: 'track-run invite code input',
        });
        const canRetry = await prepareMatchRoomMutation({
          forceCleanup: true,
          inviteToken,
          source: 'invite code join retry after blocker',
        });
        if (!canRetry) {
          throw joinError;
        }
        payload = await joinRoom('track-run invite code retry');
      }

      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
      setRoomInviteTokenInput('');
      navigateToMatchRoomWithTrace('invite code join', payload.room.roomId);
    } catch (roomError) {
      const message = getApiErrorMessage(roomError, '방에 들어가지 못했어.');
      rgPerfMark('room join API error', {
        message,
        source: 'track-run invite code input',
      });
      setError(message);
    } finally {
      joinMatchRoomInFlightRef.current = false;
      setIsJoiningMatchRoom(false);
    }
  };

  const handleAcceptRoomInviteFromRunning = async () => {
    if (!visibleMatchRoom) {
      return;
    }

    setIsJoiningMatchRoom(true);
    setError(null);

    rgPerfMark('invite code input submit', {
      hasToken: Boolean(visibleMatchRoom.inviteToken),
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card accept',
    });
    let endJoinApiTrace: ReturnType<typeof rgPerfMeasureStart> | null = null;

    try {
      const canProceed = await prepareMatchRoomMutation({
        inviteToken: visibleMatchRoom.inviteToken,
        source: 'invite card accept preflight',
      });
      if (!canProceed) {
        return;
      }

      endJoinApiTrace = rgPerfMeasureStart('room join API', {
        roomId: visibleMatchRoom.roomId,
        source: 'track-run invite card accept',
      });
      const payload = await joinRunningMatchRoom({ inviteToken: visibleMatchRoom.inviteToken });
      if (!payload.room?.roomId) {
        endJoinApiTrace({
          reason: 'missing roomId',
          success: false,
        });
        throw new Error('방 정보를 불러오지 못했습니다. 다시 시도해주세요.');
      }
      endJoinApiTrace({
        roomId: payload.room.roomId,
        success: true,
      });
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
      navigateToMatchRoomWithTrace('invite card accept', payload.room.roomId);
    } catch (roomError) {
      endJoinApiTrace?.({ success: false });
      const message = getApiErrorMessage(roomError, '초대를 수락하지 못했어.');
      rgPerfMark('room join API error', {
        message,
        roomId: visibleMatchRoom.roomId,
        source: 'track-run invite card accept',
      });
      setError(message);
    } finally {
      setIsJoiningMatchRoom(false);
    }
  };

  const handleDeclineRoomInviteFromRunning = async () => {
    if (!visibleMatchRoom) {
      return;
    }

    setIsLeavingMatchRoom(true);
    setError(null);

    rgPerfMark('room leave button press', {
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card decline',
    });
    const endLeaveApiTrace = rgPerfMeasureStart('room leave API', {
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card decline',
    });

    try {
      const payload = await leaveRunningMatchRoom({ roomId: visibleMatchRoom.roomId });
      endLeaveApiTrace({
        roomId: visibleMatchRoom.roomId,
        success: true,
      });
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
      rgPerfMark('local room state cleared', {
        roomId: visibleMatchRoom.roomId,
        source: 'track-run invite card decline',
      });
      setSelectedRoomFriendIds([]);
    } catch (roomError) {
      endLeaveApiTrace({ success: false });
      const message = getApiErrorMessage(roomError, '초대를 거절하지 못했어.');
      rgPerfMark('room leave API error', {
        message,
        roomId: visibleMatchRoom.roomId,
        source: 'track-run invite card decline',
      });
      setError(message);
    } finally {
      setIsLeavingMatchRoom(false);
    }
  };

  const clearLocalDuelMatchState = (notice?: string | null) => {
    focusedDuelMatchIdRef.current = null;
    setDuelMatchResult(null);
    setDuelMatchStatus(null);
    setDuelMatchNotice(notice ?? null);
  };

  const clearLocalGroupMatchState = (notice?: string | null) => {
    focusedGroupMatchIdRef.current = null;
    setGroupMatchResult(null);
    setGroupMatchStatus(null);
    setGroupMatchNotice(notice ?? null);
  };

  const clearLocalForfeitedMatchState = (source: 'duel' | 'group', matchId: string) => {
    forfeitedMatchIdsRef.current.add(matchId);
    matchProgressHeartbeatRef.current = 0;
    preStartWarmupMatchIdRef.current = null;
    autoStartedMatchIdRef.current = null;
    roomLinkedMatchContextRef.current = null;
    setForceOpenActiveMatch(false);
    setLiveArenaPage(0);
    setLastSyncedMatchProgress(null);
    setUpcomingMatches((currentItems) => currentItems.filter((match) => match.matchId !== matchId));

    if (matchRoom?.linkedMatchId === matchId) {
      commitMatchRoom(null);
    }

    if (source === 'duel') {
      clearLocalDuelMatchState(null);
    } else {
      clearLocalGroupMatchState(null);
    }

    setMatchMode('solo');
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  };

  const refreshStaleMatchArtifacts = async () => {
    const [roomPayload, upcomingItems, duelStatusPayload, groupStatusPayload] = await Promise.all([
      loadMatchRoom().catch(() => matchRoom),
      loadUpcomingMatches().catch(() => upcomingMatches),
      (isDuelTestFlow || duelMatchStatus || duelMatchResult)
        ? loadDuelMatchStatus(activeDuelSlotStartAt, { testMode: isDuelTestFlow || Boolean(duelMatchStatus?.isTestMatch || duelMatchResult?.isTestMatch) }).catch(() => null)
        : Promise.resolve(null),
      (isGroupTestFlow || groupMatchStatus || groupMatchResult)
        ? loadGroupMatchStatus(activeGroupSlotStartAt, { testMode: isGroupTestFlow || Boolean(groupMatchStatus?.isTestMatch || groupMatchResult?.isTestMatch) }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const hasUpcomingDuel = upcomingItems.some((match) => match.mode === 'duel');
    const hasUpcomingGroup = upcomingItems.some((match) => match.mode === 'group');
    const hasLinkedRoomMatch = Boolean(roomPayload?.linkedMatchId || roomPayload?.linkedMatchSlotStartAt);

    if (duelStatusPayload?.state === 'idle' && !hasUpcomingDuel && (isDuelTestFlow || duelMatchStatus || duelMatchResult)) {
      const shouldKeepTestArtifacts = isDuelTestFlow || duelMatchStatus?.isTestMatch || duelMatchResult?.isTestMatch;
      clearLocalDuelMatchState(
        shouldKeepTestArtifacts ? '이전 테스트 1대1 대결은 이미 정리됐어요. 새로 시작할 수 있어요.' : null,
      );
    }

    if (groupStatusPayload?.state === 'idle' && !hasUpcomingGroup && (isGroupTestFlow || groupMatchStatus || groupMatchResult)) {
      const shouldKeepTestArtifacts = isGroupTestFlow || groupMatchStatus?.isTestMatch || groupMatchResult?.isTestMatch;
      clearLocalGroupMatchState(
        shouldKeepTestArtifacts ? '이전 테스트 그룹 대결은 이미 정리됐어요. 새로 시작할 수 있어요.' : null,
      );
    }

    if (status !== 'idle' || hasLinkedRoomMatch) {
      return;
    }

    if (!hasUpcomingDuel && duelMatchStatus?.state !== 'active' && !duelMatchStatus?.isTestMatch) {
      clearLocalDuelMatchState();
    }

    if (!hasUpcomingGroup && groupMatchStatus?.state !== 'active' && !groupMatchStatus?.isTestMatch) {
      clearLocalGroupMatchState();
    }
  };

  useEffect(() => {
    if (matchMode !== 'duel') {
      return;
    }

    if (roomLinkedMatchContext?.mode === 'duel') {
      return;
    }

    let canceled = false;
    void loadDuelMatchStatus(activeDuelSlotStartAt, {
      testMode: focusRequestedDuelTest || isDuelTestFlow,
    }).catch(() => {
      if (!canceled) {
        setDuelMatchStatus(null);
      }
    });

    return () => {
      canceled = true;
    };
  }, [matchMode, duelDistanceKm, activeDuelSlotStartAt, focusRequestedDuelTest, isDuelTestFlow, roomLinkedMatchContext?.mode]);

  useEffect(() => {
    if (matchMode !== 'group') {
      return;
    }

    if (roomLinkedMatchContext?.mode === 'group') {
      return;
    }

    let canceled = false;
    void loadGroupMatchStatus(activeGroupSlotStartAt, {
      testMode: focusRequestedGroupTest || isGroupTestFlow,
    }).catch(() => {
      if (!canceled) {
        setGroupMatchStatus(null);
      }
    });

    return () => {
      canceled = true;
    };
  }, [matchMode, groupDistanceKm, activeGroupSlotStartAt, focusRequestedGroupTest, isGroupTestFlow, roomLinkedMatchContext?.mode]);

  useUpcomingMatchPolling({
    duelMatchId: duelMatchStatus?.matchId,
    duelMatchState: duelMatchStatus?.state,
    groupMatchId: groupMatchStatus?.matchId,
    groupMatchState: groupMatchStatus?.state,
    loadUpcomingMatches,
    onUpcomingMatchesFallback: setUpcomingMatches,
  });

  useAndroidDeferredEffect(() => {
    let canceled = false;

    void loadMatchRoom().catch(() => {
      if (!canceled) {
        commitMatchRoom(null);
      }
    });

    void loadFriendLeaderboardData().catch(() => {
      if (!canceled) {
        setFriendLeaderboard(null);
      }
    });

    return () => {
      canceled = true;
    };
  }, []);

  const acknowledgeRoomCountdownReady = async (roomId: string) => {
    const payload = await acknowledgeRunningMatchRoomCountdown({ roomId });
    if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
      return;
    }

    syncServerClock(payload.serverNow);
    commitMatchRoom(payload.room);
  };

  const syncRoomLinkedMatchStatus = async (context: RoomLinkedMatchContext) => {
    if (!context) {
      return null;
    }

    return context.mode === 'duel'
      ? loadDuelMatchStatus(context.slotStartAt, {
          distanceKm: context.distanceKm,
          matchId: context.matchId,
          testMode: false,
          forceAccept: true,
        })
      : loadGroupMatchStatus(context.slotStartAt, {
          distanceKm: context.distanceKm,
          matchId: context.matchId,
          testMode: false,
          forceAccept: true,
        });
  };

  usePartyRunSync({
    currentUserId,
    matchRoom,
    matchRoomFlow,
    visiblePartyRunFlow,
    roomLinkedMatchContext,
    roomCountdownRemainingSeconds,
    duelMatchStatus,
    groupMatchStatus,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    livePagerRef,
    fastRoomPollMs: MATCH_ROOM_FAST_POLL_MS,
    idleRoomPollMs: MATCH_ROOM_IDLE_POLL_MS,
    fastMatchStatusPollMs: MATCH_STATUS_FAST_POLL_MS,
    idleMatchStatusPollMs: MATCH_STATUS_IDLE_POLL_MS,
    linkedMatchSyncEnabled: liveMatchHeavyWorkReady,
    getSyncedNowMs,
    loadMatchRoom,
    acknowledgeCountdownReady: acknowledgeRoomCountdownReady,
    focusRoomLinkedMatch,
    syncRoomLinkedMatchStatus,
    loadUpcomingMatches,
    onMatchModeChange: setMatchMode,
    onForceOpenActiveMatchChange: setForceOpenActiveMatch,
    onLiveArenaPageChange: setLiveArenaPage,
    onError: setError,
  });

  useStaleMatchCleanup({ refreshStaleMatchArtifacts });

  useMatchEntryEffects({
    focusMatchNonce,
    focusMatchMode,
    focusMatchId,
    focusMatchDistanceKm,
    focusMatchSlotStartAt,
    focusMatchIsTest,
    forceMatchArena,
    roomInviteToken,
    livePagerRef,
    latestMatchRoomServerNowMsRef,
    onForceOpenActiveMatchChange: setForceOpenActiveMatch,
    onLiveArenaPageChange: setLiveArenaPage,
    onRoomInviteTokenInputChange: setRoomInviteTokenInput,
    syncServerClock,
    commitMatchRoom,
    onError: setError,
    focusRunningMatch,
  });

  useLiveMatchNavigationEffects({
    livePagerRef,
    isResolvingFocusedMatch,
    isIdle,
    forceOpenActiveMatch,
    shouldKeepRunningMatchArena,
    showLiveArena,
    hasMatchResultPage,
    liveArenaPageWidth,
    duelState: duelMatchState,
    groupState: groupMatchState,
    duelMatchId: duelMatchStatus?.matchId,
    groupMatchId: groupMatchStatus?.matchId,
    duelShouldOpenCountdownArena,
    groupShouldOpenCountdownArena,
    roomShouldOpenCountdownArena,
    nextStartingMatch,
    activeUpcomingMatch,
    onForceOpenActiveMatchChange: setForceOpenActiveMatch,
    onLiveArenaPageChange: setLiveArenaPage,
    focusRunningMatch,
  });

  const shouldShowFullscreenMatchCountdown =
    isIdle
    && shouldUseFullscreenMatchCountdown({
      hasCountdownEntry: Boolean(visibleCountdownEntry),
      remainingSeconds: visibleCountdownEntry?.remainingSeconds ?? null,
    });
  const shouldShowCenteredMatchCountdown = shouldUseCenteredMatchCountdown({
    hasCountdownEntry: Boolean(visibleCountdownEntry),
    remainingSeconds: visibleCountdownEntry?.remainingSeconds ?? null,
    showLiveArena,
    hasRoomCountdownEntry: Boolean(roomCountdownEntry),
  });

  useTrackRunNotificationSync({
    upcomingMatches,
    matchRemindersEnabled,
    onMatchRemindersEnabledChange: setMatchRemindersEnabled,
  });

  useSyncedCountdownTicker({
    serverClockOffsetMsRef,
    onNowMsChange: setNowMs,
    enabled: Boolean(
      isStarting
      || isRunning
      || focusMatchId
      || visibleCountdownEntry
      || roomCountdownEntry
      || nextStartingMatch
      || activeUpcomingMatch
      || visibleUpcomingMatches.length > 0
      || duelMatchState === 'matched'
      || groupMatchState === 'matched'
      || matchRoom?.linkedMatchId
      || matchRoom?.state === 'arming'
      || matchRoom?.state === 'countdown'
    ),
  });

  useBlockingMatchStatusPolling({
    matchMode,
    duelMatchStatus,
    groupMatchStatus,
    syncedNowMs,
    fastPollMs: MATCH_STATUS_FAST_POLL_MS,
    idlePollMs: 15000,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
    enabled: liveMatchHeavyWorkReady,
  });

  const {
    pushRunningMatchProgress,
    buildDisplayedMatchProgress,
    getDisplayedTrackingSnapshot,
    handlePauseTracking,
    handleResumeTracking,
    handleStartTracking,
    resetForegroundTrackingState,
    stopForegroundTrackingHelpers,
    syncElapsedSeconds,
    syncFromBackgroundTracking,
    syncLiveSharing,
  } = useRunTrackingFlow({
    pedometerSubscriptionRef,
    timerRef,
    soloStartCountdownTimerRef,
    soloStartCountdownResolveRef,
    routeRef,
    elapsedSecondsRef,
    totalStepsRef,
    pedometerStepOffsetRef,
    liveShareEnabledRef,
    liveShareLabelRef,
    liveShareHeartbeatRef,
    matchProgressHeartbeatRef,
    appStateRef,
    trackerStatusRef,
    officialStartBaselineRef,
    matchModeRef,
    roomLinkedMatchContextRef,
    duelMatchStatusRef,
    groupMatchStatusRef,
    autoStartingMatchTrackingRef,
    autoStartedMatchIdRef,
    preStartWarmupMatchIdRef,
    matchMode,
    duelMatchState,
    groupMatchState,
    duelMatchStatus,
    groupMatchStatus,
    roomLinkedMatchContext,
    status,
    visiblePartyRunShouldOpenArena: visiblePartyRunFlow.shouldOpenArena,
    duelStartCountdownSeconds,
    groupStartCountdownSeconds,
    setStatus,
    setSoloStartCountdownSeconds,
    setRoute,
    setDistanceKm,
    setElapsedSeconds,
    setCurrentPace,
    setLastSyncedMatchProgress,
    setDuelMatchStatus,
    setGroupMatchStatus,
    setElevationGainM,
    setCadenceSpm,
    setLocationPermissionGranted,
    setBackgroundLocationPermissionGranted,
    setMotionPermissionGranted,
    setLiveShareLabel,
    setError,
    officialStartDistanceNoiseGraceSeconds: OFFICIAL_START_DISTANCE_NOISE_GRACE_SECONDS,
    officialStartDistanceNoiseGraceKm: OFFICIAL_START_DISTANCE_NOISE_GRACE_KM,
    soloStartCountdownSeconds: SOLO_START_COUNTDOWN_SECONDS,
    getSyncedNowMs,
    refreshStaleMatchArtifacts,
    matchProgressHeartbeatEnabled: shouldEnableMatchProgressHeartbeat,
  });

  const handleRequestDuelMatch = async (
    slotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt,
    options?: { testMode?: boolean },
  ) => {
    try {
      setError(null);
      setDuelMatchNotice(null);
      setIsRequestingDuelMatch(true);

      const payload = await requestDuelMatch({
        distanceKm: duelDistanceKm,
        slotStartAt,
        testMode: options?.testMode,
      });

      setDuelMatchResult(payload);
      if (payload.isTestMatch) {
        setDuelDemandSummary(null);
        await loadDuelMatchStatus(slotStartAt, { testMode: true });
      } else {
        const [nextSummary] = await Promise.all([
          fetchMatchDemandSummary({
            mode: 'duel',
            distanceKm: duelDistanceKm,
            slotStartAt,
          }),
          loadDuelMatchStatus(slotStartAt),
        ]);
        setDuelDemandSummary(nextSummary);
      }
    } catch (matchError) {
      setError(getApiErrorMessage(matchError, '1대1 매칭을 찾지 못했어.'));
    } finally {
      setIsRequestingDuelMatch(false);
    }
  };

  const handleRequestGroupMatch = async (
    slotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt,
    options?: { testMode?: boolean },
  ) => {
    try {
      setError(null);
      setGroupMatchNotice(null);
      setIsRequestingGroupMatch(true);

      const payload = await requestGroupMatch({
        distanceKm: groupDistanceKm,
        slotStartAt,
        testMode: options?.testMode,
      });

      setGroupMatchResult(payload);
      if (payload.isTestMatch) {
        setGroupDemandSummary(null);
        await loadGroupMatchStatus(slotStartAt, { testMode: true });
      } else {
        const [nextSummary] = await Promise.all([
          fetchMatchDemandSummary({
            mode: 'group',
            distanceKm: groupDistanceKm,
            slotStartAt,
          }),
          loadGroupMatchStatus(slotStartAt),
        ]);
        setGroupDemandSummary(nextSummary);
      }
    } catch (matchError) {
      setError(getApiErrorMessage(matchError, '그룹 매칭을 찾지 못했어.'));
    } finally {
      setIsRequestingGroupMatch(false);
    }
  };

  const handleCancelDuelMatch = async () => {
    try {
      if (duelMatchState === 'matched' && duelMatchStatus?.canCancel === false) {
        throw new Error('출발 1시간 전부터는 예약을 취소할 수 없어.');
      }

      const wasTestMatch = isDuelTestFlow;
      setError(null);
      setDuelMatchNotice(null);
      setIsCancelingDuelMatch(true);
      await cancelRunningMatch({
        mode: 'duel',
        distanceKm: duelDistanceKm,
        slotStartAt: activeDuelSlotStartAt,
        testMode: wasTestMatch,
        ...(duelMatchStatus?.matchId ? { matchId: duelMatchStatus.matchId } : {}),
      });
      setDuelMatchResult(null);
      const nextStatus = await loadDuelMatchStatus(activeDuelSlotStartAt, { testMode: wasTestMatch });
      if (wasTestMatch) {
        setDuelDemandSummary(null);
      } else {
        const nextSummary = await fetchMatchDemandSummary({
          mode: 'duel',
          distanceKm: duelDistanceKm,
          slotStartAt: activeDuelSlotStartAt,
        });
        setDuelDemandSummary(nextSummary);
      }
      if (nextStatus.state === 'idle') {
        setDuelMatchStatus(null);
      }
    } catch (matchError) {
      setError(getApiErrorMessage(matchError, '1대1 매치를 취소하지 못했어.'));
    } finally {
      setIsCancelingDuelMatch(false);
    }
  };

  const handleCancelGroupMatch = async () => {
    try {
      if (groupMatchState === 'matched' && groupMatchStatus?.canCancel === false) {
        throw new Error('출발 1시간 전부터는 예약을 취소할 수 없어.');
      }

      const wasTestMatch = isGroupTestFlow;
      setError(null);
      setGroupMatchNotice(null);
      setIsCancelingGroupMatch(true);
      await cancelRunningMatch({
        mode: 'group',
        distanceKm: groupDistanceKm,
        slotStartAt: activeGroupSlotStartAt,
        testMode: wasTestMatch,
        ...(groupMatchStatus?.matchId ? { matchId: groupMatchStatus.matchId } : {}),
      });
      setGroupMatchResult(null);
      const nextStatus = await loadGroupMatchStatus(activeGroupSlotStartAt, { testMode: wasTestMatch });
      if (wasTestMatch) {
        setGroupDemandSummary(null);
      } else {
        const nextSummary = await fetchMatchDemandSummary({
          mode: 'group',
          distanceKm: groupDistanceKm,
          slotStartAt: activeGroupSlotStartAt,
        });
        setGroupDemandSummary(nextSummary);
      }
      if (nextStatus.state === 'idle') {
        setGroupMatchStatus(null);
      }
    } catch (matchError) {
      setError(getApiErrorMessage(matchError, '그룹 매치를 취소하지 못했어.'));
    } finally {
      setIsCancelingGroupMatch(false);
    }
  };

  const handleCancelUpcomingMatch = async (match: UpcomingRunningMatchItem) => {
    try {
      if (!match.canCancel) {
        throw new Error('출발 1시간 전부터는 예약을 취소할 수 없어.');
      }

      setError(null);
      setCancelingUpcomingMatchId(match.matchId);
      await cancelRunningMatch({
        mode: match.mode,
        distanceKm: match.distanceKm,
        slotStartAt: match.slotStartAt,
        matchId: match.matchId,
      });
      await loadUpcomingMatches();
      if (match.mode === 'duel' && duelMatchStatus?.matchId === match.matchId) {
        setDuelMatchResult(null);
        setDuelMatchStatus(null);
      }
      if (match.mode === 'group' && groupMatchStatus?.matchId === match.matchId) {
        setGroupMatchResult(null);
        setGroupMatchStatus(null);
      }
    } catch (cancelError) {
      setError(getApiErrorMessage(cancelError, '예약을 취소하지 못했어.'));
    } finally {
      setCancelingUpcomingMatchId(null);
    }
  };

  const {
    handleContinueSoloFromMatch,
    handleForfeitMatch,
    handleSaveTracking,
    handleShowResultAfterCounterpartForfeit,
    handleDiscardTracking,
  } = useRunSaveFlow({
    status,
    setStatus,
    setError,
    isTabMode,
    discardRedirectHref,
    matchMode,
    setMatchMode,
    duelMatchStatus,
    setDuelMatchStatus,
    groupMatchStatus,
    setGroupMatchStatus,
    duelMatchNotice,
    setDuelMatchNotice,
    groupMatchNotice,
    setGroupMatchNotice,
    setDuelMatchResult,
    setGroupMatchResult,
    setIsLeavingDuelMatch,
    setIsLeavingGroupMatch,
    setForceOpenActiveMatch,
    roomLinkedMatchContext,
    trackedMatchResult,
    totalStepsRef,
    pendingForfeitMatchRef,
    pendingCounterpartForfeitResultRef,
    matchProgressHeartbeatRef,
    preStartWarmupMatchIdRef,
    officialStartBaselineRef,
    autoStartedMatchIdRef,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    stopForegroundTrackingHelpers,
    resetForegroundTrackingState,
    syncFromBackgroundTracking,
    syncElapsedSeconds,
    getDisplayedTrackingSnapshot,
    buildDisplayedMatchProgress,
    pushRunningMatchProgress,
    syncLiveSharing,
    loadUpcomingMatches,
    clearLocalForfeitedMatchState,
  });

  const liveArenaExitActionProps = useForfeitController({
    source: activeMatchExitSource,
    isTestMatch: activeMatchExitIsTest,
    isLeaving: activeMatchExitIsLeaving,
    isSaving,
    isRunning,
    counterpartForfeited: activeMatchExitCounterpartForfeited,
    onContinueSolo: handleContinueSoloFromMatch,
    onForfeit: handleForfeitMatch,
    onShowResultAfterCounterpartForfeit: handleShowResultAfterCounterpartForfeit,
  });
  const liveArenaExitAction = useMemo(
    () => <LiveMatchExitActionCard {...liveArenaExitActionProps} />,
    [liveArenaExitActionProps],
  );
  const handleSaveTrackingPress = useCallback(() => {
    void handleSaveTracking();
  }, [handleSaveTracking]);
  const handleReadyAction = () => {
    if (matchMode === 'room') {
      if (matchRoom) {
        rgPerfMark('already joined room detected', {
          roomId: matchRoom.roomId,
          source: 'ready action existing room',
          state: matchRoom.state,
        });
        navigateToMatchRoomWithTrace('ready action existing room', matchRoom.roomId);
        return;
      }
      void handleCreateMatchRoom();
      return;
    }
    void handleStartTracking();
  };

  const liveArenaPageProps = useMemo(() => ({
    activeMatchId: liveMatchStartupIdentity,
    matchMode,
    effectiveDuelOpponent,
    duelDistanceKm,
    groupDistanceKm,
    distanceKm: liveMatchDisplayDistanceKm,
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
    deferHeavyContent: !liveMatchHeavyWorkReady,
    onLiveMatchMounted: markLiveMatchMounted,
  }), [
    liveMatchStartupIdentity,
    currentGroupLeader,
    currentGroupStanding,
    currentUserArenaPace,
    currentUserDuelLiveStatus,
    currentUserGroupLiveStatus,
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
    liveMatchHeavyWorkReady,
    liveMatchDisplayDistanceKm,
    matchMode,
    markLiveMatchMounted,
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

  const liveRaceBoardPageProps = useMemo(() => ({
    matchMode,
    effectiveDuelOpponent,
    duelLiveGapKm,
    duelDistanceKm,
    groupDistanceKm,
    distanceKm: liveMatchDisplayDistanceKm,
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
    duelDistanceKm,
    duelLiveGapKm,
    effectiveDuelOpponent,
    groupArenaUsesLivePace,
    groupDistanceKm,
    groupLiveStandings,
    liveMatchDisplayDistanceKm,
    matchMode,
    roomLinkedDuelPlaceholderParticipants,
    roomLinkedGroupPlaceholderParticipants,
    syncedDuelDistanceKm,
    syncedDuelOpponentDistanceKm,
    visibleMatchRoom,
  ]);

  const liveTrackingPageBaseProps = useMemo(() => ({
    matchMode,
    liveMatchTitle,
    liveMatchText,
    effectiveDuelOpponent,
    duelDistanceKm,
    duelLiveTitle,
    duelLiveSummary,
    duelStatusAlert,
    distanceKm: liveMatchDisplayDistanceKm,
    isLeavingDuelMatch,
    effectiveGroupParticipantCount,
    currentGroupStanding,
    groupAheadParticipant,
    groupBehindParticipant,
    groupStatusAlert,
    isLeavingGroupMatch,
    groupLiveStandings,
    currentGroupLeader,
    elapsedSeconds: liveMatchDisplayElapsedSeconds,
    averagePace: liveMatchDisplayFrame.averagePace,
    currentPace: liveMatchDisplayFrame.currentPace,
    cadenceSpm: liveMatchDisplayFrame.cadenceSpm,
    elevationGainM: liveMatchDisplayFrame.elevationGainM,
    onContinueSoloFromMatch: handleContinueSoloFromMatch,
  }), [
    currentGroupLeader,
    currentGroupStanding,
    duelDistanceKm,
    duelLiveSummary,
    duelLiveTitle,
    duelStatusAlert,
    effectiveDuelOpponent,
    effectiveGroupParticipantCount,
    groupAheadParticipant,
    groupBehindParticipant,
    groupLiveStandings,
    groupStatusAlert,
    handleContinueSoloFromMatch,
    isLeavingDuelMatch,
    isLeavingGroupMatch,
    liveMatchDisplayDistanceKm,
    liveMatchDisplayElapsedSeconds,
    liveMatchDisplayFrame.averagePace,
    liveMatchDisplayFrame.cadenceSpm,
    liveMatchDisplayFrame.currentPace,
    liveMatchDisplayFrame.elevationGainM,
    liveMatchText,
    liveMatchTitle,
    matchMode,
  ]);

  const liveResultPageProps = useMemo(() => ({
    matchMode,
    estimatedBonusPoints: estimatedMatchBonusPoints,
    duelRows: duelResultRows,
    groupRows: groupResultRows,
    groupStatusLabel: groupResultStatusLabel,
  }), [
    duelResultRows,
    estimatedMatchBonusPoints,
    groupResultRows,
    groupResultStatusLabel,
    matchMode,
  ]);
  const livePagesRaceBoardProps = liveArenaPage === 1 ? liveRaceBoardPageProps : null;
  const livePagesTrackingProps = useMemo(
    () => (liveArenaPage === 2 ? { ...liveTrackingPageBaseProps, includeMatchCards: false } : null),
    [liveArenaPage, liveTrackingPageBaseProps],
  );
  const livePagesResultProps = liveArenaPage === 3 ? liveResultPageProps : null;

  const readyUpcomingMatchesProps = {
    matches: visibleUpcomingMatches,
    nowMs: syncedNowMs,
    cancelingMatchId: cancelingUpcomingMatchId,
    onOpenMatch: (match: UpcomingRunningMatchItem) => {
      void focusRunningMatch({
        mode: match.mode,
        distanceKm: match.distanceKm,
        slotStartAt: match.slotStartAt,
        isTestMatch: match.isTestMatch,
      }).catch(() => {});
    },
    onCancelMatch: (match: UpcomingRunningMatchItem) => {
      void handleCancelUpcomingMatch(match);
    },
  };

  const readyMatchOptionProps = {
    options: matchOptions,
    selectedMode: matchMode,
    onSelect: (option: MatchOptionItem) => {
      if (option.mode === 'room' && visibleMatchRoom) {
        rgPerfMark('already joined room detected', {
          roomId: visibleMatchRoom.roomId,
          source: 'ready option select',
          state: visibleMatchRoom.state,
        });
        navigateToMatchRoomWithTrace('ready option existing room', visibleMatchRoom.roomId);
        return;
      }

      setMatchMode(option.mode);
    },
  };

  const readyPartyRunProps = {
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
    onAcceptInvite: () => { void handleAcceptRoomInviteFromRunning(); },
    onDeclineInvite: () => { void handleDeclineRoomInviteFromRunning(); },
    onJoinRoom: () => { void handleJoinMatchRoom(); },
  };

  const readyDuelSetupProps = matchMode === 'duel'
    ? {
        distanceKm: duelDistanceKm,
        distanceText: duelDistanceText,
        showCustomDistanceInput: showDuelCustomDistanceInput,
        dateOptions: duelDateOptions,
        selectedDateKey: selectedDuelDateKey,
        selectedTimeSection: selectedDuelTimeSection,
        slotOptions: visibleDuelSlotOptions,
        selectedSlotStartAt: selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt,
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
        onDistanceTextChange: setDuelDistanceText,
        onShowCustomDistanceInputChange: setShowDuelCustomDistanceInput,
        onSelectDate: (dateKey: string) => {
          setSelectedDuelDateKey(dateKey);
          selectNextDuelSlotForDate(dateKey);
        },
        onSelectTimeSection: selectDuelTimeSection,
        onSelectSlot: setSelectedDuelSlotStartAt,
        onCancelMatch: () => { void handleCancelDuelMatch(); },
        onRequestMatch: () => { void handleRequestDuelMatch(); },
        onRequestTestMatch: () => { void handleRequestDuelMatch(activeDuelSlotStartAt, { testMode: true }); },
        onRequestRematch: () => { void handleRequestDuelMatch(activeDuelSlotStartAt); },
      }
    : null;

  const readyGroupSetupProps = matchMode === 'group'
    ? {
        distanceKm: groupDistanceKm,
        distanceText: groupDistanceText,
        showCustomDistanceInput: showGroupCustomDistanceInput,
        dateOptions: groupDateOptions,
        selectedDateKey: selectedGroupDateKey,
        selectedTimeSection: selectedGroupTimeSection,
        slotOptions: visibleGroupSlotOptions,
        selectedSlotStartAt: selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt,
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
        effectiveSeedRank: effectiveGroupSeedRank ?? null,
        participants: effectiveGroupParticipants,
        onDistanceTextChange: setGroupDistanceText,
        onShowCustomDistanceInputChange: setShowGroupCustomDistanceInput,
        onSelectDate: (dateKey: string) => {
          setSelectedGroupDateKey(dateKey);
          selectNextGroupSlotForDate(dateKey);
        },
        onSelectTimeSection: selectGroupTimeSection,
        onSelectSlot: setSelectedGroupSlotStartAt,
        onCancelMatch: () => { void handleCancelGroupMatch(); },
        onRequestMatch: () => { void handleRequestGroupMatch(); },
        onRequestTestMatch: () => { void handleRequestGroupMatch(activeGroupSlotStartAt, { testMode: true }); },
        onRequestRematch: () => { void handleRequestGroupMatch(activeGroupSlotStartAt); },
      }
    : null;

  const livePagesProps = useMemo(() => ({
    scrollRef: livePagerRef,
    page: liveArenaPage,
    pageWidth: liveArenaPageWidth,
    hasResultPage: hasMatchResultPage,
    arenaProps: liveArenaPageProps,
    raceBoardProps: livePagesRaceBoardProps,
    trackingProps: livePagesTrackingProps,
    resultProps: livePagesResultProps,
    onPageChange: setLiveArenaPage,
  }), [
    hasMatchResultPage,
    liveArenaPage,
    liveArenaPageProps,
    liveArenaPageWidth,
    livePagesRaceBoardProps,
    livePagesResultProps,
    livePagesTrackingProps,
    setLiveArenaPage,
  ]);

  return (
    <View style={styles.root}>
      <Screen>
      <AuthHeader
        title="실시간 러닝"
        showBack={!isTabMode}
        backHref={backHref}
      />

      {isIdle && !showLiveArena ? (
        <RunningReadyScreen
          bottomInset={insets.bottom}
          upcomingMatchesProps={readyUpcomingMatchesProps}
          matchSetupProps={{
            matchOptionProps: readyMatchOptionProps,
            partyRunProps: readyPartyRunProps,
            duelSetupProps: readyDuelSetupProps,
            groupSetupProps: readyGroupSetupProps,
          }}
          readyActionLabel={readyActionLabel}
          readyActionLoadingLabel={matchMode === 'room' && isCreatingMatchRoom ? '방 만드는 중...' : undefined}
          readyActionDisabled={matchMode === 'room' ? isCreatingMatchRoom : false}
          onReadyAction={handleReadyAction}
        />
      ) : (
        <LiveMatchContainer
          showLiveArena={showLiveArena}
          livePagesProps={livePagesProps}
          trackingPageProps={liveTrackingPageBaseProps}
          exitAction={liveArenaExitAction}
          isSaving={isSaving}
          isRunningSolo={isRunning && matchMode === 'solo'}
          isPaused={isPaused}
          onSaveTracking={handleSaveTrackingPress}
          onPauseTracking={handlePauseTracking}
          onResumeTracking={handleResumeTracking}
          onDiscardTracking={handleDiscardTracking}
        />
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Screen>
      {shouldShowFullscreenMatchCountdown && visibleCountdownEntry ? (
        <MatchStartCountdownOverlay
          title={visibleCountdownEntry.title}
          subtitle={visibleCountdownEntry.subtitle}
          secondsRemaining={visibleCountdownEntry.remainingSeconds}
        />
      ) : null}
      {shouldShowRoomArmingOverlay ? (
        <View style={styles.roomArmingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.roomArmingOverlayTitle}>로딩중...</Text>
          <Text style={styles.roomArmingOverlayText}>
            대결 화면을 맞추는 중이에요. 잠시 뒤 모든 참가자에게 같은 카운트다운이 보여요.
          </Text>
        </View>
      ) : null}
      {isStarting && typeof soloStartCountdownSeconds === 'number' ? (
        <View style={styles.soloStartCountdownOverlay} pointerEvents="none">
          <View style={styles.soloStartCountdownCard}>
            <Text style={styles.soloStartCountdownEyebrow}>READY</Text>
            <Text style={styles.soloStartCountdownTitle}>러닝 시작</Text>
            <Text style={styles.soloStartCountdownNumber}>{soloStartCountdownSeconds}</Text>
            <Text style={styles.soloStartCountdownText}>카운트가 끝나면 기록 측정을 시작해요.</Text>
          </View>
        </View>
      ) : null}
      {shouldShowCenteredMatchCountdown && visibleCountdownEntry ? (
        <MatchStartCountdownOverlay
          secondsRemaining={visibleCountdownEntry.remainingSeconds}
          variant="centered"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  roomArmingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
    zIndex: 30,
  },
  roomArmingOverlayTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  roomArmingOverlayText: {
    color: '#D6D9F9',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  soloStartCountdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 35,
  },
  soloStartCountdownCard: {
    width: '100%',
    maxWidth: 280,
    borderRadius: 30,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(141, 132, 255, 0.45)',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 22,
    shadowColor: '#111827',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  soloStartCountdownEyebrow: {
    color: '#8D84FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  soloStartCountdownTitle: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  soloStartCountdownNumber: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 88,
    fontWeight: '900',
    lineHeight: 96,
  },
  soloStartCountdownText: {
    color: '#D6D9F9',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  readyCard: {
    gap: 16,
    backgroundColor: '#111827',
    paddingTop: 18,
    paddingBottom: 18,
  },
  readyHero: {
    gap: 10,
  },
  readyEyebrow: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  readyTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  readyPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  readyPill: {
    borderRadius: 999,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  readyPillText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
  },
  phoneRunGuideCard: {
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
  phoneRunGuideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  phoneRunGuideCopy: {
    gap: 4,
    flex: 1,
  },
  phoneRunGuideTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  phoneRunGuideSummary: {
    color: '#D0D5DD',
    fontSize: 13,
    lineHeight: 19,
  },
  phoneRunGuideBadge: {
    borderRadius: 999,
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  phoneRunGuideBadgeText: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '800',
  },
  phoneRunChecklist: {
    gap: 8,
  },
  phoneRunChecklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  phoneRunChecklistDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: '#818CF8',
  },
  phoneRunChecklistText: {
    flex: 1,
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 19,
  },
  phoneRunGuideFootnote: {
    color: '#98A2B3',
    fontSize: 12,
    lineHeight: 18,
  },
  liveShareCard: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
  liveShareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  liveShareCopy: {
    gap: 4,
    flex: 1,
  },
  liveShareTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  liveShareText: {
    color: '#D0D5DD',
    lineHeight: 19,
  },
  liveShareModeBadge: {
    borderRadius: 999,
    backgroundColor: '#123524',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveShareModeBadgeText: {
    color: '#D1FADF',
    fontSize: 11,
    fontWeight: '800',
  },
  liveShareToggle: {
    position: 'relative',
    height: 52,
    borderRadius: 999,
    padding: 4,
    justifyContent: 'center',
  },
  liveShareToggleEnabled: {
    backgroundColor: '#111827',
  },
  liveShareToggleDisabled: {
    backgroundColor: '#475467',
  },
  liveShareThumb: {
    position: 'absolute',
    top: 4,
    width: '48%',
    height: 44,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  liveShareThumbEnabled: {
    left: 4,
  },
  liveShareThumbDisabled: {
    right: 4,
  },
  liveShareToggleLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  liveShareToggleText: {
    fontSize: 13,
    fontWeight: '800',
    zIndex: 1,
  },
  liveShareToggleTextActive: {
    color: '#111827',
  },
  liveShareToggleTextInactiveDark: {
    color: '#F2F4F7',
  },
  liveShareToggleTextInactiveLight: {
    color: '#475467',
  },
  matchCard: {
    gap: 10,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  matchHeaderCopy: {
    flex: 1,
    gap: 0,
  },
  matchTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  matchBadge: {
    borderRadius: 999,
    backgroundColor: '#312E81',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  matchBadgeText: {
    color: '#E0E7FF',
    fontSize: 11,
    fontWeight: '800',
  },
  finishSummaryCard: {
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#F8FAFC',
    padding: 16,
  },
  finishSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  finishSummaryCopy: {
    flex: 1,
    gap: 4,
  },
  finishSummaryEyebrow: {
    color: '#6D5EF7',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  finishSummaryTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  finishSummaryText: {
    color: '#475467',
    lineHeight: 20,
  },
  finishSummaryMeta: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '700',
  },
  finishSummaryPointPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  finishSummaryPointPillText: {
    color: '#4338CA',
    fontSize: 12,
    fontWeight: '800',
  },
  finishSummaryHint: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
  },
  finishSummaryBadge: {
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  finishSummaryBadgeWin: {
    backgroundColor: '#123524',
  },
  finishSummaryBadgeLose: {
    backgroundColor: '#4A1D1F',
  },
  finishSummaryBadgeDraw: {
    backgroundColor: '#344054',
  },
  finishSummaryBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  finishSummaryPodium: {
    gap: 8,
  },
  finishSummaryPodiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  finishSummaryPodiumRank: {
    width: 22,
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  finishSummaryPodiumCopy: {
    flex: 1,
    gap: 2,
  },
  finishSummaryPodiumName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  finishSummaryPodiumMeta: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '600',
  },
  plannerCard: {
    gap: 16,
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  plannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  toggleButtonText: {
    color: '#344054',
    fontWeight: '700',
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: '#111827',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FCFCFD',
    color: '#111827',
    fontSize: 15,
  },
  promptInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  fieldHelp: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 18,
  },
  inlineActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inlineAction: {
    flex: 1,
  },
  confirmedLocationCard: {
    gap: 4,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  confirmedLocationTitle: {
    color: '#344054',
    fontWeight: '800',
  },
  confirmedLocationText: {
    color: '#111827',
    fontWeight: '800',
  },
  confirmedLocationAddress: {
    color: '#344054',
    lineHeight: 19,
  },
  confirmedLocationMeta: {
    color: '#667085',
    fontSize: 12,
  },
  routeRuleCard: {
    gap: 7,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  routeRuleTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  routeRuleText: {
    color: '#667085',
    lineHeight: 19,
  },
  previewCard: {
    gap: 14,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  previewTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  previewDescription: {
    color: '#667085',
    lineHeight: 20,
  },
  previewBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  previewBadgeText: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  previewMapWrap: {
    height: 260,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  previewStats: {
    flexDirection: 'row',
    gap: 10,
  },
  previewStatCard: {
    flex: 1,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  previewStatLabel: {
    color: '#667085',
    fontWeight: '700',
  },
  previewStatValue: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 17,
  },
  previewProviderText: {
    color: '#667085',
    lineHeight: 20,
  },
  previewFootnote: {
    color: '#667085',
    lineHeight: 20,
  },
  previewWarning: {
    color: '#B54708',
    lineHeight: 20,
  },
  guideCard: {
    gap: 10,
    borderWidth: 1,
    borderColor: '#EAECF0',
    backgroundColor: '#FCFCFD',
  },
  guideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  statusRunning: {
    backgroundColor: '#ECFDF3',
  },
  statusPaused: {
    backgroundColor: '#FFF7ED',
  },
  statusIdle: {
    backgroundColor: '#F2F4F7',
  },
  statusBadgeText: {
    fontWeight: '800',
  },
  statusRunningText: {
    color: '#027A48',
  },
  statusPausedText: {
    color: '#B54708',
  },
  statusIdleText: {
    color: '#344054',
  },
  statusRunningDark: {
    backgroundColor: '#123524',
  },
  statusPausedDark: {
    backgroundColor: '#4A2B0F',
  },
  statusIdleDark: {
    backgroundColor: '#1F2937',
  },
  statusRunningDarkText: {
    color: '#D1FADF',
  },
  statusPausedDarkText: {
    color: '#FDEAD7',
  },
  statusIdleDarkText: {
    color: '#E5E7EB',
  },
  guideText: {
    color: '#344054',
    lineHeight: 20,
  },
  guideHint: {
    color: '#667085',
    lineHeight: 20,
  },
  actionColumn: {
    gap: 10,
  },
  discardButton: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
  discardButtonText: {
    color: '#B42318',
    fontWeight: '700',
  },
  errorText: {
    color: '#B42318',
    lineHeight: 20,
  },
});
