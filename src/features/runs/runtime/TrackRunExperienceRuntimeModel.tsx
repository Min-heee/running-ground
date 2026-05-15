import { useCallback, useMemo, useRef } from 'react';
import {
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { type Href, useFocusEffect } from 'expo-router';
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
import { useAndroidLiveMatchDisplayFrame } from '@/features/runs/viewModels/useAndroidLiveMatchDisplayFrame';
import { useAndroidLiveMatchStartupGate } from '@/features/runs/lifecycle/hooks/useAndroidLiveMatchStartupGate';
import { useTrackRunIdleViewModel } from '@/features/runs/viewModels/useTrackRunIdleViewModel';
import { useMatchRuntimeState } from '@/features/runs/hooks/useMatchRuntimeState';
import { useMatchRoomSelectionSync } from '@/features/runs/hooks/useMatchRoomSelectionSync';
import { useMatchSelectionModel } from '@/features/runs/hooks/useMatchSelectionModel';
import { useMatchCountdownModel } from '@/features/runs/lifecycle/hooks/useMatchCountdownModel';
import { useRunTrackingFlow } from '@/features/runs/hooks/useRunTrackingFlow';
import {
  acknowledgeRunningMatchRoomCountdown,
  cancelRunningMatch,
  createRunningMatchRoom,
  fetchFriendLeaderboard,
  fetchRunningMatchRoomInviteInbox,
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
} from '@/features/runs/sync/staleRoomCleanup';
import {
  getActiveRoomCheckResultSkipReason,
  runActiveRoomCheck,
} from '@/features/runs/sync/activeRoomCheck';
import {
  buildActiveRoomResultLogDetail,
  buildActiveRoomSnapshotKey,
} from '@/features/runs/sync/activeRoomResult';
import {
  buildRecipientRoomInviteInboxResult,
} from '@/features/runs/sync/roomInviteInbox';
import {
  shouldAutoOpenMatchArena,
} from '@/lib/matchCountdown';
import {
  type RunningMatchStatusResponse,
  type UpcomingRunningMatchItem,
} from '@/lib/api/types';
import {
  buildAverageArenaPaceLabel,
  buildParticipantAveragePaceLabel,
  isMeasuredPaceLabel,
} from '@/features/runs/viewModels/matchProgress';
import {
  LIVE_MATCH_ROOM_IDLE_POLL_MS,
  LIVE_MATCH_SERVER_SYNC_INTERVAL_MS,
  LIVE_MATCH_STATUS_IDLE_POLL_MS,
} from '@/features/runs/sync/liveMatchCadence';
import {
  buildDuelArenaParticipants,
  buildGroupArenaParticipants,
  buildRoomLinkedDuelPlaceholderParticipants,
  buildRoomLinkedGroupPlaceholderParticipants,
} from '@/features/runs/viewModels/matchViewModels';
import {
  buildMatchTransitionNotice,
  type PartyRunLinkedMatchContext,
  shouldUseCenteredMatchCountdown,
  shouldUseFullscreenMatchCountdown,
} from '@/features/runs/lifecycle/matchStateMachine';
import {
  filterUpcomingMatchesForRuntime,
  isLinkedRoomRuntimeState,
  selectLinkedRuntimeRoom,
  selectPartyRunRuntimeSource,
} from '@/features/runs/lifecycle/matchRuntimeStateSelector';
import { getLiveMatchRouteHydration } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import { buildTrackRunRuntimeRouteKey } from '@/features/runs/lifecycle/trackRunRouteState';
import {
  resolveLiveMatchShellPreservation,
  type PreservedLiveMatchShell,
} from '@/features/runs/lifecycle/liveMatchShellPreservation';
import { isMatchRoomExiting } from '@/features/runs/lifecycle/matchRoomExitGuard';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import { getCurrentUserProfile } from '@/lib/session';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import {
  beginRgInputTrace,
  isRgInputInteractionRecent,
  waitForRgInputFeedbackFrame,
} from '@/utils/rgInputTrace';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';
import { useTrackRunNavigationAdapter } from '@/features/runs/runtime/useTrackRunNavigationAdapter';
import { useTrackRunIdleRuntime } from '@/features/runs/runtime/useTrackRunIdleRuntime';
import { useMatchLobbyRuntime } from '@/features/runs/runtime/useMatchLobbyRuntime';
import { useTrackRunRuntimeTrace } from '@/features/runs/runtime/useTrackRunRuntimeTrace';
import { useTrackRunRuntimeEffects } from '@/features/runs/runtime/useTrackRunRuntimeEffects';
import { useIdleRunRuntimeModel } from '@/features/runs/runtime/useIdleRunRuntimeModel';
import { useMatchLobbyRuntimeModel } from '@/features/runs/runtime/useMatchLobbyRuntimeModel';
import { useTrackRunRuntimeActions } from '@/features/runs/runtime/useTrackRunRuntimeActions';
import { useLiveMatchRuntimeModel } from '@/features/runs/runtime/useLiveMatchRuntimeModel';

const STALE_RENDER_MATCHED_MATCH_MS = 10 * 60 * 1000;
const STALE_RENDER_ACTIVE_MATCH_MS = 8 * 60 * 60 * 1000;
const OFFICIAL_START_DISTANCE_NOISE_GRACE_SECONDS = 5;
const OFFICIAL_START_DISTANCE_NOISE_GRACE_KM = 0.05;
const SOLO_START_COUNTDOWN_SECONDS = 5;
const MATCH_ROOM_FAST_POLL_MS = LIVE_MATCH_SERVER_SYNC_INTERVAL_MS;
const MATCH_ROOM_IDLE_POLL_MS = LIVE_MATCH_ROOM_IDLE_POLL_MS;
const MATCH_STATUS_FAST_POLL_MS = LIVE_MATCH_SERVER_SYNC_INTERVAL_MS;
const MATCH_STATUS_IDLE_POLL_MS = LIVE_MATCH_STATUS_IDLE_POLL_MS;

function useStableCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback((...args: TArgs) => callbackRef.current(...args), []);
}

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
  const liveMatchRouteHydration = getLiveMatchRouteHydration();
  const hydratedFocusMatchMode = focusMatchMode ?? liveMatchRouteHydration?.mode;
  const hydratedFocusMatchId = focusMatchId ?? (
    liveMatchRouteHydration?.mode === hydratedFocusMatchMode
      ? liveMatchRouteHydration?.matchId
      : undefined
  );
  const hydratedFocusRoomId = focusRoomId ?? liveMatchRouteHydration?.roomId ?? undefined;
  const hydratedFocusMatchDistanceKm = focusMatchDistanceKm ?? liveMatchRouteHydration?.distanceKm;
  const hydratedFocusMatchSlotStartAt = focusMatchSlotStartAt ?? liveMatchRouteHydration?.slotStartAt;
  const hydratedForceMatchArena = forceMatchArena ?? liveMatchRouteHydration?.preferArena;
  const hydratedFocusMatchNonce = focusMatchNonce ?? liveMatchRouteHydration?.nonce;

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
  const liveMatchStartupIdentity = useMemo(() => {
    if (matchMode === 'duel') {
      return duelMatchStatus?.matchId
        ?? (roomLinkedMatchContext?.mode === 'duel' ? roomLinkedMatchContext.matchId : null)
        ?? (hydratedFocusMatchMode === 'duel' ? hydratedFocusMatchId ?? null : null)
        ?? null;
    }

    if (matchMode === 'group') {
      return groupMatchStatus?.matchId
        ?? (roomLinkedMatchContext?.mode === 'group' ? roomLinkedMatchContext.matchId : null)
        ?? (hydratedFocusMatchMode === 'group' ? hydratedFocusMatchId ?? null : null)
        ?? null;
    }

    return null;
  }, [
    duelMatchStatus?.matchId,
    groupMatchStatus?.matchId,
    hydratedFocusMatchId,
    hydratedFocusMatchMode,
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
      || partyRunRuntimeSource.flow.shouldOpenArena
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
    deferRankingCalculations: trackRunIdleViewModel.disableHeavySubscriptions || !liveMatchHeavyWorkReady,
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
  const duelShouldOpenCountdownArena = duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds);
  const groupShouldOpenCountdownArena = groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds);
  const roomShouldOpenCountdownArena = Boolean(
    partyRunRuntimeSource.room?.linkedMatchId
    && (partyRunRuntimeSource.flow.shouldOpenArena || forceOpenActiveMatch),
  );
  const duelShouldHoldArenaDuringActivation = duelMatchState === 'matched' && forceOpenActiveMatch;
  const groupShouldHoldArenaDuringActivation = groupMatchState === 'matched' && forceOpenActiveMatch;
  const runningMatchIdentity = matchMode === 'duel'
    ? duelMatchStatus?.matchId
      ?? (roomLinkedMatchContext?.mode === 'duel' ? roomLinkedMatchContext.matchId : null)
      ?? (hydratedFocusMatchMode === 'duel' ? hydratedFocusMatchId ?? null : null)
      ?? lastSyncedMatchProgress?.matchId
      ?? null
    : matchMode === 'group'
      ? groupMatchStatus?.matchId
        ?? (roomLinkedMatchContext?.mode === 'group' ? roomLinkedMatchContext.matchId : null)
        ?? (hydratedFocusMatchMode === 'group' ? hydratedFocusMatchId ?? null : null)
        ?? lastSyncedMatchProgress?.matchId
        ?? null
      : liveMatchRouteHydration?.matchId ?? null;
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
  const previousPreservedLiveMatchShell = preservedLiveMatchShellRef.current;
  const liveMatchShellPreservation = resolveLiveMatchShellPreservation({
    currentMatchId: liveMatchRenderIdentity,
    currentMode: liveMatchRenderMode,
    isCurrentUserForfeited: currentUserHasForfeitedActiveMatch,
    previous: previousPreservedLiveMatchShell,
    requestedShowLiveArena: showLiveArena,
    stage: matchLifecycleController.stage,
  });
  preservedLiveMatchShellRef.current = liveMatchShellPreservation.next;
  const effectiveShowLiveArena = liveMatchShellPreservation.shouldRenderLiveArena;

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
    showLiveArena,
    trackerStatusRef,
  });
  const backHref: Href = '/my-activity';
  const discardRedirectHref: Href | null = isTabMode ? null : '/my-activity';

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

  const buildTrackRunActiveRoomCheckRouteKey = () => {
    const routeState = buildTrackRunRuntimeRouteKey({
      focusMatchId,
      focusRoomId,
      focusedDuelMatchId: focusedDuelMatchIdRef.current,
      focusedGroupMatchId: focusedGroupMatchIdRef.current,
      forceOpenActiveMatch,
      hydratedMatchId: liveMatchRouteHydration?.matchId,
      hydratedMatchMode: liveMatchRouteHydration?.mode,
      hydratedRoomId: liveMatchRouteHydration?.roomId,
      liveArenaPage,
      matchMode,
      matchRoomId: matchRoom?.roomId,
      roomLinkedMatchId: roomLinkedMatchContext?.matchId,
      visibleMatchRoomId: visibleMatchRoom?.roomId,
    });

    if (routeState.correctedByRouteParams && lastRouteKeyCorrectionRef.current !== routeState.routeKey) {
      lastRouteKeyCorrectionRef.current = routeState.routeKey;
      rgPerfMark('live match route key corrected', {
        focusMatchId: focusMatchId ?? null,
        focusRoomId: focusRoomId ?? null,
        hydratedMatchId: liveMatchRouteHydration?.matchId ?? null,
        hydratedRoomId: liveMatchRouteHydration?.roomId ?? null,
        matchId: routeState.matchId,
        roomId: routeState.roomId,
        routeKey: routeState.routeKey,
        source: 'track-run experience',
      });
    }

    return routeState.routeKey;
  };

  const getCurrentLiveMatchId = () => (
    liveMatchMountedRef.current?.matchId
    ?? focusedDuelMatchIdRef.current
    ?? focusedGroupMatchIdRef.current
    ?? roomLinkedMatchContext?.matchId
    ?? null
  );

  const loadMatchRoom = async (options?: {
    ignoreDuringInteraction?: boolean;
    localActiveMatchId?: string | null;
    localActiveRoomId?: string | null;
    priority?: 'normal' | 'low-priority';
    requireLocalActiveHint?: boolean;
  }) => {
    try {
      const routeKey = buildTrackRunActiveRoomCheckRouteKey();
      const priority = options?.priority ?? 'normal';
      const localActiveMatchId = options?.localActiveMatchId ?? null;
      const localActiveRoomId = options?.localActiveRoomId ?? null;

      if (options?.requireLocalActiveHint && !localActiveRoomId && !localActiveMatchId) {
        rgPerfMark('active room check skipped no local active hint', {
          priority,
          routeKey,
          source: 'track-run experience',
        });
        return matchRoom;
      }

      if (options?.ignoreDuringInteraction && isRgInputInteractionRecent()) {
        rgPerfMark('active room check skipped during interaction', {
          priority,
          routeKey,
          source: 'track-run experience',
        });
        rgPerfMark('active room check suppressed by user interaction', {
          priority,
          routeKey,
          source: 'track-run experience',
        });
        return matchRoom;
      }

      if (priority === 'low-priority') {
        rgPerfMark('active room check low priority idle', {
          routeKey,
          source: 'track-run experience',
        });
      }

      const activeRoomCheckResult = await runActiveRoomCheck({
        ...(priority === 'low-priority'
          ? {
              hardTimeoutMs: 1_500,
              throttleMs: 60_000,
              uiTimeoutMs: 1_200,
            }
          : {}),
        routeKey,
        source: 'track-run experience',
      });

      if (options?.ignoreDuringInteraction && isRgInputInteractionRecent()) {
        rgPerfMark('active room check skipped during interaction', {
          priority,
          reason: 'result-after-input',
          requestId: activeRoomCheckResult.requestId,
          routeKey,
          source: 'track-run experience',
        });
        rgPerfMark('active room check suppressed by user interaction', {
          priority,
          reason: 'result-after-input',
          requestId: activeRoomCheckResult.requestId,
          routeKey,
          source: 'track-run experience',
        });
        return matchRoom;
      }

      const currentRouteKey = buildTrackRunActiveRoomCheckRouteKey();
      const skipReason = getActiveRoomCheckResultSkipReason({
        currentMatchId: getCurrentLiveMatchId(),
        currentRouteKey,
        isLiveMatchMounted: Boolean(liveMatchMountedRef.current),
        result: activeRoomCheckResult,
      });

      if (skipReason) {
        const logDetail = {
          currentRouteKey,
          generation: activeRoomCheckResult.generation,
          reason: skipReason,
          requestId: activeRoomCheckResult.requestId,
          routeKey: activeRoomCheckResult.routeKey,
          source: 'track-run experience',
        };

        if (skipReason === 'stale-generation') {
          rgPerfMark('active room result skipped stale generation', logDetail);
        } else if (skipReason === 'live-match-mounted') {
          rgPerfMark('active room result ignored after live match mounted', logDetail);
        } else {
          rgPerfMark('active room result skipped duplicate', logDetail);
        }
        if (liveMatchShellPreservation.shouldRenderLiveArena) {
          rgPerfMark('stale result ignored without unmount', {
            ...logDetail,
            liveMatchKey: liveMatchShellPreservation.key,
            matchId: liveMatchRenderIdentity,
            mode: liveMatchRenderMode,
          });
        }
        return matchRoom;
      }

      const payload = activeRoomCheckResult.payload;
      if (!payload) {
        return matchRoom;
      }

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
        if (liveMatchShellPreservation.shouldRenderLiveArena) {
          rgPerfMark('stale result ignored without unmount', {
            liveMatchKey: liveMatchShellPreservation.key,
            matchId: liveMatchRenderIdentity,
            mode: liveMatchRenderMode,
            reason: 'stale result',
            source: 'track-run experience',
          });
        }
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
        if (payload.room.linkedMatchId) {
          rgPerfMark('track-run live state accepted hydration', {
            matchId: payload.room.linkedMatchId,
            roomId: payload.room.roomId,
            source: 'track-run experience',
            state: payload.room.state,
          });
        }
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

  const fetchRecipientInviteInbox = useCallback(async (source: string) => {
    if (recipientInviteFetchInFlightRef.current) {
      rgPerfMark('invite inbox fetch for recipient begin', {
        skipped: true,
        reason: 'in-flight',
        source,
        userId: currentUserId,
      });
      return;
    }

    if (isCreatingMatchRoom || isJoiningMatchRoom || isLeavingMatchRoom) {
      rgPerfMark('invite inbox fetch for recipient begin', {
        skipped: true,
        reason: 'room-action-pending',
        source,
        userId: currentUserId,
      });
      return;
    }

    recipientInviteFetchInFlightRef.current = true;
    const endRecipientInviteFetchTrace = rgPerfMeasureStart('invite inbox fetch for recipient', {
      source,
      userId: currentUserId,
    });
    rgPerfMark('invite inbox fetch for recipient begin', {
      source,
      userId: currentUserId,
    });

    try {
      const payload = await fetchRunningMatchRoomInviteInbox();
      endRecipientInviteFetchTrace({
        roomId: payload.room?.roomId ?? null,
        success: true,
      });
      rgPerfMark('invite inbox fetch for recipient end', {
        joined: payload.room?.joined ?? null,
        roomId: payload.room?.roomId ?? null,
        source,
        success: true,
        userId: currentUserId,
      });

      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        rgPerfMark('invite card display skipped reason', {
          reason: 'stale-result',
          roomId: payload.room?.roomId ?? null,
          source,
          userId: currentUserId,
        });
        return;
      }

      const inviteResult = buildRecipientRoomInviteInboxResult({
        currentUserId,
        previousInviteKey: lastDisplayedRecipientInviteKeyRef.current,
        room: payload.room,
      });
      rgPerfMark('invite inbox pending count', {
        pendingCount: inviteResult.pendingCount,
        roomId: inviteResult.event?.roomId ?? payload.room?.roomId ?? null,
        source,
        userId: currentUserId,
      });

      if (!inviteResult.event) {
        rgPerfMark('invite card display skipped reason', {
          reason: inviteResult.skippedReason,
          roomId: payload.room?.roomId ?? null,
          source,
          userId: currentUserId,
        });
        return;
      }

      if (payload.room) {
        syncServerClock(payload.serverNow);
        commitMatchRoom(payload.room);
      }

      if (!inviteResult.shouldDisplay) {
        rgPerfMark('invite card display skipped reason', {
          inviteId: inviteResult.event.inviteId,
          invitedUserId: inviteResult.event.invitedUserId,
          reason: inviteResult.skippedReason,
          roomId: inviteResult.event.roomId,
          source,
          userId: currentUserId,
        });
        return;
      }

      lastDisplayedRecipientInviteKeyRef.current = inviteResult.event.key;
      rgPerfMark('invite received', {
        inviteId: inviteResult.event.inviteId,
        invitedUserId: inviteResult.event.invitedUserId,
        roomId: inviteResult.event.roomId,
        source: 'recipient invite inbox fetch',
        state: inviteResult.event.roomState,
      });
      rgPerfMark('invite card displayed', {
        inviteId: inviteResult.event.inviteId,
        invitedUserId: inviteResult.event.invitedUserId,
        roomId: inviteResult.event.roomId,
        source: 'recipient invite inbox fetch',
        state: inviteResult.event.roomState,
      });
    } catch (inviteError) {
      endRecipientInviteFetchTrace({ success: false });
      rgPerfMark('invite inbox fetch for recipient end', {
        message: getApiErrorMessage(inviteError, '초대함을 불러오지 못했어.'),
        source,
        success: false,
        userId: currentUserId,
      });
    } finally {
      recipientInviteFetchInFlightRef.current = false;
    }
  }, [
    commitMatchRoom,
    currentUserId,
    isCreatingMatchRoom,
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    syncServerClock,
  ]);

  useFocusEffect(useCallback(() => {
    void fetchRecipientInviteInbox('track-run recipient inbox focus');
  }, [fetchRecipientInviteInbox]));

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
      navigateToMatchRoomWithTrace(`${source} existing room`, payload.room, payload.serverNow);
      return false;
    }

    if (inviteToken && payload.room.joined === false && payload.room.inviteToken.toUpperCase() === inviteToken.toUpperCase()) {
      return true;
    }

    setError(payload.message ?? '이미 참여 중인 방이 있어요. 기존 방을 먼저 나간 뒤 다시 시도해주세요.');
    return false;
  };

  const handleCreateMatchRoom = async () => {
    if (createMatchRoomInFlightRef.current || isCreatingMatchRoom) {
      return;
    }

    const nextRoomMode = roomMatchMode;
    const nextDistanceKm = nextRoomMode === 'duel' ? duelDistanceKm : groupDistanceKm;
    const inputTrace = beginRgInputTrace('room create button press', {
      distanceKm: nextDistanceKm,
      mode: nextRoomMode,
      source: 'track-run ready action',
    });

    rgPerfMark('room create button press', {
      distanceKm: nextDistanceKm,
      mode: nextRoomMode,
      source: 'track-run ready action',
    });

    createMatchRoomInFlightRef.current = true;
    setIsCreatingMatchRoom(true);
    setError(null);
    inputTrace.markFeedback('loading state set', {
      disabled: true,
      loading: true,
    });
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'room create preflight',
    });

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
        navigateToMatchRoomWithTrace('room create', payload.room, payload.serverNow);
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
      createMatchRoomInFlightRef.current = false;
      setIsCreatingMatchRoom(false);
    }
  };

  const handleJoinMatchRoom = async () => {
    if (joinMatchRoomInFlightRef.current || isJoiningMatchRoom) {
      return;
    }

    const inviteToken = roomInviteTokenInput.trim();
    const inputTrace = beginRgInputTrace('invite code input submit', {
      hasToken: inviteToken.length > 0,
      source: 'track-run invite code input',
    });

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
    inputTrace.markFeedback('loading state set', {
      disabled: true,
      loading: true,
    });
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'invite code join preflight',
    });

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
      navigateToMatchRoomWithTrace('invite code join', payload.room, payload.serverNow);
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

    if (joinMatchRoomInFlightRef.current || isJoiningMatchRoom) {
      return;
    }

    const inputTrace = beginRgInputTrace('invite code input submit', {
      hasToken: Boolean(visibleMatchRoom.inviteToken),
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card accept',
    });

    joinMatchRoomInFlightRef.current = true;
    setIsJoiningMatchRoom(true);
    setError(null);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });

    rgPerfMark('invite code input submit', {
      hasToken: Boolean(visibleMatchRoom.inviteToken),
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card accept',
    });
    let endJoinApiTrace: ReturnType<typeof rgPerfMeasureStart> | null = null;
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'invite card accept preflight',
    });

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
      navigateToMatchRoomWithTrace('invite card accept', payload.room, payload.serverNow);
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
      joinMatchRoomInFlightRef.current = false;
      setIsJoiningMatchRoom(false);
    }
  };

  const handleDeclineRoomInviteFromRunning = async () => {
    if (!visibleMatchRoom) {
      return;
    }

    if (leaveMatchRoomInFlightRef.current || isLeavingMatchRoom) {
      return;
    }

    const inputTrace = beginRgInputTrace('room leave button press', {
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card decline',
    });

    leaveMatchRoomInFlightRef.current = true;
    setIsLeavingMatchRoom(true);
    setError(null);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });

    rgPerfMark('room leave button press', {
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card decline',
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
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
      leaveMatchRoomInFlightRef.current = false;
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
    const isLowPriorityActiveRoomCheck = trackRunIdleViewModel.activeRoomCheckPriority === 'low-priority';
    const [roomPayload, upcomingItems, duelStatusPayload, groupStatusPayload] = await Promise.all([
      loadMatchRoom({
        ignoreDuringInteraction: isLowPriorityActiveRoomCheck,
        localActiveMatchId: trackRunIdleViewModel.activeMatchId,
        localActiveRoomId: trackRunIdleViewModel.activeRoomId,
        priority: trackRunIdleViewModel.activeRoomCheckPriority,
        requireLocalActiveHint: isLowPriorityActiveRoomCheck,
      }).catch(() => matchRoom),
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

  liveMatchViewConfirmationRef.current = {
    matchId: liveMatchStartupIdentity,
    mode: liveMatchRenderMode,
    showLiveArena: effectiveShowLiveArena,
  };

  const shouldShowFullscreenMatchCountdown =
    isIdle
    && shouldUseFullscreenMatchCountdown({
      hasCountdownEntry: Boolean(visibleCountdownEntry),
      remainingSeconds: visibleCountdownEntry?.remainingSeconds ?? null,
    });
  const shouldShowCenteredMatchCountdown = shouldUseCenteredMatchCountdown({
    hasCountdownEntry: Boolean(visibleCountdownEntry),
    remainingSeconds: visibleCountdownEntry?.remainingSeconds ?? null,
    showLiveArena: effectiveShowLiveArena,
    hasRoomCountdownEntry: Boolean(roomCountdownEntry),
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
      showLiveArena: effectiveShowLiveArena,
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
      enabled: trackRunIdleViewModel.shouldRunCountdownTicker && Boolean(
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
      idlePollMs: 15000,
      loadDuelMatchStatus,
      loadGroupMatchStatus,
      enabled: !trackRunIdleViewModel.disableHeavySubscriptions
        && liveMatchHeavyWorkReady
        && matchLifecycleController.effects.shouldPollDirectMatchStatus,
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
    matchProgressHeartbeatEnabled: trackRunIdleViewModel.shouldRunLiveMatchProgress && shouldEnableMatchProgressHeartbeat,
    matchLifecycleController,
    trackingSubscriptionsEnabled: trackRunIdleViewModel.shouldRunTrackingSubscriptions,
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
      onContinueSolo: handleContinueSoloFromMatch,
      onForfeit: handleForfeitMatch,
      onShowResultAfterCounterpartForfeit: handleShowResultAfterCounterpartForfeit,
    },
    isPaused,
    isRunning,
    isSaving,
    matchMode,
    showLiveArena: effectiveShowLiveArena,
    viewModelInput: {
      scrollRef: livePagerRef,
      page: liveArenaPage,
      pageWidth: liveArenaPageWidth,
      hasResultPage: hasMatchResultPage,
      onPageChange: setLiveArenaPage,
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
      duelRows: duelResultRows,
      groupRows: groupResultRows,
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
    void handleJoinMatchRoom();
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

  const handleRequestGroupMatchPress = useStableCallback(() => {
    void handleRequestGroupMatch();
  });

  const handleRequestGroupTestMatchPress = useStableCallback(() => {
    void handleRequestGroupMatch(activeGroupSlotStartAt, { testMode: true });
  });

  const handleRequestGroupRematchPress = useStableCallback(() => {
    void handleRequestGroupMatch(activeGroupSlotStartAt);
  });

  const shouldShowReadyScreen = isIdle && !effectiveShowLiveArena && !hasLinkedRuntimeRoom;
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
    onAcceptRoomInvite: handleAcceptRoomInvitePress,
    onCancelDuelMatch: handleCancelDuelMatchPress,
    onCancelGroupMatch: handleCancelGroupMatchPress,
    onCancelUpcomingMatch: handleCancelUpcomingMatchPress,
    onDeclineRoomInvite: handleDeclineRoomInvitePress,
    onDistanceTextChangeDuel: setDuelDistanceText,
    onDistanceTextChangeGroup: setGroupDistanceText,
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
  const idleRuntime = useTrackRunIdleRuntime({
    active: trackRunShellKind === 'idle',
    readyScreenProps,
  });
  const lobbyRuntime = useMatchLobbyRuntime({
    active: trackRunShellKind === 'lobby',
    readyScreenProps,
  });
  const runtimeReadyScreenProps = trackRunShellKind === 'idle'
    ? idleRuntime.readyScreenProps
    : lobbyRuntime.readyScreenProps;

  return (
    <TrackRunExperienceView
      backHref={backHref}
      centeredCountdownEntry={
        shouldShowCenteredMatchCountdown && visibleCountdownEntry
          ? visibleCountdownEntry
          : null
      }
      error={error}
      fullscreenCountdownEntry={
        shouldShowFullscreenMatchCountdown && visibleCountdownEntry
          ? visibleCountdownEntry
          : null
      }
      isTabMode={isTabMode}
      liveContainerProps={liveContainerProps}
      liveMatchKey={liveMatchShellPreservation.key}
      readyScreenProps={runtimeReadyScreenProps}
      shellKind={trackRunShellKind}
      shouldShowReadyScreen={shouldShowReadyScreen}
      shouldShowRoomArmingOverlay={shouldShowRoomArmingOverlay}
      soloStartCountdownSeconds={
        isStarting && typeof soloStartCountdownSeconds === 'number'
          ? soloStartCountdownSeconds
          : null
      }
    />
  );
}
