import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { type Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MatchOptionItem } from '@/features/runs/components/MatchOptionSelector';
import {
  TrackRunExperienceView,
} from '@/features/runs/components/TrackRunExperienceView';
import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShells';
import { useRunTrackingController } from '@/features/runs/hooks/useRunTrackingController';
import { useRunSaveFlow } from '@/features/runs/hooks/useRunSaveFlow';
import { usePartyRunRoom } from '@/features/runs/hooks/usePartyRunRoom';
import {
  useMatchLifecycle,
  type RunMatchMode,
} from '@/features/runs/hooks/useMatchLifecycle';
import { useMatchResultController } from '@/features/runs/hooks/useMatchResultController';
import { useLiveMatchProgress } from '@/features/runs/viewModels/useLiveMatchProgress';
import {
  resolveCurrentUserFinishedForResultPage,
  shouldShowMatchResultPageOnCurrentUserFinished,
} from '@/features/runs/viewModels/matchResultPageVisibility';
import { useAndroidLiveMatchDisplayFrame } from '@/features/runs/viewModels/useAndroidLiveMatchDisplayFrame';
import { useAndroidLiveMatchStartupGate } from '@/features/runs/lifecycle/hooks/useAndroidLiveMatchStartupGate';
import { useTrackRunIdleViewModel } from '@/features/runs/viewModels/useTrackRunIdleViewModel';
import { useMatchRuntimeState } from '@/features/runs/hooks/useMatchRuntimeState';
import { useMatchRoomSelectionSync } from '@/features/runs/hooks/useMatchRoomSelectionSync';
import { useMatchSelectionModel } from '@/features/runs/hooks/useMatchSelectionModel';
import { useForceLeaveStuckMatch } from '@/features/runs/hooks/useForceLeaveStuckMatch';
import { useMatchCountdownModel } from '@/features/runs/lifecycle/hooks/useMatchCountdownModel';
import {
  fetchRunningMatchStatus,
  fetchUpcomingRunningMatches,
  forceResetRunningMatchState,
  getApiErrorMessage,
} from '@/services';
import {
  type RunningMatchStatusResponse,
  type UpcomingRunningMatchItem,
} from '@/lib/api/types';
import type { ForfeitedMatchSnapshot } from '@/features/runs/types/matchForfeit';
import {
  buildDuelArenaParticipants,
  buildGroupArenaParticipants,
  buildRoomLinkedDuelPlaceholderParticipants,
  buildRoomLinkedGroupPlaceholderParticipants,
} from '@/features/runs/viewModels/matchViewModels';
import {
  buildRoomLinkedDuelForfeitResultRows,
  buildRoomLinkedGroupForfeitResultRows,
} from '@/features/runs/viewModels/matchResultFallbackRows';
import {
  buildMatchTransitionNotice,
  isLiveMatchState,
  type PartyRunLinkedMatchContext,
} from '@/features/runs/lifecycle/matchStateMachine';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import {
  filterUpcomingMatchesForRuntime,
  isLinkedRoomRuntimeState,
  selectLinkedRuntimeRoom,
  selectPartyRunRuntimeSource,
} from '@/features/runs/lifecycle/matchRuntimeStateSelector';
import { getLiveMatchRouteHydration } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import {
  resolveLiveMatchShellPreservation,
  type PreservedLiveMatchShell,
} from '@/features/runs/lifecycle/liveMatchShellPreservation';
import { resolveTrackRunLiveShellGate } from '@/features/runs/lifecycle/trackRunLiveShellGate';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import { getCurrentUserProfile } from '@/lib/session';
import { rgDiagLog, rgPerfMark } from '@/utils/rgPerfTrace';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';
import { useTrackRunNavigationAdapter } from '@/features/runs/runtime/useTrackRunNavigationAdapter';
import { useTrackRunRuntimeTrace } from '@/features/runs/runtime/useTrackRunRuntimeTrace';
import { useTrackRunLiveShellGateTrace } from '@/features/runs/runtime/useTrackRunLiveShellGateTrace';
import { useTrackRunRuntimeEffects } from '@/features/runs/runtime/useTrackRunRuntimeEffects';
import { useIdleRunRuntimeModel } from '@/features/runs/runtime/useIdleRunRuntimeModel';
import { useMatchLobbyRuntimeModel } from '@/features/runs/runtime/useMatchLobbyRuntimeModel';
import { useTrackRunRuntimeActions } from '@/features/runs/runtime/useTrackRunRuntimeActions';
import { useLiveMatchRuntimeModel } from '@/features/runs/runtime/useLiveMatchRuntimeModel';
import { useTrackRunRuntimeStateBridge } from '@/features/runs/runtime/useTrackRunRuntimeStateBridge';
import { useTrackRunRuntimeRoomActions } from '@/features/runs/runtime/useTrackRunRuntimeRoomActions';
import { useTrackRunRuntimeMatchActions } from '@/features/runs/runtime/useTrackRunRuntimeMatchActions';
import { useTrackRunRuntimeShareState } from '@/features/runs/runtime/useTrackRunRuntimeShareState';
import { useRuntimeMatchRoomHydration } from '@/features/runs/runtime/useRuntimeMatchRoomHydration';
import { useTrackRunRuntimeScreenState } from '@/features/runs/runtime/useTrackRunRuntimeScreenState';
import { useTrackRunRuntimePropsComposer } from '@/features/runs/runtime/useTrackRunRuntimePropsComposer';
import {
  MATCH_ROOM_FAST_POLL_MS,
  MATCH_ROOM_IDLE_POLL_MS,
  MATCH_STATUS_FAST_POLL_MS,
  MATCH_STATUS_IDLE_POLL_MS,
  OFFICIAL_START_DISTANCE_NOISE_GRACE_KM,
  OFFICIAL_START_DISTANCE_NOISE_GRACE_SECONDS,
  SOLO_START_COUNTDOWN_SECONDS,
  STALE_RENDER_ACTIVE_MATCH_MS,
  STALE_RENDER_MATCHED_MATCH_MS,
} from './trackRunExperienceConstants';
import { shouldHidePastUpcomingMatch } from './matchVisibility';
import { useStableCallback } from './useStableCallback';
import { useMatchModeDerivedState } from './useMatchModeDerivedState';
import {
  resolveCurrentUserArenaPace,
  resolveDuelLiveSummary,
  resolveDuelOpponentArenaPace,
  resolveRoomLinkedDuelProgress,
  resolveTrackRunRuntimeRouteHydration,
} from './trackRunRuntimeDerivedState';

export type TrackRunMode = 'tab' | 'stack';
type RoomLinkedMatchContext = PartyRunLinkedMatchContext;

export type TrackRunExperienceRuntimeProps = {
  mode: TrackRunMode;
  focusMatchMode?: Extract<RunMatchMode, 'duel' | 'group'>;
  focusMatchId?: string;
  focusMatchDistanceKm?: number;
  focusMatchSlotStartAt?: string;
  focusMatchIsTest?: boolean;
  focusMatchNonce?: string;
  forceMatchArena?: boolean;
  focusRoomId?: string;
  roomInviteToken?: string;
  routeShellHint?: TrackRunShellKind;
};

function isRunningMatchForceResetCandidate(message: string | null) {
  if (!message) {
    return false;
  }

  return (
    message.includes('이미')
    && (
      message.includes('방')
      || message.includes('매치')
      || message.includes('매칭')
      || message.includes('대결')
    )
  );
}

export function TrackRunExperienceRuntime({
  mode,
  focusMatchMode,
  focusMatchId,
  focusMatchDistanceKm,
  focusMatchSlotStartAt,
  focusMatchIsTest,
  focusMatchNonce,
  forceMatchArena,
  focusRoomId,
  roomInviteToken,
  routeShellHint,
}: TrackRunExperienceRuntimeProps) {
  const isScreenFocused = useIsFocused();
  const liveMatchRouteHydration = getLiveMatchRouteHydration();
  const {
    hydratedFocusMatchMode,
    hydratedFocusMatchId,
    hydratedFocusRoomId,
    hydratedFocusMatchDistanceKm,
    hydratedFocusMatchSlotStartAt,
    hydratedForceMatchArena,
    hydratedFocusMatchNonce,
  } = resolveTrackRunRuntimeRouteHydration({
    focusMatchMode,
    focusMatchId,
    focusMatchDistanceKm,
    focusMatchSlotStartAt,
    focusMatchNonce,
    forceMatchArena,
    focusRoomId,
    liveMatchRouteHydration,
  });

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
  const [isForceResettingRunningMatch, setIsForceResettingRunningMatch] = useState(false);
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
  const lastRouteKeyCorrectionRef = useRef<string | null>(null);
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
  } = useMatchLifecycle({ focusMatchMode: hydratedFocusMatchMode, focusMatchIsTest });
  const pendingForfeitMatchRef = useRef<string | null>(null);
  const pendingCounterpartForfeitResultRef = useRef(false);
  const autoStartedMatchIdRef = useRef<string | null>(null);
  const autoStartingMatchTrackingRef = useRef(false);
  const preStartWarmupMatchIdRef = useRef<string | null>(null);
  const forfeitedMatchIdsRef = useRef<Set<string>>(new Set());
  const [locallyForfeitedMatches, setLocallyForfeitedMatches] = useState<ReadonlyMap<string, ForfeitedMatchSnapshot>>(() => new Map());
  const markMatchLocallyForfeited = useCallback((snapshot: ForfeitedMatchSnapshot) => {
    setLocallyForfeitedMatches((currentSnapshots) => {
      if (currentSnapshots.has(snapshot.matchId)) {
        return currentSnapshots;
      }

      const nextSnapshots = new Map(currentSnapshots);
      nextSnapshots.set(snapshot.matchId, snapshot);
      return nextSnapshots;
    });
  }, []);
  const createMatchRoomInFlightRef = useRef(false);
  const joinMatchRoomInFlightRef = useRef(false);
  const leaveMatchRoomInFlightRef = useRef(false);
  const lastHandledActiveRoomSnapshotKeyRef = useRef<string | null>(null);
  const lastDisplayedRecipientInviteKeyRef = useRef<string | null>(null);
  const recipientInviteFetchInFlightRef = useRef(false);
  const liveMatchMountedRef = useRef<{ matchId: string | null; mode: 'duel' | 'group'; mountedAtMs: number } | null>(null);
  const preservedLiveMatchShellRef = useRef<PreservedLiveMatchShell | null>(null);
  const liveMatchViewConfirmationRef = useRef<{
    matchId: string | null;
    mode: 'duel' | 'group' | null;
    showLiveArena: boolean;
  }>({
    matchId: null,
    mode: null,
    showLiveArena: false,
  });
  const previousLiveArenaShellVisibleRef = useRef<boolean | null>(null);
  const previousHasMatchResultPageRef = useRef<boolean | null>(null);
  const previousMatchLifecycleStageRef = useRef<string | null>(null);

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

  useRuntimeMatchRoomHydration({
    commitMatchRoom,
    liveMatchRouteHydration,
  });

  const linkedRuntimeRoom = selectLinkedRuntimeRoom({ matchRoom, visibleMatchRoom });
  const hasLinkedRuntimeRoom = isLinkedRoomRuntimeState(linkedRuntimeRoom);
  const visibleUpcomingMatches = useMemo(
    () => filterUpcomingMatchesForRuntime(
      upcomingMatches.filter((match) => !shouldHidePastUpcomingMatch(match, syncedNowMs)),
      linkedRuntimeRoom,
    ),
    [linkedRuntimeRoom, syncedNowMs, upcomingMatches],
  );
  const {
    matchOptions,
    canCreateDuelMatch,
    canCreateGroupMatch,
    blockingMatchHelperText,
    blockingRoomId,
    blockingDuelMatch,
    blockingGroupMatch,
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
  const {
    duelExpiryCountdownLabel,
    groupExpiryCountdownLabel,
    duelWaitingHint,
    duelWaitingMeta,
    duelWaitingTitle,
  } = useMatchLobbyRuntimeModel({
    duelMatchStatus,
    groupMatchStatus,
    isDuelTestFlow,
  });
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
  const partyRunRuntimeSource = useMemo(() => selectPartyRunRuntimeSource({
    matchRoom,
    matchRoomFlow,
    visibleMatchRoom,
    visiblePartyRunFlow,
  }), [matchRoom, matchRoomFlow, visibleMatchRoom, visiblePartyRunFlow]);
  const roomLinkedMatchContext = partyRunRuntimeSource.linkedMatchContext;
  const roomLinkedSlotStartAtForDiagnostics =
    roomLinkedMatchContext?.slotStartAt
    ?? matchRoomFlow.linkedMatchContext?.slotStartAt
    ?? visiblePartyRunFlow.linkedMatchContext?.slotStartAt
    ?? matchRoom?.linkedMatchSlotStartAt
    ?? visibleMatchRoom?.linkedMatchSlotStartAt
    ?? matchRoom?.slotStartAt
    ?? visibleMatchRoom?.slotStartAt
    ?? null;
  const roomLinkedSlotElapsedMsForDiagnostics = useMemo(() => {
    if (!roomLinkedSlotStartAtForDiagnostics) {
      return null;
    }

    const slotStartMs = Date.parse(roomLinkedSlotStartAtForDiagnostics);
    return Number.isFinite(slotStartMs) ? syncedNowMs - slotStartMs : null;
  }, [roomLinkedSlotStartAtForDiagnostics, syncedNowMs]);
  const trackRunIdleViewModel = useTrackRunIdleViewModel({
    mode,
    matchMode,
    trackingStatus: status,
    hydratedFocusMatchId,
    hydratedFocusRoomId,
    roomInviteToken,
    matchRoom,
    visibleMatchRoom,
    roomLinkedMatchContext,
    duelMatchStatus,
    groupMatchStatus,
    lastSyncedMatchProgress,
    forceOpenActiveMatch,
    isCreatingMatchRoom,
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    isRequestingDuelMatch,
    isRequestingGroupMatch,
  });
  const {
    liveMatchStartupIdentity,
    shouldStageAndroidLiveMatchStartup,
    hasRoomLinkedDuelContext,
    hasRoomLinkedGroupContext,
    duelArenaUsesLivePace,
    groupArenaUsesLivePace,
    officialCurrentAveragePace,
    duelShouldOpenCountdownArena,
    groupShouldOpenCountdownArena,
    roomShouldOpenCountdownArena,
    duelShouldHoldArenaDuringActivation,
    groupShouldHoldArenaDuringActivation,
    runningMatchIdentity,
  } = useMatchModeDerivedState({
    matchMode,
    isRunning,
    forceOpenActiveMatch,
    duelMatchState,
    groupMatchState,
    duelStartCountdownSeconds,
    groupStartCountdownSeconds,
    duelMatchStatus,
    groupMatchStatus,
    roomLinkedMatchContext,
    hydratedFocusMatchMode,
    hydratedFocusMatchId,
    lastSyncedMatchProgressMatchId: lastSyncedMatchProgress?.matchId,
    liveMatchRouteHydrationMatchId: liveMatchRouteHydration?.matchId,
    partyRunLinkedMatchId: partyRunRuntimeSource.room?.linkedMatchId,
    partyRunShouldOpenArena: partyRunRuntimeSource.flow.shouldOpenArena,
  });
  const androidLiveMatchStartup = useAndroidLiveMatchStartupGate({
    active: shouldStageAndroidLiveMatchStartup,
    identity: liveMatchStartupIdentity,
  });
  const liveMatchHeavyWorkReady = androidLiveMatchStartup.ready;
  const activeLiveMatchProgressMatchId = useMemo(() => {
    if (matchMode === 'duel') {
      return duelMatchStatus?.matchId
        ?? (roomLinkedMatchContext?.mode === 'duel' ? roomLinkedMatchContext.matchId : null);
    }

    if (matchMode === 'group') {
      return groupMatchStatus?.matchId
        ?? (roomLinkedMatchContext?.mode === 'group' ? roomLinkedMatchContext.matchId : null);
    }

    return null;
  }, [
    duelMatchStatus?.matchId,
    groupMatchStatus?.matchId,
    matchMode,
    roomLinkedMatchContext?.matchId,
    roomLinkedMatchContext?.mode,
  ]);
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
    locallyForfeitedMatches,
    activeMatchId: activeLiveMatchProgressMatchId,
    deferRankingCalculations: trackRunIdleViewModel.disableHeavySubscriptions || !liveMatchHeavyWorkReady,
  });
  const isTabMode = mode === 'tab';
  const heavyTickersFocusGate = !(
    isTabMode
    && trackRunIdleViewModel.hasLocalActiveHint
    && !isScreenFocused
  );
  const liveArenaPageWidth = Math.max(windowWidth - 32, 280);
  const currentUserArenaPace = useMemo(() => resolveCurrentUserArenaPace({
    officialCurrentAveragePace,
    liveMatchDisplayDistanceKm,
    liveMatchDisplayElapsedSeconds,
    shouldUseLivePace: duelArenaUsesLivePace || groupArenaUsesLivePace,
  }), [
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
  const effectiveDuelOpponentArenaPace = useMemo(
    () => resolveDuelOpponentArenaPace({
      opponent: effectiveDuelOpponent,
      duelArenaUsesLivePace,
    }),
    [duelArenaUsesLivePace, effectiveDuelOpponent],
  );
  const duelLiveSummary = useMemo(() => resolveDuelLiveSummary({
    opponent: effectiveDuelOpponent,
    opponentArenaPace: effectiveDuelOpponentArenaPace,
    opponentStatusLabel: effectiveDuelOpponentStatusLabel,
    isOpponentForfeited: isDuelOpponentForfeited,
  }), [
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
    room: linkedRuntimeRoom,
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
    linkedRuntimeRoom,
    roomLinkedMatchContext,
  ]);
  const {
    roomLinkedDuelCurrentParticipant,
    roomLinkedDuelOpponentParticipant,
    roomLinkedDuelGapKm,
    hasRoomLinkedDuelLiveProgress,
  } = useMemo(
    () => resolveRoomLinkedDuelProgress(roomLinkedDuelPlaceholderParticipants),
    [roomLinkedDuelPlaceholderParticipants],
  );
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
    room: linkedRuntimeRoom,
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
    linkedRuntimeRoom,
    liveMatchDisplayDistanceKm,
    roomLinkedMatchContext,
  ]);
  const currentUserFinishedForResultPageFromParticipants = useMemo(() => resolveCurrentUserFinishedForResultPage({
    matchMode,
    duelArenaParticipants,
    roomLinkedDuelPlaceholderParticipants,
    groupArenaParticipants,
    roomLinkedGroupPlaceholderParticipants,
  }), [
    duelArenaParticipants,
    groupArenaParticipants,
    matchMode,
    roomLinkedDuelPlaceholderParticipants,
    roomLinkedGroupPlaceholderParticipants,
  ]);
  const currentUserFinishedForResultPage = currentUserFinishedForResultPageFromParticipants || currentUserHasForfeitedActiveMatch;
  const hasTrackedMatchResult = Boolean(trackedMatchResult);
  const currentUserForfeitSnapshot = activeLiveMatchProgressMatchId
    ? locallyForfeitedMatches.get(activeLiveMatchProgressMatchId) ?? null
    : null;
  const effectiveDuelResultRows = useMemo(() => {
    if (duelResultRows.length || matchMode !== 'duel' || !currentUserHasForfeitedActiveMatch) {
      return duelResultRows;
    }

    return buildRoomLinkedDuelForfeitResultRows({
      currentUserForfeitSnapshot,
      liveElapsedSeconds: liveMatchDisplayElapsedSeconds,
      participants: roomLinkedDuelPlaceholderParticipants,
    });
  }, [
    currentUserHasForfeitedActiveMatch,
    currentUserForfeitSnapshot,
    duelResultRows,
    liveMatchDisplayElapsedSeconds,
    matchMode,
    roomLinkedDuelPlaceholderParticipants,
  ]);
  const effectiveGroupResultRows = useMemo(() => {
    if (groupResultRows.length || matchMode !== 'group' || !currentUserHasForfeitedActiveMatch) {
      return groupResultRows;
    }

    return buildRoomLinkedGroupForfeitResultRows({
      currentUserForfeitSnapshot,
      liveElapsedSeconds: liveMatchDisplayElapsedSeconds,
      participants: roomLinkedGroupPlaceholderParticipants,
    });
  }, [
    currentUserHasForfeitedActiveMatch,
    currentUserForfeitSnapshot,
    groupResultRows,
    liveMatchDisplayElapsedSeconds,
    matchMode,
    roomLinkedGroupPlaceholderParticipants,
  ]);
  const hasMatchResultPage = shouldShowMatchResultPageOnCurrentUserFinished({
    matchMode,
    currentUserFinished: currentUserFinishedForResultPage,
    hasTrackedMatchResult,
  });
  const {
    activeMatchExitCounterpartForfeited,
    activeMatchExitIsLeaving,
    activeMatchExitIsTest,
    activeMatchExitSource,
    matchLifecycleController,
    shouldEnableMatchProgressHeartbeat,
    shouldKeepRunningMatchArena,
    showLiveArena,
  } = useMatchRuntimeState({
    matchMode,
    trackingStatus: status,
    isRunning,
    isCurrentUserForfeited: currentUserHasForfeitedActiveMatch,
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
    fallbackMatchId: runningMatchIdentity,
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
  });
  const liveMatchRenderMode = matchMode === 'duel' || matchMode === 'group'
    ? matchMode
    : roomLinkedMatchContext?.mode ?? (
      hydratedFocusMatchMode === 'duel' || hydratedFocusMatchMode === 'group'
        ? hydratedFocusMatchMode
        : liveMatchMountedRef.current?.mode ?? null
    );
  const liveMatchRenderIdentity = liveMatchStartupIdentity
    ?? liveMatchRouteHydration?.matchId
    ?? liveMatchMountedRef.current?.matchId
    ?? null;
  const activeMatchExitSelfForfeited = Boolean(
    currentUserHasForfeitedActiveMatch
    && (activeMatchExitSource === 'duel' || activeMatchExitSource === 'group'),
  );
  const activeMatchExitSelfFinished = activeMatchExitSource === 'duel'
    && currentUserDuelLiveStatus === 'finished';
  const shouldForceLiveArenaFromRoute = Boolean(
    hydratedFocusMatchId
    && (
      hydratedForceMatchArena
      || liveMatchRouteHydration?.preferArena
      || (
        routeShellHint === 'live'
        && (
          matchLifecycleController.stage === 'arming'
          || matchLifecycleController.stage === 'countdown'
          || matchLifecycleController.stage === 'active'
        )
      )
    ),
  );
  const previousPreservedLiveMatchShell = preservedLiveMatchShellRef.current;
  const liveMatchShellPreservation = resolveLiveMatchShellPreservation({
    currentMatchId: liveMatchRenderIdentity,
    currentMode: liveMatchRenderMode,
    isCurrentUserForfeited: currentUserHasForfeitedActiveMatch,
    previous: previousPreservedLiveMatchShell,
    requestedShowLiveArena: showLiveArena || shouldForceLiveArenaFromRoute,
    stage: matchLifecycleController.stage,
  });
  preservedLiveMatchShellRef.current = liveMatchShellPreservation.next;
  const effectiveShowLiveArena = liveMatchShellPreservation.shouldRenderLiveArena;
  const shouldRenderLiveArena = effectiveShowLiveArena || shouldForceLiveArenaFromRoute;

  useEffect(() => {
    const previousShouldRenderLiveArena = previousLiveArenaShellVisibleRef.current;
    if (previousShouldRenderLiveArena !== null && previousShouldRenderLiveArena !== shouldRenderLiveArena) {
      rgDiagLog(shouldRenderLiveArena ? 'live arena shell restored' : 'live arena shell dropped', {
        appState: appStateRef.current,
        duelArenaParticipantCount: duelArenaParticipants.length,
        duelMatchId: duelMatchStatus?.matchId ?? null,
        duelMatchStateKind: duelMatchState,
        duelMatchStatusState: duelMatchStatus?.state ?? null,
        effectiveShowLiveArena,
        forceOpenActiveMatch,
        hasMatchResultPage,
        isCurrentUserForfeited: currentUserHasForfeitedActiveMatch,
        isLiveMatchState: isLiveMatchState(duelMatchState),
        isRunning,
        preservationRendered: liveMatchShellPreservation.shouldRenderLiveArena,
        shouldForceLiveArenaFromRoute,
        shouldRenderLiveArena,
        showLiveArena,
        stage: matchLifecycleController.stage,
      });
    }
    previousLiveArenaShellVisibleRef.current = shouldRenderLiveArena;
  }, [
    appStateRef,
    currentUserHasForfeitedActiveMatch,
    duelArenaParticipants.length,
    duelMatchState,
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    effectiveShowLiveArena,
    forceOpenActiveMatch,
    hasMatchResultPage,
    isRunning,
    liveMatchShellPreservation.shouldRenderLiveArena,
    matchLifecycleController.stage,
    shouldForceLiveArenaFromRoute,
    shouldRenderLiveArena,
    showLiveArena,
  ]);

  useEffect(() => {
    const previousHasMatchResultPage = previousHasMatchResultPageRef.current;
    if (previousHasMatchResultPage !== null && previousHasMatchResultPage !== hasMatchResultPage) {
      rgDiagLog('has match result page changed', {
        currentUserFinished: currentUserFinishedForResultPage,
        duelMatchId: duelMatchStatus?.matchId ?? null,
        duelMatchStateKind: duelMatchState,
        duelMatchStatusState: duelMatchStatus?.state ?? null,
        hasMatchResultPage,
        hasTrackedMatchResult,
        isPaused,
        matchMode,
      });
    }
    previousHasMatchResultPageRef.current = hasMatchResultPage;
  }, [
    currentUserFinishedForResultPage,
    duelMatchState,
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    hasMatchResultPage,
    hasTrackedMatchResult,
    isPaused,
    matchMode,
  ]);

  useEffect(() => {
    const previousMatchLifecycleStage = previousMatchLifecycleStageRef.current;
    if (
      previousMatchLifecycleStage !== null
      && previousMatchLifecycleStage !== matchLifecycleController.stage
    ) {
      rgDiagLog('match lifecycle stage changed', {
        duelArenaParticipantCount: duelArenaParticipants.length,
        duelMatchId: duelMatchStatus?.matchId ?? null,
        duelMatchStateKind: duelMatchState,
        duelMatchStatusState: duelMatchStatus?.state ?? null,
        effectiveShowLiveArena,
        forceOpenActiveMatch,
        fromStage: previousMatchLifecycleStage,
        hasMatchResultPage,
        isRunning,
        roomCountdownRemainingSeconds,
        roomLinkedSlotElapsedMs: roomLinkedSlotElapsedMsForDiagnostics,
        roomLinkedSlotStartAt: roomLinkedSlotStartAtForDiagnostics,
        shouldRenderLiveArena,
        showLiveArena,
        source: matchLifecycleController.source,
        syncedNowMs,
        toStage: matchLifecycleController.stage,
      });
    }
    previousMatchLifecycleStageRef.current = matchLifecycleController.stage;
  }, [
    duelArenaParticipants.length,
    duelMatchState,
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    effectiveShowLiveArena,
    forceOpenActiveMatch,
    hasMatchResultPage,
    isRunning,
    matchLifecycleController.stage,
    matchLifecycleController.source,
    roomCountdownRemainingSeconds,
    roomLinkedSlotElapsedMsForDiagnostics,
    roomLinkedSlotStartAtForDiagnostics,
    shouldRenderLiveArena,
    showLiveArena,
    syncedNowMs,
  ]);

  useTrackRunRuntimeTrace({
    currentTrackerStatus: status,
    duelMatchStatus,
    duelMatchStatusRef,
    focusMatchId,
    focusMatchMode,
    focusRoomId,
    groupMatchStatus,
    groupMatchStatusRef,
    isMountedRef,
    liveMatchRenderIdentity,
    liveMatchRenderMode,
    liveMatchRouteHydration,
    liveMatchShellPreservation,
    liveShareEnabled,
    liveShareEnabledRef,
    liveShareLabel,
    liveShareLabelRef,
    matchLifecycleStage: matchLifecycleController.stage,
    matchMode,
    matchModeRef,
    mode,
    previousPreservedLiveMatchShell,
    roomLinkedMatchContext,
    roomLinkedMatchContextRef,
    routeShellHint,
    showLiveArena: shouldRenderLiveArena,
    trackerStatusRef,
  });
  const backHref: Href = '/my-activity';
  const discardRedirectHref: Href | null = isTabMode ? null : '/my-activity';
  const shouldSkipDuelSlotDistanceCleanup = matchLifecycleController.source === 'party-room'
    && roomLinkedMatchContext?.mode === 'duel'
    && matchLifecycleController.stage !== 'waiting';
  const shouldSkipGroupSlotDistanceCleanup = matchLifecycleController.source === 'party-room'
    && roomLinkedMatchContext?.mode === 'group'
    && matchLifecycleController.stage !== 'waiting';

  useAndroidDeferredEffect(() => {
    if (matchMode !== 'duel' || shouldSkipDuelSlotDistanceCleanup) {
      return;
    }

    setDuelMatchResult((current) => {
      if (!current) {
        return null;
      }

      if (current.isTestMatch) {
        return current;
      }

      if (current.matched) {
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

      if (current.matchId) {
        return current;
      }

      const activeSlotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt;
      const shouldKeepStatus = current.distanceKm === duelDistanceKm && current.slotStartAt === activeSlotStartAt;
      if (!shouldKeepStatus) {
        rgDiagLog('duel match status reset by slot/distance effect', {
          currentDistanceKm: current.distanceKm,
          currentMatchId: current.matchId ?? null,
          currentSlotStartAt: current.slotStartAt ?? null,
          currentState: current.state,
          isTestMatch: current.isTestMatch,
          nextDistanceKm: duelDistanceKm,
          nextSlotStartAt: activeSlotStartAt ?? null,
          reason: 'slot-or-distance-mismatch',
        });
      }
      return shouldKeepStatus ? current : null;
    });
    setDuelMatchNotice(null);
  }, [duelDistanceKm, matchMode, selectedDuelSlot, selectedDuelSlotStartAt, shouldSkipDuelSlotDistanceCleanup]);

  useAndroidDeferredEffect(() => {
    if (matchMode !== 'group' || shouldSkipGroupSlotDistanceCleanup) {
      return;
    }

    setGroupMatchResult((current) => {
      if (!current) {
        return null;
      }

      if (current.isTestMatch) {
        return current;
      }

      if (current.matched) {
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

      if (current.matchId) {
        return current;
      }

      const activeSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;
      return current.distanceKm === groupDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setGroupMatchNotice(null);
  }, [groupDistanceKm, matchMode, selectedGroupSlot, selectedGroupSlotStartAt, shouldSkipGroupSlotDistanceCleanup]);

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

    focusedDuelMatchIdRef.current = payload.matchId ?? focusedDuelMatchIdRef.current;
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

    rgDiagLog('duel match status set from poll', {
      currentUserId,
      hasOpponent: Boolean(payload.opponent),
      nextMatchId: payload.matchId ?? null,
      nextState: payload.state ?? null,
      opponentId: payload.opponent?.id ?? null,
      opponentLiveDistanceKm: payload.opponent?.liveDistanceKm ?? null,
      opponentLiveUpdatedAt: payload.opponent?.liveUpdatedAt ?? null,
      requestedDistanceKm: options?.distanceKm ?? duelDistanceKm,
      requestedMatchId: options?.matchId ?? focusedDuelMatchIdRef.current ?? null,
      requestedSlotStartAt: slotStartAt,
      source: options?.forceAccept ? 'force-accept' : 'poll',
    });
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

    focusedGroupMatchIdRef.current = payload.matchId ?? focusedGroupMatchIdRef.current;
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

  const getCurrentLiveMatchId = useCallback(() => (
    liveMatchMountedRef.current?.matchId
    ?? focusedDuelMatchIdRef.current
    ?? focusedGroupMatchIdRef.current
    ?? roomLinkedMatchContext?.matchId
    ?? null
  ), [roomLinkedMatchContext?.matchId]);

  const {
    focusRoomLinkedMatch,
    focusRunningMatch,
    handleLiveMatchMounted,
    navigateToMatchRoomWithTrace,
  } = useTrackRunNavigationAdapter({
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
    liveMatchMountedRef,
    liveMatchViewConfirmationRef,
  });

  const {
    buildTrackRunActiveRoomCheckRouteKey,
    isExitingRoom,
    prepareMatchRoomMutation,
  } = useTrackRunRuntimeStateBridge({
    commitMatchRoom,
    focusMatchId,
    focusRoomId,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    forceOpenActiveMatch,
    hydratedMatchId: liveMatchRouteHydration?.matchId,
    hydratedMatchMode: liveMatchRouteHydration?.mode,
    hydratedRoomId: liveMatchRouteHydration?.roomId,
    lastRouteKeyCorrectionRef,
    liveArenaPage,
    matchMode,
    matchRoom,
    navigateToMatchRoomWithTrace,
    roomLinkedMatchContext,
    setError,
    setSelectedRoomFriendIds,
    visibleMatchRoom,
  });
  const {
    handleAcceptRoomInviteFromRunning,
    handleCreateMatchRoom,
    handleDeclineRoomInviteFromRunning,
    handleJoinMatchRoom,
    loadFriendLeaderboardData,
    loadMatchRoom,
  } = useTrackRunRuntimeRoomActions({
    activeRoomId: visibleMatchRoom?.roomId ?? matchRoom?.roomId ?? hydratedFocusRoomId ?? null,
    commitMatchRoom,
    currentUserId,
    isCreatingMatchRoom,
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    isLiveMatchMounted: Boolean(liveMatchMountedRef.current),
    joinMatchRoomInFlightRef,
    lastDisplayedRecipientInviteKeyRef,
    latestMatchRoomServerNowMsRef,
    leaveMatchRoomInFlightRef,
    linkedMatchId: visibleMatchRoom?.linkedMatchId
      ?? matchRoom?.linkedMatchId
      ?? roomLinkedMatchContext?.matchId
      ?? liveMatchRenderIdentity
      ?? hydratedFocusMatchId
      ?? null,
    liveMatchKey: liveMatchShellPreservation.key,
    matchRoom,
    recipientInviteFetchInFlightRef,
    roomCreateActionInput: {
      activeDuelSlotStartAt,
      activeGroupSlotStartAt,
      commitMatchRoom,
      createMatchRoomInFlightRef,
      duelDistanceKm,
      groupDistanceKm,
      isCreatingMatchRoom,
      latestMatchRoomServerNowMsRef,
      matchRoom,
      navigateToMatchRoomWithTrace,
      prepareMatchRoomMutation,
      roomMatchMode,
      roomMaxParticipants,
      roomStartMode,
      setError,
      setIsCreatingMatchRoom,
      syncServerClock,
      visibleMatchRoom,
    },
    roomJoinActionInput: {
      commitMatchRoom,
      isJoiningMatchRoom,
      joinMatchRoomInFlightRef,
      latestMatchRoomServerNowMsRef,
      matchRoom,
      navigateToMatchRoomWithTrace,
      prepareMatchRoomMutation,
      roomInviteTokenInput,
      setError,
      setIsJoiningMatchRoom,
      setRoomInviteTokenInput,
      syncServerClock,
      visibleMatchRoom,
    },
    roomLoaderInput: {
      buildTrackRunActiveRoomCheckRouteKey,
      commitMatchRoom,
      currentUserId,
      forfeitedMatchIdsRef,
      getCurrentLiveMatchId,
      isExitingRoom,
      isMountedRef,
      lastHandledActiveRoomSnapshotKeyRef,
      latestMatchRoomServerNowMsRef,
      liveMatchMountedRef,
      liveMatchRenderIdentity,
      liveMatchRenderMode,
      liveMatchShellPreservation,
      matchRoom,
      syncServerClock,
    },
    setError,
    setFriendLeaderboard,
    setIsJoiningMatchRoom,
    setIsLeavingMatchRoom,
    setSelectedRoomFriendIds,
    syncServerClock,
    visibleMatchRoom,
  });

  const clearLocalDuelMatchState = (notice?: string | null) => {
    focusedDuelMatchIdRef.current = null;
    setDuelMatchResult(null);
    rgDiagLog('duel match status set local clear', {
      currentMatchId: duelMatchStatus?.matchId ?? null,
      currentState: duelMatchStatus?.state ?? null,
      notice: notice ?? null,
      source: 'clearLocalDuelMatchState',
    });
    setDuelMatchStatus(null);
    setDuelMatchNotice(notice ?? null);
  };

  const clearLocalGroupMatchState = (notice?: string | null) => {
    focusedGroupMatchIdRef.current = null;
    setGroupMatchResult(null);
    setGroupMatchStatus(null);
    setGroupMatchNotice(notice ?? null);
  };

  const {
    acknowledgeRoomCountdownReady,
    clearLocalForfeitedMatchState,
    handleCancelDuelMatch,
    handleCancelGroupMatch,
    handleCancelUpcomingMatch,
    handleRequestDuelMatch,
    handleRequestGroupMatch,
    refreshStaleMatchArtifacts,
    syncRoomLinkedMatchStatus,
  } = useTrackRunRuntimeMatchActions({
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    autoStartedMatchIdRef,
    clearLocalDuelMatchState,
    clearLocalGroupMatchState,
    commitMatchRoom,
    duelDistanceKm,
    duelMatchResult,
    duelMatchState,
    duelMatchStatus,
    forfeitedMatchIdsRef,
    groupDistanceKm,
    groupMatchResult,
    groupMatchState,
    groupMatchStatus,
    isDuelTestFlow,
    isGroupTestFlow,
    latestMatchRoomServerNowMsRef,
    livePagerRef,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
    loadMatchRoom,
    loadUpcomingMatches,
    matchProgressHeartbeatRef,
    matchRoom,
    preStartWarmupMatchIdRef,
    roomLinkedMatchContextRef,
    selectedDuelSlot,
    selectedDuelSlotStartAt,
    selectedGroupSlot,
    selectedGroupSlotStartAt,
    setCancelingUpcomingMatchId,
    setDuelDemandSummary,
    setDuelMatchNotice,
    setDuelMatchResult,
    setDuelMatchStatus,
    setError,
    setForceOpenActiveMatch,
    setGroupDemandSummary,
    setGroupMatchNotice,
    setGroupMatchResult,
    setGroupMatchStatus,
    setIsCancelingDuelMatch,
    setIsCancelingGroupMatch,
    setIsRequestingDuelMatch,
    setIsRequestingGroupMatch,
    setLastSyncedMatchProgress,
    setLiveArenaPage,
    setMatchMode,
    setUpcomingMatches,
    status,
    syncServerClock,
    trackRunIdleViewModel,
    upcomingMatches,
  });

  const {
    error: forceLeaveStuckMatchError,
    forceLeave: forceLeaveStuckMatch,
    isLeaving: isForceLeavingStuckMatch,
  } = useForceLeaveStuckMatch({
    onSettled: refreshStaleMatchArtifacts,
  });

  const runForceResetRunningMatchState = useStableCallback(async () => {
    if (isForceResettingRunningMatch) {
      return;
    }

    setIsForceResettingRunningMatch(true);
    try {
      const payload = await forceResetRunningMatchState();
      rgPerfMark('running match force reset completed', {
        cleaned: payload.cleaned,
        cleanedItems: payload.cleanedItems.join(','),
        source: 'track-run emergency reset',
      });
      commitMatchRoom(null);
      setSelectedRoomFriendIds([]);
      clearLocalDuelMatchState(null);
      clearLocalGroupMatchState(null);
      setForceOpenActiveMatch(false);
      setError(null);
      await refreshStaleMatchArtifacts().catch(() => {});
      Alert.alert('초기화 완료', '다시 방 만들기 또는 매칭을 눌러주세요.');
    } catch (resetError) {
      Alert.alert(
        '초기화 실패',
        getApiErrorMessage(resetError, '매칭 상태를 강제로 초기화하지 못했어.'),
      );
    } finally {
      setIsForceResettingRunningMatch(false);
    }
  });

  const handleForceResetRunningMatchPress = useStableCallback(() => {
    Alert.alert(
      '강제 초기화',
      '진행 중인 모든 매치/방/대기열을 강제로 정리합니다. 진행 중인 대결은 패배 처리될 수 있어요. 계속할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: () => {
            void runForceResetRunningMatchState();
          },
        },
      ],
    );
  });

  const {
    runtimeSoloStartCountdownSeconds,
    shouldShowCenteredMatchCountdown,
    shouldShowFullscreenMatchCountdown,
  } = useTrackRunRuntimeScreenState({
    effectiveShowLiveArena: shouldRenderLiveArena,
    isIdle,
    liveMatchRenderMode,
    liveMatchStartupIdentity: liveMatchRenderIdentity,
    liveMatchViewConfirmationRef,
    roomCountdownEntry,
    soloStartCountdownSeconds,
    visibleCountdownEntry,
  });

  useTrackRunRuntimeEffects({
    demandSummaryEffects: {
      duelDistanceKm,
      duelSlotStartAt: selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt,
      groupDistanceKm,
      groupSlotStartAt: selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt,
      matchMode,
      setDuelDemandSummary,
      setGroupDemandSummary,
      setIsLoadingDuelDemandSummary,
      setIsLoadingGroupDemandSummary,
    },
    directStatusEffects: {
      activeDuelSlotStartAt,
      activeGroupSlotStartAt,
      duelDistanceKm,
      focusRequestedDuelTest,
      focusRequestedGroupTest,
      groupDistanceKm,
      isDuelTestFlow,
      isGroupTestFlow,
      loadDuelMatchStatus,
      loadGroupMatchStatus,
      matchMode,
      roomLinkedMatchMode: roomLinkedMatchContext?.mode ?? null,
      setDuelMatchStatus,
      setGroupMatchStatus,
    },
    upcomingMatchPolling: {
      duelMatchId: duelMatchStatus?.matchId,
      duelMatchState: duelMatchStatus?.state,
      groupMatchId: groupMatchStatus?.matchId,
      groupMatchState: groupMatchStatus?.state,
      loadUpcomingMatches,
      onUpcomingMatchesFallback: setUpcomingMatches,
    },
    initialLoadEffects: {
      commitMatchRoom,
      loadFriendLeaderboardData,
      loadMatchRoom,
      setFriendLeaderboard,
      trackRunIdleViewModel,
    },
    partyRunSync: {
      enabled: trackRunIdleViewModel.shouldRunPartyRunSync,
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
      lifecycleController: matchLifecycleController,
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
    },
    staleMatchCleanup: {
      enabled: trackRunIdleViewModel.shouldRunActiveRoomCheck || !trackRunIdleViewModel.disableHeavySubscriptions,
      refreshStaleMatchArtifacts,
    },
    matchEntryEffects: {
      focusMatchNonce: hydratedFocusMatchNonce,
      focusMatchMode: hydratedFocusMatchMode,
      focusMatchId: hydratedFocusMatchId,
      focusMatchDistanceKm: hydratedFocusMatchDistanceKm,
      focusMatchSlotStartAt: hydratedFocusMatchSlotStartAt,
      focusMatchIsTest,
      focusRoomId: hydratedFocusRoomId,
      forceMatchArena: hydratedForceMatchArena,
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
    },
    liveMatchNavigationEffects: {
      livePagerRef,
      isResolvingFocusedMatch,
      isIdle,
      forceOpenActiveMatch,
      shouldKeepRunningMatchArena,
      showLiveArena: shouldRenderLiveArena,
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
    },
    notificationSync: {
      upcomingMatches,
      matchRemindersEnabled,
      onMatchRemindersEnabledChange: setMatchRemindersEnabled,
    },
    countdownTicker: {
      serverClockOffsetMsRef,
      onNowMsChange: setNowMs,
      enabled: heavyTickersFocusGate
        && trackRunIdleViewModel.shouldRunCountdownTicker
        && Boolean(
          isStarting
          || isRunning
          || hydratedFocusMatchId
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
    },
    blockingMatchStatusPolling: {
      matchMode,
      duelMatchStatus,
      groupMatchStatus,
      syncedNowMs,
      fastPollMs: MATCH_STATUS_FAST_POLL_MS,
      // Was 15000 — the guest could sit ~7.5s on the lobby/main tab waiting
      // for the next status poll to deliver `matched`, which is the main
      // visible delay before the host's start API result reaches them.
      // 5000ms keeps the worst-case under ~2.5s without a meaningful
      // increase in load (we only poll while heavy work is ready and the
      // lifecycle controller asks for direct status polling).
      idlePollMs: 5000,
      loadDuelMatchStatus,
      loadGroupMatchStatus,
      enabled: !trackRunIdleViewModel.disableHeavySubscriptions
        && liveMatchHeavyWorkReady
        && (
          matchLifecycleController.effects.shouldPollDirectMatchStatus
          || matchLifecycleController.effects.shouldPollLinkedMatch
        ),
      linkedMatchContext: matchLifecycleController.effects.shouldPollLinkedMatch
        ? roomLinkedMatchContext
        : null,
      recoveryMatchId: matchLifecycleController.source === 'party-room' ? null : matchLifecycleController.matchId,
    },
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
  } = useTrackRunRuntimeShareState({
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
    elapsedTickerEnabled: heavyTickersFocusGate,
    matchProgressHeartbeatEnabled: heavyTickersFocusGate
      && trackRunIdleViewModel.shouldRunLiveMatchProgress
      && shouldEnableMatchProgressHeartbeat,
    matchLifecycleController,
    slotElapsedTickerEnabled: heavyTickersFocusGate,
    trackingSubscriptionsEnabled: heavyTickersFocusGate
      && trackRunIdleViewModel.shouldRunTrackingSubscriptions,
  });

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
    markMatchLocallyForfeited,
  });

  const trackRunActionHandlers = useTrackRunRuntimeActions({
    matchMode,
    matchRoom,
    handleSaveTracking,
    handlePauseTracking,
    handleResumeTracking,
    handleDiscardTracking,
    handleCreateMatchRoom,
    handleStartTracking,
    navigateToMatchRoomWithTrace,
  });
  const {
    handleReadyAction,
  } = trackRunActionHandlers;

  const liveContainerProps = useLiveMatchRuntimeModel({
    actionHandlers: trackRunActionHandlers,
    forfeitControllerInput: {
      source: activeMatchExitSource,
      isTestMatch: activeMatchExitIsTest,
      isLeaving: activeMatchExitIsLeaving,
      isSaving,
      isRunning,
      counterpartForfeited: activeMatchExitCounterpartForfeited,
      selfForfeited: activeMatchExitSelfForfeited,
      selfFinished: activeMatchExitSelfFinished,
      onContinueSolo: handleContinueSoloFromMatch,
      onForfeit: handleForfeitMatch,
      onShowResultAfterCounterpartForfeit: handleShowResultAfterCounterpartForfeit,
    },
    isPaused,
    isRunning,
    isSaving,
    matchMode,
    showLiveArena: shouldRenderLiveArena,
    viewModelInput: {
      scrollRef: livePagerRef,
      page: liveArenaPage,
      pageWidth: liveArenaPageWidth,
      hasResultPage: hasMatchResultPage,
      onPageChange: setLiveArenaPage,
      activeMatchId: liveMatchRenderIdentity,
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
      shouldKeepRunningMatchArena: shouldKeepRunningMatchArena || shouldForceLiveArenaFromRoute,
      currentUserDuelLiveStatus,
      currentUserGroupLiveStatus,
      deferHeavyContent: !liveMatchHeavyWorkReady,
      onLiveMatchMounted: handleLiveMatchMounted,
      groupLiveStandings,
      groupArenaUsesLivePace,
      liveMatchTitle,
      liveMatchText,
      duelLiveTitle,
      duelStatusAlert,
      isLeavingDuelMatch,
      groupStatusAlert,
      isLeavingGroupMatch,
      elapsedSeconds: liveMatchDisplayElapsedSeconds,
      averagePace: liveMatchDisplayFrame.averagePace,
      currentPace: liveMatchDisplayFrame.currentPace,
      cadenceSpm: liveMatchDisplayFrame.cadenceSpm,
      elevationGainM: liveMatchDisplayFrame.elevationGainM,
      onContinueSoloFromMatch: handleContinueSoloFromMatch,
      estimatedBonusPoints: estimatedMatchBonusPoints,
      duelRows: effectiveDuelResultRows,
      groupRows: effectiveGroupResultRows,
      groupStatusLabel: groupResultStatusLabel,
    },
  });

  const handleOpenUpcomingMatch = useStableCallback((match: UpcomingRunningMatchItem) => {
    void focusRunningMatch({
      mode: match.mode,
      distanceKm: match.distanceKm,
      slotStartAt: match.slotStartAt,
      isTestMatch: match.isTestMatch,
    }).catch(() => {});
  });

  const handleCancelUpcomingMatchPress = useStableCallback((match: UpcomingRunningMatchItem) => {
    void handleCancelUpcomingMatch(match);
  });

  const handleSelectMatchOption = useStableCallback((option: MatchOptionItem) => {
    if (option.mode === 'room' && visibleMatchRoom) {
      if (isMatchRoomDeleted(visibleMatchRoom.roomId)) {
        rgPerfMark('room entry skipped deleted room', {
          roomId: visibleMatchRoom.roomId,
          source: 'ready option existing room',
          state: visibleMatchRoom.state,
        });
        return;
      }

      rgPerfMark('already joined room detected', {
        roomId: visibleMatchRoom.roomId,
        source: 'ready option select',
        state: visibleMatchRoom.state,
      });
      navigateToMatchRoomWithTrace('ready option existing room', visibleMatchRoom);
      return;
    }

    setMatchMode(option.mode);
  });

  const handleAcceptRoomInvitePress = useStableCallback(() => {
    void handleAcceptRoomInviteFromRunning();
  });

  const handleDeclineRoomInvitePress = useStableCallback(() => {
    void handleDeclineRoomInviteFromRunning();
  });

  const handleJoinRoomPress = useStableCallback(() => {
    return handleJoinMatchRoom();
  });

  const handleSelectDuelDate = useStableCallback((dateKey: string) => {
    setSelectedDuelDateKey(dateKey);
    selectNextDuelSlotForDate(dateKey);
  });

  const handleCancelDuelMatchPress = useStableCallback(() => {
    void handleCancelDuelMatch();
  });

  const handleRequestDuelMatchPress = useStableCallback(() => {
    void handleRequestDuelMatch();
  });

  const handleRequestDuelTestMatchPress = useStableCallback(() => {
    void handleRequestDuelMatch(activeDuelSlotStartAt, { testMode: true });
  });

  const handleRequestDuelRematchPress = useStableCallback(() => {
    void handleRequestDuelMatch(activeDuelSlotStartAt);
  });

  const handleSelectGroupDate = useStableCallback((dateKey: string) => {
    setSelectedGroupDateKey(dateKey);
    selectNextGroupSlotForDate(dateKey);
  });

  const handleCancelGroupMatchPress = useStableCallback(() => {
    void handleCancelGroupMatch();
  });

  const handleForceLeaveStuckMatchPress = useStableCallback(() => {
    void forceLeaveStuckMatch({
      roomId: blockingRoomId,
      duelMatch: blockingDuelMatch,
      groupMatch: blockingGroupMatch,
    });
  });

  const handleRequestGroupMatchPress = useStableCallback(() => {
    void handleRequestGroupMatch();
  });

  const handleRequestGroupTestMatchPress = useStableCallback(() => {
    void handleRequestGroupMatch(activeGroupSlotStartAt, { testMode: true });
  });

  const handleRequestGroupRematchPress = useStableCallback(() => {
    void handleRequestGroupMatch(activeGroupSlotStartAt);
  });

  const shouldShowReadyScreen = isIdle && !shouldRenderLiveArena && !hasLinkedRuntimeRoom;
  const {
    readyScreenProps,
    trackRunShellKind,
  } = useIdleRunRuntimeModel({
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    blockingMatchHelperText,
    bottomInset: insets.bottom,
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
    duelSelectedSlotStartAt: selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt,
    duelStartCountdownSeconds,
    duelWaitingHint,
    duelWaitingMeta,
    duelWaitingTitle,
    effectiveDuelOpponent,
    effectiveDuelOpponentStatusLabel,
    effectiveDuelSlotLabel,
    effectiveGroupParticipantCount,
    effectiveGroupParticipants,
    effectiveGroupSeedRank: effectiveGroupSeedRank ?? null,
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
    groupSelectedSlotStartAt: selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt,
    groupStartCountdownSeconds,
    forceLeaveStuckMatchError,
    hasLinkedRuntimeRoom,
    isCancelingDuelMatch,
    isCancelingGroupMatch,
    isCreatingMatchRoom,
    isGroupTestFlow,
    isIdle,
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    isForceLeavingStuckMatch,
    isLoadingGroupDemandSummary,
    isRequestingDuelMatch,
    isRequestingGroupMatch,
    matchMode,
    matchOptions,
    matchRoom,
    onAcceptRoomInvite: handleAcceptRoomInvitePress,
    onCancelDuelMatch: handleCancelDuelMatchPress,
    onCancelGroupMatch: handleCancelGroupMatchPress,
    onCancelUpcomingMatch: handleCancelUpcomingMatchPress,
    onDeclineRoomInvite: handleDeclineRoomInvitePress,
    onDistanceTextChangeDuel: setDuelDistanceText,
    onDistanceTextChangeGroup: setGroupDistanceText,
    onForceLeaveStuckMatch: handleForceLeaveStuckMatchPress,
    onJoinRoom: handleJoinRoomPress,
    onOpenUpcomingMatch: handleOpenUpcomingMatch,
    onReadyAction: handleReadyAction,
    onRequestDuelMatch: handleRequestDuelMatchPress,
    onRequestDuelRematch: handleRequestDuelRematchPress,
    onRequestDuelTestMatch: handleRequestDuelTestMatchPress,
    onRequestGroupMatch: handleRequestGroupMatchPress,
    onRequestGroupRematch: handleRequestGroupRematchPress,
    onRequestGroupTestMatch: handleRequestGroupTestMatchPress,
    onSelectDuelDate: handleSelectDuelDate,
    onSelectDuelSlot: setSelectedDuelSlotStartAt,
    onSelectDuelTimeSection: selectDuelTimeSection,
    onSelectGroupDate: handleSelectGroupDate,
    onSelectGroupSlot: setSelectedGroupSlotStartAt,
    onSelectGroupTimeSection: selectGroupTimeSection,
    onSelectMatchOption: handleSelectMatchOption,
    onShowCustomDistanceInputChangeDuel: setShowDuelCustomDistanceInput,
    onShowCustomDistanceInputChangeGroup: setShowGroupCustomDistanceInput,
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
    visibleUpcomingMatchesNowMs: visibleUpcomingMatches.length > 0 ? syncedNowMs : 0,
  });
  const liveShellGateDecision = resolveTrackRunLiveShellGate({
    focusMatchId: hydratedFocusMatchId,
    forceMatchArena: hydratedForceMatchArena,
    hydratedMatchId: liveMatchRouteHydration?.matchId,
    matchLifecycleStage: matchLifecycleController.stage,
    requestedShell: trackRunShellKind,
    requestedShouldShowReadyScreen: shouldShowReadyScreen,
    routePreferArena: liveMatchRouteHydration?.preferArena,
    routeShellHint,
    showLiveArena: shouldRenderLiveArena,
  });
  useTrackRunLiveShellGateTrace({
    decision: liveShellGateDecision,
    requestedShell: trackRunShellKind,
    routeShellHint,
  });
  const trackRunViewProps = useTrackRunRuntimePropsComposer({
    backHref,
    centeredCountdownEntry: shouldShowCenteredMatchCountdown && visibleCountdownEntry
      ? visibleCountdownEntry
      : null,
    error,
    fullscreenCountdownEntry: shouldShowFullscreenMatchCountdown && visibleCountdownEntry
      ? visibleCountdownEntry
      : null,
    isForceResettingRunningMatch,
    isTabMode,
    liveContainerProps,
    liveMatchKey: liveMatchShellPreservation.key,
    onForceResetRunningMatch: handleForceResetRunningMatchPress,
    readyScreenProps,
    shellKind: liveShellGateDecision.shellKind,
    shouldShowReadyScreen: liveShellGateDecision.shouldShowReadyScreen,
    showForceResetAction: isRunningMatchForceResetCandidate(error),
    shouldShowRoomArmingOverlay,
    soloStartCountdownSeconds: runtimeSoloStartCountdownSeconds,
  });

  return <TrackRunExperienceView {...trackRunViewProps} />;
}
