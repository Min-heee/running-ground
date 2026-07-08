import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { type Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TrackRunExperienceView,
} from '@/features/runs/components/TrackRunExperienceView';
import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShells';
import { useRunTrackingController } from '@/features/runs/hooks/useRunTrackingController';
import { useRunSaveFlow } from '@/features/runs/hooks/useRunSaveFlow';
import { useMatchSelfEndAutoExit } from '@/features/runs/hooks/useMatchSelfEndAutoExit';
import { getLocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';
import { usePartyRunRoom } from '@/features/runs/hooks/usePartyRunRoom';
import {
  useMatchLifecycle,
  type RunMatchMode,
} from '@/features/runs/hooks/useMatchLifecycle';
import { useMatchResultController } from '@/features/runs/hooks/useMatchResultController';
import { useLiveMatchProgress } from '@/features/runs/viewModels/useLiveMatchProgress';
import { useLiveGapNotificationScheduler } from '@/features/runs/liveGap/useLiveGapNotificationScheduler';
import { useOpponentForfeitVoice } from '@/features/runs/liveGap/useOpponentForfeitVoice';
import { useFinishApproachReminder } from '@/features/runs/finishReminder/useFinishApproachReminder';
import { parseMeasuredPaceSecondsPerKm } from '@/features/runs/liveGap/liveGapMessage';
import {
  applyDuelOpponentForfeitLatch,
  resolveDuelOpponentForfeitLatch,
  type DuelOpponentForfeitLatch,
} from '@/features/runs/viewModels/liveMatchProgressModel';
import {
  resolveCurrentUserFinishedForResultPage,
  shouldShowMatchResultPageOnCurrentUserFinished,
} from '@/features/runs/viewModels/matchResultPageVisibility';
import { useAndroidLiveMatchDisplayFrames } from '@/features/runs/viewModels/useAndroidLiveMatchDisplayFrame';
import { getLiveTrackingMetricFrameSnapshot } from '@/features/runs/tracking/liveTrackingMetricStore';
import { useAndroidLiveMatchStartupGate } from '@/features/runs/lifecycle/hooks/useAndroidLiveMatchStartupGate';
import { useTrackRunIdleViewModel } from '@/features/runs/viewModels/useTrackRunIdleViewModel';
import { useMatchRuntimeState } from '@/features/runs/hooks/useMatchRuntimeState';
import { useMatchRoomSelectionSync } from '@/features/runs/hooks/useMatchRoomSelectionSync';
import { useMatchSelectionModel } from '@/features/runs/hooks/useMatchSelectionModel';
import { useMatchCountdownModel } from '@/features/runs/lifecycle/hooks/useMatchCountdownModel';
import { useSlotGatedArenaOpen } from '@/features/runs/lifecycle/hooks/useSlotGatedArenaOpen';
import {
  type RunningMatchStatusResponse,
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
  type PartyRunLinkedMatchContext,
} from '@/features/runs/lifecycle/matchStateMachine';
import { markRouteFocusMatchTerminated } from '@/features/runs/lifecycle/terminatedRouteFocusMatch';
import { resolveRouteForcedLiveArena } from '@/features/runs/lifecycle/routeForcedLiveArena';
import {
  filterUpcomingMatchesForRuntime,
  isLinkedRoomRuntimeState,
  selectLinkedRuntimeRoom,
  selectPartyRunRuntimeSource,
} from '@/features/runs/lifecycle/matchRuntimeStateSelector';
import {
  clearLiveMatchRouteHydration,
  getLiveMatchRouteHydration,
} from '@/features/runs/lifecycle/liveMatchRouteHydration';
import {
  resolveLiveMatchShellPreservation,
  type PreservedLiveMatchShell,
} from '@/features/runs/lifecycle/liveMatchShellPreservation';
import { resolveTrackRunLiveShellGate } from '@/features/runs/lifecycle/trackRunLiveShellGate';
import { isMyMatchDistanceStale } from '@/features/runs/sync/matchDistanceStaleness';
import {
  isTerminalMatchLiveStatus,
} from '@/features/runs/sync/matchProgressSync';
import {
  type MatchStatusVanishState,
} from '@/features/runs/sync/matchStatusVanish';
import { getCurrentUserProfile } from '@/lib/session';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { shouldEnableCountdownTicker } from '@/features/runs/runtime/countdownTickerGate';
import { useTrackRunForceResetAction } from '@/features/runs/runtime/useTrackRunForceResetAction';
import { useTrackRunIdlePressHandlers } from '@/features/runs/runtime/useTrackRunIdlePressHandlers';
import { useTrackRunMatchStatusLoaders } from '@/features/runs/runtime/useTrackRunMatchStatusLoaders';
import { useTrackRunMatchStatusSnapshotApplier } from '@/features/runs/runtime/useTrackRunMatchStatusSnapshotApplier';
import { useTrackRunNavigationAdapter } from '@/features/runs/runtime/useTrackRunNavigationAdapter';
import { useTrackRunOpponentSyncLifeline } from '@/features/runs/runtime/useTrackRunOpponentSyncLifeline';
import { unmarkLiveMatchMounted } from '@/features/runs/lifecycle/liveMatchMountedRegistry';
import { useTrackRunRuntimeTrace } from '@/features/runs/runtime/useTrackRunRuntimeTrace';
import { useTrackRunLiveArenaDiagnostics } from '@/features/runs/runtime/useTrackRunLiveArenaDiagnostics';
import { useTrackRunForfeitDiagnosticsSnapshot } from '@/features/runs/runtime/useTrackRunForfeitDiagnosticsSnapshot';
import { useTrackRunDiagnosticsSlotElapsed } from '@/features/runs/runtime/useTrackRunDiagnosticsSlotElapsed';
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
import { useTrackRunSlotDistanceCleanup } from '@/features/runs/runtime/useTrackRunSlotDistanceCleanup';
import { useTrackRunWedgedLoadingWatchdog } from '@/features/runs/runtime/useTrackRunWedgedLoadingWatchdog';
import { useRuntimeMatchRoomHydration } from '@/features/runs/runtime/useRuntimeMatchRoomHydration';
import { useTrackRunRuntimeScreenState } from '@/features/runs/runtime/useTrackRunRuntimeScreenState';
import { useTrackRunRuntimePropsComposer } from '@/features/runs/runtime/useTrackRunRuntimePropsComposer';
import { useLiveActivityBridge } from '@/features/runs/liveActivity/useLiveActivityBridge';
import {
  MATCH_ROOM_FAST_POLL_MS,
  MATCH_ROOM_IDLE_POLL_MS,
  MATCH_STATUS_COUNTDOWN_POLL_MS,
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
import {
  shouldDeferLiveMatchHeavyArenaWork,
  useMatchModeDerivedState,
} from './useMatchModeDerivedState';
import {
  isRunningMatchForceResetCandidate,
  resolveActiveLiveMatchProgressMatchId,
  resolveActiveMatchExitAllOthersForfeited,
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
  // Durable party-run latch (see partyRunSourceClassifier). roomLinkedMatchContext is
  // ephemeral and drops to null on an early forfeit before the save reads it; this stays
  // true once the run is known to be a party run, and is reset by the post-run runtime reset.
  const wasPartyRunRef = useRef(false);
  const duelOpponentForfeitLatchRef = useRef<DuelOpponentForfeitLatch>(null);
  const focusedDuelMatchIdRef = useRef<string | null>(null);
  const focusedGroupMatchIdRef = useRef<string | null>(null);
  const latestDuelStatusServerNowMsRef = useRef(0);
  const latestGroupStatusServerNowMsRef = useRef(0);
  const latestUpcomingServerNowMsRef = useRef(0);
  const latestMatchRoomServerNowMsRef = useRef(0);
  // Opponent-sync lifeline (Piece 2) — wall-clock stamp of the last ACCEPTED duel/group match
  // status apply (written by the poll loaders and the snapshot-applier funnel; read by
  // useTrackRunOpponentSyncLifeline's ref-only 5s timer).
  const lastMatchStatusAppliedAtMsRef = useRef(0);
  const lastRouteKeyCorrectionRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const linkedMatchVanishStateRef = useRef<Record<'duel' | 'group', MatchStatusVanishState>>({
    duel: { count: 0, matchId: null },
    group: { count: 0, matchId: null },
  });

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
    duelSlotCounts,
    setDuelSlotCounts,
    matchRemindersEnabled,
    setMatchRemindersEnabled,
    cancelingUpcomingMatchId,
    setCancelingUpcomingMatchId,
    nowMs,
    setNowMs,
    syncedNowMs,
    serverClockReady,
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
  // C-1 — save-navigation epoch. saveForfeitResultAndNavigate captures this at entry; the
  // overlay watchdog's abandon bumps it. A late-settling save whose epoch no longer matches
  // must NOT yank the user with router.replace — it offers an Alert instead.
  const saveNavEpochRef = useRef(0);
  const autoStartedMatchIdRef = useRef<string | null>(null);
  const autoStartingMatchTrackingRef = useRef(false);
  const preStartWarmupMatchIdRef = useRef<string | null>(null);
  const forfeitedMatchIdsRef = useRef<Set<string>>(new Set());
  const [locallyForfeitedMatches, setLocallyForfeitedMatches] = useState<ReadonlyMap<string, ForfeitedMatchSnapshot>>(() => new Map());
  const markMatchLocallyForfeited = useCallback((snapshot: ForfeitedMatchSnapshot) => {
    forfeitedMatchIdsRef.current.add(snapshot.matchId);
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
  const hasMatchResultPageRef = useRef(false);
  // Wedged-loading watchdog (B2c): tracks the current LIVE loading-shell episode and
  // which one-shot recovery stages have fired for it, so a back-to-back match #2 stuck
  // in the loading shell self-recovers without a relaunch (closes #198/#200).
  const wedgedLoadingWatchdogRef = useRef<{ episodeKey: string | null; rearmedAtMs: number | null; dropped: boolean }>({
    episodeKey: null,
    rearmedAtMs: null,
    dropped: false,
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
    serverClockReady,
    visibleUpcomingMatches,
    duelMatchState,
    groupMatchState,
    duelMatchStatus,
    groupMatchStatus,
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
  const roomLinkedMatchStatus = roomLinkedMatchContext?.mode === 'duel'
    ? duelMatchStatus
    : roomLinkedMatchContext?.mode === 'group'
      ? groupMatchStatus
      : null;
  const currentUserDoneWithLinkedMatch = Boolean(
    roomLinkedMatchContext?.matchId
    && (
      locallyForfeitedMatches.has(roomLinkedMatchContext.matchId)
      || (
        roomLinkedMatchStatus?.matchId === roomLinkedMatchContext.matchId
        && isTerminalMatchLiveStatus(roomLinkedMatchStatus.currentUserLiveStatus)
      )
    ),
  );
  const currentUserDoneWithCurrentMatch = currentUserDoneWithLinkedMatch || (
    matchMode === 'duel'
      ? isTerminalMatchLiveStatus(duelMatchStatus?.currentUserLiveStatus)
      : matchMode === 'group'
        ? isTerminalMatchLiveStatus(groupMatchStatus?.currentUserLiveStatus)
        : false
  );
  const {
    roomLinkedSlotStartAtForDiagnostics,
    roomLinkedSlotElapsedMsForDiagnostics,
  } = useTrackRunDiagnosticsSlotElapsed({
    roomLinkedMatchContext,
    matchRoomFlow,
    visiblePartyRunFlow,
    matchRoom,
    visibleMatchRoom,
    syncedNowMs,
  });
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
    currentUserDoneWithLinkedMatch,
  });
  const androidLiveMatchStartup = useAndroidLiveMatchStartupGate({
    active: shouldStageAndroidLiveMatchStartup,
    identity: liveMatchStartupIdentity,
  });
  const liveMatchStartupWorkReady = androidLiveMatchStartup.ready;
  const shouldDeferLiveMatchHeavyWork = shouldDeferLiveMatchHeavyArenaWork({
    matchMode,
    isRunning,
    duelMatchState,
    groupMatchState,
    roomLinkedMatchMode: roomLinkedMatchContext?.mode ?? null,
    roomLinkedMatchState: roomLinkedMatchContext?.state ?? null,
    hasVisibleCountdownEntry: Boolean(visibleCountdownEntry),
    hasRoomCountdownEntry: Boolean(roomCountdownEntry),
    shouldShowRoomArmingOverlay,
  });
  const liveMatchHeavyWorkReady = liveMatchStartupWorkReady && !shouldDeferLiveMatchHeavyWork;
  const activeLiveMatchProgressMatchId = useMemo(() => resolveActiveLiveMatchProgressMatchId({
    matchMode,
    duelMatchStatusMatchId: duelMatchStatus?.matchId,
    groupMatchStatusMatchId: groupMatchStatus?.matchId,
    roomLinkedMatchContextMatchId: roomLinkedMatchContext?.matchId,
    roomLinkedMatchContextMode: roomLinkedMatchContext?.mode,
  }), [
    duelMatchStatus?.matchId,
    groupMatchStatus?.matchId,
    matchMode,
    roomLinkedMatchContext?.matchId,
    roomLinkedMatchContext?.mode,
  ]);
  const roomLinkedDuelOpponentForfeited = Boolean(
    matchMode === 'duel'
    && linkedRuntimeRoom?.mode === 'duel'
    && linkedRuntimeRoom.participants.some((participant) => (
      participant.userId !== currentUserId && participant.liveStatus === 'forfeited'
    )),
  );
  const duelOpponentForLatch = useMemo(() => (
    roomLinkedDuelOpponentForfeited && effectiveDuelOpponent
      ? {
        ...effectiveDuelOpponent,
        liveStatus: 'forfeited' as const,
      }
      : effectiveDuelOpponent
  ), [effectiveDuelOpponent, roomLinkedDuelOpponentForfeited]);
  duelOpponentForfeitLatchRef.current = resolveDuelOpponentForfeitLatch({
    activeMatchId: activeLiveMatchProgressMatchId,
    matchMode,
    opponent: duelOpponentForLatch,
    previousLatch: duelOpponentForfeitLatchRef.current,
  });
  const duelOpponentForfeitLatch = duelOpponentForfeitLatchRef.current;
  const effectiveDuelOpponentForLive = useMemo(
    () => applyDuelOpponentForfeitLatch(duelOpponentForLatch, duelOpponentForfeitLatch),
    [duelOpponentForfeitLatch, duelOpponentForLatch],
  );
  const rawLiveMatchDisplayFrame = useMemo(
    () => ({
      distanceKm,
      elapsedSeconds,
      // RC-4: pair the throttled display distance with the wall-clock arena elapsed from the
      // live tracking metric store (published from syncedNow on each GPS snapshot, NO JS timer)
      // so MY avg/arena pace stays correct while backgrounded. This is a non-reactive read, but
      // the memo recomputes whenever `distanceKm` commits — which is exactly the GPS-snapshot /
      // throttle cadence that also refreshes arenaElapsedSeconds — so it rides the existing
      // re-render without adding a 1Hz subscription to this component.
      arenaElapsedSeconds: getLiveTrackingMetricFrameSnapshot().arenaElapsedSeconds,
      currentPace,
      averagePace,
      cadenceSpm,
      elevationGainM,
    }),
    [averagePace, cadenceSpm, currentPace, distanceKm, elapsedSeconds, elevationGainM],
  );
  const {
    frame: liveMatchDisplayFrame,
    metricFrame: liveMatchMetricFrame,
  } = useAndroidLiveMatchDisplayFrames(
    rawLiveMatchDisplayFrame,
    isRunning && (matchMode === 'duel' || matchMode === 'group'),
  );
  const liveMatchDisplayDistanceKm = liveMatchDisplayFrame.distanceKm;
  const liveMatchDisplayElapsedSeconds = liveMatchDisplayFrame.elapsedSeconds;
  const useLeafLiveTrackingMetrics = Platform.OS === 'android'
    && isRunning
    && (matchMode === 'duel' || matchMode === 'group');
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
    effectiveDuelOpponent: effectiveDuelOpponentForLive,
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
  // Stamp the synced-clock instant the slot-gated arena force-open fired. The measuring
  // ticker quiesce (countdownTickerGate) keys its grace window off this stamp — a ref
  // written in an effect (never in render) so the stamp itself can't cause a render.
  // Cleared when the force-open drops (finish/leave/done), so a re-entered match re-arms
  // the grace from its own open instant.
  const arenaOpenAtMsRef = useRef<number | null>(null);
  useEffect(() => {
    if (forceOpenActiveMatch) {
      if (arenaOpenAtMsRef.current === null) {
        arenaOpenAtMsRef.current = getSyncedNowMs();
      }
      return;
    }
    arenaOpenAtMsRef.current = null;
  }, [forceOpenActiveMatch, getSyncedNowMs]);
  const liveArenaPageWidth = Math.max(windowWidth - 32, 280);
  // Freshness stamp for MY live distance. The screen-off JS suspend FREEZES distance (it is
  // 100% JS-computed) while the wall-clock elapsed keeps climbing, so the cumulative avg pace
  // balloons and the my-vs-opponent gap goes phantom. Stamp the wall-clock instant whenever MY
  // displayed distance actually CHANGES; while frozen this stamp stops advancing and ages out.
  // We OR it with the synced checkpoint's updatedAt (also frozen in background) and take the more
  // recent of the two as "last time MY distance was fresh". This is a render-time ref update
  // (no effect / no extra subscription); it only writes when the value moves.
  const myDistanceFreshnessRef = useRef<{ distanceKm: number; updatedAtMs: number }>({
    distanceKm: liveMatchMetricFrame.distanceKm,
    updatedAtMs: getSyncedNowMs(),
  });
  if (myDistanceFreshnessRef.current.distanceKm !== liveMatchMetricFrame.distanceKm) {
    myDistanceFreshnessRef.current = {
      distanceKm: liveMatchMetricFrame.distanceKm,
      updatedAtMs: getSyncedNowMs(),
    };
  }
  const myMatchDistanceUpdatedAtMs = Math.max(
    myDistanceFreshnessRef.current.updatedAtMs,
    lastSyncedMatchProgress?.updatedAt ?? 0,
  );
  const isMyMatchDistanceStaleNow = isMyMatchDistanceStale({
    lastUpdatedAtMs: myMatchDistanceUpdatedAtMs,
    nowMs: getSyncedNowMs(),
  });
  const currentUserArenaPace = useMemo(() => resolveCurrentUserArenaPace({
    officialCurrentAveragePace,
    liveMatchDisplayDistanceKm: liveMatchMetricFrame.distanceKm,
    // RC-4: feed the wall-clock arena elapsed (slot/start-anchored, no JS timer) instead of
    // `elapsedSeconds` (slot-ticker value the OS freezes with the screen off). This keeps MY
    // avg/arena pace — and the avg-pace voice announcement — correct while backgrounded and on
    // resume. In foreground both are ≈equal so the displayed avg pace is unchanged.
    liveMatchDisplayElapsedSeconds: liveMatchMetricFrame.arenaElapsedSeconds ?? liveMatchMetricFrame.elapsedSeconds,
    shouldUseLivePace: duelArenaUsesLivePace || groupArenaUsesLivePace,
    // When MY distance is stale, withhold the ballooned cumulative avg pace and show the
    // not-ready sentinel instead. A genuinely slow/walking pace with fresh GPS is NOT stale
    // (gated by timestamp, never pace magnitude), so it still shows its real value.
    isMyDistanceStale: isMyMatchDistanceStaleNow,
  }), [
    duelArenaUsesLivePace,
    groupArenaUsesLivePace,
    isMyMatchDistanceStaleNow,
    liveMatchMetricFrame.distanceKm,
    liveMatchMetricFrame.arenaElapsedSeconds,
    liveMatchMetricFrame.elapsedSeconds,
    officialCurrentAveragePace,
  ]);
  const {
    trackedMatchResult,
    estimatedMatchBonusPoints,
    estimatedMatchLpDelta,
    duelResultRows,
    groupResultRows,
    groupResultStatusLabel,
  } = useMatchResultController({
    matchMode,
    isPartyRun: Boolean(roomLinkedMatchContext),
    effectiveDuelOpponent: effectiveDuelOpponentForLive,
    currentGroupStanding,
    effectiveGroupParticipantCount,
    groupLiveStandings,
    currentUserArenaPace,
    currentUserDuelLiveStatus,
    distanceKm,
    duelDistanceKm,
    groupDistanceKm,
    elapsedSeconds,
    // C2: feed the server-authoritative duel verdict + the user's own frozen finish elapsed
    // into the result model. Both are absent on older backends → graceful local fallback.
    duelVerdict: duelMatchStatus?.duelVerdict ?? null,
    currentUserFinishElapsedSeconds: duelMatchStatus?.currentUserFinishElapsedSeconds ?? null,
    // C (group parity): feed the server-authoritative group final placement into the result
    // model. Absent on older backends → the group model holds a PENDING placeholder (never a
    // fabricated local rank).
    groupVerdict: groupMatchStatus?.groupVerdict ?? null,
    // C1: the active match's id. Its presence marks the duel/group as server-tracked, so the
    // result model produces a PENDING result (no invented winner/rank) while the verdict is
    // unresolved.
    matchId: activeLiveMatchProgressMatchId,
  });
  const effectiveDuelOpponentArenaPace = useMemo(
    () => resolveDuelOpponentArenaPace({
      opponent: effectiveDuelOpponentForLive,
      duelArenaUsesLivePace,
    }),
    [duelArenaUsesLivePace, effectiveDuelOpponentForLive],
  );
  const duelLiveSummary = useMemo(() => resolveDuelLiveSummary({
    opponent: effectiveDuelOpponentForLive,
    opponentArenaPace: effectiveDuelOpponentArenaPace,
    opponentStatusLabel: effectiveDuelOpponentStatusLabel,
    isOpponentForfeited: isDuelOpponentForfeited,
  }), [
    effectiveDuelOpponentForLive,
    effectiveDuelOpponentArenaPace,
    effectiveDuelOpponentStatusLabel,
    isDuelOpponentForfeited,
  ]);
  const duelArenaParticipants = useMemo(
    () => buildDuelArenaParticipants({
      currentUserPaceLabel: currentUserArenaPace,
      currentUserLiveStatus: currentUserDuelLiveStatus ?? undefined,
      // HEAD-TO-HEAD FAIRNESS: my duel dot sits on the SAME latest-common-checkpoint basis
      // as the opponent dot (syncedDuelOpponentDistanceKm) — both from the server-fed synced
      // comparison — so the two dots and the gap between them are computed at one identical
      // checkpoint time, removing the old asymmetry (my dot on live GPS vs opponent on the
      // server value). syncedDuelDistanceKm falls back to my live `distanceKm` when no
      // comparison snapshot exists yet (pre-sync), so it NEVER shows a fake 0.00.
      // My HERO big number/time/pace stay LIVE (liveMatchDisplayDistanceKm / metric frame)
      // and are unaffected by this — only the head-to-head dot moves to the checkpoint basis.
      currentDistanceKm: syncedDuelDistanceKm,
      opponent: effectiveDuelOpponentForLive,
      opponentPaceLabel: effectiveDuelOpponentArenaPace,
      opponentDistanceKm: syncedDuelOpponentDistanceKm,
      liveGapKm: duelLiveGapKm,
    }),
    [
      currentUserArenaPace,
      currentUserDuelLiveStatus,
      duelLiveGapKm,
      effectiveDuelOpponentForLive,
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
    opponent: effectiveDuelOpponentForLive,
    roomLinkedMatchContext,
  }), [
    currentUserArenaPace,
    currentUserId,
    effectiveDuelOpponentForLive,
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
  // The live-gap push and finish reminder must use the ACTUAL match target, not the
  // match-setup UI value (duelDistanceKm/groupDistanceKm, e.g. a default 2km while running
  // a 1km room-linked duel). Prefer the same authority chain the race board resolves:
  // room-linked match target → server match status target → setup value.
  const liveGapTargetDistanceKm = roomLinkedMatchContext?.distanceKm
    ?? (matchMode === 'group' ? groupMatchStatus?.distanceKm : duelMatchStatus?.distanceKm)
    ?? (matchMode === 'group' ? groupDistanceKm : duelDistanceKm);
  const liveGapRemainingDistanceKm = typeof liveGapTargetDistanceKm === 'number'
    ? Math.max(0, liveGapTargetDistanceKm - liveMatchDisplayDistanceKm)
    : null;
  useLiveGapNotificationScheduler({
    active: isRunning && (matchMode === 'duel' || matchMode === 'group'),
    matchMode: matchMode === 'group' ? 'group' : 'duel',
    opponentName: effectiveDuelOpponentForLive?.name ?? null,
    myPaceLabel: currentUserArenaPace,
    remainingDistanceKm: liveGapRemainingDistanceKm,
    opponentPaceLabel: effectiveDuelOpponentArenaPace,
    duelGapKm: duelLiveGapKm,
    groupStandings: groupLiveStandings,
    // Same freshness stamp the arena uses, so the gap push and the arena avg pace gate on ONE
    // staleness definition. The scheduler re-evaluates this against the wall clock at each fire,
    // withholding the my-distance-derived avg pace + gap while MY distance is frozen.
    myDistanceUpdatedAtMs: myMatchDistanceUpdatedAtMs,
  });
  // "Finish approaching — turn your screen on" one-shot reminder. A locked iOS screen suspends
  // JS so DISTANCE freezes; a distance-threshold trigger would never fire screen-off exactly
  // when it matters, so this schedules a TIME-based local notification ~300m before the target
  // (computed from the freshest distance + my average pace) that the OS fires even while JS is
  // suspended, so the finish elapsed is captured accurately. Applies to ANY goal run (duel /
  // group / party-run); a no-goal solo run passes no target and gets nothing. Fires once;
  // cancelled on run end / finish / forfeit / unmount.
  useFinishApproachReminder({
    active: isRunning && (matchMode === 'duel' || matchMode === 'group'),
    targetDistanceKm: liveGapTargetDistanceKm,
    currentDistanceKm: liveMatchDisplayDistanceKm,
    // My cumulative average pace label (e.g. '5:30/km'), already staleness-gated; null while a
    // real pace isn't measurable yet (distance ~0 at start) so we never schedule a bogus time.
    averagePaceSecondsPerKm: parseMeasuredPaceSecondsPerKm(currentUserArenaPace),
    isFinished: currentUserDoneWithCurrentMatch || currentUserHasForfeitedActiveMatch,
  });
  // Speak a one-shot ko-KR forfeit announcement when an opponent (duel) / any other
  // participant (group) quits, so a backgrounded runner hears it. Reads the SAME
  // forfeit-latched duel opponent and group standings the arena uses.
  useOpponentForfeitVoice({
    active: isRunning && (matchMode === 'duel' || matchMode === 'group'),
    matchMode: matchMode === 'group' ? 'group' : 'duel',
    opponent: effectiveDuelOpponentForLive,
    standings: groupLiveStandings,
  });
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
  useTrackRunForfeitDiagnosticsSnapshot({
    matchMode,
    activeLiveMatchProgressMatchId,
    currentUserId,
    duelMatchStatus,
    groupMatchStatus,
    roomLinkedMatchContext,
    linkedRuntimeRoom,
    duelArenaParticipants,
    groupArenaParticipants,
    roomLinkedDuelPlaceholderParticipants,
    roomLinkedGroupPlaceholderParticipants,
  });
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
  hasMatchResultPageRef.current = hasMatchResultPage;
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
    isCurrentUserDoneWithMatch: currentUserDoneWithCurrentMatch,
    liveMatchHeavyWorkReady: liveMatchStartupWorkReady,
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
    syncedNowMs,
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
  // Group parity: a group runner who reaches the goal must get the same self-finished
  // exit (auto save -> run detail) as a duel runner, instead of being left on the live
  // page with a 기권하기 card.
  const activeMatchExitSelfFinished = (activeMatchExitSource === 'duel'
    && currentUserDuelLiveStatus === 'finished')
    || (activeMatchExitSource === 'group' && currentUserGroupLiveStatus === 'finished');
  const activeMatchExitAllOthersForfeited = useMemo(() => resolveActiveMatchExitAllOthersForfeited({
    activeMatchExitSource,
    groupArenaParticipants,
    currentUserGroupLiveStatus,
    currentUserHasForfeitedActiveMatch,
  }), [
    activeMatchExitSource,
    currentUserGroupLiveStatus,
    currentUserHasForfeitedActiveMatch,
    groupArenaParticipants,
  ]);
  // Whether a stale/active route should force the live arena. The terminated-route-focus
  // tombstone (set by the post-run reset, keyed to the ended matchId) suppresses the stale
  // forceMatchArena route param AFTER a match is done — covering the after-reset window where
  // the duel/group statuses are null again and the in-component done-match guard would
  // otherwise miss it, stranding the running tab on the live measuring shell. See
  // resolveRouteForcedLiveArena for the full contract.
  const shouldForceLiveArenaFromRoute = resolveRouteForcedLiveArena({
    isRunning,
    currentUserDoneWithCurrentMatch,
    hydratedFocusMatchId,
    hydratedForceMatchArena,
    routeHydrationMatchId: liveMatchRouteHydration?.matchId,
    routeHydrationPreferArena: liveMatchRouteHydration?.preferArena,
    routeShellHint,
    matchLifecycleStage: matchLifecycleController.stage,
  });
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

  // STAGE 3 (clean core): the SINGLE slot-gated arena force-open. This is now the only
  // path that flips forceOpenActiveMatch ON for a live match — gated on syncedNow>=slot
  // (or serverActive corroborating at/after the slot), plus the explicit route force.
  // The pre-slot navigation hooks below may still mount/scroll the arena page, but they
  // no longer flip the flag pre-slot, so the measuring arena can never open under a
  // running countdown.
  useSlotGatedArenaOpen({
    enabled: matchMode === 'duel' || matchMode === 'group' || Boolean(roomLinkedMatchContext),
    matchMode,
    duelMatch: duelMatchStatus
      ? { matchId: duelMatchStatus.matchId, slotStartAt: duelMatchStatus.slotStartAt, state: duelMatchStatus.state }
      : null,
    groupMatch: groupMatchStatus
      ? { matchId: groupMatchStatus.matchId, slotStartAt: groupMatchStatus.slotStartAt, state: groupMatchStatus.state }
      : null,
    roomLinkedMatchContext: roomLinkedMatchContext
      ? {
          matchId: roomLinkedMatchContext.matchId,
          slotStartAt: roomLinkedMatchContext.slotStartAt,
          state: roomLinkedMatchContext.state,
        }
      : null,
    routeForceMatchArena: shouldForceLiveArenaFromRoute,
    syncedNowMs,
    forceOpenActiveMatch,
    onForceOpenActiveMatchChange: setForceOpenActiveMatch,
    onLiveArenaPageChange: setLiveArenaPage,
    livePagerRef,
  });

  useTrackRunLiveArenaDiagnostics({
    appStateRef,
    currentUserHasForfeitedActiveMatch,
    currentUserFinishedForResultPage,
    duelArenaParticipantCount: duelArenaParticipants.length,
    duelMatchState,
    duelMatchStatus,
    effectiveShowLiveArena,
    forceOpenActiveMatch,
    hasMatchResultPage,
    hasTrackedMatchResult,
    isPaused,
    isRunning,
    liveMatchShellPreservationShouldRenderLiveArena: liveMatchShellPreservation.shouldRenderLiveArena,
    matchLifecycleStage: matchLifecycleController.stage,
    matchLifecycleSource: matchLifecycleController.source,
    matchMode,
    roomCountdownRemainingSeconds,
    roomLinkedSlotElapsedMsForDiagnostics,
    roomLinkedSlotStartAtForDiagnostics,
    shouldForceLiveArenaFromRoute,
    shouldRenderLiveArena,
    showLiveArena,
    syncedNowMs,
  });

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
    wasPartyRunRef,
  });
  const backHref: Href = '/my-activity';
  const discardRedirectHref: Href | null = isTabMode ? null : '/my-activity';
  useTrackRunSlotDistanceCleanup({
    duelDistanceKm,
    groupDistanceKm,
    matchLifecycleSource: matchLifecycleController.source,
    matchLifecycleStage: matchLifecycleController.stage,
    matchMode,
    roomLinkedMatchMode: roomLinkedMatchContext?.mode,
    selectedDuelSlot,
    selectedDuelSlotStartAt,
    selectedGroupSlot,
    selectedGroupSlotStartAt,
    setDuelMatchNotice,
    setDuelMatchResult,
    setDuelMatchStatus,
    setGroupMatchNotice,
    setGroupMatchResult,
    setGroupMatchStatus,
  });

  const {
    clearLocalDuelMatchState,
    clearLocalGroupMatchState,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
    loadUpcomingMatches,
  } = useTrackRunMatchStatusLoaders({
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    commitMatchRoom,
    currentUserId,
    duelDistanceKm,
    duelMatchStatus,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    forfeitedMatchIdsRef,
    groupDistanceKm,
    groupMatchStatus,
    hasMatchResultPageRef,
    isDuelTestFlow,
    isGroupTestFlow,
    // FIX-B (2026-07-09) — a confirmed status-vanish must not demote matchMode to 'solo'
    // while the tracker is actively recording this match: status 'running', or an un-cleared
    // localGoalFreeze (crossed-but-unsaved). Keeping the match context makes the eventual
    // save carry matchId+matchResult instead of degrading to a plain solo run.
    isMatchActivelyRecording: (vanishedMatchId: string) => (
      status === 'running' || Boolean(getLocalGoalFreeze(vanishedMatchId))
    ),
    lastMatchStatusAppliedAtMsRef,
    latestDuelStatusServerNowMsRef,
    latestGroupStatusServerNowMsRef,
    latestUpcomingServerNowMsRef,
    linkedMatchVanishStateRef,
    livePagerRef,
    matchRoom,
    roomLinkedMatchContextRef,
    setDuelMatchNotice,
    setDuelMatchResult,
    setDuelMatchStatus,
    setDuelSlotCounts,
    setForceOpenActiveMatch,
    setGroupMatchNotice,
    setGroupMatchResult,
    setGroupMatchStatus,
    setLastSyncedMatchProgress,
    setLiveArenaPage,
    setMatchMode,
    setUpcomingMatches,
    syncServerClock,
    upcomingMatches,
    visibleMatchRoom,
  });

  const {
    applyMatchStatusSnapshot,
  } = useTrackRunMatchStatusSnapshotApplier({
    duelMatchStatusRef,
    forfeitedMatchIdsRef,
    groupMatchStatusRef,
    lastMatchStatusAppliedAtMsRef,
    latestDuelStatusServerNowMsRef,
    latestGroupStatusServerNowMsRef,
    roomLinkedMatchContextRef,
    setDuelMatchStatus,
    setGroupMatchStatus,
    syncServerClock,
  });

  // Opponent-sync lifeline (docs/opponent-poll-stall-diag-2026-07-06.md, Piece 2) — registry-free,
  // render-independent safety net for the foreground opponent channel: a 5s ref-only timer fires
  // one guarded status GET whenever no accepted status apply has landed for >8s while the app is
  // foregrounded and a duel/group match is active. Zero work when healthy (heartbeat/poll applies
  // keep the stamp fresh), zero renders by itself.
  useTrackRunOpponentSyncLifeline({
    activeLiveMatchProgressMatchId,
    duelMatchStatusRef,
    groupMatchStatusRef,
    lastMatchStatusAppliedAtMsRef,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
  });

  // iOS Live Activity (lock-screen live-run card + Dynamic Island) — OTA-SAFE, FIRE-AND-FORGET.
  // Starts the card on run/match start, refreshes it from the snapshot commit (solo) and the bg
  // flush match-status response (match, via the hook this registers in backgroundMatchProgressSync),
  // and ends it on run end / forfeit / unmount. No-op on every current binary (native module absent)
  // and on Android; never awaits or mutates the bg-sync promise / throttle / inflight guards.
  useLiveActivityBridge({
    isRunning,
    matchMode,
    myName: currentUser?.name ?? '나',
    duelDistanceKm,
    groupDistanceKm,
    distanceKm,
    elapsedSecondsRef,
    duelMatchStatusRef,
    groupMatchStatusRef,
    roomLinkedMatchContextRef,
  });

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
    resetLiveMatchNavigationOwner,
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

  const resetMatchRuntimeAfterTrackingCleared = useStableCallback((reason: 'discard-tracking' | 'save-reset') => {
    const endedDuelMatchId = duelMatchStatusRef.current?.matchId ?? null;
    const endedGroupMatchId = groupMatchStatusRef.current?.matchId ?? null;
    const endedLiveMatch = liveMatchMountedRef.current;

    rgPerfMark('post-run match runtime reset', {
      duelMatchId: endedDuelMatchId,
      groupMatchId: endedGroupMatchId,
      liveMatchId: endedLiveMatch?.matchId ?? null,
      preservedKey: preservedLiveMatchShellRef.current?.key ?? null,
      reason,
      roomId: matchRoom?.roomId ?? visibleMatchRoom?.roomId ?? null,
    });

    // Evict the just-ended match(es) from the module-level mount registry and drop
    // the navigation-owner latches so a back-to-back match #2 is not blocked from
    // its loading→active transition (B2b). Scope eviction to the ended matchIds only
    // — this is a mounted-latch removal, not a server-ended-match revival, so the
    // forfeitedMatchIdsRef guard still drops any payload for a left/forfeited match.
    if (endedDuelMatchId) {
      unmarkLiveMatchMounted({ matchId: endedDuelMatchId, mode: 'duel' });
    }
    if (endedGroupMatchId) {
      unmarkLiveMatchMounted({ matchId: endedGroupMatchId, mode: 'group' });
    }
    if (endedLiveMatch?.matchId) {
      unmarkLiveMatchMounted({ matchId: endedLiveMatch.matchId, mode: endedLiveMatch.mode });
    }
    resetLiveMatchNavigationOwner();

    // Tombstone every match id that could still drive the stale route-forced live arena
    // (the running-tab route keeps forceMatchArena/focusMatchId from the reservation
    // handoff after the match ends, and clearing the duel/group statuses below removes
    // the in-component done-match suppression). Keyed to the ended match ids only, so a
    // brand-new match, the reservation pre-mount, or an in-progress race is never blocked.
    markRouteFocusMatchTerminated(endedDuelMatchId);
    markRouteFocusMatchTerminated(endedGroupMatchId);
    markRouteFocusMatchTerminated(endedLiveMatch?.matchId ?? null);
    markRouteFocusMatchTerminated(hydratedFocusMatchId ?? null);
    markRouteFocusMatchTerminated(liveMatchRouteHydration?.matchId ?? null);

    clearLiveMatchRouteHydration();
    commitMatchRoom(null);
    preservedLiveMatchShellRef.current = null;
    liveMatchMountedRef.current = null;
    liveMatchViewConfirmationRef.current = {
      matchId: null,
      mode: null,
      showLiveArena: false,
    };
    roomLinkedMatchContextRef.current = null;
    // Drop the durable party-run latch so the NEXT run (e.g. a back-to-back official
    // matchmaking match) is classified fresh and never inherits this run's party-ness.
    wasPartyRunRef.current = false;
    focusedDuelMatchIdRef.current = null;
    focusedGroupMatchIdRef.current = null;
    matchProgressHeartbeatRef.current = 0;
    setForceOpenActiveMatch(false);
    setLiveArenaPage(0);
    setMatchMode('solo');
    setSelectedRoomFriendIds([]);
    setDuelMatchResult(null);
    setDuelMatchStatus(null);
    setDuelMatchNotice(null);
    setGroupMatchResult(null);
    setGroupMatchStatus(null);
    setGroupMatchNotice(null);
    setLastSyncedMatchProgress(null);
  });

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
    liveMatchMountedRef,
    liveMatchViewConfirmationRef,
    livePagerRef,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
    loadMatchRoom,
    loadUpcomingMatches,
    matchProgressHeartbeatRef,
    matchRoom,
    preservedLiveMatchShellRef,
    preStartWarmupMatchIdRef,
    resetLiveMatchNavigationOwner,
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
    handleForceResetRunningMatchPress,
  } = useTrackRunForceResetAction({
    clearLocalDuelMatchState,
    clearLocalGroupMatchState,
    commitMatchRoom,
    isForceResettingRunningMatch,
    refreshStaleMatchArtifacts,
    setError,
    setForceOpenActiveMatch,
    setIsForceResettingRunningMatch,
    setSelectedRoomFriendIds,
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
      currentUserDoneWithLinkedMatch,
      duelMatchStatus,
      groupMatchStatus,
      focusedDuelMatchIdRef,
      focusedGroupMatchIdRef,
      livePagerRef,
      fastRoomPollMs: MATCH_ROOM_FAST_POLL_MS,
      idleRoomPollMs: MATCH_ROOM_IDLE_POLL_MS,
      fastMatchStatusPollMs: MATCH_STATUS_FAST_POLL_MS,
      idleMatchStatusPollMs: MATCH_STATUS_IDLE_POLL_MS,
      linkedMatchSyncEnabled: liveMatchStartupWorkReady,
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
      nextStartingMatch: currentUserDoneWithCurrentMatch ? null : nextStartingMatch,
      activeUpcomingMatch: currentUserDoneWithCurrentMatch ? null : activeUpcomingMatch,
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
      // The 1Hz ticker re-renders this entire model per tick, so it QUIESCES for the long
      // measuring phase once the slot-gated arena open has fired + a grace has passed
      // (countdownTickerGate). Every start-adjacent term stays always-on and byte-identical
      // to the old inline gate. Time terms use a FRESH getSyncedNowMs() read — the state
      // syncedNowMs freezes while quiesced; heartbeat/poll/GPS renders (~2-3s) keep
      // re-evaluating this gate, which is what wakes the ticker for an upcoming slot.
      enabled: shouldEnableCountdownTicker({
        heavyTickersFocusGate,
        shouldRunCountdownTicker: trackRunIdleViewModel.shouldRunCountdownTicker,
        isStarting,
        isRunning,
        hasHydratedFocusMatch: Boolean(hydratedFocusMatchId),
        hasVisibleCountdownEntry: Boolean(visibleCountdownEntry),
        hasRoomCountdownEntry: Boolean(roomCountdownEntry),
        hasNextStartingMatch: Boolean(nextStartingMatch),
        hasActiveUpcomingMatch: Boolean(activeUpcomingMatch),
        upcomingMatches: visibleUpcomingMatches,
        duelMatchState,
        groupMatchState,
        matchRoomLinkedMatchId: matchRoom?.linkedMatchId,
        matchRoomState: matchRoom?.state,
        arenaOpenFired: forceOpenActiveMatch,
        arenaOpenAtMs: arenaOpenAtMsRef.current,
        freshSyncedNowMs: getSyncedNowMs(),
      }),
    },
    blockingMatchStatusPolling: {
      matchMode,
      duelMatchStatus,
      groupMatchStatus,
      syncedNowMs,
      fastPollMs: shouldDeferLiveMatchHeavyWork
        ? MATCH_STATUS_COUNTDOWN_POLL_MS
        : MATCH_STATUS_FAST_POLL_MS,
      // Was 15000 — the guest could sit ~7.5s on the lobby/main tab waiting
      // for the next status poll to deliver `matched`, which is the main
      // visible delay before the host's start API result reaches them.
      // 5000ms keeps the worst-case under ~2.5s without a meaningful
      // increase in load. During the visible countdown, cadence relaxes so
      // polling responses do not compete with the countdown ticker.
      idlePollMs: shouldDeferLiveMatchHeavyWork ? MATCH_STATUS_COUNTDOWN_POLL_MS : 5000,
      loadDuelMatchStatus,
      loadGroupMatchStatus,
      enabled: !trackRunIdleViewModel.disableHeavySubscriptions
        && liveMatchStartupWorkReady
        && (
          matchLifecycleController.effects.shouldPollDirectMatchStatus
          || matchLifecycleController.effects.shouldPollLinkedMatch
          || matchLifecycleController.effects.shouldDiscoverWaitingMatch
        ),
      linkedMatchContext: matchLifecycleController.effects.shouldPollLinkedMatch
        ? roomLinkedMatchContext
        : null,
      recoveryMatchId: matchLifecycleController.source === 'party-room' ? null : matchLifecycleController.matchId,
      // A queued runner waiting for an opponent (no matchId) keeps polling direct status
      // by slot + distance so the reservation an opponent's request creates is discovered
      // on the searching cadence. Cleared the moment the discovered session sets matchId.
      waitingDiscovery: matchLifecycleController.effects.shouldDiscoverWaitingMatch
        && matchLifecycleController.mode
        ? {
          mode: matchLifecycleController.mode,
          slotStartAt: matchLifecycleController.mode === 'duel'
            ? activeDuelSlotStartAt
            : activeGroupSlotStartAt,
        }
        : null,
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
    // Bundle A2 — the heartbeat writes other-participant live status ONLY through the single
    // guarded apply funnel (forfeit + monotonic-serverNow), never via the bare status setters.
    applyMatchStatusSnapshot,
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
    handleShowResultAfterSelfForfeit,
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
    wasPartyRunRef,
    trackedMatchResult,
    totalStepsRef,
    pendingForfeitMatchRef,
    pendingCounterpartForfeitResultRef,
    saveNavEpochRef,
    matchProgressHeartbeatRef,
    preStartWarmupMatchIdRef,
    officialStartBaselineRef,
    autoStartedMatchIdRef,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    resetMatchRuntimeAfterTrackingCleared,
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
    resetLiveMatchNavigationOwner,
    markMatchLocallyForfeited,
  });

  // FIX-C (2026-07-09) — HOISTED self-end auto-exit. Lives here (always mounted with the
  // runtime model) instead of inside the arena-page-only LiveMatchExitActionCard, so my own
  // finish auto-saves and navigates regardless of which pager segment is active. Also carries
  // the freeze-deadline fallback: a locally recorded goal crossing whose server 'finished'
  // echo does not land within the grace window forces the same exit (the save path delivers
  // the frozen finish idempotently). Single-flight via FIX-1's saveCommandInFlight.
  useMatchSelfEndAutoExit({
    source: activeMatchExitSource,
    matchId: activeLiveMatchProgressMatchId,
    isTestMatch: activeMatchExitIsTest,
    selfFinished: activeMatchExitSelfFinished,
    selfForfeited: activeMatchExitSelfForfeited,
    isLeaving: activeMatchExitIsLeaving,
    isSaving,
    trackingStatus: status,
    onShowResultAfterCounterpartForfeit: handleShowResultAfterCounterpartForfeit,
    onShowResultAfterSelfForfeit: handleShowResultAfterSelfForfeit,
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
      allOthersForfeited: activeMatchExitAllOthersForfeited,
      onContinueSolo: handleContinueSoloFromMatch,
      onForfeit: handleForfeitMatch,
      onShowResultAfterCounterpartForfeit: handleShowResultAfterCounterpartForfeit,
      onShowResultAfterSelfForfeit: handleShowResultAfterSelfForfeit,
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
      effectiveDuelOpponent: effectiveDuelOpponentForLive,
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
      useLiveTrackingMetrics: useLeafLiveTrackingMetrics,
      onContinueSoloFromMatch: handleContinueSoloFromMatch,
      estimatedBonusPoints: estimatedMatchBonusPoints,
      estimatedLpDelta: estimatedMatchLpDelta,
      duelRows: effectiveDuelResultRows,
      groupRows: effectiveGroupResultRows,
      groupStatusLabel: groupResultStatusLabel,
    },
  });

  const {
    handleAcceptRoomInvitePress,
    handleCancelDuelMatchPress,
    handleCancelGroupMatchPress,
    handleCancelUpcomingMatchPress,
    handleDeclineRoomInvitePress,
    handleJoinRoomPress,
    handleOpenUpcomingMatch,
    handleRequestDuelMatchPress,
    handleRequestDuelRematchPress,
    handleRequestGroupMatchPress,
    handleRequestGroupRematchPress,
    handleSelectDuelDate,
    handleSelectGroupDate,
    handleSelectMatchOption,
  } = useTrackRunIdlePressHandlers({
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    focusRunningMatch,
    handleAcceptRoomInviteFromRunning,
    handleCancelDuelMatch,
    handleCancelGroupMatch,
    handleCancelUpcomingMatch,
    handleDeclineRoomInviteFromRunning,
    handleJoinMatchRoom,
    handleRequestDuelMatch,
    handleRequestGroupMatch,
    navigateToMatchRoomWithTrace,
    selectNextDuelSlotForDate,
    selectNextGroupSlotForDate,
    setMatchMode,
    setSelectedDuelDateKey,
    setSelectedGroupDateKey,
    visibleMatchRoom,
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
    onRequestGroupMatch: handleRequestGroupMatchPress,
    onRequestGroupRematch: handleRequestGroupRematchPress,
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
    slotDuelCounts: duelSlotCounts,
    syncedNowMs,
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

  useTrackRunWedgedLoadingWatchdog({
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    hydratedFocusMatchMode,
    isMountedRef,
    isResolvingFocusedMatch,
    liveMatchMountedRef,
    liveMatchViewConfirmationRef,
    liveShellGateDecision,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
    matchLifecycleStage: matchLifecycleController.stage,
    resetLiveMatchNavigationOwner,
    setForceOpenActiveMatch,
    setIsResolvingFocusedMatch,
    wedgedLoadingWatchdogRef,
  });

  // C-1 abandon: release the user from the blocking 결과 저장 중 overlay WITHOUT touching the
  // in-flight save. Bumping the epoch first makes the late-settling navigate at
  // saveForfeitResultAndNavigate degrade to an Alert (no yank); dropping the isLeaving flags
  // hides the overlay. Status stays 'saving', so the paused-shell action buttons stay hidden
  // (shouldShowPausedTrackingActions = isPaused && !showLiveArena) — no duplicate-save tap is
  // possible — and the small LiveMatchSavingIndicator keeps showing.
  const handleAbandonMatchEndTransition = useCallback(() => {
    saveNavEpochRef.current += 1;
    setIsLeavingDuelMatch(false);
    setIsLeavingGroupMatch(false);
  }, [setIsLeavingDuelMatch, setIsLeavingGroupMatch]);

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
    // Covers the whole live shell from the moment a match-ending button is pressed
    // (forfeit / 대결종료 / finish) until the run-detail replace lands, so none of the
    // intermediate live/matching screens flash by during the save. C-1: the overlay carries
    // a wall-clock watchdog and can abandon the WAIT via the handler below.
    shouldShowMatchEndTransitionOverlay: isLeavingDuelMatch || isLeavingGroupMatch,
    onAbandonMatchEndTransition: handleAbandonMatchEndTransition,
    soloStartCountdownSeconds: runtimeSoloStartCountdownSeconds,
  });

  return <TrackRunExperienceView {...trackRunViewProps} />;
}
