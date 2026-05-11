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
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { type Href, router } from 'expo-router';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { LiveMatchArena } from '@/components/matches/LiveMatchArena';
import { LiveMatchRaceBoard } from '@/components/matches/LiveMatchRaceBoard';
import { MatchStartCountdownOverlay } from '@/components/matches/MatchStartCountdownOverlay';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { RunMatchResult, RunRoutePoint } from '@/domain/types';
import { MatchOptionSelector } from '@/features/runs/components/MatchOptionSelector';
import { MatchResultPanel } from '@/features/runs/components/MatchResultPanel';
import { PartyRunInviteCard } from '@/features/runs/components/PartyRunInviteCard';
import { RunningMetricGrid } from '@/features/runs/components/RunningMetricGrid';
import { UpcomingMatchList } from '@/features/runs/components/UpcomingMatchList';
import {
  useRunTracking,
  type SaveTrackingOptions,
  type TrackerStatus,
} from '@/features/runs/hooks/useRunTracking';
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
  createTrackedRun,
  fetchFriendLeaderboard,
  fetchMatchDemandSummary,
  fetchNotificationSettings,
  fetchRunningMatchRoom,
  fetchUpcomingRunningMatches,
  fetchRunningMatchStatus,
  joinRunningMatchRoom,
  leaveRunningMatch,
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
  shouldShowMatchCardCountdown,
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
  buildRunDateFromTimestamp,
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
  formatCadence,
  formatElevation,
  formatMetricDistance,
} from '@/features/runs/trackingSession';
import {
  RECOMMENDED_MATCH_DISTANCES,
  buildMatchSlotDateLabel,
  findNearestRecommendedDistance,
  formatMatchDateKey,
  formatMatchExpiryCountdown,
  formatMatchTargetDistance,
  getEstimatedMatchBonusPoints,
  isRecommendedMatchDistance,
  isUnsavableShortRunError,
  resolveMatchTimeSection,
} from '@/features/runs/matchScheduling';
import {
  buildAverageArenaPaceLabel,
  buildDistanceGapLabel,
  buildEstimatedCompetitiveDistanceKm,
  buildParticipantAveragePaceLabel,
  formatArenaPaceChip,
  hasRemoteRunnerProgress,
  isMeasuredPaceLabel,
  normalizeMatchProgressPace,
  resolveParticipantDisplayDistanceKm,
} from '@/features/runs/matchProgress';
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
type MatchParticipantLiveStatus = DuelMatchOpponent['liveStatus'];

function buildMatchParticipantStatusLabel(status?: MatchParticipantLiveStatus) {
  switch (status) {
    case 'running':
      return '러닝 중';
    case 'background':
      return '백그라운드';
    case 'paused':
      return '일시정지';
    case 'disconnected':
      return '연결 끊김';
    case 'forfeited':
      return '포기함';
    case 'finished':
      return '완료';
    case 'ready':
    default:
      return '준비됨';
  }
}

function buildMatchTransitionNotice(
  mode: 'duel' | 'group',
  previousState: RunningMatchStatusResponse['state'],
  nextState: RunningMatchStatusResponse['state'],
) {
  if (previousState === nextState) {
    return null;
  }

  if (previousState === 'waiting' && nextState === 'idle') {
    return '대기 시간이 지나 자동으로 정리됐어요. 다시 찾으면 새 대기열로 들어가요.';
  }

  if ((previousState === 'matched' || previousState === 'active') && nextState === 'waiting') {
    return mode === 'duel'
      ? '상대가 빠져서 다시 비슷한 상대를 찾는 중이에요.'
      : '일부 참가자가 빠져서 다시 비슷한 그룹을 모으는 중이에요.';
  }

  if ((previousState === 'matched' || previousState === 'active') && nextState === 'idle') {
    return '매칭이 정리됐어요. 다시 찾으면 새 대기열로 들어가요.';
  }

  return null;
}

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
    () => visibleUpcomingMatches.some((match) => ['matched', 'active'].includes(match.status)),
    [visibleUpcomingMatches],
  );
  const hasBlockingDuelMatch = ['waiting', 'matched', 'active'].includes(duelMatchState);
  const hasBlockingGroupMatch = ['waiting', 'matched', 'active'].includes(groupMatchState);
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
    && matchRoom.state === 'arming'
    && !shouldShowMatchStartOverlay(roomCountdownRemainingSeconds)
    && (matchMode === 'duel' || matchMode === 'group'),
  );
  const canOpenRoomArena = Boolean(
    visibleMatchRoom?.linkedMatchSlotStartAt
    && (
      visibleMatchRoom.linkedMatchStatus === 'active'
      || shouldAutoOpenMatchArena(roomCountdownRemainingSeconds)
    ),
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
    () => (effectiveDuelOpponent
      ? [
          {
            id: 'me',
            name: '나',
            paceLabel: currentUserArenaPace,
            distanceKm: syncedDuelDistanceKm,
            isCurrentUser: true,
            isLeader: duelLiveGapKm !== null ? duelLiveGapKm >= 0 : false,
            liveStatus: currentUserDuelLiveStatus ?? undefined,
            showPaceBubble: Boolean(currentUserArenaPace),
          },
          {
            id: effectiveDuelOpponent.id,
            name: effectiveDuelOpponent.name,
            paceLabel: isDuelOpponentForfeited ? '기권' : effectiveDuelOpponentArenaPace,
            distanceKm: syncedDuelOpponentDistanceKm,
            isLeader: duelLiveGapKm !== null ? duelLiveGapKm < 0 : true,
            liveStatus: effectiveDuelOpponent.liveStatus,
            showPaceBubble: isDuelOpponentForfeited || Boolean(effectiveDuelOpponentArenaPace),
          },
        ]
      : []),
    [
      currentUserArenaPace,
      currentUserDuelLiveStatus,
      duelLiveGapKm,
      effectiveDuelOpponent,
      effectiveDuelOpponentArenaPace,
      isDuelOpponentForfeited,
      syncedDuelDistanceKm,
      syncedDuelOpponentDistanceKm,
    ],
  );
  const roomLinkedDuelPlaceholderParticipants = useMemo(() => {
    if (!hasRoomLinkedDuelContext || !visibleMatchRoom) {
      return [];
    }

    const placeholderDistanceKm = visibleMatchRoom.linkedMatchDistanceKm ?? visibleMatchRoom.distanceKm;
    const participants = visibleMatchRoom.participants.slice(0, 2).map((participant) => {
      const isCurrentUser = participant.userId === currentUserId || participant.tag === currentUserId;
      const duelStatusParticipant = !isCurrentUser
        && effectiveDuelOpponent
        && (
          effectiveDuelOpponent.id === participant.userId
          || effectiveDuelOpponent.tag === participant.tag
          || effectiveDuelOpponent.tag === participant.userId
        )
        ? effectiveDuelOpponent
        : null;
      const participantLiveStatus = duelStatusParticipant?.liveStatus ?? participant.liveStatus;
      const participantOfficialDistanceKm = duelStatusParticipant?.officialReady && typeof duelStatusParticipant.officialDistanceKm === 'number'
        ? duelStatusParticipant.officialDistanceKm
        : participant.officialReady && typeof participant.officialDistanceKm === 'number'
          ? participant.officialDistanceKm
          : null;
      const participantLiveDistanceKm = resolveParticipantDisplayDistanceKm(duelStatusParticipant ?? participant, placeholderDistanceKm);
      const participantDistanceKm = isCurrentUser && roomLinkedMatchContext?.state === 'active'
        ? distanceKm
        : participantOfficialDistanceKm ?? participantLiveDistanceKm ?? 0;
      const mergedParticipant = duelStatusParticipant
        ? {
            ...participant,
            liveDistanceKm: duelStatusParticipant.liveDistanceKm ?? participant.liveDistanceKm,
            liveElapsedSeconds: duelStatusParticipant.liveElapsedSeconds ?? participant.liveElapsedSeconds,
            livePace: duelStatusParticipant.livePace ?? participant.livePace,
            liveUpdatedAt: duelStatusParticipant.liveUpdatedAt ?? participant.liveUpdatedAt,
            officialAveragePace: duelStatusParticipant.officialAveragePace ?? participant.officialAveragePace,
          }
        : participant;
      const participantPaceLabel = isCurrentUser
        ? currentUserArenaPace
        : buildParticipantAveragePaceLabel(mergedParticipant, roomLinkedMatchContext?.state === 'active');

      return {
        id: participant.userId,
        name: isCurrentUser ? '나' : participant.name,
        paceLabel: participantLiveStatus === 'forfeited' ? '기권' : participantPaceLabel,
        distanceKm: participantDistanceKm,
        isCurrentUser,
        isLeader: false,
        liveStatus: participantLiveStatus,
        showPaceBubble: participantLiveStatus === 'forfeited' || Boolean(participantPaceLabel),
      };
    });

    const leaderDistanceKm = Math.max(...participants.map((participant) => participant.distanceKm));
    return participants.map((participant) => ({
      ...participant,
      isLeader: participant.distanceKm >= leaderDistanceKm && leaderDistanceKm > 0,
    }));
  }, [
    currentUserArenaPace,
    currentUserId,
    distanceKm,
    effectiveDuelOpponent,
    hasRoomLinkedDuelContext,
    roomLinkedMatchContext?.state,
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
    () =>
      groupLiveStandings.map((participant) => ({
        id: participant.id,
        name: participant.isCurrentUser ? '나' : participant.name,
        paceLabel: participant.isCurrentUser
          ? currentUserArenaPace
          : buildParticipantAveragePaceLabel(participant, groupArenaUsesLivePace),
        distanceKm: participant.currentDistanceKm,
        rankLabel: String(participant.rank),
        isCurrentUser: participant.isCurrentUser,
        isLeader: participant.rank === 1,
        liveStatus: participant.liveStatus,
        showPaceBubble: participant.isCurrentUser
          ? Boolean(currentUserArenaPace)
          : Boolean(buildParticipantAveragePaceLabel(participant, groupArenaUsesLivePace)),
        emphasis: featuredGroupArenaParticipantIds.has(participant.id) ? ('featured' as const) : ('compact' as const),
      })),
    [currentUserArenaPace, featuredGroupArenaParticipantIds, groupArenaUsesLivePace, groupLiveStandings],
  );
  const roomLinkedGroupPlaceholderParticipants = useMemo(() => {
    if (!hasRoomLinkedGroupContext || !visibleMatchRoom) {
      return [];
    }

    return visibleMatchRoom.participants.map((participant, index) => {
      const isCurrentUser = participant.userId === currentUserId || participant.tag === currentUserId;
      const groupStatusParticipant = effectiveGroupParticipants.find((statusParticipant) => (
        statusParticipant.id === participant.userId
        || statusParticipant.tag === participant.tag
        || statusParticipant.tag === participant.userId
      )) ?? null;
      const participantLiveStatus = groupStatusParticipant?.liveStatus ?? participant.liveStatus;
      const participantOfficialDistanceKm = groupStatusParticipant?.officialReady && typeof groupStatusParticipant.officialDistanceKm === 'number'
        ? groupStatusParticipant.officialDistanceKm
        : participant.officialReady && typeof participant.officialDistanceKm === 'number'
          ? participant.officialDistanceKm
          : null;
      const placeholderDistanceKm = visibleMatchRoom.linkedMatchDistanceKm ?? visibleMatchRoom.distanceKm;
      const participantLiveDistanceKm = resolveParticipantDisplayDistanceKm(groupStatusParticipant ?? participant, placeholderDistanceKm);
      const participantDistanceKm = isCurrentUser && roomLinkedMatchContext?.state === 'active'
        ? distanceKm
        : participantOfficialDistanceKm ?? participantLiveDistanceKm ?? 0;
      const mergedParticipant = groupStatusParticipant
        ? {
            ...participant,
            liveDistanceKm: groupStatusParticipant.liveDistanceKm ?? participant.liveDistanceKm,
            liveElapsedSeconds: groupStatusParticipant.liveElapsedSeconds ?? participant.liveElapsedSeconds,
            livePace: groupStatusParticipant.livePace ?? participant.livePace,
            liveUpdatedAt: groupStatusParticipant.liveUpdatedAt ?? participant.liveUpdatedAt,
            officialAveragePace: groupStatusParticipant.officialAveragePace ?? participant.officialAveragePace,
          }
        : participant;
      const participantPaceLabel = isCurrentUser
        ? currentUserArenaPace
        : buildParticipantAveragePaceLabel(mergedParticipant, roomLinkedMatchContext?.state === 'active');

      return {
        id: participant.userId,
        name: isCurrentUser ? '나' : participant.name,
        paceLabel: participantLiveStatus === 'forfeited' ? '기권' : participantPaceLabel,
        distanceKm: participantDistanceKm,
        rankLabel: String(index + 1),
        isCurrentUser,
        isLeader: index === 0,
        liveStatus: participantLiveStatus,
        showPaceBubble: participantLiveStatus === 'forfeited' || Boolean(participantPaceLabel),
        emphasis: 'featured' as const,
      };
    });
  }, [
    currentUserArenaPace,
    currentUserId,
    distanceKm,
    effectiveGroupParticipants,
    hasRoomLinkedGroupContext,
    roomLinkedMatchContext?.state,
    visibleMatchRoom,
  ]);
  const duelShouldOpenCountdownArena = duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds);
  const groupShouldOpenCountdownArena = groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds);
  const roomShouldOpenCountdownArena = Boolean(
    visibleMatchRoom?.linkedMatchId
    && (
      visibleMatchRoom.linkedMatchStatus === 'active'
      || shouldAutoOpenMatchArena(roomCountdownRemainingSeconds)
      || forceOpenActiveMatch
    ),
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
      && ['matched', 'active'].includes(duelMatchState)
      && duelArenaParticipants.length === 2
      && (duelMatchState === 'active' || duelShouldOpenCountdownArena || duelShouldHoldArenaDuringActivation))
    || (matchMode === 'duel'
      && hasRoomLinkedDuelContext
      && roomLinkedDuelPlaceholderParticipants.length === 2
      && roomShouldOpenCountdownArena)
    || (matchMode === 'group'
      && ['matched', 'active'].includes(groupMatchState)
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
          (duelMatchStatus?.matchId && ['matched', 'active'].includes(duelMatchState))
          || roomLinkedMatchContext?.mode === 'duel'
            ? 'duel'
            : null
        )
      : isRunning && matchMode === 'group'
        ? (
            (groupMatchStatus?.matchId && ['matched', 'active'].includes(groupMatchState))
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

    const shouldPreferArena = matchRoom.linkedMatchStatus === 'active'
      || shouldAutoOpenMatchArena(roomCountdownRemainingSeconds);

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

    const intervalMs = roomLinkedMatchContext.state === 'active'
      || shouldShowMatchStartOverlay(roomCountdownRemainingSeconds)
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
    roomCountdownRemainingSeconds,
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

    if (
      duelMatchState !== 'active'
      && groupMatchState !== 'active'
      && !duelShouldOpenCountdownArena
      && !groupShouldOpenCountdownArena
      && !roomShouldOpenCountdownArena
      && !(forceOpenActiveMatch && (duelMatchState === 'matched' || groupMatchState === 'matched'))
      && !shouldKeepRunningMatchArena
    ) {
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
    if (duelMatchState === 'active' || groupMatchState === 'active') {
      setForceOpenActiveMatch(true);
      setLiveArenaPage(0);
      livePagerRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [duelMatchState, groupMatchState]);

  useEffect(() => {
    if (!duelShouldOpenCountdownArena && !groupShouldOpenCountdownArena) {
      return;
    }

    setForceOpenActiveMatch(true);
    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [duelShouldOpenCountdownArena, groupShouldOpenCountdownArena]);

  useEffect(() => {
    if (!hasMatchResultPage) {
      return;
    }

    setLiveArenaPage(3);
    livePagerRef.current?.scrollTo({ x: liveArenaPageWidth * 3, animated: true });
  }, [hasMatchResultPage, liveArenaPageWidth]);

  useEffect(() => {
    if (!isIdle || !nextStartingMatch || !shouldAutoOpenMatchArena(nextStartingMatch.remainingSeconds)) {
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
    && Boolean(visibleCountdownEntry)
    && shouldShowMatchStartOverlay(visibleCountdownEntry?.remainingSeconds ?? null)
    && !shouldAutoOpenMatchArena(visibleCountdownEntry?.remainingSeconds ?? null);
  const shouldShowCenteredMatchCountdown =
    Boolean(visibleCountdownEntry)
    && shouldAutoOpenMatchArena(visibleCountdownEntry?.remainingSeconds ?? null)
    && (showLiveArena || Boolean(roomCountdownEntry));

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
      && shouldAutoOpenMatchArena(roomCountdownRemainingSeconds)
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
    roomCountdownRemainingSeconds,
    roomLinkedMatchContext,
    status,
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
    if (matchMode !== 'duel' || !duelMatchStatus || !['waiting', 'matched', 'active'].includes(duelMatchStatus.state)) {
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
    if (matchMode !== 'group' || !groupMatchStatus || !['waiting', 'matched', 'active'].includes(groupMatchStatus.state)) {
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

    if (matchMode === 'duel' && !['matched', 'active'].includes(duelMatchState) && roomLinkedStartContext?.mode !== 'duel') {
      setError('1대1 매칭이 잡힌 뒤에만 시작할 수 있어요.');
      return;
    }

    if (matchMode === 'group' && !['matched', 'active'].includes(groupMatchState) && roomLinkedStartContext?.mode !== 'group') {
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

  const leaveMatchAndContinueSolo = async (
    source: 'duel' | 'group',
    options?: {
      duelNotice?: string;
      groupNotice?: string;
      errorMessage?: string;
    },
  ) => {
    setError(null);
    const roomLinkedMatchId = roomLinkedMatchContext?.mode === source
      ? roomLinkedMatchContext.matchId
      : null;
    const matchId = source === 'duel'
      ? duelMatchStatus?.matchId ?? roomLinkedMatchId
      : groupMatchStatus?.matchId ?? roomLinkedMatchId;

    if (source === 'duel') {
      setIsLeavingDuelMatch(true);
    } else {
      setIsLeavingGroupMatch(true);
    }

    try {
      if (matchId) {
        await leaveRunningMatch({ matchId });
      }

      matchProgressHeartbeatRef.current = 0;

      if (source === 'duel') {
        setDuelMatchResult(null);
        setDuelMatchStatus(null);
        setDuelMatchNotice(options?.duelNotice ?? '매치에서는 빠졌고, 지금 러닝은 혼자 계속 이어가요.');
      } else {
        setGroupMatchResult(null);
        setGroupMatchStatus(null);
        setGroupMatchNotice(options?.groupNotice ?? '그룹전에서는 빠졌고, 지금 러닝은 혼자 계속 이어가요.');
      }

      await loadUpcomingMatches().catch(() => {});
      setMatchMode('solo');
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : options?.errorMessage ?? '혼자 계속 달리기 전환에 실패했어.');
    } finally {
      if (source === 'duel') {
        setIsLeavingDuelMatch(false);
      } else {
        setIsLeavingGroupMatch(false);
      }
    }
  };

  const handleContinueSoloFromMatch = (source: 'duel' | 'group') => {
    Alert.alert('혼자 계속 달릴까요?', '지금 매치 표시는 정리하고, 러닝 측정은 그대로 이어갈게요.', [
      { text: '계속 볼게요', style: 'cancel' },
      {
        text: '혼자 계속',
        style: 'destructive',
        onPress: () => {
          void leaveMatchAndContinueSolo(source);
        },
      },
    ]);
  };

  const forfeitMatchAndKeepRunning = async (source: 'duel' | 'group') => {
    setError(null);
    const previousDuelStatus = duelMatchStatus;
    const previousGroupStatus = groupMatchStatus;
    const previousDuelNotice = duelMatchNotice;
    const previousGroupNotice = groupMatchNotice;
    const roomLinkedMatchId = roomLinkedMatchContext?.mode === source
      ? roomLinkedMatchContext.matchId
      : null;
    const matchId = source === 'duel'
      ? duelMatchStatus?.matchId ?? roomLinkedMatchId
      : groupMatchStatus?.matchId ?? roomLinkedMatchId;

    if (!matchId) {
      setError('기권 처리할 대결을 찾지 못했어.');
      return;
    }

    if (pendingForfeitMatchRef.current === matchId) {
      return;
    }

    if (source === 'duel') {
      setIsLeavingDuelMatch(true);
    } else {
      setIsLeavingGroupMatch(true);
    }

    try {
      pendingForfeitMatchRef.current = matchId;

      if (source === 'duel') {
        setDuelMatchStatus((currentStatus) => (
          currentStatus?.matchId === matchId
            ? { ...currentStatus, currentUserLiveStatus: 'forfeited' }
            : currentStatus
        ));
        setDuelMatchNotice('기권 처리됐어요. 기록을 저장하고 대결 화면에서 나갈게요.');
        await leaveRunningMatch({ matchId });
        matchProgressHeartbeatRef.current = Date.now();
      } else {
        setGroupMatchStatus((currentStatus) => (
          currentStatus?.matchId === matchId
            ? {
              ...currentStatus,
              currentUserLiveStatus: 'forfeited',
              participants: currentStatus.participants?.map((participant) => (
                participant.seedRank === (currentStatus.mySeedRank ?? 1)
                  ? { ...participant, liveStatus: 'forfeited' as const }
                  : participant
              )),
            }
            : currentStatus
        ));
        setGroupMatchNotice('기권 처리됐어요. 기록을 저장하고 대결 화면에서 나갈게요.');
        await leaveRunningMatch({ matchId });
        matchProgressHeartbeatRef.current = Date.now();
      }

      clearLocalForfeitedMatchState(source, matchId);
      void loadUpcomingMatches().catch(() => {});
      await handleSaveTracking({ exitIfUnsavable: true, resetAfterSave: true });
    } catch (matchError) {
      if (source === 'duel') {
        setDuelMatchStatus(previousDuelStatus);
        setDuelMatchNotice(previousDuelNotice);
      } else {
        setGroupMatchStatus(previousGroupStatus);
        setGroupMatchNotice(previousGroupNotice);
      }
      setError(matchError instanceof Error ? matchError.message : '기권 처리에 실패했어.');
    } finally {
      if (pendingForfeitMatchRef.current === matchId) {
        pendingForfeitMatchRef.current = null;
      }
      if (source === 'duel') {
        setIsLeavingDuelMatch(false);
      } else {
        setIsLeavingGroupMatch(false);
      }
    }
  };

  const handleForfeitMatch = (source: 'duel' | 'group') => {
    void forfeitMatchAndKeepRunning(source);
  };

  const handlePauseTracking = async () => {
    await pauseBackgroundRunTracking();
    stopForegroundTrackingHelpers();
    syncFromBackgroundTracking();

    const roomActiveMatchId =
      roomLinkedMatchContext?.state === 'active'
      && roomLinkedMatchContext.mode === matchMode
        ? roomLinkedMatchContext.matchId
        : null;
    const activeMatchId = matchMode === 'duel'
      ? duelMatchStatus?.matchId ?? roomActiveMatchId
      : matchMode === 'group'
        ? groupMatchStatus?.matchId ?? roomActiveMatchId
        : roomActiveMatchId;

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

      const roomActiveMatchId =
        roomLinkedMatchContext?.state === 'active'
        && roomLinkedMatchContext.mode === matchMode
          ? roomLinkedMatchContext.matchId
          : null;
      const activeMatchId = matchMode === 'duel'
        ? duelMatchStatus?.matchId ?? roomActiveMatchId
        : matchMode === 'group'
          ? groupMatchStatus?.matchId ?? roomActiveMatchId
          : roomActiveMatchId;

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

  const discardCurrentTracking = async () => {
    await resetBackgroundRunTracking();
    await syncLiveSharing({
      enabled: false,
      status: 'idle',
    }).catch(() => {});
    preStartWarmupMatchIdRef.current = null;
    officialStartBaselineRef.current = null;
    autoStartedMatchIdRef.current = null;
    focusedDuelMatchIdRef.current = null;
    focusedGroupMatchIdRef.current = null;
    setForceOpenActiveMatch(false);
    resetForegroundTrackingState();
    setStatus('idle');
    setError(null);

    if (discardRedirectHref) {
      router.replace(discardRedirectHref);
    }
  };

  const handleDiscardTracking = () => {
    Alert.alert('기록 버리기', '지금까지 측정한 경로와 기록을 지울까요?', [
      { text: '계속 측정할게요', style: 'cancel' },
      {
        text: '버릴게요',
        style: 'destructive',
        onPress: () => {
          void discardCurrentTracking();
        },
      },
    ]);
  };

  const handleSaveTracking = async (options: SaveTrackingOptions = {}) => {
    try {
      setError(null);

      if (status === 'running') {
        await pauseBackgroundRunTracking();
        stopForegroundTrackingHelpers();
      }

      const trackingSnapshot = getBackgroundRunTrackingSnapshot();
      const displayedSnapshot = getDisplayedTrackingSnapshot(trackingSnapshot);
      syncFromBackgroundTracking(trackingSnapshot);
      const finalElapsedSeconds = displayedSnapshot.elapsedSeconds;
      syncElapsedSeconds(finalElapsedSeconds);

      const startedAt = displayedSnapshot.startedAt ?? new Date().toISOString();
      const endedAt = displayedSnapshot.route.length
        ? displayedSnapshot.route[displayedSnapshot.route.length - 1].timestamp
        : new Date().toISOString();
      const finalDistanceKm = displayedSnapshot.distanceKm;
      const finalElevationGainM = displayedSnapshot.elevationGainM;
      const finalCadenceSpm = calculateCadenceSpm(totalStepsRef.current, finalElapsedSeconds);
      const averagePaceLabel = buildAveragePace(finalDistanceKm, finalElapsedSeconds);

      if (displayedSnapshot.route.length < 2 || finalDistanceKm < 0.1) {
        throw new Error('저장하려면 실제로 이동한 러닝 경로가 조금 더 필요해.');
      }

      if (averagePaceLabel === '--:--/km') {
        throw new Error('페이스 계산이 아직 부족해서 저장할 수 없어. 조금 더 측정한 뒤 다시 시도해줘.');
      }

      const roomActiveMatchId =
        roomLinkedMatchContext?.state === 'active'
        && roomLinkedMatchContext.mode === matchMode
          ? roomLinkedMatchContext.matchId
          : null;
      const activeMatchId = matchMode === 'duel'
        ? duelMatchStatus?.matchId ?? roomActiveMatchId
        : matchMode === 'group'
          ? groupMatchStatus?.matchId ?? roomActiveMatchId
          : roomActiveMatchId;

      if (activeMatchId) {
        try {
          const progress = buildDisplayedMatchProgress(trackingSnapshot);
          await pushRunningMatchProgress({
            matchId: activeMatchId,
            distanceKm: progress.distanceKm,
            elapsedSeconds: progress.elapsedSeconds,
            currentPace: progress.currentPace,
            status: 'finished',
          });
        } catch {
          setError('러닝 결과는 계산됐지만 경쟁 상태를 마지막으로 반영하지 못했어요.');
        }
      }

      setStatus('saving');
      const savedRun = await createTrackedRun({
        date: buildRunDateFromTimestamp(startedAt),
        distanceKm: finalDistanceKm,
        pace: averagePaceLabel,
        durationSeconds: finalElapsedSeconds,
        cadenceSpm: finalCadenceSpm,
        elevationGainM: finalElevationGainM,
        route: displayedSnapshot.route,
        startedAt,
        endedAt,
        ...(trackedMatchResult ? { matchResult: trackedMatchResult } : {}),
      });

      await syncLiveSharing({
        enabled: false,
        status: 'idle',
      }).catch(() => {});
      preStartWarmupMatchIdRef.current = null;
      officialStartBaselineRef.current = null;
      autoStartedMatchIdRef.current = null;

      if (options.resetAfterSave) {
        await resetBackgroundRunTracking();
        resetForegroundTrackingState();
        setStatus('idle');
      }

      router.replace({
        pathname: '/run-detail',
        params: {
          runId: savedRun.run.id,
          origin: isTabMode ? 'running' : 'activity',
        },
      });
      return true;
    } catch (saveError) {
      if (options.exitIfUnsavable && isUnsavableShortRunError(saveError)) {
        await discardCurrentTracking();
        return false;
      }

      setStatus('paused');
      setError(saveError instanceof Error ? saveError.message : '러닝 기록 저장에 실패했어.');
      return false;
    }
  };

  const handleShowResultAfterCounterpartForfeit = async (source: 'duel' | 'group') => {
    if (pendingCounterpartForfeitResultRef.current || isSaving || status !== 'running') {
      return;
    }

    pendingCounterpartForfeitResultRef.current = true;
    if (source === 'duel') {
      setIsLeavingDuelMatch(true);
    } else {
      setIsLeavingGroupMatch(true);
    }

    try {
      await handleSaveTracking({ exitIfUnsavable: true });
    } finally {
      pendingCounterpartForfeitResultRef.current = false;
      if (source === 'duel') {
        setIsLeavingDuelMatch(false);
      } else {
        setIsLeavingGroupMatch(false);
      }
    }
  };

  const renderLiveArenaExitAction = () => {
    if (!activeMatchExitSource) {
      return null;
    }

    if (activeMatchExitIsTest) {
      return (
        <Card style={styles.testExitCard}>
          <Text style={styles.testExitTitle}>테스트 대결을 여기서 끝낼 수 있어요</Text>
          <Text style={styles.testExitText}>
            테스트 상대 표시는 정리하고, 지금 러닝 기록은 혼자 계속 이어갈게요.
          </Text>
          <SecondaryButton
            label={activeMatchExitIsLeaving ? '정리 중...' : '테스트 대결 그만'}
            onPress={() => {
              handleContinueSoloFromMatch(activeMatchExitSource);
            }}
            disabled={activeMatchExitIsLeaving}
          />
        </Card>
      );
    }

    if (activeMatchExitCounterpartForfeited) {
      const isPreparingCounterpartForfeitResult = activeMatchExitIsLeaving || isSaving || !isRunning;
      return (
        <Card style={styles.matchForfeitCard}>
          <Text style={styles.matchForfeitTitle}>상대가 기권했어요</Text>
          <Text style={styles.matchForfeitText}>
            내가 승리한 상태예요. 러닝을 종료하면 결과 화면에서 대결 결과를 확인할 수 있어요.
          </Text>
          <Pressable
            style={[styles.matchForfeitButton, isPreparingCounterpartForfeitResult ? styles.matchForfeitButtonDisabled : undefined]}
            onPress={() => {
              void handleShowResultAfterCounterpartForfeit(activeMatchExitSource);
            }}
            disabled={isPreparingCounterpartForfeitResult}
          >
            <Text style={styles.matchForfeitButtonText}>
              {activeMatchExitIsLeaving || isSaving ? '결과 저장 중...' : !isRunning ? '결과 화면 준비 중...' : '러닝 종료하고 결과보기'}
            </Text>
          </Pressable>
        </Card>
      );
    }

    return (
      <Card style={styles.matchForfeitCard}>
        <Text style={styles.matchForfeitTitle}>대결을 기권할 수 있어요</Text>
        <Text style={styles.matchForfeitText}>
          기권하면 내 동그라미가 기권 상태로 표시되고, 지금까지 측정한 기록을 저장한 뒤 나가요.
        </Text>
        <Pressable
          style={[styles.matchForfeitButton, activeMatchExitIsLeaving ? styles.matchForfeitButtonDisabled : undefined]}
          onPress={() => {
            handleForfeitMatch(activeMatchExitSource);
          }}
          disabled={activeMatchExitIsLeaving}
        >
          <Text style={styles.matchForfeitButtonText}>
            {activeMatchExitIsLeaving ? '기권 처리 중...' : '기권하기'}
          </Text>
        </Pressable>
      </Card>
    );
  };

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

  const renderLiveArenaPage = () => {
    if (matchMode === 'duel' && effectiveDuelOpponent) {
      return (
        <LiveMatchArena
          mode="duel"
          targetDistanceKm={duelDistanceKm}
          title={`${effectiveDuelOpponent.name}님과 1대1 대결`}
          subtitle={duelLiveSummary}
          summaryChips={[
            formatArenaPaceChip('내 페이스', currentUserArenaPace),
            isDuelOpponentForfeited
              ? '상대 기권'
              : formatArenaPaceChip('상대 페이스', effectiveDuelOpponentArenaPace),
            isDuelOpponentForfeited
              ? '내 기록은 계속 저장'
              : duelComparisonSnapshot
              ? `${officialDuelReady ? '서버' : '동기화'} ${formatDuration(duelComparisonSnapshot.checkpointSeconds)} 기준 ${buildDistanceGapLabel(duelLiveGapKm)}`
              : duelLiveGapKm !== null
                ? `실시간 수신 ${buildDistanceGapLabel(duelLiveGapKm)}`
                : buildDistanceGapLabel(null),
          ]}
          participants={duelArenaParticipants}
          footer={
            isDuelOpponentForfeited
              ? '상대가 기권했어요. 상대 동그라미는 기권 상태로 고정되고, 내 러닝 기록은 계속 저장돼요.'
              : duelLiveGapKm === null
              ? '서버가 양쪽 기록을 받은 뒤 같은 기준 시간의 공식 거리로 비교해요.'
              : `${duelComparisonSnapshot ? (officialDuelReady ? '서버 공식' : '동기화') : '실시간 수신'} ${duelComparisonSnapshot ? `${formatDuration(duelComparisonSnapshot.checkpointSeconds)} 기준 · ` : ''}내 ${syncedDuelDistanceKm.toFixed(2)}km · 상대 ${syncedDuelOpponentDistanceKm.toFixed(2)}km`
          }
        />
      );
    }

    if (matchMode === 'duel' && roomLinkedDuelPlaceholderParticipants.length === 2) {
      const placeholderOpponent = roomLinkedDuelOpponentParticipant;
      const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;
      return (
        <LiveMatchArena
          mode="duel"
          targetDistanceKm={placeholderDistanceKm}
          title={`${placeholderOpponent?.name ?? '상대'}님과 1대1 대결`}
          subtitle="대결 정보를 맞추는 중이에요."
          summaryChips={[
            formatArenaPaceChip('내 페이스', currentUserArenaPace),
            formatArenaPaceChip('상대 페이스', placeholderOpponent?.paceLabel ?? ''),
            typeof roomCountdownRemainingSeconds === 'number' && !duelArenaUsesLivePace
              ? `시작까지 ${formatMatchCountdown(roomCountdownRemainingSeconds)}`
              : hasRoomLinkedDuelLiveProgress
                ? `실시간 수신 ${buildDistanceGapLabel(roomLinkedDuelGapKm)}`
                : buildDistanceGapLabel(null),
          ]}
          participants={roomLinkedDuelPlaceholderParticipants}
          footer={
            hasRoomLinkedDuelLiveProgress && roomLinkedDuelCurrentParticipant && roomLinkedDuelOpponentParticipant
              ? `실시간 수신 · 내 ${roomLinkedDuelCurrentParticipant.distanceKm.toFixed(2)}km · 상대 ${roomLinkedDuelOpponentParticipant.distanceKm.toFixed(2)}km`
              : '상대와 같은 대결방에 연결됐어요. 카운트다운이 끝나면 거리 비교가 시작돼요.'
          }
        />
      );
    }

    if (matchMode === 'group' && currentGroupStanding) {
      return (
        <LiveMatchArena
          mode="group"
          targetDistanceKm={groupDistanceKm}
          title={`${effectiveGroupParticipantCount}명 그룹 대결`}
          subtitle={
            currentGroupStanding.rank === 1
              ? '지금은 선두예요. 흐름을 유지해보세요.'
              : `현재 ${currentGroupStanding.rank}/${effectiveGroupParticipantCount}위 · 앞 사람과 ${currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km 차이`
          }
          summaryChips={[
            formatArenaPaceChip('내 페이스', currentUserArenaPace),
            `현재 ${currentGroupStanding.rank}/${effectiveGroupParticipantCount}위`,
            currentGroupLeader ? `선두 ${currentGroupLeader.name} · ${currentGroupLeader.currentDistanceKm.toFixed(2)}km` : '선두 동기화 중',
          ]}
          participants={groupArenaParticipants}
          footer={
            groupAheadParticipant
              ? `앞 사람 ${groupAheadParticipant.name} · ${currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km 차이`
              : groupBehindParticipant
                ? `뒤 사람 ${groupBehindParticipant.name}보다 ${groupBehindParticipant.gapAheadKm?.toFixed(2) ?? '0.00'}km 앞서 있어요.`
                : '참가자 상태를 계속 정리하고 있어요.'
          }
        />
      );
    }

    if (matchMode === 'group' && roomLinkedGroupPlaceholderParticipants.length > 0) {
      const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? groupDistanceKm;
      return (
        <LiveMatchArena
          mode="group"
          targetDistanceKm={placeholderDistanceKm}
          title={`${roomLinkedGroupPlaceholderParticipants.length}명 그룹 대결`}
          subtitle="그룹 대결 정보를 맞추는 중이에요."
          summaryChips={[
            formatArenaPaceChip('내 페이스', currentUserArenaPace),
            `${roomLinkedGroupPlaceholderParticipants.length}명 연결됨`,
            typeof roomCountdownRemainingSeconds === 'number'
              ? `시작까지 ${formatMatchCountdown(roomCountdownRemainingSeconds)}`
              : '곧 시작',
          ]}
          participants={roomLinkedGroupPlaceholderParticipants}
          footer="참가자와 같은 대결방에 연결됐어요. 카운트다운이 끝나면 순위 비교가 시작돼요."
        />
      );
    }

    if (matchMode === 'duel' && shouldKeepRunningMatchArena) {
      const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;
      const opponentName = roomLinkedDuelOpponentParticipant?.name ?? effectiveDuelOpponent?.name ?? '상대';
      const opponentDistanceKm = roomLinkedDuelOpponentParticipant?.distanceKm
        ?? (effectiveDuelOpponent ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, placeholderDistanceKm) : 0);
      const opponentPaceLabel = roomLinkedDuelOpponentParticipant?.paceLabel
        ?? effectiveDuelOpponentArenaPace
        ?? '동기화 중';

      return (
        <LiveMatchArena
          mode="duel"
          targetDistanceKm={placeholderDistanceKm}
          title={`${opponentName}님과 1대1 대결`}
          subtitle="대결 화면을 유지하면서 기록 연결을 다시 맞추는 중이에요."
          summaryChips={[
            formatArenaPaceChip('내 페이스', currentUserArenaPace),
            formatArenaPaceChip('상대 페이스', opponentPaceLabel),
            '대결 화면 유지 중',
          ]}
          participants={[
            {
              id: 'duel-fallback-opponent',
              name: opponentName,
              paceLabel: opponentPaceLabel,
              distanceKm: opponentDistanceKm,
              isLeader: opponentDistanceKm > distanceKm,
              liveStatus: roomLinkedDuelOpponentParticipant?.liveStatus ?? effectiveDuelOpponent?.liveStatus,
              showPaceBubble: Boolean(opponentPaceLabel),
            },
            {
              id: 'duel-fallback-current',
              name: '나',
              paceLabel: currentUserArenaPace,
              distanceKm,
              isCurrentUser: true,
              isLeader: distanceKm >= opponentDistanceKm,
              liveStatus: currentUserDuelLiveStatus ?? undefined,
              showPaceBubble: Boolean(currentUserArenaPace),
            },
          ]}
          footer="서버 응답이 잠깐 흔들려도 측정 화면으로 빠지지 않고 대결 화면을 유지해요."
        />
      );
    }

    if (matchMode === 'group' && shouldKeepRunningMatchArena) {
      const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? groupDistanceKm;
      const fallbackGroupParticipants = roomLinkedGroupPlaceholderParticipants.length
        ? roomLinkedGroupPlaceholderParticipants
        : [
            {
              id: 'group-fallback-current',
              name: '나',
              paceLabel: currentUserArenaPace,
              distanceKm,
              rankLabel: '1',
              isCurrentUser: true,
              isLeader: true,
              liveStatus: currentUserGroupLiveStatus ?? undefined,
              showPaceBubble: Boolean(currentUserArenaPace),
              emphasis: 'featured' as const,
            },
          ];

      return (
        <LiveMatchArena
          mode="group"
          targetDistanceKm={placeholderDistanceKm}
          title="그룹 대결"
          subtitle="그룹 대결 화면을 유지하면서 참가자 기록을 다시 맞추는 중이에요."
          summaryChips={[
            formatArenaPaceChip('내 페이스', currentUserArenaPace),
            `${fallbackGroupParticipants.length}명 연결 확인 중`,
            '대결 화면 유지 중',
          ]}
          participants={fallbackGroupParticipants}
          footer="서버 응답이 잠깐 흔들려도 측정 화면으로 빠지지 않고 대결 화면을 유지해요."
        />
      );
    }

    return null;
  };

  const renderLiveRaceBoardPage = () => {
    if (matchMode === 'duel' && effectiveDuelOpponent) {
      const currentBoardDistanceKm = duelLiveGapKm === null ? distanceKm : syncedDuelDistanceKm;
      const opponentBoardDistanceKm = duelLiveGapKm === null
        ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, duelDistanceKm)
        : syncedDuelOpponentDistanceKm;
      const duelRows = [
        {
          id: 'current-user',
          name: '나',
          distanceKm: currentBoardDistanceKm,
          remainingKm: Math.max(0, duelDistanceKm - currentBoardDistanceKm),
          progress: duelDistanceKm > 0 ? currentBoardDistanceKm / duelDistanceKm : 0,
          isCurrentUser: true,
          liveStatus: currentUserDuelLiveStatus ?? undefined,
        },
        {
          id: effectiveDuelOpponent.id,
          name: effectiveDuelOpponent.name,
          distanceKm: opponentBoardDistanceKm,
          remainingKm: Math.max(0, duelDistanceKm - opponentBoardDistanceKm),
          progress: duelDistanceKm > 0 ? opponentBoardDistanceKm / duelDistanceKm : 0,
          isCurrentUser: false,
          liveStatus: effectiveDuelOpponent.liveStatus,
        },
      ]
        .sort((left, right) => {
          const leftForfeited = left.liveStatus === 'forfeited';
          const rightForfeited = right.liveStatus === 'forfeited';

          if (leftForfeited !== rightForfeited) {
            return leftForfeited ? 1 : -1;
          }

          if (right.distanceKm !== left.distanceKm) {
            return right.distanceKm - left.distanceKm;
          }

          return left.isCurrentUser ? -1 : 1;
        })
        .map((row, index) => ({
          ...row,
          rank: index + 1,
        }));

      return (
        <LiveMatchRaceBoard
          title="1대1 레이스 보드"
          subtitle="누가 더 앞서 있는지, 각각 얼마 남았는지 한눈에 볼 수 있어요."
          rows={duelRows}
        />
      );
    }

    if (matchMode === 'duel' && roomLinkedDuelPlaceholderParticipants.length === 2) {
      const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;
      const duelRows = roomLinkedDuelPlaceholderParticipants
        .map((participant) => ({
          id: participant.id,
          name: participant.name,
          distanceKm: participant.distanceKm,
          remainingKm: Math.max(0, placeholderDistanceKm - participant.distanceKm),
          progress: placeholderDistanceKm > 0 ? participant.distanceKm / placeholderDistanceKm : 0,
          isCurrentUser: participant.isCurrentUser,
          liveStatus: participant.liveStatus,
        }))
        .sort((left, right) => {
          const leftForfeited = left.liveStatus === 'forfeited';
          const rightForfeited = right.liveStatus === 'forfeited';

          if (leftForfeited !== rightForfeited) {
            return leftForfeited ? 1 : -1;
          }

          if (right.distanceKm !== left.distanceKm) {
            return right.distanceKm - left.distanceKm;
          }

          return left.isCurrentUser ? -1 : 1;
        })
        .map((row, index) => ({
          ...row,
          rank: index + 1,
        }));

      return (
        <LiveMatchRaceBoard
          title="1대1 레이스 보드"
          subtitle="대결 정보를 맞추는 중에도 내 측정 거리와 상대 대기 상태를 볼 수 있어요."
          rows={duelRows}
        />
      );
    }

    if (matchMode === 'group' && groupLiveStandings.length > 0) {
      return (
        <LiveMatchRaceBoard
          title="그룹 레이스 보드"
          subtitle="전체 순위 흐름과 각 러너의 남은 거리를 계속 확인할 수 있어요."
          rows={groupLiveStandings.map((participant) => ({
            id: participant.id,
            rank: participant.rank,
            name: participant.name,
            paceLabel: participant.isCurrentUser
              ? currentUserArenaPace
              : buildParticipantAveragePaceLabel(participant, groupArenaUsesLivePace),
            distanceKm: participant.currentDistanceKm,
            remainingKm: Math.max(0, groupDistanceKm - participant.currentDistanceKm),
            progress: groupDistanceKm > 0 ? participant.currentDistanceKm / groupDistanceKm : 0,
            isCurrentUser: participant.isCurrentUser,
            liveStatus: participant.liveStatus,
          }))}
        />
      );
    }

    if (matchMode === 'group' && roomLinkedGroupPlaceholderParticipants.length > 0) {
      const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? groupDistanceKm;
      return (
        <LiveMatchRaceBoard
          title="그룹 레이스 보드"
          subtitle="그룹 대결 정보를 맞추는 중에도 참가자 목록과 내 진행 거리를 볼 수 있어요."
          rows={roomLinkedGroupPlaceholderParticipants
            .map((participant) => ({
              id: participant.id,
              rank: 0,
              name: participant.name,
              distanceKm: participant.distanceKm,
              remainingKm: Math.max(0, placeholderDistanceKm - participant.distanceKm),
              progress: placeholderDistanceKm > 0 ? participant.distanceKm / placeholderDistanceKm : 0,
              isCurrentUser: participant.isCurrentUser,
              liveStatus: participant.liveStatus,
            }))
            .sort((left, right) => {
              const leftForfeited = left.liveStatus === 'forfeited';
              const rightForfeited = right.liveStatus === 'forfeited';

              if (leftForfeited !== rightForfeited) {
                return leftForfeited ? 1 : -1;
              }

              if (right.distanceKm !== left.distanceKm) {
                return right.distanceKm - left.distanceKm;
              }

              return left.isCurrentUser ? -1 : 1;
            })
            .map((row, index) => ({ ...row, rank: index + 1 }))}
        />
      );
    }

    if (matchMode === 'duel') {
      return (
        <LiveMatchRaceBoard
          title="1대1 레이스 보드"
          subtitle="대결 기록을 맞추는 중이에요. 내 기록은 계속 측정되고 있어요."
          rows={[
            {
              id: 'current-user-fallback',
              rank: 1,
              name: '나',
              distanceKm,
              remainingKm: Math.max(0, duelDistanceKm - distanceKm),
              progress: duelDistanceKm > 0 ? distanceKm / duelDistanceKm : 0,
              isCurrentUser: true,
              liveStatus: currentUserDuelLiveStatus ?? undefined,
            },
          ]}
        />
      );
    }

    if (matchMode === 'group') {
      return (
        <LiveMatchRaceBoard
          title="그룹 레이스 보드"
          subtitle="그룹 기록을 맞추는 중이에요. 내 기록은 계속 측정되고 있어요."
          rows={[
            {
              id: 'current-user-fallback',
              rank: 1,
              name: '나',
              distanceKm,
              remainingKm: Math.max(0, groupDistanceKm - distanceKm),
              progress: groupDistanceKm > 0 ? distanceKm / groupDistanceKm : 0,
              isCurrentUser: true,
              liveStatus: currentUserGroupLiveStatus ?? undefined,
            },
          ]}
        />
      );
    }

    return null;
  };

  const renderMatchResultPage = () => {
    return (
      <MatchResultPanel
        mode={matchMode === 'group' ? 'group' : 'duel'}
        estimatedBonusPoints={estimatedMatchBonusPoints}
        duelRows={duelResultRows}
        groupRows={groupResultRows}
        groupStatusLabel={groupResultStatusLabel}
      />
    );
  };

  const renderRunningStatsBoard = (includeMatchCards: boolean) => (
    <>
      {includeMatchCards && matchMode !== 'solo' ? (
        <Card style={styles.mapCard}>
          <View style={styles.liveMatchCard}>
            <Text style={styles.liveMatchEyebrow}>MATCH MODE</Text>
            <Text style={styles.liveMatchTitle}>{liveMatchTitle}</Text>
            <Text style={styles.liveMatchText}>{liveMatchText}</Text>
          </View>
          {matchMode === 'duel' && effectiveDuelOpponent ? (
            <View style={styles.duelLiveCard}>
            <View style={styles.duelLiveHeader}>
              <View style={styles.groupLiveHeaderCopy}>
                <Text style={styles.liveMatchEyebrow}>LIVE GAP</Text>
                <Text style={styles.groupLiveTitle}>{duelLiveTitle}</Text>
                <Text style={styles.groupLiveSummary}>{duelLiveSummary}</Text>
              </View>
              <View style={styles.duelLiveBadge}>
                <Text style={styles.duelLiveBadgeText}>1대1</Text>
              </View>
            </View>
            <View style={styles.groupLiveGapRow}>
              <View style={styles.groupLiveGapChip}>
                <Text style={styles.groupLiveGapEyebrow}>나</Text>
                <Text style={styles.groupLiveGapText}>{distanceKm.toFixed(2)}km</Text>
              </View>
              <View style={styles.groupLiveGapChip}>
                <Text style={styles.groupLiveGapEyebrow}>상대</Text>
                <Text style={styles.groupLiveGapText}>
                  {hasRemoteRunnerProgress(effectiveDuelOpponent)
                    ? `${resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, duelDistanceKm).toFixed(2)}km`
                    : '동기화 중'}
                </Text>
              </View>
            </View>
            {duelStatusAlert ? (
              <View
                style={[
                  styles.matchStatusBanner,
                  duelStatusAlert.tone === 'danger'
                    ? styles.matchStatusBannerDanger
                    : duelStatusAlert.tone === 'warning'
                      ? styles.matchStatusBannerWarning
                      : styles.matchStatusBannerNeutral,
                ]}
              >
                <Text style={styles.matchStatusBannerTitle}>{duelStatusAlert.title}</Text>
                <Text style={styles.matchStatusBannerText}>{duelStatusAlert.summary}</Text>
                <Pressable
                  style={styles.matchStatusBannerAction}
                  disabled={isLeavingDuelMatch}
                  onPress={() => {
                    handleContinueSoloFromMatch('duel');
                  }}
                >
                  <Text style={styles.matchStatusBannerActionText}>
                    {isLeavingDuelMatch ? '전환 중...' : '혼자 계속 달릴게요'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            </View>
          ) : null}
          {matchMode === 'group' && effectiveGroupParticipantCount > 0 && currentGroupStanding ? (
            <View style={styles.groupLiveCard}>
            <View style={styles.groupLiveHeader}>
              <View style={styles.groupLiveHeaderCopy}>
                <Text style={styles.liveMatchEyebrow}>LIVE RANK</Text>
                <Text style={styles.groupLiveTitle}>
                  현재 {currentGroupStanding.rank}/{effectiveGroupParticipantCount}위
                </Text>
                <Text style={styles.groupLiveSummary}>
                  {currentGroupStanding.rank === 1
                    ? groupBehindParticipant
                      ? `${groupBehindParticipant.name}님보다 ${groupBehindParticipant.gapAheadKm?.toFixed(2) ?? '0.00'}km 앞서 있어요.`
                      : '지금은 선두예요. 이 흐름을 그대로 유지해보세요.'
                    : `앞 사람과 ${currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km 차이 · 1위와 ${currentGroupStanding.gapLeaderKm.toFixed(2)}km 차이`}
                </Text>
                <View style={styles.groupLiveGapRow}>
                  {groupAheadParticipant ? (
                    <View style={styles.groupLiveGapChip}>
                      <Text style={styles.groupLiveGapEyebrow}>앞</Text>
                      <Text style={styles.groupLiveGapText}>
                        {groupAheadParticipant.name} · {currentGroupStanding?.gapAheadKm?.toFixed(2) ?? '0.00'}km
                      </Text>
                    </View>
                  ) : null}
                  {groupBehindParticipant ? (
                    <View style={styles.groupLiveGapChip}>
                      <Text style={styles.groupLiveGapEyebrow}>뒤</Text>
                      <Text style={styles.groupLiveGapText}>
                        {groupBehindParticipant.name} · {groupBehindParticipant.gapAheadKm?.toFixed(2) ?? '0.00'}km
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.groupLiveBadge}>
                <Text style={styles.groupLiveBadgeText}>{effectiveGroupParticipantCount}명</Text>
              </View>
            </View>
            {groupStatusAlert ? (
              <View
                style={[
                  styles.matchStatusBanner,
                  groupStatusAlert.tone === 'danger'
                    ? styles.matchStatusBannerDanger
                    : styles.matchStatusBannerWarning,
                ]}
              >
                <Text style={styles.matchStatusBannerTitle}>{groupStatusAlert.title}</Text>
                <Text style={styles.matchStatusBannerText}>{groupStatusAlert.summary}</Text>
                {groupStatusAlert.tone === 'danger' ? (
                  <Pressable
                    style={styles.matchStatusBannerAction}
                    disabled={isLeavingGroupMatch}
                    onPress={() => {
                      handleContinueSoloFromMatch('group');
                    }}
                  >
                    <Text style={styles.matchStatusBannerActionText}>
                      {isLeavingGroupMatch ? '전환 중...' : '혼자 계속 달릴게요'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <View style={styles.groupLiveTopList}>
              {groupLiveStandings.slice(0, 5).map((participant) => (
                <View
                  key={participant.id}
                  style={[styles.groupLiveRow, participant.isCurrentUser ? styles.groupLiveRowCurrent : undefined]}
                >
                  <Text style={styles.groupLiveRank}>{participant.rank}</Text>
                  <View style={styles.groupLiveCopy}>
                    <Text style={styles.groupLiveName}>
                      {participant.name}
                      {participant.isCurrentUser ? ' (나)' : ''}
                    </Text>
                    <Text style={styles.groupLiveMeta}>
                      {participant.averagePace} · {participant.levelLabel} · {participant.seedSummary}
                      {participant.liveStatus ? ` · ${buildMatchParticipantStatusLabel(participant.liveStatus)}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.groupLiveDistance}>{participant.currentDistanceKm.toFixed(2)}km</Text>
                </View>
              ))}
            </View>
            {currentGroupStanding.rank > 5 ? (
              <View style={[styles.groupLiveRow, styles.groupLiveRowCurrent]}>
                <Text style={styles.groupLiveRank}>{currentGroupStanding.rank}</Text>
                <View style={styles.groupLiveCopy}>
                  <Text style={styles.groupLiveName}>{currentGroupStanding.name} (나)</Text>
                  <Text style={styles.groupLiveMeta}>
                    {currentGroupStanding.averagePace} · {currentGroupStanding.levelLabel}
                    {currentGroupStanding.liveStatus ? ` · ${buildMatchParticipantStatusLabel(currentGroupStanding.liveStatus)}` : ''}
                    {' · '}
                    앞 사람과 {currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km
                  </Text>
                </View>
                <Text style={styles.groupLiveDistance}>{currentGroupStanding.currentDistanceKm.toFixed(2)}km</Text>
              </View>
            ) : null}
            {currentGroupLeader && currentGroupStanding.rank !== 1 ? (
              <Text style={styles.groupLiveFooter}>
                선두는 {currentGroupLeader.name}님이에요. {currentGroupLeader.currentDistanceKm.toFixed(2)}km로 앞서가고 있어요.
              </Text>
            ) : (
              <Text style={styles.groupLiveFooter}>지금은 선두예요. 다음 러너와 간격을 유지해보세요.</Text>
            )}
            </View>
          ) : null}
        </Card>
      ) : null}

      <RunningMetricGrid
        elapsedLabel={formatDuration(elapsedSeconds)}
        distanceLabel={formatMetricDistance(distanceKm)}
        averagePaceLabel={averagePace}
        currentPaceLabel={currentPace}
        cadenceLabel={formatCadence(cadenceSpm)}
        elevationLabel={formatElevation(elevationGainM)}
      />

    </>
  );

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
              {visibleMatchRoom ? (
                visibleMatchRoomIsInviteOnly ? (
                  <PartyRunInviteCard
                    room={visibleMatchRoom}
                    isAccepting={isJoiningMatchRoom}
                    isDeclining={isLeavingMatchRoom}
                    onAccept={() => { void handleAcceptRoomInviteFromRunning(); }}
                    onDecline={() => { void handleDeclineRoomInviteFromRunning(); }}
                  />
                ) : (
                  <Pressable
                    style={styles.partyRoomEntryButton}
                    onPress={() => {
                      router.push('/match-room' as Href);
                    }}
                  >
                    <Text style={styles.partyRoomEntryButtonText}>파티런 대기실로 가기</Text>
                  </Pressable>
                )
              ) : null}
              {matchMode === 'room' ? (
                <View style={styles.roomCard}>
                  {!matchRoom ? (
                    <>
                      <View style={styles.roomModeRow}>
                        {([
                          { key: 'duel' as const, label: '1대1 대결' },
                          { key: 'group' as const, label: '그룹 대결' },
                        ]).map((option) => {
                          const isSelected = roomMatchMode === option.key;

                          return (
                            <Pressable
                              key={option.key}
                              style={[styles.roomModeChip, isSelected ? styles.roomModeChipSelected : undefined]}
                              onPress={() => setRoomMatchMode(option.key)}
                            >
                              <Text style={[styles.roomModeChipText, isSelected ? styles.roomModeChipTextSelected : undefined]}>
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={styles.roomJoinBox}>
                        <Text style={styles.roomPickerTitle}>초대 코드로 입장</Text>
                        <TextInput
                          value={roomInviteTokenInput}
                          onChangeText={setRoomInviteTokenInput}
                          placeholder="예: AB12CD"
                          placeholderTextColor="#98A2B3"
                          autoCapitalize="characters"
                          style={styles.roomInput}
                        />
                        <SecondaryButton
                          label={isJoiningMatchRoom ? '입장 중...' : '방 입장'}
                          onPress={() => {
                            void handleJoinMatchRoom();
                          }}
                          disabled={isJoiningMatchRoom}
                        />
                      </View>
                    </>
                  ) : null}
                </View>
              ) : null}
              {matchMode === 'duel' ? (
                <View style={styles.duelSetupCard}>
                  <View style={styles.duelSection}>
                    <View style={styles.duelSectionHeader}>
                      <Text style={styles.duelSectionTitle}>거리</Text>
                      <Pressable
                        style={styles.distanceInputToggle}
                        onPress={() => setShowDuelCustomDistanceInput((current) => !current)}
                      >
                        <Text style={styles.distanceInputToggleText}>
                          {showDuelCustomDistanceInput ? '추천 거리' : '직접 입력'}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.matchDistanceChipRow}>
                      {RECOMMENDED_MATCH_DISTANCES.map((recommendedDistanceKm) => {
                        const isSelected = Math.abs(duelDistanceKm - recommendedDistanceKm) < 0.15;

                        return (
                          <Pressable
                            key={`duel-${recommendedDistanceKm}`}
                            style={[styles.matchDistanceChip, isSelected ? styles.matchDistanceChipSelected : undefined]}
                            onPress={() => {
                              setDuelDistanceText(String(recommendedDistanceKm));
                              setShowDuelCustomDistanceInput(false);
                            }}
                          >
                            <Text style={[styles.matchDistanceChipText, isSelected ? styles.matchDistanceChipTextSelected : undefined]}>
                              {recommendedDistanceKm}km
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {showDuelCustomDistanceInput ? (
                      <TextInput
                        value={duelDistanceText}
                        onChangeText={setDuelDistanceText}
                        placeholder="예: 5, 10, 21.1"
                        placeholderTextColor="#98A2B3"
                        keyboardType="decimal-pad"
                        style={styles.duelDistanceInput}
                      />
                    ) : null}
                    {!isRecommendedMatchDistance(duelDistanceKm) ? (
                      <Text style={styles.duelHelperText}>
                        추천 거리 {findNearestRecommendedDistance(duelDistanceKm)}km로 맞추면 더 빨리 비슷한 러너가 모여요.
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.duelSection}>
                    <View style={styles.duelSectionHeader}>
                      <Text style={styles.duelSectionTitle}>출발 시간대</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.slotDateScrollContent}
                      style={styles.slotDateScroll}
                    >
                      {duelDateOptions.map((dateOption) => {
                        const isSelected = dateOption.key === selectedDuelDateKey;

                        return (
                          <Pressable
                            key={`duel-date-${dateOption.key}`}
                            style={[styles.slotDateChip, isSelected ? styles.slotDateChipSelected : undefined]}
                            onPress={() => {
                              setSelectedDuelDateKey(dateOption.key);
                              selectNextDuelSlotForDate(dateOption.key);
                            }}
                          >
                            <Text style={[styles.slotDateChipLabel, isSelected ? styles.slotDateChipLabelSelected : undefined]}>
                              {dateOption.label}
                            </Text>
                            <Text style={[styles.slotDateChipMeta, isSelected ? styles.slotDateChipMetaSelected : undefined]}>
                              {dateOption.subtitle}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <View style={styles.slotSectionRow}>
                      {[
                        { key: 'am' as const, label: '오전' },
                        { key: 'pm' as const, label: '오후' },
                      ].map((section) => {
                        const isSelected = selectedDuelTimeSection === section.key;

                        return (
                          <Pressable
                            key={`duel-section-${section.key}`}
                            style={[styles.slotSectionChip, isSelected ? styles.slotSectionChipSelected : undefined]}
                            onPress={() => selectDuelTimeSection(section.key)}
                          >
                            <Text style={[styles.slotSectionChipText, isSelected ? styles.slotSectionChipTextSelected : undefined]}>
                              {section.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={styles.duelSlotGrid}>
                      {visibleDuelSlotOptions.map((slot) => {
                        const isSelected = slot.startsAt === (selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt);

                        return (
                          <Pressable
                            key={slot.startsAt}
                            disabled={slot.isClosed}
                            style={[
                              styles.duelSlotChip,
                              isSelected ? styles.duelSlotChipSelected : undefined,
                              slot.isClosed ? styles.duelSlotChipDisabled : undefined,
                            ]}
                            onPress={() => {
                              if (slot.isClosed) {
                                return;
                              }
                              setSelectedDuelSlotStartAt(slot.startsAt);
                            }}
                          >
                            <Text style={[styles.duelSlotLabel, isSelected ? styles.duelSlotLabelSelected : undefined]}>
                              {slot.label}
                            </Text>
                            {slot.isClosed ? <Text style={styles.duelSlotClosedText}>마감</Text> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {isRequestingDuelMatch ? <ActivityIndicator size="small" color="#818CF8" /> : null}

                  {duelMatchState === 'waiting' ? (
                    <View style={styles.duelResultCard}>
                      <Text style={styles.duelResultEyebrow}>WAITING</Text>
                      <Text style={styles.duelResultTitle}>{duelWaitingTitle}</Text>
                      <Text style={styles.duelResultMeta}>{duelWaitingMeta}</Text>
                      <Text style={styles.duelResultMeta}>{duelWaitingHint}</Text>
                      {duelExpiryCountdownLabel ? (
                        <Text style={styles.duelResultMeta}>자동 정리까지 {duelExpiryCountdownLabel} 남음</Text>
                      ) : null}
                      <Text style={styles.duelResultMeta}>{duelMatchStatus?.criteriaSummary}</Text>
                    </View>
                  ) : null}

                  {duelMatchState === 'matched' && effectiveDuelOpponent ? (
                    <View style={styles.duelResultCard}>
                      <Text style={styles.duelResultEyebrow}>MATCHED</Text>
                      <Text style={styles.duelResultTitle}>
                        {duelMatchStatus?.isTestMatch ? '테스트 매칭이 잡혔습니다' : '매칭이 잡혔습니다'}
                      </Text>
                      <Text style={styles.duelResultMeta}>
                        {buildMatchSlotDateLabel(duelMatchStatus?.slotStartAt ?? activeDuelSlotStartAt)} {effectiveDuelSlotLabel}
                      </Text>
                      {shouldShowMatchCardCountdown(duelStartCountdownSeconds) ? (
                        <View style={styles.matchCountdownPill}>
                          <Text style={styles.matchCountdownText}>시작까지 {formatMatchCountdown(duelStartCountdownSeconds!)}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.duelResultMeta}>
                        상대 {effectiveDuelOpponent.name} · {effectiveDuelOpponent.averagePace} · {effectiveDuelOpponent.levelLabel}
                        {effectiveDuelOpponentStatusLabel ? ` · ${effectiveDuelOpponentStatusLabel}` : ''}
                      </Text>
                      <Text style={styles.duelResultMeta}>
                        {duelMatchStatus?.isTestMatch
                          ? (duelMatchStatus?.readyToStart ? '카운트다운이 끝나서 바로 시작돼요.' : '테스트 카운트다운이 끝나면 자동으로 대결이 시작돼요.')
                          : duelMatchStatus?.readyToStart ? '지금 바로 시작할 수 있어요.' : '시작 시간 전까지 자동으로 예약 상태를 유지해요.'}
                      </Text>
                    </View>
                  ) : null}

                  {duelMatchNotice ? (
                    <View style={styles.matchNoticeBlock}>
                      <Text style={styles.matchNoticeText}>{duelMatchNotice}</Text>
                      {duelNeedsManualRematch ? (
                        <Pressable
                          style={styles.matchNoticeAction}
                          onPress={() => {
                            void handleRequestDuelMatch(activeDuelSlotStartAt);
                          }}
                        >
                          <Text style={styles.matchNoticeActionText}>같은 조건으로 다시 찾기</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  {duelMatchState === 'active' && effectiveDuelOpponent ? (
                    <View style={styles.duelResultCard}>
                      <Text style={styles.duelResultEyebrow}>MATCH ACTIVE</Text>
                      <Text style={styles.duelResultTitle}>{effectiveDuelOpponent.name}님과 바로 시작할 수 있어요</Text>
                      <Text style={styles.duelResultMeta}>
                        {effectiveDuelOpponent.averagePace} · {effectiveDuelOpponent.levelLabel} · {effectiveDuelOpponent.districtName}
                        {effectiveDuelOpponentStatusLabel ? ` · ${effectiveDuelOpponentStatusLabel}` : ''}
                      </Text>
                      {duelLiveGapKm !== null ? (
                        <Text style={styles.duelResultMeta}>
                          {duelLiveGapKm >= 0
                            ? `${duelLiveGapKm.toFixed(2)}km 앞서고 있어요`
                            : `${Math.abs(duelLiveGapKm).toFixed(2)}km 따라가는 중이에요`}
                        </Text>
                      ) : null}
                      <Text style={styles.duelResultMeta}>{effectiveDuelSlotLabel} 시작</Text>
                    </View>
                  ) : null}

                  {duelMatchState === 'waiting' || duelMatchState === 'matched' ? (
                    <>
                      <SecondaryButton
                        label={isCancelingDuelMatch ? '취소 중...' : duelMatchState === 'matched' ? '1대1 예약 취소' : '1대1 대기 취소'}
                        onPress={() => {
                          void handleCancelDuelMatch();
                        }}
                        disabled={duelReservationLocked}
                      />
                      {duelReservationLocked ? <Text style={styles.matchCancelHelperText}>출발 1시간 전부터는 예약을 취소할 수 없어요.</Text> : null}
                    </>
                  ) : duelMatchState === 'active' ? null : (
                    <View style={styles.matchActionColumn}>
                      <SecondaryButton
                        label="1대1 매칭 찾기"
                        onPress={() => {
                          void handleRequestDuelMatch();
                        }}
                        disabled={!canCreateDuelMatch}
                      />
                      <SecondaryButton
                        label="1대1 테스트 매칭"
                        onPress={() => {
                          void handleRequestDuelMatch(activeDuelSlotStartAt, { testMode: true });
                        }}
                        disabled={!canCreateDuelMatch}
                      />
                    </View>
                  )}
                  {!canCreateDuelMatch && blockingMatchHelperText ? (
                    <Text style={styles.matchCancelHelperText}>{blockingMatchHelperText}</Text>
                  ) : null}
                </View>
              ) : null}
              {matchMode === 'group' ? (
                <View style={styles.duelSetupCard}>
                  <View style={styles.duelSection}>
                    <View style={styles.duelSectionHeader}>
                      <Text style={styles.duelSectionTitle}>거리</Text>
                      <Pressable
                        style={styles.distanceInputToggle}
                        onPress={() => setShowGroupCustomDistanceInput((current) => !current)}
                      >
                        <Text style={styles.distanceInputToggleText}>
                          {showGroupCustomDistanceInput ? '추천 거리' : '직접 입력'}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.matchDistanceChipRow}>
                      {RECOMMENDED_MATCH_DISTANCES.map((recommendedDistanceKm) => {
                        const isSelected = Math.abs(groupDistanceKm - recommendedDistanceKm) < 0.15;

                        return (
                          <Pressable
                            key={`group-${recommendedDistanceKm}`}
                            style={[styles.matchDistanceChip, isSelected ? styles.matchDistanceChipSelected : undefined]}
                            onPress={() => {
                              setGroupDistanceText(String(recommendedDistanceKm));
                              setShowGroupCustomDistanceInput(false);
                            }}
                          >
                            <Text style={[styles.matchDistanceChipText, isSelected ? styles.matchDistanceChipTextSelected : undefined]}>
                              {recommendedDistanceKm}km
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {showGroupCustomDistanceInput ? (
                      <TextInput
                        value={groupDistanceText}
                        onChangeText={setGroupDistanceText}
                        placeholder="예: 5, 10, 21.1"
                        placeholderTextColor="#98A2B3"
                        keyboardType="decimal-pad"
                        style={styles.duelDistanceInput}
                      />
                    ) : null}
                    {!isRecommendedMatchDistance(groupDistanceKm) ? (
                      <Text style={styles.duelHelperText}>
                        추천 거리 {findNearestRecommendedDistance(groupDistanceKm)}km로 맞추면 더 빨리 비슷한 러너가 모여요.
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.duelSection}>
                    <View style={styles.duelSectionHeader}>
                      <Text style={styles.duelSectionTitle}>출발 시간대</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.slotDateScrollContent}
                      style={styles.slotDateScroll}
                    >
                      {groupDateOptions.map((dateOption) => {
                        const isSelected = dateOption.key === selectedGroupDateKey;

                        return (
                          <Pressable
                            key={`group-date-${dateOption.key}`}
                            style={[styles.slotDateChip, isSelected ? styles.slotDateChipSelected : undefined]}
                            onPress={() => {
                              setSelectedGroupDateKey(dateOption.key);
                              selectNextGroupSlotForDate(dateOption.key);
                            }}
                          >
                            <Text style={[styles.slotDateChipLabel, isSelected ? styles.slotDateChipLabelSelected : undefined]}>
                              {dateOption.label}
                            </Text>
                            <Text style={[styles.slotDateChipMeta, isSelected ? styles.slotDateChipMetaSelected : undefined]}>
                              {dateOption.subtitle}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <View style={styles.slotSectionRow}>
                      {[
                        { key: 'am' as const, label: '오전' },
                        { key: 'pm' as const, label: '오후' },
                      ].map((section) => {
                        const isSelected = selectedGroupTimeSection === section.key;

                        return (
                          <Pressable
                            key={`group-section-${section.key}`}
                            style={[styles.slotSectionChip, isSelected ? styles.slotSectionChipSelected : undefined]}
                            onPress={() => selectGroupTimeSection(section.key)}
                          >
                            <Text style={[styles.slotSectionChipText, isSelected ? styles.slotSectionChipTextSelected : undefined]}>
                              {section.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={styles.duelSlotGrid}>
                      {visibleGroupSlotOptions.map((slot) => {
                        const isSelected = slot.startsAt === (selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt);

                        return (
                          <Pressable
                            key={slot.startsAt}
                            disabled={slot.isClosed}
                            style={[
                              styles.duelSlotChip,
                              isSelected ? styles.duelSlotChipSelected : undefined,
                              slot.isClosed ? styles.duelSlotChipDisabled : undefined,
                            ]}
                            onPress={() => {
                              if (slot.isClosed) {
                                return;
                              }
                              setSelectedGroupSlotStartAt(slot.startsAt);
                            }}
                          >
                            <Text style={[styles.duelSlotLabel, isSelected ? styles.duelSlotLabelSelected : undefined]}>
                              {slot.label}
                            </Text>
                            {slot.isClosed ? <Text style={styles.duelSlotClosedText}>마감</Text> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {!isGroupTestFlow ? (
                    <View style={styles.matchDemandCard}>
                      <View style={styles.matchDemandHeader}>
                        <Text style={styles.matchDemandTitle}>현재 신청 현황</Text>
                        {isLoadingGroupDemandSummary ? <ActivityIndicator size="small" color="#818CF8" /> : null}
                      </View>
                      <Text style={styles.matchDemandHeadline}>
                        {groupDemandSummary
                          ? `${groupDemandSummary.averagePace} · ${groupDemandSummary.fillRatioLabel}`
                          : '평균 페이스와 신청 인원을 불러오는 중'}
                      </Text>
                      {groupDemandSummary?.participantsCount ? (
                        <Text style={styles.matchDemandText}>{groupDemandSummary.summaryText}</Text>
                      ) : null}
                    </View>
                  ) : null}

                  {isRequestingGroupMatch ? <ActivityIndicator size="small" color="#818CF8" /> : null}

                  {groupMatchState === 'waiting' ? (
                    <View style={styles.duelResultCard}>
                      <Text style={styles.duelResultEyebrow}>WAITING</Text>
                      <Text style={styles.duelResultTitle}>{isGroupTestFlow ? '테스트 그룹을 모으는 중이에요' : '비슷한 그룹을 모으는 중이에요'}</Text>
                      <Text style={styles.duelResultMeta}>
                        {isGroupTestFlow
                          ? `현재 ${groupMatchStatus?.participantCount ?? 0}/${groupMatchStatus?.capacity ?? 30}명 대기 · 2명만 모이면 시작`
                          : `현재 ${groupMatchStatus?.participantCount ?? 0}/${groupMatchStatus?.capacity ?? 30}명 대기 · 평균 ${groupDemandSummary?.averagePace ?? '페이스 계산 중'}`}
                      </Text>
                      {groupExpiryCountdownLabel ? (
                        <Text style={styles.duelResultMeta}>자동 정리까지 {groupExpiryCountdownLabel} 남음</Text>
                      ) : null}
                      <Text style={styles.duelResultMeta}>{groupMatchStatus?.criteriaSummary}</Text>
                    </View>
                  ) : null}

                  {(groupMatchState === 'matched' || groupMatchState === 'active') && effectiveGroupParticipantCount ? (
                    <View style={styles.duelResultCard}>
                      <Text style={styles.duelResultEyebrow}>
                        {groupMatchState === 'matched' ? 'MATCHED' : 'GROUP ACTIVE'}
                      </Text>
                      <Text style={styles.duelResultTitle}>
                        {groupMatchState === 'matched'
                          ? groupMatchStatus?.isTestMatch ? '테스트 그룹이 잡혔습니다' : '매칭이 잡혔습니다'
                          : `${effectiveGroupParticipantCount}명 그룹전 바로 시작 가능`}
                      </Text>
                      <Text style={styles.duelResultMeta}>
                        {buildMatchSlotDateLabel(groupMatchStatus?.slotStartAt ?? activeGroupSlotStartAt)} {effectiveGroupSlotLabel}
                      </Text>
                      {groupMatchState === 'matched' && shouldShowMatchCardCountdown(groupStartCountdownSeconds) ? (
                        <View style={styles.matchCountdownPill}>
                          <Text style={styles.matchCountdownText}>시작까지 {formatMatchCountdown(groupStartCountdownSeconds!)}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.duelResultMeta}>
                        {effectiveGroupParticipantCount}명 그룹 · 내 시작 시드 {effectiveGroupSeedRank ?? 1}위
                      </Text>
                      {groupMatchState === 'matched' ? (
                        <Text style={styles.duelResultMeta}>
                          {groupMatchStatus?.isTestMatch
                            ? (groupMatchStatus?.readyToStart ? '카운트다운이 끝나서 바로 시작돼요.' : '테스트 카운트다운이 끝나면 자동으로 그룹 대결이 시작돼요.')
                            : groupMatchStatus?.readyToStart ? '지금 바로 시작할 수 있어요.' : '시작 시간 전까지 자동으로 예약 상태를 유지해요.'}
                        </Text>
                      ) : null}
                      <View style={styles.groupParticipantList}>
                        {effectiveGroupParticipants.slice(0, 3).map((participant) => (
                          <View key={participant.id} style={styles.groupParticipantRow}>
                            <Text style={styles.groupParticipantRank}>{participant.seedRank}</Text>
                            <View style={styles.groupParticipantCopy}>
                              <Text style={styles.groupParticipantName}>
                                {participant.name}
                                {participant.seedRank === (effectiveGroupSeedRank ?? 1) ? ' (나)' : ''}
                              </Text>
                              <Text style={styles.groupParticipantMeta}>
                                {participant.averagePace} · {participant.levelLabel}
                                {participant.liveStatus ? ` · ${buildMatchParticipantStatusLabel(participant.liveStatus)}` : ''}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                      {effectiveGroupParticipantCount > 3 ? (
                        <Text style={styles.duelResultMeta}>외 {effectiveGroupParticipantCount - 3}명</Text>
                      ) : null}
                    </View>
                  ) : null}

                  {groupMatchNotice ? (
                    <View style={styles.matchNoticeBlock}>
                      <Text style={styles.matchNoticeText}>{groupMatchNotice}</Text>
                      {groupNeedsManualRematch ? (
                        <Pressable
                          style={styles.matchNoticeAction}
                          onPress={() => {
                            void handleRequestGroupMatch(activeGroupSlotStartAt);
                          }}
                        >
                          <Text style={styles.matchNoticeActionText}>같은 조건으로 다시 찾기</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  {groupMatchState === 'waiting' || groupMatchState === 'matched' ? (
                    <>
                      <SecondaryButton
                        label={isCancelingGroupMatch ? '취소 중...' : groupMatchState === 'matched' ? '그룹 예약 취소' : '그룹 대기 취소'}
                        onPress={() => {
                          void handleCancelGroupMatch();
                        }}
                        disabled={groupReservationLocked}
                      />
                      {groupReservationLocked ? <Text style={styles.matchCancelHelperText}>출발 1시간 전부터는 예약을 취소할 수 없어요.</Text> : null}
                    </>
                  ) : groupMatchState === 'active' ? null : (
                    <View style={styles.matchActionColumn}>
                      <SecondaryButton
                        label="그룹 매칭 찾기"
                        onPress={() => {
                          void handleRequestGroupMatch();
                        }}
                        disabled={!canCreateGroupMatch}
                      />
                      <SecondaryButton
                        label="그룹 테스트 매칭"
                        onPress={() => {
                          void handleRequestGroupMatch(activeGroupSlotStartAt, { testMode: true });
                        }}
                        disabled={!canCreateGroupMatch}
                      />
                    </View>
                  )}
                  {!canCreateGroupMatch && blockingMatchHelperText ? (
                    <Text style={styles.matchCancelHelperText}>{blockingMatchHelperText}</Text>
                  ) : null}
                </View>
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
            <View style={styles.livePagerShell}>
              <View style={styles.livePagerTabRow}>
                <Pressable
                  style={[styles.livePagerTab, liveArenaPage === 0 ? styles.livePagerTabSelected : undefined]}
                  onPress={() => {
                    livePagerRef.current?.scrollTo({ x: 0, animated: true });
                    setLiveArenaPage(0);
                  }}
                >
                  <Text style={[styles.livePagerTabText, liveArenaPage === 0 ? styles.livePagerTabTextSelected : undefined]}>
                    대결 보기
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.livePagerTab, liveArenaPage === 1 ? styles.livePagerTabSelected : undefined]}
                  onPress={() => {
                    livePagerRef.current?.scrollTo({ x: liveArenaPageWidth, animated: true });
                    setLiveArenaPage(1);
                  }}
                >
                  <Text style={[styles.livePagerTabText, liveArenaPage === 1 ? styles.livePagerTabTextSelected : undefined]}>
                    순위 보기
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.livePagerTab, liveArenaPage === 2 ? styles.livePagerTabSelected : undefined]}
                  onPress={() => {
                    livePagerRef.current?.scrollTo({ x: liveArenaPageWidth * 2, animated: true });
                    setLiveArenaPage(2);
                  }}
                >
                  <Text style={[styles.livePagerTabText, liveArenaPage === 2 ? styles.livePagerTabTextSelected : undefined]}>
                    기록 보기
                  </Text>
                </Pressable>
                {hasMatchResultPage ? (
                  <Pressable
                    style={[styles.livePagerTab, liveArenaPage === 3 ? styles.livePagerTabSelected : undefined]}
                    onPress={() => {
                      livePagerRef.current?.scrollTo({ x: liveArenaPageWidth * 3, animated: true });
                      setLiveArenaPage(3);
                    }}
                  >
                    <Text style={[styles.livePagerTabText, liveArenaPage === 3 ? styles.livePagerTabTextSelected : undefined]}>
                      결과 보기
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView
                ref={livePagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                  const page = Math.round(event.nativeEvent.contentOffset.x / liveArenaPageWidth);
                  setLiveArenaPage(page);
                }}
              >
                <View style={[styles.livePagerPage, { width: liveArenaPageWidth }]}>
                  {renderLiveArenaPage()}
                  {renderLiveArenaExitAction()}
                </View>
                <View style={[styles.livePagerPage, { width: liveArenaPageWidth }]}>
                  {renderLiveRaceBoardPage()}
                </View>
                <View style={[styles.livePagerPage, { width: liveArenaPageWidth }]}>
                  {renderRunningStatsBoard(false)}
                </View>
                {hasMatchResultPage ? (
                  <View style={[styles.livePagerPage, { width: liveArenaPageWidth }]}>
                    {renderMatchResultPage()}
                  </View>
                ) : null}
              </ScrollView>
              <Text style={styles.livePagerHint}>
                {hasMatchResultPage
                  ? '옆으로 넘기면 순위, 기록, 결과 화면을 볼 수 있어요.'
                  : '옆으로 넘기면 순위와 기록 화면을 볼 수 있어요.'}
              </Text>
            </View>
          ) : (
            renderRunningStatsBoard(true)
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
  roomCard: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  roomEyebrow: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  roomTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 4,
  },
  roomBadge: {
    borderRadius: 999,
    backgroundColor: '#312E81',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roomBadgeText: {
    color: '#E0E7FF',
    fontSize: 11,
    fontWeight: '800',
  },
  roomModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roomModeChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#475467',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  roomModeChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#312E81',
  },
  roomModeChipText: {
    color: '#D0D5DD',
    fontSize: 13,
    fontWeight: '800',
  },
  roomModeChipTextSelected: {
    color: '#FFFFFF',
  },
  roomHelperText: {
    color: '#98A2B3',
    fontSize: 12,
    lineHeight: 18,
  },
  roomInput: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#475467',
    backgroundColor: '#111827',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    fontWeight: '700',
  },
  roomFriendSelector: {
    gap: 8,
  },
  roomPickerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  roomFriendChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomFriendChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#475467',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  roomFriendChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#312E81',
  },
  roomFriendChipText: {
    color: '#D0D5DD',
    fontSize: 12,
    fontWeight: '700',
  },
  roomFriendChipTextSelected: {
    color: '#FFFFFF',
  },
  roomJoinBox: {
    gap: 10,
    paddingTop: 2,
  },
  roomLobby: {
    gap: 10,
    paddingTop: 4,
  },
  roomSettingsPanel: {
    gap: 14,
    marginTop: 2,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#312E81',
    backgroundColor: '#0F172A',
  },
  roomSettingBlock: {
    gap: 8,
  },
  roomLobbyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  roomLobbyMeta: {
    color: '#D0D5DD',
    fontSize: 13,
    lineHeight: 18,
  },
  roomParticipantRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomParticipantChip: {
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  roomParticipantChipText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
  },
  roomActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roomActionButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#475467',
    backgroundColor: '#111827',
    alignItems: 'center',
    paddingVertical: 12,
  },
  roomActionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
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
  livePagerShell: {
    gap: 12,
  },
  livePagerTabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  livePagerTab: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    alignItems: 'center',
  },
  livePagerTabSelected: {
    borderColor: '#6D5EF7',
    backgroundColor: '#EEF2FF',
  },
  livePagerTabText: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '800',
  },
  livePagerTabTextSelected: {
    color: '#4338CA',
  },
  livePagerPage: {
    paddingRight: 16,
    gap: 16,
  },
  livePagerHint: {
    color: '#98A2B3',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
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
  partyRoomEntryButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  partyRoomEntryButtonText: {
    color: '#EEF2FF',
    fontSize: 15,
    fontWeight: '900',
  },
  duelSetupCard: {
    gap: 12,
  },
  duelSection: {
    gap: 10,
  },
  duelSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  duelSectionTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  duelSectionMeta: {
    color: '#98A2B3',
    fontSize: 12,
    fontWeight: '700',
  },
  distanceInputToggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  distanceInputToggleText: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '800',
  },
  duelDistanceInput: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  duelHelperText: {
    color: '#98A2B3',
    lineHeight: 18,
  },
  matchDistanceChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  matchDistanceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  matchDistanceChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
  },
  matchDistanceChipText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
  },
  matchDistanceChipTextSelected: {
    color: '#E0E7FF',
  },
  duelSlotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  slotDateScroll: {
    marginHorizontal: -4,
  },
  slotDateScrollContent: {
    gap: 8,
    paddingHorizontal: 4,
  },
  slotDateChip: {
    minWidth: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
  },
  slotDateChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
  },
  slotDateChipLabel: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '800',
  },
  slotDateChipLabelSelected: {
    color: '#FFFFFF',
  },
  slotDateChipMeta: {
    color: '#98A2B3',
    fontSize: 11,
    fontWeight: '700',
  },
  slotDateChipMetaSelected: {
    color: '#C7D2FE',
  },
  slotSectionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  slotSectionChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    paddingVertical: 8,
    alignItems: 'center',
  },
  slotSectionChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
  },
  slotSectionChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  slotSectionChipTextSelected: {
    color: '#E0E7FF',
  },
  duelSlotChip: {
    width: '23.5%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    paddingHorizontal: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  duelSlotChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
  },
  duelSlotChipDisabled: {
    borderColor: '#344054',
    backgroundColor: '#101828',
    opacity: 0.65,
  },
  duelSlotLabel: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  duelSlotLabelSelected: {
    color: '#E0E7FF',
  },
  duelSlotClosedText: {
    color: '#98A2B3',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  matchDemandCard: {
    gap: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    padding: 14,
  },
  matchDemandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  matchDemandTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  matchDemandHeadline: {
    color: '#E0E7FF',
    fontSize: 18,
    fontWeight: '800',
  },
  matchDemandText: {
    color: '#C7D2FE',
    lineHeight: 19,
  },
  matchExpansionCard: {
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#312E81',
    backgroundColor: '#111827',
    padding: 14,
  },
  matchExpansionTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  matchExpansionText: {
    color: '#E5E7EB',
    lineHeight: 19,
  },
  matchExpansionMeta: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '700',
  },
  matchExpansionButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  matchExpansionButtonText: {
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '800',
  },
  matchActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  matchActionItem: {
    flex: 1,
  },
  matchActionColumn: {
    gap: 10,
  },
  duelResultCard: {
    gap: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
    padding: 14,
  },
  duelResultEyebrow: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  duelResultTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  duelResultBody: {
    color: '#E5E7EB',
    lineHeight: 20,
  },
  duelResultMeta: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '700',
  },
  matchCountdownPill: {
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  matchCountdownText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  matchNoticeText: {
    color: '#A5B4FC',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  matchNoticeBlock: {
    gap: 8,
  },
  matchNoticeAction: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.28)',
  },
  matchNoticeActionText: {
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '800',
  },
  matchCancelHelperText: {
    color: '#98A2B3',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: -4,
  },
  groupParticipantList: {
    gap: 8,
    marginTop: 4,
  },
  groupParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  groupParticipantRank: {
    width: 24,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  groupParticipantCopy: {
    flex: 1,
    gap: 2,
  },
  groupParticipantName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  groupParticipantMeta: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '600',
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
  mapCard: {
    gap: 14,
    backgroundColor: '#111827',
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  mapLabelWrap: {
    gap: 4,
  },
  mapKicker: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  mapLabel: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  mapWrap: {
    height: 280,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  liveMatchCard: {
    gap: 5,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
  liveMatchEyebrow: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  liveMatchTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  liveMatchText: {
    color: '#D0D5DD',
    lineHeight: 20,
  },
  groupLiveCard: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#312E81',
    backgroundColor: '#111827',
  },
  duelLiveCard: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#0F172A',
  },
  duelLiveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  duelLiveBadge: {
    borderRadius: 999,
    backgroundColor: '#172554',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  duelLiveBadgeText: {
    color: '#DBEAFE',
    fontSize: 11,
    fontWeight: '800',
  },
  matchStatusBanner: {
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  matchStatusBannerNeutral: {
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  matchStatusBannerWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.22)',
  },
  matchStatusBannerDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.22)',
  },
  matchStatusBannerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  matchStatusBannerText: {
    color: '#D0D5DD',
    fontSize: 12,
    lineHeight: 18,
  },
  matchStatusBannerAction: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  matchStatusBannerActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  groupLiveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  groupLiveHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  groupLiveTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  groupLiveSummary: {
    color: '#D0D5DD',
    lineHeight: 20,
  },
  groupLiveGapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  groupLiveGapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(129, 140, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.22)',
  },
  groupLiveGapEyebrow: {
    color: '#C7D2FE',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  groupLiveGapText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  groupLiveBadge: {
    borderRadius: 999,
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  groupLiveBadgeText: {
    color: '#E0E7FF',
    fontSize: 11,
    fontWeight: '800',
  },
  groupLiveTopList: {
    gap: 8,
  },
  groupLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  groupLiveRowCurrent: {
    borderWidth: 1,
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
  },
  groupLiveRank: {
    width: 24,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  groupLiveCopy: {
    flex: 1,
    gap: 2,
  },
  groupLiveName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  groupLiveMeta: {
    color: '#C7D2FE',
    fontSize: 12,
    lineHeight: 17,
  },
  groupLiveDistance: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  groupLiveFooter: {
    color: '#C7D2FE',
    fontSize: 12,
    lineHeight: 18,
  },
  mapEmptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  mapEmptyTitle: {
    color: '#111827',
    fontWeight: '800',
    textAlign: 'center',
  },
  mapEmptyText: {
    color: '#667085',
    textAlign: 'center',
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
  testExitCard: {
    gap: 12,
    borderWidth: 1,
    borderColor: '#E9D7FE',
    backgroundColor: '#F9F5FF',
  },
  testExitTitle: {
    color: '#42307D',
    fontSize: 16,
    fontWeight: '800',
  },
  testExitText: {
    color: '#6941C6',
    lineHeight: 20,
  },
  matchForfeitCard: {
    gap: 12,
    borderWidth: 1,
    borderColor: '#FECDCA',
    backgroundColor: '#FFF1F3',
  },
  matchForfeitTitle: {
    color: '#7A271A',
    fontSize: 16,
    fontWeight: '800',
  },
  matchForfeitText: {
    color: '#B42318',
    lineHeight: 20,
  },
  matchForfeitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: '#D92D20',
  },
  matchForfeitButtonDisabled: {
    opacity: 0.55,
  },
  matchForfeitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
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
