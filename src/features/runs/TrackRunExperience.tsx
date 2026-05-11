import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { type Href, router } from 'expo-router';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { MatchStartCountdownOverlay } from '@/components/matches/MatchStartCountdownOverlay';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { RunMatchResult, RunRoutePoint } from '@/domain/types';
import { MatchOptionSelector } from '@/features/runs/components/MatchOptionSelector';
import { LiveMatchExitActionCard } from '@/features/runs/components/LiveMatchExitActionCard';
import { LiveMatchPages } from '@/features/runs/components/LiveMatchPages';
import { LiveMatchTrackingPage } from '@/features/runs/components/LiveMatchTrackingPage';
import { DuelMatchSetupCard, GroupMatchSetupCard } from '@/features/runs/components/MatchSetupCards';
import { PartyRunHomePanel } from '@/features/runs/components/PartyRunHomePanel';
import { UpcomingMatchList } from '@/features/runs/components/UpcomingMatchList';
import {
  useRunTracking,
  type TrackerStatus,
} from '@/features/runs/hooks/useRunTracking';
import { useRunSaveFlow } from '@/features/runs/hooks/useRunSaveFlow';
import {
  usePartyRunRoom,
  type RoomStartMode,
} from '@/features/runs/hooks/usePartyRunRoom';
import {
  useMatchLifecycle,
  type RunMatchMode,
} from '@/features/runs/hooks/useMatchLifecycle';
import { useLiveMatchProgress } from '@/features/runs/hooks/useLiveMatchProgress';
import {
  acknowledgeRunningMatchRoomCountdown,
  cancelRunningMatch,
  createRunningMatchRoom,
  fetchFriendLeaderboard,
  fetchMatchDemandSummary,
  fetchNotificationSettings,
  fetchRunningMatchRoom,
  fetchUpcomingRunningMatches,
  fetchRunningMatchStatus,
  joinRunningMatchRoom,
  leaveRunningMatchRoom,
  requestDuelMatch,
  requestGroupMatch,
  startRunningMatchRoom,
  updateRunningMatchRoom,
  updateRunningMatchProgress,
  updateRunningLiveShare,
} from '@/lib/api/services';
import { syncScheduledMatchNotifications } from '@/lib/matchNotifications';
import {
  findNextStartingMatchedMatch,
  formatMatchCountdown,
  getMatchStartRemainingSeconds,
  shouldAutoOpenMatchArena,
  shouldShowMatchStartOverlay,
} from '@/lib/matchCountdown';
import {
  type DuelMatchOpponent,
  type RunningMatchRoom,
  type RunningMatchStatusResponse,
  type UpcomingRunningMatchItem,
  type UpdateRunningMatchProgressInput,
} from '@/lib/api/types';
import {
  getBackgroundRunElapsedSeconds,
  getBackgroundRunTrackingSnapshot,
  pauseBackgroundRunTracking,
  resetBackgroundRunTracking,
  resumeBackgroundRunTracking,
  startBackgroundRunTracking,
  subscribeBackgroundRunTracking,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/backgroundTracking';
import {
  buildAveragePace,
  calculateCadenceSpm,
  calculateElevationGainM,
  formatDuration,
  formatPaceFromSpeedMps,
} from '@/features/runs/tracking';
import {
  buildLiveShareFallbackLabel,
  buildLiveShareLabelFromAddress,
  buildOfficialStartBaseline,
  buildRouteFromOfficialStart,
  buildRoutePoint,
} from '@/features/runs/trackingSession';
import {
  formatMatchDateKey,
  formatMatchExpiryCountdown,
  formatMatchTargetDistance,
  getEstimatedMatchBonusPoints,
  resolveMatchTimeSection,
} from '@/features/runs/matchScheduling';
import {
  buildAverageArenaPaceLabel,
  buildEstimatedCompetitiveDistanceKm,
  buildParticipantAveragePaceLabel,
  hasRemoteRunnerProgress,
  isMeasuredPaceLabel,
  normalizeMatchProgressPace,
  resolveParticipantDisplayDistanceKm,
} from '@/features/runs/matchProgress';
import {
  buildDuelArenaParticipants,
  buildGroupArenaParticipants,
  buildRoomLinkedDuelPlaceholderParticipants,
  buildRoomLinkedGroupPlaceholderParticipants,
} from '@/features/runs/matchViewModels';
import {
  buildMatchParticipantStatusLabel,
  buildMatchTransitionNotice,
  derivePartyRunStartPhase,
  isBlockingMatchState,
  isLiveMatchState,
  resolveActiveMatchId,
  shouldAutoFocusMatchArena,
  shouldEnterMatchArenaForLifecycle,
  shouldKeepMatchArenaForceOpen,
  shouldOpenPartyRunArena,
  shouldPreferRoomLinkedArena,
  shouldShowPartyRunLoading,
  shouldUseCenteredMatchCountdown,
  shouldUseFullscreenMatchCountdown,
} from '@/features/runs/matchStateMachine';
import { getCurrentUserProfile } from '@/lib/session';

type StableCountdownTracker = {
  key: string;
  baselineRemainingSeconds: number;
  baselineNowMs: number;
};
const STALE_RENDER_MATCHED_MATCH_MS = 10 * 60 * 1000;
const STALE_RENDER_ACTIVE_MATCH_MS = 8 * 60 * 60 * 1000;
const OFFICIAL_START_DISTANCE_NOISE_GRACE_SECONDS = 5;
const OFFICIAL_START_DISTANCE_NOISE_GRACE_KM = 0.05;
const SOLO_START_COUNTDOWN_SECONDS = 5;
const MATCH_ROOM_FAST_POLL_MS = Platform.OS === 'android' ? 1500 : 1000;
const MATCH_ROOM_IDLE_POLL_MS = 5000;
const MATCH_STATUS_FAST_POLL_MS = Platform.OS === 'android' ? 2500 : 2000;
const MATCH_STATUS_IDLE_POLL_MS = 3000;

function parseServerNowMs(serverNow?: string) {
  const parsedMs = serverNow ? new Date(serverNow).getTime() : NaN;
  return Number.isFinite(parsedMs) ? parsedMs : null;
}

function shouldAcceptServerSnapshot(latestServerNowMsRef: { current: number }, serverNow?: string) {
  const serverNowMs = parseServerNowMs(serverNow);
  if (serverNowMs === null) {
    return true;
  }

  if (serverNowMs < latestServerNowMsRef.current) {
    return false;
  }

  latestServerNowMsRef.current = serverNowMs;
  return true;
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

function resolveStableCountdownRemainingSeconds(
  tracker: { current: StableCountdownTracker | null },
  key: string | null,
  rawRemainingSeconds: number | null,
  nowMs: number,
) {
  if (!key) {
    tracker.current = null;
    return rawRemainingSeconds;
  }

  const current = tracker.current;

  if (!current || current.key !== key) {
    if (typeof rawRemainingSeconds !== 'number') {
      tracker.current = null;
      return rawRemainingSeconds;
    }
    tracker.current = {
      key,
      baselineRemainingSeconds: rawRemainingSeconds,
      baselineNowMs: nowMs,
    };
    return rawRemainingSeconds;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - current.baselineNowMs) / 1000));
  const modeledRemainingSeconds = Math.max(0, current.baselineRemainingSeconds - elapsedSeconds);

  if (typeof rawRemainingSeconds !== 'number') {
    return modeledRemainingSeconds > 0 ? modeledRemainingSeconds : null;
  }

  if (rawRemainingSeconds < modeledRemainingSeconds) {
    tracker.current = {
      key,
      baselineRemainingSeconds: rawRemainingSeconds,
      baselineNowMs: nowMs,
    };
    return rawRemainingSeconds;
  }

  return modeledRemainingSeconds;
}
type TrackRunMode = 'tab' | 'stack';
type RoomLinkedMatchContext = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId: string;
  slotStartAt: string;
  distanceKm: number;
  state: 'matched' | 'active';
};

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
    route,
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
    locationPermissionGranted,
    setLocationPermissionGranted,
    backgroundLocationPermissionGranted,
    setBackgroundLocationPermissionGranted,
    motionPermissionGranted,
    setMotionPermissionGranted,
    error,
    setError,
    liveShareEnabled,
    setLiveShareEnabled,
    liveShareLabel,
    setLiveShareLabel,
    averagePace,
  } = useRunTracking();
  const livePagerRef = useRef<ScrollView | null>(null);
  const matchModeRef = useRef<RunMatchMode>('duel');
  const duelMatchStatusRef = useRef<RunningMatchStatusResponse | null>(null);
  const groupMatchStatusRef = useRef<RunningMatchStatusResponse | null>(null);
  const roomLinkedMatchContextRef = useRef<RoomLinkedMatchContext | null>(null);
  const focusedDuelMatchIdRef = useRef<string | null>(null);
  const focusedGroupMatchIdRef = useRef<string | null>(null);
  const countdownReadyRoomAckRef = useRef<string | null>(null);
  const roomLinkedMatchAutoFocusRef = useRef<string | null>(null);
  const duelCountdownTrackerRef = useRef<StableCountdownTracker | null>(null);
  const groupCountdownTrackerRef = useRef<StableCountdownTracker | null>(null);
  const roomCountdownTrackerRef = useRef<StableCountdownTracker | null>(null);
  const upcomingCountdownTrackerRef = useRef<StableCountdownTracker | null>(null);
  const latestDuelStatusServerNowMsRef = useRef(0);
  const latestGroupStatusServerNowMsRef = useRef(0);
  const latestUpcomingServerNowMsRef = useRef(0);
  const latestMatchRoomServerNowMsRef = useRef(0);
  const pushRunningMatchProgressRef = useRef<((input: UpdateRunningMatchProgressInput) => Promise<RunningMatchStatusResponse>) | null>(null);

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
    duelDemandSummary,
    setDuelDemandSummary,
    isLoadingDuelDemandSummary,
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
    duelSlotOptions,
    groupSlotOptions,
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
  const countdownAutoOpenMatchIdRef = useRef<string | null>(null);
  const activeAutoOpenMatchIdRef = useRef<string | null>(null);
  const autoStartedMatchIdRef = useRef<string | null>(null);
  const autoStartingMatchTrackingRef = useRef(false);
  const preStartWarmupMatchIdRef = useRef<string | null>(null);
  const handledRoomInviteTokenRef = useRef<string | null>(null);
  const forfeitedMatchIdsRef = useRef<Set<string>>(new Set());

  const {
    matchRoom,
    commitMatchRoom,
    visibleMatchRoom,
    currentRoomParticipant,
    roomFriendOptions,
    roomMatchMode,
    setRoomMatchMode,
    roomStartMode,
    setRoomStartMode,
    roomMaxParticipants,
    setRoomMaxParticipants,
    roomInviteTokenInput,
    setRoomInviteTokenInput,
    selectedRoomFriendIds,
    setSelectedRoomFriendIds,
    friendLeaderboard,
    setFriendLeaderboard,
    isLoadingMatchRoom,
    setIsLoadingMatchRoom,
    isCreatingMatchRoom,
    setIsCreatingMatchRoom,
    isJoiningMatchRoom,
    setIsJoiningMatchRoom,
    isUpdatingMatchRoom,
    setIsUpdatingMatchRoom,
    isStartingMatchRoom,
    setIsStartingMatchRoom,
    isLeavingMatchRoom,
    setIsLeavingMatchRoom,
  } = usePartyRunRoom({
    currentUserId,
    syncedNowMs,
    staleMatchedMatchMs: STALE_RENDER_MATCHED_MATCH_MS,
    staleActiveMatchMs: STALE_RENDER_ACTIVE_MATCH_MS,
  });

  useEffect(() => {
    if (!matchRoom) {
      return;
    }

    setRoomMatchMode(matchRoom.mode);
    setRoomStartMode(matchRoom.startMode);
    setRoomMaxParticipants(String(matchRoom.maxParticipants));
    setSelectedRoomFriendIds(matchRoom.invitedFriendIds);
    setRoomInviteTokenInput(matchRoom.inviteToken);

    if (matchRoom.mode === 'duel') {
      setDuelDistanceText(String(matchRoom.distanceKm));
      setSelectedDuelSlotStartAt(matchRoom.slotStartAt);
      setSelectedDuelDateKey(formatMatchDateKey(new Date(matchRoom.slotStartAt)));
      setSelectedDuelTimeSection(resolveMatchTimeSection(matchRoom.slotStartAt));
      return;
    }

    setGroupDistanceText(String(matchRoom.distanceKm));
    setSelectedGroupSlotStartAt(matchRoom.slotStartAt);
    setSelectedGroupDateKey(formatMatchDateKey(new Date(matchRoom.slotStartAt)));
    setSelectedGroupTimeSection(resolveMatchTimeSection(matchRoom.slotStartAt));
  }, [matchRoom]);

  const matchOptions = useMemo(
    () => [
      {
        mode: 'solo' as const,
        title: '혼자 러닝',
        summary: '기록에만 집중하는 기본 러닝 모드예요.',
        meta: '지금 페이스와 거리 흐름에만 집중',
        startLabel: '바로 런닝 시작',
        liveTitle: '개인 러닝 진행 중',
        liveText: '내 페이스와 현재 리듬을 지켜가는 데 집중하기 좋아요.',
      },
      {
        mode: 'duel' as const,
        title: '1대1 매치',
        summary: '비슷한 목표 러너 한 명과 바로 붙는 대결 모드예요.',
        meta: `${formatMatchTargetDistance(duelDistanceKm)} 기준 · 1시간 단위 주간 예약`,
        startLabel: '1대1 매치로 시작',
        liveTitle: '1대1 매치 진행 중',
        liveText: '완주 시간과 평균 페이스를 중심으로 오늘 결과를 비교하기 좋은 모드예요.',
      },
      {
        mode: 'group' as const,
        title: '그룹 대결',
        summary: '최대 30명까지 모아 순위 흐름을 보는 그룹전 모드예요.',
        meta: `${formatMatchTargetDistance(groupDistanceKm)} 기준 · 1시간 단위 주간 예약`,
        startLabel: '그룹 대결로 시작',
        liveTitle: '그룹 대결 진행 중',
        liveText: '비슷한 러너들과 함께 뛰면서 내 순위를 보는 재미를 주는 모드예요.',
      },
      {
        mode: 'room' as const,
        title: '파티런',
        summary: '친구 초대나 링크 공유로 직접 대결 방을 열 수 있어요.',
        meta: `${roomMatchMode === 'duel' ? '1대1 대결' : '그룹 대결'} · ${roomStartMode === 'scheduled' ? '예약 시작' : '방장 시작'}`,
        startLabel: visibleMatchRoom ? '방 입장' : '방 만들기',
        liveTitle: '친구 방 대기 중',
        liveText: '친구를 모아 직접 대결을 열고 시작할 수 있어요.',
      },
    ],
    [duelDistanceKm, groupDistanceKm, roomMatchMode, roomStartMode, visibleMatchRoom],
  );

  const selectedMatch = matchOptions.find((option) => option.mode === matchMode) ?? matchOptions[0];
  const visibleUpcomingMatches = useMemo(
    () => upcomingMatches.filter((match) => !shouldHidePastUpcomingMatch(match, syncedNowMs)),
    [syncedNowMs, upcomingMatches],
  );
  const hasBlockingRoom = Boolean(visibleMatchRoom);
  const hasBlockingScheduledMatch = useMemo(
    () => visibleUpcomingMatches.some((match) => isLiveMatchState(match.status)),
    [visibleUpcomingMatches],
  );
  const hasBlockingDuelMatch = isBlockingMatchState(duelMatchState);
  const hasBlockingGroupMatch = isBlockingMatchState(groupMatchState);
  const canCreateDuelMatch = !hasBlockingRoom && !hasBlockingScheduledMatch && !hasBlockingGroupMatch && !hasBlockingDuelMatch;
  const canCreateGroupMatch = !hasBlockingRoom && !hasBlockingScheduledMatch && !hasBlockingDuelMatch && !hasBlockingGroupMatch;
  const blockingMatchHelperText = hasBlockingRoom
    ? '이미 참여 중이거나 초대된 방이 있어요. 먼저 그 방을 정리한 뒤 다른 매칭을 잡을 수 있어요.'
    : hasBlockingScheduledMatch
    ? '매칭은 한 번에 하나만 잡을 수 있어요. 지금 예약된 매치를 먼저 취소하거나 끝내야 해요.'
    : hasBlockingDuelMatch
      ? '이미 1대1 매칭 신청이나 예약이 있어요. 먼저 정리한 뒤 새 매칭을 잡을 수 있어요.'
      : hasBlockingGroupMatch
        ? '이미 그룹 매칭 신청이나 예약이 있어요. 먼저 정리한 뒤 새 매칭을 잡을 수 있어요.'
        : null;
  const duelReservationLocked = duelMatchState === 'matched' && duelMatchStatus?.canCancel === false;
  const groupReservationLocked = groupMatchState === 'matched' && groupMatchStatus?.canCancel === false;
  const effectiveDuelOpponent = duelMatchStatus?.opponent ?? duelMatchResult?.opponent ?? null;
  const effectiveDuelOpponentStatusLabel = effectiveDuelOpponent
    ? buildMatchParticipantStatusLabel(effectiveDuelOpponent.liveStatus)
    : null;
  const effectiveDuelSlotLabel = duelMatchStatus?.slotLabel ?? duelMatchResult?.slotLabel ?? selectedDuelSlot?.label ?? '시간 미정';
  const rawDuelStartCountdownSeconds =
    duelMatchState === 'matched'
      ? getMatchStartRemainingSeconds(duelMatchStatus?.slotStartAt ?? activeDuelSlotStartAt, syncedNowMs)
      : null;
  const duelStartCountdownSeconds = resolveStableCountdownRemainingSeconds(
    duelCountdownTrackerRef,
    duelMatchState === 'matched'
      ? `${duelMatchStatus?.matchId ?? 'duel'}:${duelMatchStatus?.slotStartAt ?? activeDuelSlotStartAt}`
      : null,
    rawDuelStartCountdownSeconds,
    nowMs,
  );
  const duelExpiryCountdownLabel = formatMatchExpiryCountdown(duelMatchStatus?.expiresInSeconds);
  const effectiveGroupSlotLabel = groupMatchStatus?.slotLabel ?? groupMatchResult?.slotLabel ?? selectedGroupSlot?.label ?? '시간 미정';
  const rawGroupStartCountdownSeconds =
    groupMatchState === 'matched'
      ? getMatchStartRemainingSeconds(groupMatchStatus?.slotStartAt ?? activeGroupSlotStartAt, syncedNowMs)
      : null;
  const groupStartCountdownSeconds = resolveStableCountdownRemainingSeconds(
    groupCountdownTrackerRef,
    groupMatchState === 'matched'
      ? `${groupMatchStatus?.matchId ?? 'group'}:${groupMatchStatus?.slotStartAt ?? activeGroupSlotStartAt}`
      : null,
    rawGroupStartCountdownSeconds,
    nowMs,
  );
  const groupExpiryCountdownLabel = formatMatchExpiryCountdown(groupMatchStatus?.expiresInSeconds);
  const duelNeedsManualRematch = Boolean(duelMatchNotice && duelMatchState === 'idle');
  const groupNeedsManualRematch = Boolean(groupMatchNotice && groupMatchState === 'idle');
  const nextStartingMatch = useMemo(
    () => findNextStartingMatchedMatch(visibleUpcomingMatches, syncedNowMs),
    [syncedNowMs, visibleUpcomingMatches],
  );
  const stableNextStartingMatch = useMemo(() => {
    if (!nextStartingMatch) {
      return null;
    }

    const stableRemainingSeconds = resolveStableCountdownRemainingSeconds(
      upcomingCountdownTrackerRef,
      `${nextStartingMatch.match.matchId}:${nextStartingMatch.match.slotStartAt}`,
      nextStartingMatch.remainingSeconds,
      nowMs,
    );

    if (stableRemainingSeconds === null) {
      return null;
    }

    return {
      ...nextStartingMatch,
      remainingSeconds: stableRemainingSeconds,
    };
  }, [nextStartingMatch, nowMs]);
  const activeUpcomingMatch = useMemo(
    () => visibleUpcomingMatches.find((match) => match.status === 'active') ?? null,
    [visibleUpcomingMatches],
  );
  const fallbackCountdownEntry = useMemo(() => {
    if (matchMode === 'duel' && duelMatchState === 'matched' && duelMatchStatus && typeof duelStartCountdownSeconds === 'number') {
      return {
        title: '1대1 대결 곧 시작',
        subtitle: `${duelMatchStatus.opponent?.name ?? '상대'} · ${duelMatchStatus.distanceKm.toFixed(1)}km`,
        remainingSeconds: duelStartCountdownSeconds,
      };
    }

    if (matchMode === 'group' && groupMatchState === 'matched' && groupMatchStatus && typeof groupStartCountdownSeconds === 'number') {
      return {
        title: '그룹 대결 곧 시작',
        subtitle: `${groupMatchStatus.participantCount}명 그룹 · ${groupMatchStatus.distanceKm.toFixed(1)}km`,
        remainingSeconds: groupStartCountdownSeconds,
      };
    }

    return null;
  }, [
    duelMatchState,
    duelMatchStatus,
    duelStartCountdownSeconds,
    groupMatchState,
    groupMatchStatus,
    groupStartCountdownSeconds,
    matchMode,
  ]);
  const roomParticipantsCount = visibleMatchRoom?.participants.length ?? 0;
  const visibleMatchRoomIsInviteOnly = Boolean(visibleMatchRoom?.joined === false);
  const rawRoomCountdownRemainingSeconds = visibleMatchRoom?.linkedMatchSlotStartAt
    ? getMatchStartRemainingSeconds(visibleMatchRoom.linkedMatchSlotStartAt, syncedNowMs)
    : null;
  const roomCountdownRemainingSeconds = resolveStableCountdownRemainingSeconds(
    roomCountdownTrackerRef,
    visibleMatchRoom?.linkedMatchId
      ? `${visibleMatchRoom.linkedMatchId}:${visibleMatchRoom.linkedMatchSlotStartAt ?? visibleMatchRoom.slotStartAt}`
      : null,
    rawRoomCountdownRemainingSeconds,
    nowMs,
  );
  const visiblePartyRunStartPhase = derivePartyRunStartPhase({
    roomState: visibleMatchRoom?.state,
    linkedMatchStatus: visibleMatchRoom?.linkedMatchStatus,
    isCountdownReady: currentRoomParticipant?.isCountdownReady,
    remainingSeconds: roomCountdownRemainingSeconds,
  });
  const matchRoomStartPhase = derivePartyRunStartPhase({
    roomState: matchRoom?.state,
    linkedMatchStatus: matchRoom?.linkedMatchStatus,
    isCountdownReady: currentRoomParticipant?.isCountdownReady,
    remainingSeconds: roomCountdownRemainingSeconds,
  });
  const roomCountdownEntry = useMemo(() => {
    if (
      !visibleMatchRoom?.linkedMatchId
      || typeof roomCountdownRemainingSeconds !== 'number'
      || !['arming', 'countdown', 'active'].includes(visibleMatchRoom.state)
    ) {
      return null;
    }

    return {
      title: visibleMatchRoom.mode === 'duel' ? '1대1 대결 곧 시작' : '그룹 대결 곧 시작',
      subtitle: `${visibleMatchRoom.hostName}님 방 · ${(visibleMatchRoom.linkedMatchDistanceKm ?? visibleMatchRoom.distanceKm).toFixed(1)}km`,
      remainingSeconds: roomCountdownRemainingSeconds,
    };
  }, [roomCountdownRemainingSeconds, visibleMatchRoom]);
  const visibleCountdownEntry = roomCountdownEntry ?? (stableNextStartingMatch
    ? {
        title: stableNextStartingMatch.match.mode === 'duel' ? '1대1 대결 곧 시작' : '그룹 대결 곧 시작',
        subtitle: `${stableNextStartingMatch.match.counterpartLabel} · ${stableNextStartingMatch.match.summary}`,
        remainingSeconds: stableNextStartingMatch.remainingSeconds,
      }
    : fallbackCountdownEntry);
  const shouldShowRoomArmingOverlay = Boolean(
    matchRoom?.linkedMatchId
    && shouldShowPartyRunLoading(matchRoomStartPhase)
    && (matchMode === 'duel' || matchMode === 'group'),
  );
  const canOpenRoomArena = Boolean(
    visibleMatchRoom?.linkedMatchSlotStartAt
    && shouldOpenPartyRunArena(visiblePartyRunStartPhase),
  );
  const effectiveRoomMode = matchRoom?.mode ?? roomMatchMode;
  const roomDateOptions = effectiveRoomMode === 'group' ? groupDateOptions : duelDateOptions;
  const selectedRoomDateKey = effectiveRoomMode === 'group' ? selectedGroupDateKey : selectedDuelDateKey;
  const selectedRoomTimeSection = effectiveRoomMode === 'group' ? selectedGroupTimeSection : selectedDuelTimeSection;
  const roomVisibleSlotOptions = effectiveRoomMode === 'group' ? visibleGroupSlotOptions : visibleDuelSlotOptions;
  const activeRoomSlotStartAt = effectiveRoomMode === 'group' ? activeGroupSlotStartAt : activeDuelSlotStartAt;
  const activeRoomDistanceKm = effectiveRoomMode === 'group' ? groupDistanceKm : duelDistanceKm;
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
    distanceKm,
    elapsedSeconds,
    duelDistanceKm,
    groupDistanceKm,
  });
  const duelFinishSummary = useMemo(() => {
    if (!effectiveDuelOpponent) {
      return null;
    }

    const opponentForfeited = effectiveDuelOpponent.liveStatus === 'forfeited';
    const opponentHasProgress = hasRemoteRunnerProgress(effectiveDuelOpponent);
    const opponentDistanceKm = opponentForfeited || opponentHasProgress
      ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, duelDistanceKm)
      : 0;
    const gapKm = Number(Math.abs(distanceKm - opponentDistanceKm).toFixed(2));
    const isDraw = !opponentForfeited && gapKm < 0.03;
    const resultTone: RunMatchResult['resultTone'] = opponentForfeited
      ? 'win'
      : isDraw
        ? 'draw'
        : distanceKm > opponentDistanceKm
          ? 'win'
          : 'lose';
    const title = opponentForfeited
      ? `${effectiveDuelOpponent.name}님이 기권해서 승리했어요`
      : isDraw
      ? `${effectiveDuelOpponent.name}님과 비슷한 흐름으로 마쳤어요`
      : resultTone === 'win'
        ? `${effectiveDuelOpponent.name}님을 이겼어요`
        : `${effectiveDuelOpponent.name}님에게 졌어요`;
    const summary = opponentForfeited
      ? `상대가 기권했고 내 기록은 ${distanceKm.toFixed(2)}km로 저장돼요.`
      : isDraw
      ? `두 러너 차이가 ${gapKm.toFixed(2)}km 안쪽으로 거의 비슷했어요.`
      : resultTone === 'win'
        ? `${gapKm.toFixed(2)}km 차이로 앞서 마무리했어요.`
        : `${gapKm.toFixed(2)}km 차이로 뒤에서 마무리했어요.`;
    const badgeLabel = opponentForfeited ? '상대 기권 승' : isDraw ? '무승부' : resultTone === 'win' ? '승리' : '패배';

    return {
      title,
      summary,
      resultTone,
      badgeLabel,
      opponentDistanceKm,
      gapKm,
    };
  }, [distanceKm, duelDistanceKm, effectiveDuelOpponent]);
  const groupFinishSummary = useMemo(() => {
    if (!currentGroupStanding || !effectiveGroupParticipantCount) {
      return null;
    }

    const title = currentGroupStanding.rank === 1
      ? '1위로 마무리했어요'
      : `${effectiveGroupParticipantCount}명 중 ${currentGroupStanding.rank}위로 마쳤어요`;
    const summary = currentGroupStanding.rank === 1
      ? '마지막까지 페이스를 잘 지켜서 가장 먼저 들어왔어요.'
      : `앞 사람과 ${currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km 차이였어요.`;
    const podium = groupLiveStandings.slice(0, 3);

    return {
      title,
      summary,
      podium,
    };
  }, [currentGroupStanding, effectiveGroupParticipantCount, groupLiveStandings]);
  const trackedMatchResult = useMemo<RunMatchResult | undefined>(() => {
    if (matchMode === 'duel' && effectiveDuelOpponent && duelFinishSummary) {
      return {
        mode: 'duel',
        title: duelFinishSummary.title,
        summary: duelFinishSummary.summary,
        badgeLabel: duelFinishSummary.badgeLabel,
        opponentName: effectiveDuelOpponent.name,
        resultTone: duelFinishSummary.resultTone,
        gapKm: duelFinishSummary.gapKm,
        comparedDistanceKm: duelFinishSummary.opponentDistanceKm,
      };
    }

    if (matchMode === 'group' && groupFinishSummary && currentGroupStanding && effectiveGroupParticipantCount) {
      return {
        mode: 'group',
        title: groupFinishSummary.title,
        summary: groupFinishSummary.summary,
        badgeLabel: `${currentGroupStanding.rank}위`,
        rank: currentGroupStanding.rank,
        participantCount: effectiveGroupParticipantCount,
        gapKm: currentGroupStanding.gapAheadKm ?? undefined,
      };
    }

    return undefined;
  }, [
    currentGroupStanding,
    duelFinishSummary,
    effectiveDuelOpponent,
    effectiveGroupParticipantCount,
    groupFinishSummary,
    matchMode,
  ]);
  const estimatedMatchBonusPoints = useMemo(
    () => getEstimatedMatchBonusPoints(trackedMatchResult),
    [trackedMatchResult],
  );
  const liveMatchTitle = matchMode === 'duel' && effectiveDuelOpponent
    ? `${effectiveDuelOpponent.name}님과 1대1 매치 진행 중`
    : matchMode === 'group' && effectiveGroupParticipantCount
      ? `${effectiveGroupParticipantCount}명 그룹 대결 진행 중`
      : selectedMatch.liveTitle;
  const liveMatchText = matchMode === 'duel' && effectiveDuelOpponent
    ? `${effectiveDuelOpponent.compatibilitySummary} · ${effectiveDuelSlotLabel}`
    : matchMode === 'group' && effectiveGroupParticipantCount
      ? `${effectiveGroupSlotLabel} · 내 시작 시드 ${effectiveGroupSeedRank ?? 1}위`
      : selectedMatch.liveText;
  const readyActionLabel = matchMode === 'duel'
    ? duelMatchState === 'active'
      ? `${effectiveDuelOpponent?.name ?? '상대'}님과 매치 시작`
      : duelMatchState === 'matched'
        ? null
        : duelMatchState === 'waiting'
          ? '비슷한 상대를 계속 찾는 중'
          : '매칭 완료 후 시작'
    : matchMode === 'group'
      ? groupMatchState === 'active'
        ? `${effectiveGroupParticipantCount}명 그룹으로 시작`
        : groupMatchState === 'matched'
          ? null
          : groupMatchState === 'waiting'
            ? '비슷한 그룹을 계속 찾는 중'
            : '그룹 매칭 완료 후 시작'
      : matchRoom
        ? null
        : selectedMatch.startLabel;
  const isRunning = status === 'running';
  const isStarting = status === 'starting';
  const isPaused = status === 'paused';
  const isSaving = status === 'saving';
  const isIdle = status === 'idle';
  const isTabMode = mode === 'tab';
  const hasMatchResultPage = isPaused && matchMode !== 'solo' && Boolean(trackedMatchResult);
  const liveArenaPageWidth = Math.max(windowWidth - 32, 280);
  const hasRoomLinkedDuelContext = Boolean(
    visibleMatchRoom?.linkedMatchId
    && visibleMatchRoom.mode === 'duel'
    && ['arming', 'countdown', 'active'].includes(visibleMatchRoom.state),
  );
  const hasRoomLinkedGroupContext = Boolean(
    visibleMatchRoom?.linkedMatchId
    && visibleMatchRoom.mode === 'group'
    && ['arming', 'countdown', 'active'].includes(visibleMatchRoom.state),
  );
  const roomLinkedMatchContext = useMemo<RoomLinkedMatchContext | null>(() => {
    if (
      !visibleMatchRoom?.linkedMatchId
      || !['arming', 'countdown', 'active'].includes(visibleMatchRoom.state)
    ) {
      return null;
    }

    const slotStartAt = visibleMatchRoom.linkedMatchSlotStartAt ?? visibleMatchRoom.slotStartAt;
    const hasReachedOfficialStart = typeof roomCountdownRemainingSeconds !== 'number';

    return {
      mode: visibleMatchRoom.mode,
      matchId: visibleMatchRoom.linkedMatchId,
      slotStartAt,
      distanceKm: visibleMatchRoom.linkedMatchDistanceKm ?? visibleMatchRoom.distanceKm,
      state: visibleMatchRoom.linkedMatchStatus === 'active' || visibleMatchRoom.state === 'active' || hasReachedOfficialStart
        ? 'active'
        : 'matched',
    };
  }, [roomCountdownRemainingSeconds, visibleMatchRoom]);
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
  const officialCurrentAveragePace = matchMode === 'duel'
    ? duelMatchStatus?.officialComparison?.userAveragePace
    : matchMode === 'group'
      ? groupMatchStatus?.officialComparison?.userAveragePace
      : null;
  const currentUserArenaPace = isMeasuredPaceLabel(officialCurrentAveragePace)
    ? officialCurrentAveragePace!
    : buildAverageArenaPaceLabel(
        distanceKm,
        elapsedSeconds,
        duelArenaUsesLivePace || groupArenaUsesLivePace,
      );
  const effectiveDuelOpponentArenaPace = buildParticipantAveragePaceLabel(effectiveDuelOpponent, duelArenaUsesLivePace);
  const duelLiveSummary = effectiveDuelOpponent
    ? isDuelOpponentForfeited
      ? `${effectiveDuelOpponent.name}님 · 기권`
      : `${effectiveDuelOpponent.name}님${effectiveDuelOpponentArenaPace ? ` · ${effectiveDuelOpponentArenaPace}` : ''}${effectiveDuelOpponentStatusLabel ? ` · ${effectiveDuelOpponentStatusLabel}` : ''}`
    : '상대 러너 정보를 불러오는 중이에요.';
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
    currentDistanceKm: distanceKm,
    currentUserPaceLabel: currentUserArenaPace,
    opponent: effectiveDuelOpponent,
    roomLinkedMatchContext,
  }), [
    currentUserArenaPace,
    currentUserId,
    distanceKm,
    effectiveDuelOpponent,
    hasRoomLinkedDuelContext,
    roomLinkedMatchContext,
    visibleMatchRoom,
  ]);
  const roomLinkedDuelCurrentParticipant = roomLinkedDuelPlaceholderParticipants.find((participant) => participant.isCurrentUser) ?? null;
  const roomLinkedDuelOpponentParticipant = roomLinkedDuelPlaceholderParticipants.find((participant) => !participant.isCurrentUser) ?? null;
  const roomLinkedDuelGapKm = roomLinkedDuelCurrentParticipant && roomLinkedDuelOpponentParticipant
    ? Number((roomLinkedDuelCurrentParticipant.distanceKm - roomLinkedDuelOpponentParticipant.distanceKm).toFixed(2))
    : null;
  const hasRoomLinkedDuelLiveProgress = Boolean(
    roomLinkedDuelCurrentParticipant
    && roomLinkedDuelOpponentParticipant
    && (
      roomLinkedDuelCurrentParticipant.distanceKm > 0
      || roomLinkedDuelOpponentParticipant.distanceKm > 0
    ),
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
    room: visibleMatchRoom,
    hasRoomLinkedGroupContext,
    currentUserId,
    currentDistanceKm: distanceKm,
    currentUserPaceLabel: currentUserArenaPace,
    effectiveGroupParticipants,
    roomLinkedMatchContext,
  }), [
    currentUserArenaPace,
    currentUserId,
    distanceKm,
    effectiveGroupParticipants,
    hasRoomLinkedGroupContext,
    roomLinkedMatchContext,
    visibleMatchRoom,
  ]);
  const duelShouldOpenCountdownArena = duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds);
  const groupShouldOpenCountdownArena = groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds);
  const roomShouldOpenCountdownArena = Boolean(
    visibleMatchRoom?.linkedMatchId
    && (shouldOpenPartyRunArena(visiblePartyRunStartPhase) || forceOpenActiveMatch),
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

  const duelResultRows = useMemo(() => {
    if (matchMode !== 'duel' || !effectiveDuelOpponent || !duelFinishSummary) {
      return [];
    }

    const meWon = duelFinishSummary.resultTone === 'win';
    const isDraw = duelFinishSummary.resultTone === 'draw';
    const opponentDistanceKm = duelFinishSummary.opponentDistanceKm;
    const opponentElapsedSeconds = effectiveDuelOpponent.liveElapsedSeconds ?? elapsedSeconds;
    const opponentPace = buildParticipantAveragePaceLabel(effectiveDuelOpponent, true);

    if (isDraw) {
      return [
        {
          id: 'me',
          resultLabel: 'DRAW',
          name: '나',
          paceLabel: currentUserArenaPace,
          durationLabel: formatDuration(elapsedSeconds),
          distanceKm,
          isCurrentUser: true,
        },
        {
          id: effectiveDuelOpponent.id,
          resultLabel: 'DRAW',
          name: effectiveDuelOpponent.name,
          paceLabel: opponentPace,
          durationLabel: formatDuration(opponentElapsedSeconds),
          distanceKm: opponentDistanceKm,
          isCurrentUser: false,
        },
      ];
    }

    return [
      {
        id: meWon ? 'me' : effectiveDuelOpponent.id,
        resultLabel: 'WIN',
        name: meWon ? '나' : effectiveDuelOpponent.name,
        paceLabel: meWon ? currentUserArenaPace : opponentPace,
        durationLabel: formatDuration(meWon ? elapsedSeconds : opponentElapsedSeconds),
        distanceKm: meWon ? distanceKm : opponentDistanceKm,
        isCurrentUser: meWon,
      },
      {
        id: meWon ? effectiveDuelOpponent.id : 'me',
        resultLabel: 'LOSER',
        name: meWon ? effectiveDuelOpponent.name : '나',
        paceLabel: meWon ? opponentPace : currentUserArenaPace,
        durationLabel: formatDuration(meWon ? opponentElapsedSeconds : elapsedSeconds),
        distanceKm: meWon ? opponentDistanceKm : distanceKm,
        isCurrentUser: !meWon,
      },
    ];
  }, [
    currentUserArenaPace,
    distanceKm,
    duelFinishSummary,
    elapsedSeconds,
    effectiveDuelOpponent,
    matchMode,
  ]);

  const groupResultRows = useMemo(
    () => groupLiveStandings.map((participant) => ({
      id: participant.id,
      rank: participant.rank,
      name: participant.isCurrentUser ? '나' : participant.name,
      paceLabel: participant.isCurrentUser
        ? currentUserArenaPace
        : buildParticipantAveragePaceLabel(participant, true),
      durationLabel: formatDuration(participant.liveElapsedSeconds ?? elapsedSeconds),
      distanceKm: participant.currentDistanceKm,
      isCurrentUser: participant.isCurrentUser,
      liveStatus: participant.liveStatus,
    })),
    [currentUserArenaPace, elapsedSeconds, groupLiveStandings],
  );

  const groupResultStatusLabel = useMemo(() => {
    if (!groupResultRows.length) {
      return null;
    }

    const hasOngoingParticipants = groupResultRows.some((participant) => (
      !['finished', 'forfeited', 'disconnected'].includes(participant.liveStatus ?? '')
      && participant.distanceKm < Math.max(0, groupDistanceKm - 0.01)
    ));

    return hasOngoingParticipants
      ? '진행중 · 들어오는 대로 순위가 계속 업데이트돼요.'
      : '결과 확정 · 모든 참가자 기록이 정리됐어요.';
  }, [groupDistanceKm, groupResultRows]);

  const pushRunningMatchProgress = async (input: UpdateRunningMatchProgressInput) => {
    const progressAveragePace = buildAveragePace(input.distanceKm, input.elapsedSeconds);
    const normalizedCurrentPace = normalizeMatchProgressPace(input.currentPace, progressAveragePace);
    const syncedProgress = {
      matchId: input.matchId,
      distanceKm: input.distanceKm,
      elapsedSeconds: input.elapsedSeconds,
      currentPace: normalizedCurrentPace,
      updatedAt: Date.now(),
    };
    const nextStatus = await updateRunningMatchProgress({
      ...input,
      currentPace: normalizedCurrentPace,
    });
    setLastSyncedMatchProgress(syncedProgress);

    if (input.matchId === duelMatchStatus?.matchId) {
      setDuelMatchStatus(nextStatus);
    }

    if (input.matchId === groupMatchStatus?.matchId) {
      setGroupMatchStatus(nextStatus);
    }

    if (input.matchId === roomLinkedMatchContext?.matchId) {
      if (roomLinkedMatchContext.mode === 'duel') {
        setDuelMatchStatus(nextStatus);
      } else {
        setGroupMatchStatus(nextStatus);
      }
    }

    return nextStatus;
  };

  const getActiveMatchHeartbeatTarget = () => {
    if (matchModeRef.current === 'duel' && duelMatchStatusRef.current?.state === 'active' && duelMatchStatusRef.current.matchId) {
      return {
        matchId: duelMatchStatusRef.current.matchId,
      };
    }

    if (matchModeRef.current === 'group' && groupMatchStatusRef.current?.state === 'active' && groupMatchStatusRef.current.matchId) {
      return {
        matchId: groupMatchStatusRef.current.matchId,
      };
    }

    const roomLinkedContext = roomLinkedMatchContextRef.current;
    if (
      roomLinkedContext
      && roomLinkedContext.state === 'active'
      && matchModeRef.current === roomLinkedContext.mode
    ) {
      return {
        matchId: roomLinkedContext.matchId,
      };
    }

    return null;
  };

  const syncMatchLifecycleStatus = async (
    nextStatus: Extract<UpdateRunningMatchProgressInput['status'], 'running' | 'background'>,
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot(),
  ) => {
    const target = getActiveMatchHeartbeatTarget();
    if (!target || !pushRunningMatchProgressRef.current) {
      return;
    }

    const progress = buildDisplayedMatchProgress(snapshot);
    await pushRunningMatchProgressRef.current({
      matchId: target.matchId,
      distanceKm: progress.distanceKm,
      elapsedSeconds: progress.elapsedSeconds,
      currentPace: progress.currentPace,
      status: nextStatus,
    });
    matchProgressHeartbeatRef.current = Date.now();
  };

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

  useEffect(() => {
    pushRunningMatchProgressRef.current = pushRunningMatchProgress;
  }, [pushRunningMatchProgress]);

  useEffect(() => {
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

  useEffect(() => {
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

  useEffect(() => {
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

  useEffect(() => {
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
    const payload = await fetchRunningMatchRoom();
    if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
      return matchRoom;
    }

    syncServerClock(payload.serverNow);
    const nextRoom = payload.room?.linkedMatchId && forfeitedMatchIdsRef.current.has(payload.room.linkedMatchId)
      ? null
      : payload.room;
    commitMatchRoom(nextRoom);
    return nextRoom;
  };

  const loadFriendLeaderboardData = async () => {
    const payload = await fetchFriendLeaderboard();
    setFriendLeaderboard(payload);
    return payload;
  };

  const canOpenRoomLinkedMatch = (room: RunningMatchRoom) => {
    if (!room.linkedMatchId) {
      return false;
    }

    const remainingSeconds = getMatchStartRemainingSeconds(
      room.linkedMatchSlotStartAt ?? room.slotStartAt,
      getSyncedNowMs(),
    );

    return room.state === 'active'
      || room.linkedMatchStatus === 'active'
      || shouldShowMatchStartOverlay(remainingSeconds);
  };

  const openRoomLinkedMatch = async (room: RunningMatchRoom, options?: { preferArena?: boolean }) => {
    if (!canOpenRoomLinkedMatch(room)) {
      return null;
    }

    return focusRunningMatch({
      mode: room.mode,
      matchId: room.linkedMatchId ?? undefined,
      distanceKm: room.linkedMatchDistanceKm ?? room.distanceKm,
      slotStartAt: room.linkedMatchSlotStartAt ?? room.slotStartAt,
      isTestMatch: false,
      preferArena: Boolean(options?.preferArena),
    });
  };

  const handleCreateMatchRoom = async () => {
    setIsCreatingMatchRoom(true);
    setError(null);

    try {
      const nextRoomMode = roomMatchMode;
      const payload = await createRunningMatchRoom({
        mode: nextRoomMode,
        distanceKm: nextRoomMode === 'duel' ? duelDistanceKm : groupDistanceKm,
        startMode: roomStartMode,
        ...(roomStartMode === 'scheduled'
          ? { slotStartAt: nextRoomMode === 'duel' ? activeDuelSlotStartAt : activeGroupSlotStartAt }
          : {}),
        ...(nextRoomMode === 'group' ? { maxParticipants: Number(roomMaxParticipants) || 10 } : {}),
      });
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
      if (payload.room) {
        router.push('/match-room' as Href);
      }
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '방을 만들지 못했어.');
    } finally {
      setIsCreatingMatchRoom(false);
    }
  };

  const handleJoinMatchRoom = async () => {
    const inviteToken = roomInviteTokenInput.trim();

    if (!inviteToken) {
      setError('방 초대 코드를 입력해줘.');
      return;
    }

    setIsJoiningMatchRoom(true);
    setError(null);

    try {
      const payload = await joinRunningMatchRoom({ inviteToken });
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
      setRoomInviteTokenInput('');
      if (payload.room) {
        router.push('/match-room' as Href);
      }
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '방에 들어가지 못했어.');
    } finally {
      setIsJoiningMatchRoom(false);
    }
  };

  const handleUpdateMatchRoom = async (overrides: Partial<{
    startMode: RoomStartMode;
    distanceKm: number;
    slotStartAt: string;
    maxParticipants: number;
    invitedFriendIds: string[];
  }> = {}) => {
    if (!matchRoom || !matchRoom.isHost || matchRoom.linkedMatchId) {
      return;
    }

    const nextStartMode = overrides.startMode ?? roomStartMode;
    const nextDistanceKm = overrides.distanceKm ?? (matchRoom.mode === 'duel' ? duelDistanceKm : groupDistanceKm);
    const nextSlotStartAt = overrides.slotStartAt ?? (matchRoom.mode === 'duel' ? activeDuelSlotStartAt : activeGroupSlotStartAt);
    const nextMaxParticipants = overrides.maxParticipants ?? (matchRoom.mode === 'group' ? (Number(roomMaxParticipants) || matchRoom.maxParticipants) : 2);
    const nextInvitedFriendIds = overrides.invitedFriendIds ?? selectedRoomFriendIds;

    setIsUpdatingMatchRoom(true);
    setError(null);

    try {
      const payload = await updateRunningMatchRoom({
        roomId: matchRoom.roomId,
        distanceKm: nextDistanceKm,
        startMode: nextStartMode,
        ...(nextStartMode === 'scheduled' ? { slotStartAt: nextSlotStartAt } : {}),
        ...(matchRoom.mode === 'group' ? { maxParticipants: nextMaxParticipants } : {}),
        invitedFriendIds: nextInvitedFriendIds,
      });
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '방 설정을 저장하지 못했어.');
    } finally {
      setIsUpdatingMatchRoom(false);
    }
  };

  const handleStartHostMatchRoom = async () => {
    if (!matchRoom) {
      return;
    }

    setIsStartingMatchRoom(true);
    setError(null);

    try {
      const payload = await startRunningMatchRoom({ roomId: matchRoom.roomId });
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
      if (payload.room) {
        await openRoomLinkedMatch(payload.room);
      }
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '방 시작을 반영하지 못했어.');
    } finally {
      setIsStartingMatchRoom(false);
    }
  };

  const handleLeaveMatchRoom = async () => {
    if (!matchRoom) {
      return;
    }

    setIsLeavingMatchRoom(true);
    setError(null);

    try {
      const payload = await leaveRunningMatchRoom({ roomId: matchRoom.roomId });
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
      setSelectedRoomFriendIds([]);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '방에서 나가지 못했어.');
    } finally {
      setIsLeavingMatchRoom(false);
    }
  };

  const handleAcceptRoomInviteFromRunning = async () => {
    if (!visibleMatchRoom) {
      return;
    }

    setIsJoiningMatchRoom(true);
    setError(null);

    try {
      const payload = await joinRunningMatchRoom({ inviteToken: visibleMatchRoom.inviteToken });
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
      if (payload.room) {
        router.push('/match-room' as Href);
      }
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '초대를 수락하지 못했어.');
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

    try {
      const payload = await leaveRunningMatchRoom({ roomId: visibleMatchRoom.roomId });
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitMatchRoom(payload.room);
      setSelectedRoomFriendIds([]);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '초대를 거절하지 못했어.');
    } finally {
      setIsLeavingMatchRoom(false);
    }
  };

  const handleShareMatchRoom = async () => {
    if (!matchRoom) {
      return;
    }

    try {
      await Share.share({
        message: `${matchRoom.mode === 'duel' ? '1대1' : '그룹'} 러닝 방에 같이 들어와요.\n초대 코드: ${matchRoom.inviteToken}\n링크: ${matchRoom.inviteLink}`,
      });
    } catch {
      Alert.alert('공유 실패', '지금은 초대 링크를 공유하지 못했어.');
    }
  };

  const focusRunningMatch = async ({
    mode,
    matchId,
    distanceKm,
    slotStartAt,
    isTestMatch,
    preferArena = false,
  }: {
    mode: Extract<RunMatchMode, 'duel' | 'group'>;
    matchId?: string;
    distanceKm?: number;
    slotStartAt?: string;
    isTestMatch?: boolean;
    preferArena?: boolean;
  }) => {
    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
    setForceOpenActiveMatch(Boolean(preferArena));
    setIsResolvingFocusedMatch(true);

    try {
      if (mode === 'duel') {
        setMatchMode('duel');
        if (typeof distanceKm === 'number' && Number.isFinite(distanceKm)) {
          setDuelDistanceText(String(distanceKm));
        }

      if (slotStartAt) {
        setSelectedDuelSlotStartAt(slotStartAt);
        setSelectedDuelDateKey(formatMatchDateKey(new Date(slotStartAt)));
        setSelectedDuelTimeSection(resolveMatchTimeSection(slotStartAt));
      }
      focusedDuelMatchIdRef.current = matchId ?? focusedDuelMatchIdRef.current;

      const payload = await loadDuelMatchStatus(slotStartAt ?? activeDuelSlotStartAt, {
        distanceKm,
        testMode: isTestMatch,
        matchId,
      });
      setForceOpenActiveMatch(
        payload.state === 'active'
          || (payload.state === 'matched' && (
            preferArena
            || shouldAutoOpenMatchArena(getMatchStartRemainingSeconds(payload.slotStartAt, getSyncedNowMs()))
          )),
        );
        return payload;
      }

      setMatchMode('group');
      if (typeof distanceKm === 'number' && Number.isFinite(distanceKm)) {
        setGroupDistanceText(String(distanceKm));
      }

      if (slotStartAt) {
        setSelectedGroupSlotStartAt(slotStartAt);
        setSelectedGroupDateKey(formatMatchDateKey(new Date(slotStartAt)));
        setSelectedGroupTimeSection(resolveMatchTimeSection(slotStartAt));
      }
      focusedGroupMatchIdRef.current = matchId ?? focusedGroupMatchIdRef.current;

      const payload = await loadGroupMatchStatus(slotStartAt ?? activeGroupSlotStartAt, {
        distanceKm,
        testMode: isTestMatch,
        matchId,
      });
      setForceOpenActiveMatch(
        payload.state === 'active'
        || (payload.state === 'matched' && (
          preferArena
          || shouldAutoOpenMatchArena(getMatchStartRemainingSeconds(payload.slotStartAt, getSyncedNowMs()))
        )),
      );
      return payload;
    } finally {
      setIsResolvingFocusedMatch(false);
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
    countdownAutoOpenMatchIdRef.current = null;
    activeAutoOpenMatchIdRef.current = null;
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

  useEffect(() => {
    let canceled = false;
    void loadUpcomingMatches().catch(() => {
      if (!canceled) {
        setUpcomingMatches([]);
      }
    });

    return () => {
      canceled = true;
    };
  }, [duelMatchStatus?.matchId, duelMatchStatus?.state, groupMatchStatus?.matchId, groupMatchStatus?.state]);

  useEffect(() => {
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

  useEffect(() => {
    const needsFastRoomPolling = Boolean(
      matchRoom?.linkedMatchId || ['arming', 'countdown', 'active'].includes(matchRoom?.state ?? ''),
    );
    const intervalMs = needsFastRoomPolling ? MATCH_ROOM_FAST_POLL_MS : MATCH_ROOM_IDLE_POLL_MS;
    const timer = setInterval(() => {
      void loadMatchRoom().catch(() => {});
    }, intervalMs);

    return () => clearInterval(timer);
  }, [matchRoom?.linkedMatchId, matchRoom?.state]);

  useEffect(() => {
    if (!matchRoom?.roomId || !matchRoom.linkedMatchId || matchRoom.state !== 'arming' || currentRoomParticipant?.isCountdownReady) {
      if (!matchRoom?.linkedMatchId || matchRoom.state !== 'arming') {
        countdownReadyRoomAckRef.current = null;
      }
      return;
    }

    const ackKey = `${matchRoom.roomId}:${matchRoom.linkedMatchId}:${currentUserId}`;
    if (countdownReadyRoomAckRef.current === ackKey) {
      return;
    }

    countdownReadyRoomAckRef.current = ackKey;
    void acknowledgeRunningMatchRoomCountdown({ roomId: matchRoom.roomId })
      .then((payload) => {
        if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
          return;
        }

        syncServerClock(payload.serverNow);
        commitMatchRoom(payload.room);
      })
      .catch((roomError) => {
        countdownReadyRoomAckRef.current = null;
        setError(roomError instanceof Error ? roomError.message : '파티런 카운트다운 준비를 맞추지 못했어.');
      });
  }, [currentRoomParticipant?.isCountdownReady, currentUserId, matchRoom?.linkedMatchId, matchRoom?.roomId, matchRoom?.state]);

  useEffect(() => {
    if (!matchRoom?.linkedMatchId || !canOpenRoomLinkedMatch(matchRoom)) {
      roomLinkedMatchAutoFocusRef.current = null;
      return;
    }

    const shouldPreferArena = shouldPreferRoomLinkedArena(
      matchRoom.linkedMatchStatus,
      roomCountdownRemainingSeconds,
    );

    const nextKey = [
      matchRoom.roomId,
      matchRoom.linkedMatchId,
      matchRoom.state,
      matchRoom.linkedMatchSlotStartAt ?? matchRoom.slotStartAt,
      shouldPreferArena ? 'arena' : 'countdown',
    ].join(':');

    const currentFocusedMatchId = matchRoom.mode === 'duel'
      ? duelMatchStatus?.matchId ?? focusedDuelMatchIdRef.current
      : groupMatchStatus?.matchId ?? focusedGroupMatchIdRef.current;
    const currentFocusedState = matchRoom.mode === 'duel'
      ? duelMatchStatus?.state
      : groupMatchStatus?.state;

    if (
      roomLinkedMatchAutoFocusRef.current === nextKey
      && currentFocusedMatchId === matchRoom.linkedMatchId
      && currentFocusedState === (matchRoom.linkedMatchStatus === 'active' ? 'active' : currentFocusedState)
    ) {
      return;
    }

    roomLinkedMatchAutoFocusRef.current = nextKey;
    void openRoomLinkedMatch(matchRoom, { preferArena: shouldPreferArena }).catch(() => {
      roomLinkedMatchAutoFocusRef.current = null;
    });
  }, [
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    groupMatchStatus?.matchId,
    groupMatchStatus?.state,
    matchRoom?.linkedMatchId,
    matchRoom?.linkedMatchStatus,
    matchRoom?.linkedMatchSlotStartAt,
    matchRoom?.mode,
    matchRoom?.roomId,
    matchRoom?.slotStartAt,
    matchRoom?.state,
    roomCountdownRemainingSeconds,
  ]);

  useEffect(() => {
    if (!roomLinkedMatchContext) {
      return;
    }

    let canceled = false;

    const syncRoomLinkedMatchStatus = async () => {
      try {
        const payload = roomLinkedMatchContext.mode === 'duel'
          ? await loadDuelMatchStatus(roomLinkedMatchContext.slotStartAt, {
              distanceKm: roomLinkedMatchContext.distanceKm,
              matchId: roomLinkedMatchContext.matchId,
              testMode: false,
              forceAccept: true,
            })
          : await loadGroupMatchStatus(roomLinkedMatchContext.slotStartAt, {
              distanceKm: roomLinkedMatchContext.distanceKm,
              matchId: roomLinkedMatchContext.matchId,
              testMode: false,
              forceAccept: true,
            });

        if (canceled) {
          return;
        }

        setMatchMode(roomLinkedMatchContext.mode);

        const shouldPinArenaPage = shouldAutoOpenMatchArena(
          getMatchStartRemainingSeconds(payload.slotStartAt, getSyncedNowMs()),
        );

        if (payload.state === 'active' || shouldPinArenaPage) {
          setForceOpenActiveMatch(true);

          if (shouldPinArenaPage) {
            setLiveArenaPage(0);
            livePagerRef.current?.scrollTo({ x: 0, animated: false });
          }
        }
      } catch {
        // The room snapshot still keeps the arena open; retry on the next short poll.
      }
    };

    void syncRoomLinkedMatchStatus();

    const intervalMs = visiblePartyRunStartPhase === 'countdown'
      || shouldOpenPartyRunArena(visiblePartyRunStartPhase)
      ? MATCH_STATUS_FAST_POLL_MS
      : MATCH_STATUS_IDLE_POLL_MS;
    const timer = setInterval(() => {
      void syncRoomLinkedMatchStatus();
    }, intervalMs);

    return () => {
      canceled = true;
      clearInterval(timer);
    };
  }, [
    roomLinkedMatchContext?.distanceKm,
    roomLinkedMatchContext?.matchId,
    roomLinkedMatchContext?.mode,
    roomLinkedMatchContext?.slotStartAt,
    roomLinkedMatchContext?.state,
    visiblePartyRunStartPhase,
  ]);

  useEffect(() => {
    void loadUpcomingMatches().catch(() => {});
  }, [matchRoom?.linkedMatchId, matchRoom?.state]);

  useEffect(() => {
    void refreshStaleMatchArtifacts().catch(() => {});
  }, []);

  useEffect(() => {
    if (!focusMatchNonce || !focusMatchMode) {
      return;
    }
    if (forceMatchArena) {
      setForceOpenActiveMatch(true);
      setLiveArenaPage(0);
      livePagerRef.current?.scrollTo({ x: 0, animated: false });
    }
    void focusRunningMatch({
      mode: focusMatchMode,
      matchId: focusMatchId,
      distanceKm: focusMatchDistanceKm,
      slotStartAt: focusMatchSlotStartAt,
      isTestMatch: focusMatchIsTest,
      preferArena: Boolean(forceMatchArena),
    }).catch(() => {});
  }, [focusMatchDistanceKm, focusMatchId, focusMatchIsTest, focusMatchMode, focusMatchNonce, focusMatchSlotStartAt, forceMatchArena]);

  useEffect(() => {
    if (!roomInviteToken || handledRoomInviteTokenRef.current === roomInviteToken) {
      return;
    }

    handledRoomInviteTokenRef.current = roomInviteToken;
    setRoomInviteTokenInput(roomInviteToken);
    void joinRunningMatchRoom({ inviteToken: roomInviteToken })
      .then((payload) => {
        if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
          return;
        }

        syncServerClock(payload.serverNow);
        commitMatchRoom(payload.room);
        if (payload.room) {
          router.push('/match-room' as Href);
        }
      })
      .catch((roomError) => {
        setError(roomError instanceof Error ? roomError.message : '초대 링크로 방에 들어가지 못했어.');
      });
  }, [roomInviteToken]);

  useEffect(() => {
    if (isResolvingFocusedMatch) {
      return;
    }

    if (!shouldKeepMatchArenaForceOpen({
      isResolvingFocusedMatch,
      duelState: duelMatchState,
      groupState: groupMatchState,
      duelShouldOpenCountdownArena,
      groupShouldOpenCountdownArena,
      roomShouldOpenCountdownArena,
      forceOpenActiveMatch,
      shouldKeepRunningMatchArena,
    })) {
      setForceOpenActiveMatch(false);
    }
  }, [
    duelMatchState,
    duelShouldOpenCountdownArena,
    forceOpenActiveMatch,
    groupMatchState,
    groupShouldOpenCountdownArena,
    isResolvingFocusedMatch,
    roomShouldOpenCountdownArena,
    shouldKeepRunningMatchArena,
  ]);

  useEffect(() => {
    if (!shouldEnterMatchArenaForLifecycle({
      duelState: duelMatchState,
      groupState: groupMatchState,
      duelShouldOpenCountdownArena,
      groupShouldOpenCountdownArena,
    })) {
      return;
    }

    setForceOpenActiveMatch(true);
    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [duelMatchState, duelShouldOpenCountdownArena, groupMatchState, groupShouldOpenCountdownArena]);

  useEffect(() => {
    if (!hasMatchResultPage) {
      return;
    }

    setLiveArenaPage(3);
    livePagerRef.current?.scrollTo({ x: liveArenaPageWidth * 3, animated: true });
  }, [hasMatchResultPage, liveArenaPageWidth]);

  useEffect(() => {
    if (!nextStartingMatch || !shouldAutoFocusMatchArena(isIdle, nextStartingMatch.remainingSeconds)) {
      countdownAutoOpenMatchIdRef.current = null;
      return;
    }

    if (countdownAutoOpenMatchIdRef.current === nextStartingMatch.match.matchId) {
      return;
    }

    countdownAutoOpenMatchIdRef.current = nextStartingMatch.match.matchId;

    void focusRunningMatch({
      mode: nextStartingMatch.match.mode,
      matchId: nextStartingMatch.match.matchId,
      distanceKm: nextStartingMatch.match.distanceKm,
      slotStartAt: nextStartingMatch.match.slotStartAt,
      isTestMatch: nextStartingMatch.match.isTestMatch,
      preferArena: true,
    }).catch(() => {});
  }, [focusRunningMatch, isIdle, nextStartingMatch]);

  useEffect(() => {
    if (!isIdle || !activeUpcomingMatch) {
      activeAutoOpenMatchIdRef.current = null;
      return;
    }

    if (activeAutoOpenMatchIdRef.current === activeUpcomingMatch.matchId) {
      return;
    }

    activeAutoOpenMatchIdRef.current = activeUpcomingMatch.matchId;

    void focusRunningMatch({
      mode: activeUpcomingMatch.mode,
      matchId: activeUpcomingMatch.matchId,
      distanceKm: activeUpcomingMatch.distanceKm,
      slotStartAt: activeUpcomingMatch.slotStartAt,
      isTestMatch: activeUpcomingMatch.isTestMatch,
      preferArena: true,
    }).catch(() => {});
  }, [activeUpcomingMatch, focusRunningMatch, isIdle]);

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

  useEffect(() => {
    let canceled = false;
    void fetchNotificationSettings()
      .then((settings) => {
        if (!canceled) {
          setMatchRemindersEnabled(settings.matchReminders);
        }
      })
      .catch(() => {
        if (!canceled) {
          setMatchRemindersEnabled(true);
        }
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    void syncScheduledMatchNotifications(upcomingMatches, matchRemindersEnabled);
  }, [matchRemindersEnabled, upcomingMatches]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextTick = () => {
      const currentNowMs = Date.now();
      setNowMs(currentNowMs);
      const syncedTickMs = currentNowMs + serverClockOffsetMsRef.current;
      const msUntilNextSecond = 1000 - (syncedTickMs % 1000);
      timer = setTimeout(scheduleNextTick, Math.max(120, Math.min(msUntilNextSecond + 20, 1000)));
    };

    timer = setTimeout(scheduleNextTick, 120);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    if (!showLiveArena) {
      return;
    }

    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [duelMatchStatus?.matchId, groupMatchStatus?.matchId, showLiveArena]);

  useEffect(() => {
    const roomWarmupMatchId =
      roomLinkedMatchContext
      && roomLinkedMatchContext.mode === matchMode
      && roomLinkedMatchContext.state === 'matched'
      && shouldOpenPartyRunArena(visiblePartyRunStartPhase)
        ? roomLinkedMatchContext.matchId
        : null;
    const warmupMatchId = matchMode === 'duel'
      ? duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds)
        ? duelMatchStatus?.matchId ?? roomWarmupMatchId
        : roomWarmupMatchId
      : matchMode === 'group'
        ? groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds)
          ? groupMatchStatus?.matchId ?? roomWarmupMatchId
          : roomWarmupMatchId
        : roomWarmupMatchId;

    if (!warmupMatchId) {
      if (!officialStartBaselineRef.current) {
        preStartWarmupMatchIdRef.current = null;
      }
      return;
    }

    if (status !== 'idle') {
      return;
    }

    if (autoStartedMatchIdRef.current === warmupMatchId) {
      return;
    }

    startMatchTrackingAutomatically(warmupMatchId, { allowCountdownWarmup: true });
  }, [
    duelMatchState,
    duelMatchStatus?.matchId,
    duelStartCountdownSeconds,
    groupMatchState,
    groupMatchStatus?.matchId,
    groupStartCountdownSeconds,
    matchMode,
    nowMs,
    roomLinkedMatchContext,
    status,
    visiblePartyRunStartPhase,
  ]);

  useEffect(() => {
    const roomActiveMatch =
      roomLinkedMatchContext
      && roomLinkedMatchContext.mode === matchMode
      && roomLinkedMatchContext.state === 'active'
        ? {
            matchId: roomLinkedMatchContext.matchId,
            slotStartAt: roomLinkedMatchContext.slotStartAt,
          }
        : null;
    const activeMatch = matchMode === 'duel'
      ? duelMatchStatus?.state === 'active' && duelMatchStatus.matchId
        ? { matchId: duelMatchStatus.matchId, slotStartAt: duelMatchStatus.slotStartAt }
        : roomActiveMatch
      : matchMode === 'group'
        ? groupMatchStatus?.state === 'active' && groupMatchStatus.matchId
          ? { matchId: groupMatchStatus.matchId, slotStartAt: groupMatchStatus.slotStartAt }
          : roomActiveMatch
        : roomActiveMatch;
    const activeMatchId = activeMatch?.matchId ?? null;

    if (!activeMatchId) {
      autoStartedMatchIdRef.current = null;
      if (!preStartWarmupMatchIdRef.current) {
        officialStartBaselineRef.current = null;
      }
      return;
    }

    if (
      preStartWarmupMatchIdRef.current === activeMatchId
      && status === 'running'
      && !officialStartBaselineRef.current
    ) {
      const currentSnapshot = getBackgroundRunTrackingSnapshot();
      officialStartBaselineRef.current = buildOfficialStartBaseline(
        currentSnapshot,
        activeMatchId,
        activeMatch?.slotStartAt ?? new Date().toISOString(),
      );
      preStartWarmupMatchIdRef.current = null;
      syncFromBackgroundTracking(currentSnapshot);
      return;
    }

    if (status !== 'idle') {
      return;
    }

    if (autoStartedMatchIdRef.current === activeMatchId) {
      return;
    }

    startMatchTrackingAutomatically(activeMatchId);
  }, [
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    duelMatchStatus?.slotStartAt,
    groupMatchStatus?.matchId,
    groupMatchStatus?.state,
    groupMatchStatus?.slotStartAt,
    matchMode,
    nowMs,
    roomLinkedMatchContext,
    status,
  ]);

  useEffect(() => {
    if (matchMode !== 'duel' || !duelMatchStatus || !isBlockingMatchState(duelMatchStatus.state)) {
      return;
    }

    const remainingSeconds = getMatchStartRemainingSeconds(duelMatchStatus.slotStartAt, syncedNowMs);
    const intervalMs = duelMatchStatus.state === 'active' || shouldShowMatchStartOverlay(remainingSeconds)
      ? MATCH_STATUS_FAST_POLL_MS
      : 15000;
    const timer = setInterval(() => {
      void loadDuelMatchStatus().catch(() => {});
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [activeDuelSlotStartAt, duelDistanceKm, duelMatchStatus?.matchId, duelMatchStatus?.state, matchMode, syncedNowMs]);

  useEffect(() => {
    if (matchMode !== 'group' || !groupMatchStatus || !isBlockingMatchState(groupMatchStatus.state)) {
      return;
    }

    const remainingSeconds = getMatchStartRemainingSeconds(groupMatchStatus.slotStartAt, syncedNowMs);
    const intervalMs = groupMatchStatus.state === 'active' || shouldShowMatchStartOverlay(remainingSeconds)
      ? MATCH_STATUS_FAST_POLL_MS
      : 15000;
    const timer = setInterval(() => {
      void loadGroupMatchStatus().catch(() => {});
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [activeGroupSlotStartAt, groupDistanceKm, groupMatchStatus?.matchId, groupMatchStatus?.state, matchMode, syncedNowMs]);

  const syncElapsedSeconds = (nextElapsedSeconds: number) => {
    elapsedSecondsRef.current = nextElapsedSeconds;
    setElapsedSeconds(nextElapsedSeconds);
    setCadenceSpm(calculateCadenceSpm(totalStepsRef.current, nextElapsedSeconds));
  };

  const clearElapsedTicker = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const finishSoloStartCountdown = (completed: boolean) => {
    if (soloStartCountdownTimerRef.current) {
      clearInterval(soloStartCountdownTimerRef.current);
      soloStartCountdownTimerRef.current = null;
    }

    setSoloStartCountdownSeconds(null);
    soloStartCountdownResolveRef.current?.(completed);
    soloStartCountdownResolveRef.current = null;
  };

  const runSoloStartCountdown = () => new Promise<boolean>((resolve) => {
    finishSoloStartCountdown(false);

    soloStartCountdownResolveRef.current = resolve;
    let remainingSeconds = SOLO_START_COUNTDOWN_SECONDS;
    setSoloStartCountdownSeconds(remainingSeconds);
    setStatus('starting');

    soloStartCountdownTimerRef.current = setInterval(() => {
      remainingSeconds -= 1;

      if (remainingSeconds <= 0) {
        finishSoloStartCountdown(true);
        return;
      }

      setSoloStartCountdownSeconds(remainingSeconds);
    }, 1000);
  });

  const stopPedometerSubscription = () => {
    pedometerSubscriptionRef.current?.remove();
    pedometerSubscriptionRef.current = null;
  };

  const stopForegroundTrackingHelpers = () => {
    stopPedometerSubscription();
    clearElapsedTicker();
  };

  const resetForegroundTrackingState = () => {
    stopForegroundTrackingHelpers();
    finishSoloStartCountdown(false);
    elapsedSecondsRef.current = 0;
    totalStepsRef.current = 0;
    pedometerStepOffsetRef.current = 0;
    routeRef.current = [];
    setRoute([]);
    setDistanceKm(0);
    setElapsedSeconds(0);
    setCurrentPace('--:--/km');
    setLastSyncedMatchProgress(null);
    setElevationGainM(0);
    setCadenceSpm(null);
  };

  const resolveWarmupOfficialStartTarget = () => {
    const warmupMatchId = preStartWarmupMatchIdRef.current;
    if (!warmupMatchId) {
      return null;
    }

    const roomContext = roomLinkedMatchContextRef.current;
    if (roomContext?.matchId === warmupMatchId) {
      return {
        matchId: roomContext.matchId,
        slotStartAt: roomContext.slotStartAt,
        isActive: roomContext.state === 'active',
      };
    }

    const duelStatus = duelMatchStatusRef.current;
    if (duelStatus?.matchId === warmupMatchId) {
      return {
        matchId: duelStatus.matchId,
        slotStartAt: duelStatus.slotStartAt,
        isActive: duelStatus.state === 'active',
      };
    }

    const groupStatus = groupMatchStatusRef.current;
    if (groupStatus?.matchId === warmupMatchId) {
      return {
        matchId: groupStatus.matchId,
        slotStartAt: groupStatus.slotStartAt,
        isActive: groupStatus.state === 'active',
      };
    }

    return null;
  };

  const ensureOfficialStartBaseline = (snapshot: BackgroundRunTrackingSnapshot) => {
    if (!preStartWarmupMatchIdRef.current || officialStartBaselineRef.current) {
      return;
    }

    const target = resolveWarmupOfficialStartTarget();
    if (!target) {
      return;
    }

    const officialStartMs = new Date(target.slotStartAt).getTime();
    if (!Number.isFinite(officialStartMs)) {
      return;
    }

    if (!target.isActive && officialStartMs > getSyncedNowMs()) {
      return;
    }

    officialStartBaselineRef.current = buildOfficialStartBaseline(
      snapshot,
      target.matchId,
      target.slotStartAt,
    );
    preStartWarmupMatchIdRef.current = null;
  };

  const getDisplayedTrackingSnapshot = (
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot(),
  ) => {
    ensureOfficialStartBaseline(snapshot);
    const rawElapsedSeconds = getBackgroundRunElapsedSeconds(snapshot);
    const baseline = officialStartBaselineRef.current;

    if (baseline) {
      const adjustedRoute = buildRouteFromOfficialStart(snapshot, baseline);
      const adjustedElapsedSeconds = Math.max(0, rawElapsedSeconds - baseline.elapsedSeconds);
      const adjustedDistanceKm = Number(Math.max(0, snapshot.distanceKm - baseline.distanceKm).toFixed(2));
      const shouldSuppressStartNoise = adjustedElapsedSeconds <= OFFICIAL_START_DISTANCE_NOISE_GRACE_SECONDS
        && adjustedDistanceKm <= OFFICIAL_START_DISTANCE_NOISE_GRACE_KM;
      const displayRoute = shouldSuppressStartNoise ? adjustedRoute.slice(0, 1) : adjustedRoute;

      return {
        route: displayRoute,
        distanceKm: shouldSuppressStartNoise ? 0 : adjustedDistanceKm,
        elevationGainM: shouldSuppressStartNoise ? 0 : calculateElevationGainM(displayRoute),
        currentPace: snapshot.currentPace,
        elapsedSeconds: adjustedElapsedSeconds,
        startedAt: baseline.startedAt,
      };
    }

    if (preStartWarmupMatchIdRef.current) {
      return {
        route: [] as RunRoutePoint[],
        distanceKm: 0,
        elevationGainM: 0,
        currentPace: snapshot.currentPace,
        elapsedSeconds: 0,
        startedAt: snapshot.startedAt,
      };
    }

    return {
      route: snapshot.route,
      distanceKm: snapshot.distanceKm,
      elevationGainM: snapshot.elevationGainM,
      currentPace: snapshot.currentPace,
      elapsedSeconds: rawElapsedSeconds,
      startedAt: snapshot.startedAt,
    };
  };

  const buildDisplayedMatchProgress = (
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot(),
  ) => {
    const displayedSnapshot = getDisplayedTrackingSnapshot(snapshot);
    const displayedAveragePace = buildAveragePace(displayedSnapshot.distanceKm, displayedSnapshot.elapsedSeconds);
    return {
      distanceKm: displayedSnapshot.distanceKm,
      elapsedSeconds: displayedSnapshot.elapsedSeconds,
      currentPace: normalizeMatchProgressPace(displayedSnapshot.currentPace, displayedAveragePace),
    };
  };

  const syncFromBackgroundTracking = (snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot()) => {
    const displayedSnapshot = getDisplayedTrackingSnapshot(snapshot);
    routeRef.current = displayedSnapshot.route;
    setRoute(displayedSnapshot.route);
    setDistanceKm(displayedSnapshot.distanceKm);
    setElevationGainM(displayedSnapshot.elevationGainM);
    setCurrentPace(displayedSnapshot.currentPace);
    setStatus(snapshot.status);
    syncElapsedSeconds(displayedSnapshot.elapsedSeconds);
  };

  const startElapsedTicker = () => {
    clearElapsedTicker();
    timerRef.current = setInterval(() => {
      syncFromBackgroundTracking();
    }, 1000);
  };

  const startMatchTrackingAutomatically = (
    matchId: string,
    options?: { allowCountdownWarmup?: boolean },
  ) => {
    if (autoStartingMatchTrackingRef.current) {
      return;
    }

    autoStartingMatchTrackingRef.current = true;
    autoStartedMatchIdRef.current = matchId;

    void handleStartTracking(options)
      .finally(() => {
        autoStartingMatchTrackingRef.current = false;
        if (getBackgroundRunTrackingSnapshot().status !== 'running') {
          autoStartedMatchIdRef.current = null;
        }
      });
  };

  const startPedometerUpdates = async () => {
    try {
      const isAvailable = await Pedometer.isAvailableAsync();

      if (!isAvailable) {
        setMotionPermissionGranted(false);
        return;
      }

      const permission = await Pedometer.requestPermissionsAsync();
      const granted = permission.granted || permission.status === 'granted';
      setMotionPermissionGranted(granted);

      if (!granted) {
        return;
      }

      pedometerSubscriptionRef.current = Pedometer.watchStepCount((result) => {
        const totalSteps = pedometerStepOffsetRef.current + result.steps;
        totalStepsRef.current = totalSteps;
        setCadenceSpm(calculateCadenceSpm(totalSteps, elapsedSecondsRef.current));
      });
    } catch {
      setMotionPermissionGranted(false);
    }
  };

  const ensureLocationPermission = async () => {
    const foregroundPermission = await Location.requestForegroundPermissionsAsync();
    const granted = foregroundPermission.granted || foregroundPermission.status === 'granted';
    setLocationPermissionGranted(granted);

    if (!granted) {
      throw new Error('위치 권한을 허용해야 지도와 거리 측정이 가능해.');
    }
  };

  const ensureBackgroundLocationPermission = async (options?: { required?: boolean }) => {
    const currentBackgroundPermission = await Location.getBackgroundPermissionsAsync();
    let granted = currentBackgroundPermission.granted || currentBackgroundPermission.status === 'granted';

    if (!granted && options?.required) {
      const requestedBackgroundPermission = await Location.requestBackgroundPermissionsAsync();
      granted = requestedBackgroundPermission.granted || requestedBackgroundPermission.status === 'granted';
    }

    setBackgroundLocationPermissionGranted(granted);

    if (!granted && options?.required) {
      throw new Error(
        Platform.OS === 'ios'
          ? '백그라운드에서도 계속 측정하려면 설정 > RunningGround > 위치에서 `항상 허용`을 켜주세요.'
          : '백그라운드에서도 계속 측정하려면 RunningGround 위치 권한을 `항상 허용`으로 바꿔주세요.',
      );
    }

    return granted;
  };

  const resolveLiveShareLabel = async (coordinate?: { latitude: number; longitude: number }) => {
    if (!coordinate) {
      const fallbackLabel = buildLiveShareFallbackLabel();
      setLiveShareLabel(fallbackLabel);
      return fallbackLabel;
    }

    try {
      const [address] = await Location.reverseGeocodeAsync(coordinate);
      const nextLabel = buildLiveShareLabelFromAddress(address) || buildLiveShareFallbackLabel();
      setLiveShareLabel(nextLabel);
      return nextLabel;
    } catch {
      const fallbackLabel = buildLiveShareFallbackLabel();
      setLiveShareLabel(fallbackLabel);
      return fallbackLabel;
    }
  };

  const syncLiveSharing = async ({
    enabled,
    status: nextStatus,
    locationLabel,
  }: {
    enabled: boolean;
    status: 'idle' | 'paused' | 'running';
    locationLabel?: string | null;
  }) => {
    const payload = await updateRunningLiveShare({
      enabled,
      status: nextStatus,
      ...(locationLabel ? { locationLabel } : {}),
    });

    setLiveShareLabel(payload.locationLabel ?? null);
    liveShareHeartbeatRef.current = payload.isRunningNow ? Date.now() : 0;
    return payload;
  };

  const refreshLiveSharingHeartbeat = (snapshot: BackgroundRunTrackingSnapshot) => {
    if (!liveShareEnabledRef.current || snapshot.status !== 'running') {
      return;
    }

    const now = Date.now();

    if (now - liveShareHeartbeatRef.current < 25000) {
      return;
    }

    liveShareHeartbeatRef.current = now;
    void syncLiveSharing({
      enabled: true,
      status: 'running',
      locationLabel: liveShareLabelRef.current,
    }).catch(() => {
      // Keep the run going even if the optional live-share heartbeat fails.
    });
  };

  const refreshMatchProgressHeartbeat = (snapshot: BackgroundRunTrackingSnapshot) => {
    if (snapshot.status !== 'running') {
      return;
    }

    const target = getActiveMatchHeartbeatTarget();
    const pushProgress = pushRunningMatchProgressRef.current;

    if (!target || !pushProgress) {
      return;
    }

    const now = Date.now();

    if (now - matchProgressHeartbeatRef.current < 2000) {
      return;
    }

    matchProgressHeartbeatRef.current = now;
    const progress = buildDisplayedMatchProgress(snapshot);
    void pushProgress({
      matchId: target.matchId,
      distanceKm: progress.distanceKm,
      elapsedSeconds: progress.elapsedSeconds,
      currentPace: progress.currentPace,
      status: 'running',
    }).catch(() => {
      // Keep the run going even if the optional match heartbeat fails.
    });
  };

  const handleStartTracking = async (options?: { allowCountdownWarmup?: boolean }) => {
    if (Platform.OS === 'web') {
      setError('실시간 러닝 측정은 iPhone이나 Android 앱에서 사용할 수 있어.');
      return;
    }

    const roomLinkedStartContext = roomLinkedMatchContext?.mode === matchMode
      ? roomLinkedMatchContext
      : null;

    if (matchMode === 'duel' && !isLiveMatchState(duelMatchState) && roomLinkedStartContext?.mode !== 'duel') {
      setError('1대1 매칭이 잡힌 뒤에만 시작할 수 있어요.');
      return;
    }

    if (matchMode === 'group' && !isLiveMatchState(groupMatchState) && roomLinkedStartContext?.mode !== 'group') {
      setError('그룹 매칭이 잡힌 뒤에만 시작할 수 있어요.');
      return;
    }

    if (
      matchMode === 'duel'
      && duelMatchState === 'matched'
      && !duelMatchStatus?.readyToStart
      && roomLinkedStartContext?.state !== 'active'
      && !options?.allowCountdownWarmup
    ) {
      setError('예약된 시작 시간이 되면 1대1 대결을 시작할 수 있어요.');
      return;
    }

    if (
      matchMode === 'group'
      && groupMatchState === 'matched'
      && !groupMatchStatus?.readyToStart
      && roomLinkedStartContext?.state !== 'active'
      && !options?.allowCountdownWarmup
    ) {
      setError('예약된 시작 시간이 되면 그룹 대결을 시작할 수 있어요.');
      return;
    }

    try {
      setError(null);
      const shouldUseSoloStartCountdown = matchMode === 'solo' && !options?.allowCountdownWarmup;
      await ensureLocationPermission();
      await ensureBackgroundLocationPermission();
      resetForegroundTrackingState();
      await resetBackgroundRunTracking();

      if (options?.allowCountdownWarmup) {
        const warmupMatchId = matchMode === 'duel'
          ? duelMatchStatus?.matchId ?? roomLinkedStartContext?.matchId
          : groupMatchStatus?.matchId ?? roomLinkedStartContext?.matchId;
        preStartWarmupMatchIdRef.current = warmupMatchId ?? null;
        officialStartBaselineRef.current = null;
      } else {
        preStartWarmupMatchIdRef.current = null;
      }

      if (shouldUseSoloStartCountdown) {
        const countdownCompleted = await runSoloStartCountdown();

        if (!countdownCompleted) {
          return;
        }
      }

      await startBackgroundRunTracking();
      syncFromBackgroundTracking();

      try {
        if (liveShareEnabledRef.current) {
          const initialLabel = await resolveLiveShareLabel();
          await syncLiveSharing({
            enabled: true,
            status: 'running',
            locationLabel: initialLabel,
          });
        } else {
          await syncLiveSharing({
            enabled: false,
            status: 'idle',
          });
        }
      } catch {
        setError('러닝은 시작됐지만 위치 공유 상태를 반영하지 못했어요.');
      }
    } catch (trackingError) {
      finishSoloStartCountdown(false);
      setError(trackingError instanceof Error ? trackingError.message : '러닝 측정을 시작하지 못했어.');
      stopForegroundTrackingHelpers();
      await resetBackgroundRunTracking();
      void syncLiveSharing({
        enabled: false,
        status: 'idle',
      }).catch(() => {});
      setStatus('idle');
    }
  };

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
      setError(matchError instanceof Error ? matchError.message : '1대1 매칭을 찾지 못했어.');
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
      setError(matchError instanceof Error ? matchError.message : '그룹 매칭을 찾지 못했어.');
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
      setError(matchError instanceof Error ? matchError.message : '1대1 매치를 취소하지 못했어.');
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
      setError(matchError instanceof Error ? matchError.message : '그룹 매치를 취소하지 못했어.');
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
      setError(cancelError instanceof Error ? cancelError.message : '예약을 취소하지 못했어.');
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

  const handlePauseTracking = async () => {
    await pauseBackgroundRunTracking();
    stopForegroundTrackingHelpers();
    syncFromBackgroundTracking();

    const activeMatchId = resolveActiveMatchId({
      matchMode,
      duelMatchId: duelMatchStatus?.matchId,
      groupMatchId: groupMatchStatus?.matchId,
      roomLinkedMatchContext,
    });

    if (activeMatchId) {
      try {
        const progress = buildDisplayedMatchProgress();
        await pushRunningMatchProgress({
          matchId: activeMatchId,
          distanceKm: progress.distanceKm,
          elapsedSeconds: progress.elapsedSeconds,
          currentPace: progress.currentPace,
          status: 'paused',
        });
      } catch {
        setError('러닝은 멈췄지만 경쟁 상태를 업데이트하지 못했어요.');
      }
    }

    try {
      await syncLiveSharing({
        enabled: liveShareEnabledRef.current,
        status: liveShareEnabledRef.current ? 'paused' : 'idle',
        locationLabel: liveShareLabelRef.current,
      });
    } catch {
      setError('측정은 멈췄지만 위치 공유 상태를 업데이트하지 못했어요.');
    }
  };

  const handleResumeTracking = async () => {
    try {
      setError(null);
      await ensureBackgroundLocationPermission();
      await resumeBackgroundRunTracking();
      syncFromBackgroundTracking();

      if (liveShareEnabledRef.current) {
        const currentSnapshot = getBackgroundRunTrackingSnapshot();
        const latestTrackedPoint = currentSnapshot.route[currentSnapshot.route.length - 1];
        const nextLocationLabel = liveShareLabelRef.current ?? await resolveLiveShareLabel(
          latestTrackedPoint
            ? { latitude: latestTrackedPoint.latitude, longitude: latestTrackedPoint.longitude }
            : undefined,
        );
        await syncLiveSharing({
          enabled: true,
          status: 'running',
          locationLabel: nextLocationLabel,
        });
      }

      const activeMatchId = resolveActiveMatchId({
        matchMode,
        duelMatchId: duelMatchStatus?.matchId,
        groupMatchId: groupMatchStatus?.matchId,
        roomLinkedMatchContext,
      });

      if (activeMatchId) {
        const currentSnapshot = getBackgroundRunTrackingSnapshot();
        const progress = buildDisplayedMatchProgress(currentSnapshot);
        await pushRunningMatchProgress({
          matchId: activeMatchId,
          distanceKm: progress.distanceKm,
          elapsedSeconds: progress.elapsedSeconds,
          currentPace: progress.currentPace,
          status: 'running',
        });
      }
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : '러닝 측정을 다시 시작하지 못했어.');
      stopForegroundTrackingHelpers();
      setStatus('paused');
    }
  };

  const liveArenaExitAction = (
    <LiveMatchExitActionCard
      source={activeMatchExitSource}
      isTestMatch={activeMatchExitIsTest}
      isLeaving={activeMatchExitIsLeaving}
      isSaving={isSaving}
      isRunning={isRunning}
      counterpartForfeited={activeMatchExitCounterpartForfeited}
      onContinueSolo={handleContinueSoloFromMatch}
      onForfeit={handleForfeitMatch}
      onShowResultAfterCounterpartForfeit={(source) => {
        void handleShowResultAfterCounterpartForfeit(source);
      }}
    />
  );

  useEffect(() => {
    const unsubscribe = subscribeBackgroundRunTracking((snapshot) => {
      syncFromBackgroundTracking(snapshot);
      refreshLiveSharingHeartbeat(snapshot);
      refreshMatchProgressHeartbeat(snapshot);

      if (snapshot.status === 'running') {
        startElapsedTicker();
      } else {
        clearElapsedTicker();
      }
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active') {
        const snapshot = getBackgroundRunTrackingSnapshot();
        syncFromBackgroundTracking(snapshot);
        void refreshStaleMatchArtifacts().catch(() => {});

        if (trackerStatusRef.current === 'running') {
          void syncMatchLifecycleStatus('running', snapshot).catch(() => {
            // Keep the run going even if the optional lifecycle heartbeat fails.
          });
        }
        return;
      }

      if (
        previousState === 'active'
        && (nextState === 'inactive' || nextState === 'background')
        && trackerStatusRef.current === 'running'
      ) {
        void syncMatchLifecycleStatus('background').catch(() => {
          // Keep the run going even if the optional lifecycle heartbeat fails.
        });
      }
    });

    return () => {
      unsubscribe();
      appStateSubscription.remove();
      finishSoloStartCountdown(false);
      stopForegroundTrackingHelpers();
    };
  }, []);

  useEffect(() => {
    if (status !== 'running') {
      stopPedometerSubscription();
      return;
    }

    void startPedometerUpdates();

    return () => {
      stopPedometerSubscription();
    };
  }, [status]);

  const liveArenaPageProps = {
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
  };

  const liveRaceBoardPageProps = {
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
  };

  const liveTrackingPageBaseProps = {
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
    onContinueSoloFromMatch: handleContinueSoloFromMatch,
  };

  const liveResultPageProps = {
    matchMode,
    estimatedBonusPoints: estimatedMatchBonusPoints,
    duelRows: duelResultRows,
    groupRows: groupResultRows,
    groupStatusLabel: groupResultStatusLabel,
  };

  return (
    <View style={styles.root}>
      <Screen>
      <AuthHeader
        title="실시간 러닝"
        showBack={!isTabMode}
        backHref={backHref}
      />

      {isIdle && !showLiveArena ? (
        <>
          <Card style={[styles.readyCard, { paddingBottom: 18 + Math.max(insets.bottom, 10) }]}>
            <View style={styles.readyHero}>
              <Text style={styles.readyTitle}>러닝 준비</Text>
            </View>
            <UpcomingMatchList
              matches={visibleUpcomingMatches}
              nowMs={syncedNowMs}
              cancelingMatchId={cancelingUpcomingMatchId}
              onOpenMatch={(match) => {
                void focusRunningMatch({
                  mode: match.mode,
                  distanceKm: match.distanceKm,
                  slotStartAt: match.slotStartAt,
                  isTestMatch: match.isTestMatch,
                }).catch(() => {});
              }}
              onCancelMatch={(match) => {
                void handleCancelUpcomingMatch(match);
              }}
            />
            <View style={styles.matchCard}>
              <MatchOptionSelector
                options={matchOptions}
                selectedMode={matchMode}
                onSelect={(option) => {
                  if (option.mode === 'room' && visibleMatchRoom) {
                    router.push('/match-room' as Href);
                    return;
                  }

                  setMatchMode(option.mode);
                }}
              />
              <PartyRunHomePanel
                visibleRoom={visibleMatchRoom}
                currentRoom={matchRoom}
                isSelected={matchMode === 'room'}
                isInviteOnly={visibleMatchRoomIsInviteOnly}
                isJoining={isJoiningMatchRoom}
                isLeaving={isLeavingMatchRoom}
                roomMode={roomMatchMode}
                inviteTokenInput={roomInviteTokenInput}
                onRoomModeChange={setRoomMatchMode}
                onInviteTokenChange={setRoomInviteTokenInput}
                onAcceptInvite={() => { void handleAcceptRoomInviteFromRunning(); }}
                onDeclineInvite={() => { void handleDeclineRoomInviteFromRunning(); }}
                onJoinRoom={() => { void handleJoinMatchRoom(); }}
              />
              {matchMode === 'duel' ? (
                <DuelMatchSetupCard
                  distanceKm={duelDistanceKm}
                  distanceText={duelDistanceText}
                  showCustomDistanceInput={showDuelCustomDistanceInput}
                  dateOptions={duelDateOptions}
                  selectedDateKey={selectedDuelDateKey}
                  selectedTimeSection={selectedDuelTimeSection}
                  slotOptions={visibleDuelSlotOptions}
                  selectedSlotStartAt={selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt}
                  isRequesting={isRequestingDuelMatch}
                  matchState={duelMatchState}
                  matchStatus={duelMatchStatus}
                  activeSlotStartAt={activeDuelSlotStartAt}
                  effectiveSlotLabel={effectiveDuelSlotLabel}
                  startCountdownSeconds={duelStartCountdownSeconds}
                  matchNotice={duelMatchNotice}
                  needsManualRematch={duelNeedsManualRematch}
                  isCancelingMatch={isCancelingDuelMatch}
                  reservationLocked={duelReservationLocked}
                  canCreateMatch={canCreateDuelMatch}
                  blockingMatchHelperText={blockingMatchHelperText}
                  expiryCountdownLabel={duelExpiryCountdownLabel}
                  opponent={effectiveDuelOpponent}
                  waitingTitle={duelWaitingTitle}
                  waitingMeta={duelWaitingMeta}
                  waitingHint={duelWaitingHint}
                  opponentStatusLabel={effectiveDuelOpponentStatusLabel}
                  liveGapKm={duelLiveGapKm}
                  onDistanceTextChange={setDuelDistanceText}
                  onShowCustomDistanceInputChange={setShowDuelCustomDistanceInput}
                  onSelectDate={(dateKey) => {
                    setSelectedDuelDateKey(dateKey);
                    selectNextDuelSlotForDate(dateKey);
                  }}
                  onSelectTimeSection={selectDuelTimeSection}
                  onSelectSlot={setSelectedDuelSlotStartAt}
                  onCancelMatch={() => { void handleCancelDuelMatch(); }}
                  onRequestMatch={() => { void handleRequestDuelMatch(); }}
                  onRequestTestMatch={() => { void handleRequestDuelMatch(activeDuelSlotStartAt, { testMode: true }); }}
                  onRequestRematch={() => { void handleRequestDuelMatch(activeDuelSlotStartAt); }}
                />
              ) : null}
              {matchMode === 'group' ? (
                <GroupMatchSetupCard
                  distanceKm={groupDistanceKm}
                  distanceText={groupDistanceText}
                  showCustomDistanceInput={showGroupCustomDistanceInput}
                  dateOptions={groupDateOptions}
                  selectedDateKey={selectedGroupDateKey}
                  selectedTimeSection={selectedGroupTimeSection}
                  slotOptions={visibleGroupSlotOptions}
                  selectedSlotStartAt={selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt}
                  isRequesting={isRequestingGroupMatch}
                  matchState={groupMatchState}
                  matchStatus={groupMatchStatus}
                  activeSlotStartAt={activeGroupSlotStartAt}
                  effectiveSlotLabel={effectiveGroupSlotLabel}
                  startCountdownSeconds={groupStartCountdownSeconds}
                  matchNotice={groupMatchNotice}
                  needsManualRematch={groupNeedsManualRematch}
                  isCancelingMatch={isCancelingGroupMatch}
                  reservationLocked={groupReservationLocked}
                  canCreateMatch={canCreateGroupMatch}
                  blockingMatchHelperText={blockingMatchHelperText}
                  expiryCountdownLabel={groupExpiryCountdownLabel}
                  isTestFlow={isGroupTestFlow}
                  isLoadingDemandSummary={isLoadingGroupDemandSummary}
                  demandSummary={groupDemandSummary}
                  effectiveParticipantCount={effectiveGroupParticipantCount}
                  effectiveSeedRank={effectiveGroupSeedRank ?? null}
                  participants={effectiveGroupParticipants}
                  onDistanceTextChange={setGroupDistanceText}
                  onShowCustomDistanceInputChange={setShowGroupCustomDistanceInput}
                  onSelectDate={(dateKey) => {
                    setSelectedGroupDateKey(dateKey);
                    selectNextGroupSlotForDate(dateKey);
                  }}
                  onSelectTimeSection={selectGroupTimeSection}
                  onSelectSlot={setSelectedGroupSlotStartAt}
                  onCancelMatch={() => { void handleCancelGroupMatch(); }}
                  onRequestMatch={() => { void handleRequestGroupMatch(); }}
                  onRequestTestMatch={() => { void handleRequestGroupMatch(activeGroupSlotStartAt, { testMode: true }); }}
                  onRequestRematch={() => { void handleRequestGroupMatch(activeGroupSlotStartAt); }}
                />
              ) : null}
            </View>
            {readyActionLabel ? (
              <PrimaryButton
                label={matchMode === 'room' && isCreatingMatchRoom ? '방 만드는 중...' : readyActionLabel}
                onPress={() => {
                  if (matchMode === 'room') {
                    if (matchRoom) {
                      router.push('/match-room' as Href);
                      return;
                    }
                    void handleCreateMatchRoom();
                    return;
                  }
                  void handleStartTracking();
                }}
                disabled={matchMode === 'room' ? isCreatingMatchRoom : false}
              />
            ) : null}
          </Card>

        </>
      ) : (
        <>
          {showLiveArena ? (
            <LiveMatchPages
              scrollRef={livePagerRef}
              page={liveArenaPage}
              pageWidth={liveArenaPageWidth}
              hasResultPage={hasMatchResultPage}
              arenaProps={liveArenaPageProps}
              raceBoardProps={liveRaceBoardPageProps}
              trackingProps={{ ...liveTrackingPageBaseProps, includeMatchCards: false }}
              resultProps={liveResultPageProps}
              exitAction={liveArenaExitAction}
              onPageChange={setLiveArenaPage}
            />
          ) : (
            <LiveMatchTrackingPage {...liveTrackingPageBaseProps} includeMatchCards />
          )}

          {isSaving ? <ActivityIndicator size="small" color="#6D5EF7" /> : null}

          {isRunning && matchMode === 'solo' ? (
            <View style={styles.actionColumn}>
              <PrimaryButton
                label="러닝 종료하고 저장"
                onPress={() => { void handleSaveTracking(); }}
              />
              <SecondaryButton label="일시정지" onPress={handlePauseTracking} />
            </View>
          ) : null}

          {isPaused ? (
            <>
              <View style={styles.actionColumn}>
                <PrimaryButton label="이 기록 저장하기" onPress={() => { void handleSaveTracking(); }} />
                <SecondaryButton label="측정 다시 시작" onPress={handleResumeTracking} />
                <Pressable style={styles.discardButton} onPress={handleDiscardTracking}>
                  <Text style={styles.discardButtonText}>이 기록 버리기</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </>
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
