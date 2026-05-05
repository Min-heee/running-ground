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
import {
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
  type FriendLeaderboardResponse,
  type GroupMatchParticipant,
  type MatchDemandSummaryResponse,
  type RequestDuelMatchResponse,
  type RequestGroupMatchResponse,
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
  calculateRouteDistanceKm,
  formatDuration,
  formatPaceFromSpeedMps,
} from '@/features/runs/tracking';

type TrackerStatus = 'idle' | 'running' | 'paused' | 'saving';

const STALE_RENDER_MATCHED_MATCH_MS = 10 * 60 * 1000;
const STALE_RENDER_ACTIVE_MATCH_MS = 8 * 60 * 60 * 1000;

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
type RunMatchMode = 'solo' | 'duel' | 'group' | 'room';
type GroupLiveStanding = GroupMatchParticipant & {
  rank: number;
  currentDistanceKm: number;
  gapAheadKm: number | null;
  gapLeaderKm: number;
  isForfeited: boolean;
  isCurrentUser: boolean;
};
type MatchParticipantLiveStatus = DuelMatchOpponent['liveStatus'];
type MatchSlotOption = {
  startsAt: string;
  label: string;
  dateKey: string;
  dateLabel: string;
  weekdayLabel: string;
  isClosed: boolean;
};
type MatchDateOption = {
  key: string;
  label: string;
  subtitle: string;
};
type RoomStartMode = 'scheduled' | 'host';
const RECOMMENDED_MATCH_DISTANCES = [3, 5, 7, 10, 15, 21.1, 42.2];
const MATCH_BOOKING_WINDOW_DAYS = 7;
const MATCH_BOOKING_CUTOFF_MS = 30 * 60 * 1000;

function buildRoutePoint(location: Location.LocationObject): RunRoutePoint {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    altitude: typeof location.coords.altitude === 'number' ? Number(location.coords.altitude.toFixed(1)) : null,
    timestamp: new Date(location.timestamp).toISOString(),
  };
}

function formatMetricDistance(distanceKm: number) {
  return `${distanceKm.toFixed(2)}km`;
}

function formatElevation(elevationGainM: number) {
  return `${Math.round(elevationGainM)}m`;
}

function formatCadence(cadenceSpm: number | null) {
  return cadenceSpm ? `${cadenceSpm}spm` : '--';
}

function buildLiveShareLabelFromAddress(address?: Location.LocationGeocodedAddress | null) {
  if (!address) {
    return '현재 위치 근처';
  }

  const parts = [
    address.district,
    address.street,
    address.city,
    address.region,
    address.name,
  ].filter(Boolean);

  return parts.length ? `${parts[0]} 근처` : '현재 위치 근처';
}

function buildLiveShareFallbackLabel() {
  return '현재 위치 근처';
}

function formatMatchTargetDistance(distanceKm: number) {
  return `${Number(distanceKm.toFixed(1))}km`;
}

function clampDuelMatchDistanceKm(value: number) {
  return Math.min(42.2, Math.max(2, Number(value.toFixed(1))));
}

function parseDuelMatchDistanceKm(value: string) {
  const parsedValue = Number(String(value).replace(',', '.'));

  if (!Number.isFinite(parsedValue)) {
    return 5;
  }

  return clampDuelMatchDistanceKm(parsedValue);
}

function isRecommendedMatchDistance(distanceKm: number) {
  return RECOMMENDED_MATCH_DISTANCES.some((recommendedDistanceKm) => Math.abs(recommendedDistanceKm - distanceKm) < 0.15);
}

function findNearestRecommendedDistance(distanceKm: number) {
  return RECOMMENDED_MATCH_DISTANCES.reduce((closestDistanceKm, candidateDistanceKm) => (
    Math.abs(candidateDistanceKm - distanceKm) < Math.abs(closestDistanceKm - distanceKm)
      ? candidateDistanceKm
      : closestDistanceKm
  ));
}

function formatMatchDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type MatchTimeSection = 'am' | 'pm';

function resolveMatchTimeSection(slotStartAt: string): MatchTimeSection {
  const slotDate = new Date(slotStartAt);
  const hour = Number.isNaN(slotDate.getTime()) ? 0 : slotDate.getHours();
  return hour < 12 ? 'am' : 'pm';
}

function isMatchSlotClosed(slotStartAt: string, now = new Date()) {
  const slotStartAtMs = new Date(slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return true;
  }

  return slotStartAtMs - MATCH_BOOKING_CUTOFF_MS <= now.getTime();
}

function buildWeeklyHourlySlots(referenceDate = new Date()): MatchSlotOption[] {
  const baseDate = new Date(referenceDate);
  baseDate.setMinutes(0, 0, 0);
  const maxSelectableAtMs = referenceDate.getTime() + MATCH_BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return Array.from({ length: MATCH_BOOKING_WINDOW_DAYS + 1 }, (_, dayOffset) => {
    const currentDate = new Date(baseDate);
    currentDate.setDate(baseDate.getDate() + dayOffset);
    currentDate.setHours(0, 0, 0, 0);

    return Array.from({ length: 24 }, (_, hour) => {
      const slotStart = new Date(currentDate);
      slotStart.setHours(hour, 0, 0, 0);
      const startsAt = slotStart.toISOString();
      return {
        startsAt,
        label: `${String(hour).padStart(2, '0')}:00`,
        dateKey: formatMatchDateKey(slotStart),
        dateLabel: slotStart.toLocaleDateString('ko-KR', {
          month: 'numeric',
          day: 'numeric',
        }),
        weekdayLabel: slotStart.toLocaleDateString('ko-KR', {
          weekday: 'short',
        }),
        isClosed: isMatchSlotClosed(startsAt, referenceDate),
      };
    });
  })
    .flat()
    .filter((slot) => new Date(slot.startsAt).getTime() <= maxSelectableAtMs);
}

function buildMatchDateOptions(slotOptions: MatchSlotOption[]): MatchDateOption[] {
  const seen = new Set<string>();
  return slotOptions.filter((slot) => {
    if (seen.has(slot.dateKey)) {
      return false;
    }
    seen.add(slot.dateKey);
    return true;
  }).map((slot) => ({
    key: slot.dateKey,
    label: slot.dateLabel,
    subtitle: slot.weekdayLabel,
  }));
}

function formatMatchExpiryCountdown(seconds?: number | null) {
  if (typeof seconds !== 'number' || seconds <= 0) {
    return null;
  }

  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return `${hours}시간 ${minutes}분`;
  }

  if (seconds >= 60) {
    return `${Math.ceil(seconds / 60)}분`;
  }

  return `${seconds}초`;
}

function buildMatchSlotDateLabel(slotStartAt: string) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '날짜 미정';
  }

  return slotStart.toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
}

function getEstimatedMatchBonusPoints(matchResult?: RunMatchResult) {
  if (!matchResult) {
    return 0;
  }

  if (matchResult.mode === 'duel') {
    if (matchResult.resultTone === 'win') {
      return 20;
    }

    if (matchResult.resultTone === 'draw') {
      return 15;
    }

    if (matchResult.resultTone === 'lose') {
      return 10;
    }

    return 0;
  }

  if (matchResult.mode === 'group') {
    if (matchResult.rank === 1) {
      return 25;
    }

    if (matchResult.rank === 2) {
      return 20;
    }

    if (matchResult.rank === 3) {
      return 15;
    }

    if (typeof matchResult.rank === 'number' && matchResult.rank >= 4) {
      return 10;
    }
  }

  return 0;
}

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

function parsePaceSecondsPerKm(paceLabel: string) {
  const matched = String(paceLabel).trim().match(/^(\d{1,2}):(\d{2})\/km$/i);

  if (!matched) {
    return 5 * 60 + 30;
  }

  return Number(matched[1]) * 60 + Number(matched[2]);
}

function normalizeMatchProgressPace(paceLabel: string, fallbackPaceLabel?: string) {
  const matched = String(paceLabel).trim().match(/^\d{1,2}:\d{2}\/km$/i);

  if (matched) {
    return paceLabel;
  }

  const fallbackMatched = String(fallbackPaceLabel ?? '').trim().match(/^\d{1,2}:\d{2}\/km$/i);
  if (fallbackMatched) {
    return fallbackPaceLabel!;
  }

  return '06:00/km';
}

function buildSeedRankPaceAdjustment(seedRank: number) {
  return 1 - Math.max(-0.08, Math.min(0.08, (6 - seedRank) * 0.012));
}

function buildEstimatedCompetitiveDistanceKm(paceLabel: string, elapsedSeconds: number, seedRank?: number) {
  if (elapsedSeconds <= 0) {
    return 0;
  }

  const paceSecondsPerKm = parsePaceSecondsPerKm(paceLabel);
  const paceAdjustment = typeof seedRank === 'number' ? buildSeedRankPaceAdjustment(seedRank) : 1;
  const estimatedDistanceKm = elapsedSeconds / Math.max(1, paceSecondsPerKm * paceAdjustment);

  return Number(Math.max(0, estimatedDistanceKm).toFixed(2));
}

function buildGroupLiveStandings(
  participants: GroupMatchParticipant[],
  mySeedRank: number | undefined,
  currentDistanceKm: number,
  elapsedSeconds: number,
): GroupLiveStanding[] {
  if (!participants.length) {
    return [];
  }

  const currentSeedRank = mySeedRank ?? 1;
  const standings = participants
    .map((participant) => {
      const isCurrentUser = participant.seedRank === currentSeedRank;
      const isForfeited = participant.liveStatus === 'forfeited';
      const estimatedDistanceKm = isCurrentUser
        ? currentDistanceKm
        : typeof participant.liveDistanceKm === 'number'
          ? participant.liveDistanceKm
          : buildEstimatedCompetitiveDistanceKm(participant.averagePace, elapsedSeconds, participant.seedRank);

      return {
        ...participant,
        currentDistanceKm: estimatedDistanceKm,
        isForfeited,
        rank: 0,
        gapAheadKm: null,
        gapLeaderKm: 0,
        isCurrentUser,
      };
    })
    .sort((left, right) => {
      if (left.isForfeited !== right.isForfeited) {
        return left.isForfeited ? 1 : -1;
      }

      if (right.currentDistanceKm !== left.currentDistanceKm) {
        return right.currentDistanceKm - left.currentDistanceKm;
      }

      return parsePaceSecondsPerKm(left.averagePace) - parsePaceSecondsPerKm(right.averagePace);
    })
    .map((participant, index, array) => {
      const leaderDistance = array[0]?.currentDistanceKm ?? participant.currentDistanceKm;
      const aheadRunner = index > 0 ? array[index - 1] : null;

      return {
        ...participant,
        rank: index + 1,
        gapLeaderKm: Number(Math.max(0, leaderDistance - participant.currentDistanceKm).toFixed(2)),
        gapAheadKm: aheadRunner ? Number(Math.max(0, aheadRunner.currentDistanceKm - participant.currentDistanceKm).toFixed(2)) : null,
      };
    });

  return standings;
}

export function TrackRunExperience({
  mode,
  focusMatchMode,
  focusMatchDistanceKm,
  focusMatchSlotStartAt,
  focusMatchIsTest,
  focusMatchNonce,
  forceMatchArena,
  roomInviteToken,
}: {
  mode: TrackRunMode;
  focusMatchMode?: Extract<RunMatchMode, 'duel' | 'group'>;
  focusMatchDistanceKm?: number;
  focusMatchSlotStartAt?: string;
  focusMatchIsTest?: boolean;
  focusMatchNonce?: string;
  forceMatchArena?: boolean;
  roomInviteToken?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const pedometerSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livePagerRef = useRef<ScrollView | null>(null);
  const routeRef = useRef<RunRoutePoint[]>([]);
  const elapsedSecondsRef = useRef(0);
  const totalStepsRef = useRef(0);
  const pedometerStepOffsetRef = useRef(0);
  const liveShareEnabledRef = useRef(false);
  const liveShareLabelRef = useRef<string | null>(null);
  const liveShareHeartbeatRef = useRef(0);
  const matchProgressHeartbeatRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const trackerStatusRef = useRef<TrackerStatus>('idle');
  const matchModeRef = useRef<RunMatchMode>('duel');
  const duelMatchStatusRef = useRef<RunningMatchStatusResponse | null>(null);
  const groupMatchStatusRef = useRef<RunningMatchStatusResponse | null>(null);
  const pushRunningMatchProgressRef = useRef<((input: UpdateRunningMatchProgressInput) => Promise<RunningMatchStatusResponse>) | null>(null);

  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [route, setRoute] = useState<RunRoutePoint[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentPace, setCurrentPace] = useState('--:--/km');
  const [elevationGainM, setElevationGainM] = useState(0);
  const [cadenceSpm, setCadenceSpm] = useState<number | null>(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean | null>(null);
  const [backgroundLocationPermissionGranted, setBackgroundLocationPermissionGranted] = useState<boolean | null>(null);
  const [motionPermissionGranted, setMotionPermissionGranted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveShareEnabled, setLiveShareEnabled] = useState(false);
  const [liveShareLabel, setLiveShareLabel] = useState<string | null>(null);
  const [matchMode, setMatchMode] = useState<RunMatchMode>('duel');
  const initialMatchSlotOptions = buildWeeklyHourlySlots();
  const initialMatchSlot = initialMatchSlotOptions.find((slot) => !slot.isClosed) ?? initialMatchSlotOptions[0];
  const [duelDistanceText, setDuelDistanceText] = useState('5');
  const [showDuelCustomDistanceInput, setShowDuelCustomDistanceInput] = useState(false);
  const [selectedDuelSlotStartAt, setSelectedDuelSlotStartAt] = useState(() => initialMatchSlot?.startsAt ?? new Date().toISOString());
  const [selectedDuelDateKey, setSelectedDuelDateKey] = useState(() => initialMatchSlot?.dateKey ?? formatMatchDateKey(new Date()));
  const [selectedDuelTimeSection, setSelectedDuelTimeSection] = useState<MatchTimeSection>(() => (
    resolveMatchTimeSection(initialMatchSlot?.startsAt ?? new Date().toISOString())
  ));
  const [isRequestingDuelMatch, setIsRequestingDuelMatch] = useState(false);
  const [duelMatchResult, setDuelMatchResult] = useState<RequestDuelMatchResponse | null>(null);
  const [duelMatchStatus, setDuelMatchStatus] = useState<RunningMatchStatusResponse | null>(null);
  const [isCancelingDuelMatch, setIsCancelingDuelMatch] = useState(false);
  const [isLeavingDuelMatch, setIsLeavingDuelMatch] = useState(false);
  const [duelDemandSummary, setDuelDemandSummary] = useState<MatchDemandSummaryResponse | null>(null);
  const [isLoadingDuelDemandSummary, setIsLoadingDuelDemandSummary] = useState(false);
  const [duelMatchNotice, setDuelMatchNotice] = useState<string | null>(null);
  const [groupDistanceText, setGroupDistanceText] = useState('5');
  const [showGroupCustomDistanceInput, setShowGroupCustomDistanceInput] = useState(false);
  const [selectedGroupSlotStartAt, setSelectedGroupSlotStartAt] = useState(() => initialMatchSlot?.startsAt ?? new Date().toISOString());
  const [selectedGroupDateKey, setSelectedGroupDateKey] = useState(() => initialMatchSlot?.dateKey ?? formatMatchDateKey(new Date()));
  const [selectedGroupTimeSection, setSelectedGroupTimeSection] = useState<MatchTimeSection>(() => (
    resolveMatchTimeSection(initialMatchSlot?.startsAt ?? new Date().toISOString())
  ));
  const [isRequestingGroupMatch, setIsRequestingGroupMatch] = useState(false);
  const [groupMatchResult, setGroupMatchResult] = useState<RequestGroupMatchResponse | null>(null);
  const [groupMatchStatus, setGroupMatchStatus] = useState<RunningMatchStatusResponse | null>(null);
  const [isCancelingGroupMatch, setIsCancelingGroupMatch] = useState(false);
  const [isLeavingGroupMatch, setIsLeavingGroupMatch] = useState(false);
  const [groupDemandSummary, setGroupDemandSummary] = useState<MatchDemandSummaryResponse | null>(null);
  const [isLoadingGroupDemandSummary, setIsLoadingGroupDemandSummary] = useState(false);
  const [groupMatchNotice, setGroupMatchNotice] = useState<string | null>(null);
  const [matchRoom, setMatchRoom] = useState<RunningMatchRoom | null>(null);
  const [roomMatchMode, setRoomMatchMode] = useState<'duel' | 'group'>('duel');
  const [roomStartMode, setRoomStartMode] = useState<RoomStartMode>('host');
  const [roomMaxParticipants, setRoomMaxParticipants] = useState('10');
  const [roomInviteTokenInput, setRoomInviteTokenInput] = useState('');
  const [selectedRoomFriendIds, setSelectedRoomFriendIds] = useState<string[]>([]);
  const [friendLeaderboard, setFriendLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [isLoadingMatchRoom, setIsLoadingMatchRoom] = useState(false);
  const [isCreatingMatchRoom, setIsCreatingMatchRoom] = useState(false);
  const [isJoiningMatchRoom, setIsJoiningMatchRoom] = useState(false);
  const [isUpdatingMatchRoom, setIsUpdatingMatchRoom] = useState(false);
  const [isStartingMatchRoom, setIsStartingMatchRoom] = useState(false);
  const [isLeavingMatchRoom, setIsLeavingMatchRoom] = useState(false);
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingRunningMatchItem[]>([]);
  const [matchRemindersEnabled, setMatchRemindersEnabled] = useState(true);
  const [cancelingUpcomingMatchId, setCancelingUpcomingMatchId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [liveArenaPage, setLiveArenaPage] = useState(0);
  const [forceOpenActiveMatch, setForceOpenActiveMatch] = useState(false);
  const [isResolvingFocusedMatch, setIsResolvingFocusedMatch] = useState(false);
  const serverClockOffsetMsRef = useRef(0);
  const countdownAutoOpenMatchIdRef = useRef<string | null>(null);
  const activeAutoOpenMatchIdRef = useRef<string | null>(null);
  const autoStartedMatchIdRef = useRef<string | null>(null);
  const preStartWarmupMatchIdRef = useRef<string | null>(null);
  const handledRoomInviteTokenRef = useRef<string | null>(null);
  const officialStartBaselineRef = useRef<{
    matchId: string;
    distanceKm: number;
    elapsedSeconds: number;
    routeStartIndex: number;
    startedAt: string;
  } | null>(null);

  const averagePace = useMemo(() => buildAveragePace(distanceKm, elapsedSeconds), [distanceKm, elapsedSeconds]);
  const syncedNowMs = nowMs + serverClockOffsetMs;

  const syncServerClock = (serverNow?: string) => {
    if (!serverNow) {
      return;
    }

    const serverNowMs = new Date(serverNow).getTime();
    if (!Number.isFinite(serverNowMs)) {
      return;
    }

    setServerClockOffsetMs(serverNowMs - Date.now());
  };

  const getSyncedNowMs = () => Date.now() + serverClockOffsetMsRef.current;
  const duelDistanceKm = useMemo(() => parseDuelMatchDistanceKm(duelDistanceText), [duelDistanceText]);
  const groupDistanceKm = useMemo(() => parseDuelMatchDistanceKm(groupDistanceText), [groupDistanceText]);
  const weeklyMatchSlotOptions = buildWeeklyHourlySlots();
  const duelSlotOptions = weeklyMatchSlotOptions;
  const duelDateOptions = useMemo(() => buildMatchDateOptions(duelSlotOptions), [duelSlotOptions]);
  const selectedDuelSlot = duelSlotOptions.find((slot) => slot.startsAt === selectedDuelSlotStartAt) ?? duelSlotOptions[0] ?? null;
  const visibleDuelSlotOptions = useMemo(
    () => duelSlotOptions.filter((slot) => (
      slot.dateKey === selectedDuelDateKey &&
      resolveMatchTimeSection(slot.startsAt) === selectedDuelTimeSection
    )),
    [duelSlotOptions, selectedDuelDateKey, selectedDuelTimeSection],
  );
  const activeDuelSlotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt;
  const groupSlotOptions = weeklyMatchSlotOptions;
  const groupDateOptions = useMemo(() => buildMatchDateOptions(groupSlotOptions), [groupSlotOptions]);
  const selectedGroupSlot = groupSlotOptions.find((slot) => slot.startsAt === selectedGroupSlotStartAt) ?? groupSlotOptions[0] ?? null;
  const visibleGroupSlotOptions = useMemo(
    () => groupSlotOptions.filter((slot) => (
      slot.dateKey === selectedGroupDateKey &&
      resolveMatchTimeSection(slot.startsAt) === selectedGroupTimeSection
    )),
    [groupSlotOptions, selectedGroupDateKey, selectedGroupTimeSection],
  );
  const activeGroupSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;

  useEffect(() => {
    serverClockOffsetMsRef.current = serverClockOffsetMs;
  }, [serverClockOffsetMs]);

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

  const visibleMatchRoom = useMemo(() => {
    if (!matchRoom) {
      return null;
    }

    const referenceStartAt = matchRoom.linkedMatchSlotStartAt ?? matchRoom.slotStartAt;
    const referenceStartMs = new Date(referenceStartAt).getTime();

    if (!Number.isFinite(referenceStartMs)) {
      return matchRoom;
    }

    const elapsedMs = syncedNowMs - referenceStartMs;
  const shouldHideRoom = matchRoom.linkedMatchId || matchRoom.state === 'countdown'
    ? elapsedMs > STALE_RENDER_MATCHED_MATCH_MS
    : elapsedMs > STALE_RENDER_MATCHED_MATCH_MS;

    return shouldHideRoom ? null : matchRoom;
  }, [matchRoom, syncedNowMs]);

  useEffect(() => {
    if (matchRoom && !visibleMatchRoom) {
      setMatchRoom(null);
    }
  }, [matchRoom, visibleMatchRoom]);

  const selectNextDuelSlotForDate = (dateKey: string, preferredSection = selectedDuelTimeSection) => {
    const nextSlot = duelSlotOptions.find((slot) => (
      slot.dateKey === dateKey &&
      resolveMatchTimeSection(slot.startsAt) === preferredSection &&
      !slot.isClosed
    ))
      ?? duelSlotOptions.find((slot) => (
        slot.dateKey === dateKey &&
        resolveMatchTimeSection(slot.startsAt) === preferredSection
      ))
      ?? duelSlotOptions.find((slot) => slot.dateKey === dateKey && !slot.isClosed)
      ?? duelSlotOptions.find((slot) => slot.dateKey === dateKey)
      ?? null;

    if (nextSlot) {
      setSelectedDuelSlotStartAt(nextSlot.startsAt);
      setSelectedDuelTimeSection(resolveMatchTimeSection(nextSlot.startsAt));
    }
  };
  const selectNextGroupSlotForDate = (dateKey: string, preferredSection = selectedGroupTimeSection) => {
    const nextSlot = groupSlotOptions.find((slot) => (
      slot.dateKey === dateKey &&
      resolveMatchTimeSection(slot.startsAt) === preferredSection &&
      !slot.isClosed
    ))
      ?? groupSlotOptions.find((slot) => (
        slot.dateKey === dateKey &&
        resolveMatchTimeSection(slot.startsAt) === preferredSection
      ))
      ?? groupSlotOptions.find((slot) => slot.dateKey === dateKey && !slot.isClosed)
      ?? groupSlotOptions.find((slot) => slot.dateKey === dateKey)
      ?? null;

    if (nextSlot) {
      setSelectedGroupSlotStartAt(nextSlot.startsAt);
      setSelectedGroupTimeSection(resolveMatchTimeSection(nextSlot.startsAt));
    }
  };
  const selectDuelTimeSection = (section: MatchTimeSection) => {
    setSelectedDuelTimeSection(section);
    const nextSlot = duelSlotOptions.find((slot) => (
      slot.dateKey === selectedDuelDateKey &&
      resolveMatchTimeSection(slot.startsAt) === section &&
      !slot.isClosed
    ))
      ?? duelSlotOptions.find((slot) => (
        slot.dateKey === selectedDuelDateKey &&
        resolveMatchTimeSection(slot.startsAt) === section
      ))
      ?? null;

    if (nextSlot) {
      setSelectedDuelSlotStartAt(nextSlot.startsAt);
    }
  };
  const selectGroupTimeSection = (section: MatchTimeSection) => {
    setSelectedGroupTimeSection(section);
    const nextSlot = groupSlotOptions.find((slot) => (
      slot.dateKey === selectedGroupDateKey &&
      resolveMatchTimeSection(slot.startsAt) === section &&
      !slot.isClosed
    ))
      ?? groupSlotOptions.find((slot) => (
        slot.dateKey === selectedGroupDateKey &&
        resolveMatchTimeSection(slot.startsAt) === section
      ))
      ?? null;

    if (nextSlot) {
      setSelectedGroupSlotStartAt(nextSlot.startsAt);
    }
  };
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

  useEffect(() => {
    if (selectedDuelSlot) {
      setSelectedDuelDateKey(selectedDuelSlot.dateKey);
    }
  }, [selectedDuelSlot]);

  useEffect(() => {
    if (selectedGroupSlot) {
      setSelectedGroupDateKey(selectedGroupSlot.dateKey);
    }
  }, [selectedGroupSlot]);
  const selectedMatch = matchOptions.find((option) => option.mode === matchMode) ?? matchOptions[0];
  const duelMatchState = duelMatchStatus?.state ?? 'idle';
  const groupMatchState = groupMatchStatus?.state ?? 'idle';
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
  const focusRequestedDuelTest = focusMatchMode === 'duel' && focusMatchIsTest === true;
  const focusRequestedGroupTest = focusMatchMode === 'group' && focusMatchIsTest === true;
  const isDuelTestFlow = Boolean(
    duelMatchStatus?.isTestMatch
    || duelMatchResult?.isTestMatch
    || (focusRequestedDuelTest && matchMode === 'duel'),
  );
  const isGroupTestFlow = Boolean(
    groupMatchStatus?.isTestMatch
    || groupMatchResult?.isTestMatch
    || (focusRequestedGroupTest && matchMode === 'group'),
  );
  const effectiveDuelOpponent = duelMatchStatus?.opponent ?? duelMatchResult?.opponent ?? null;
  const effectiveDuelOpponentStatusLabel = effectiveDuelOpponent
    ? buildMatchParticipantStatusLabel(effectiveDuelOpponent.liveStatus)
    : null;
  const effectiveDuelSlotLabel = duelMatchStatus?.slotLabel ?? duelMatchResult?.slotLabel ?? selectedDuelSlot?.label ?? '시간 미정';
  const duelStartCountdownSeconds =
    duelMatchState === 'matched'
      ? getMatchStartRemainingSeconds(duelMatchStatus?.slotStartAt ?? activeDuelSlotStartAt, syncedNowMs)
      : null;
  const duelExpiryCountdownLabel = formatMatchExpiryCountdown(duelMatchStatus?.expiresInSeconds);
  const effectiveGroupParticipants = groupMatchStatus?.participants ?? groupMatchResult?.participants ?? [];
  const effectiveGroupParticipantCount = groupMatchStatus?.participantCount ?? groupMatchResult?.participantsCount ?? effectiveGroupParticipants.length;
  const effectiveGroupSeedRank = groupMatchStatus?.mySeedRank ?? groupMatchResult?.mySeedRank;
  const effectiveGroupSlotLabel = groupMatchStatus?.slotLabel ?? groupMatchResult?.slotLabel ?? selectedGroupSlot?.label ?? '시간 미정';
  const groupStartCountdownSeconds =
    groupMatchState === 'matched'
      ? getMatchStartRemainingSeconds(groupMatchStatus?.slotStartAt ?? activeGroupSlotStartAt, syncedNowMs)
      : null;
  const groupExpiryCountdownLabel = formatMatchExpiryCountdown(groupMatchStatus?.expiresInSeconds);
  const duelNeedsManualRematch = Boolean(duelMatchNotice && duelMatchState === 'idle');
  const groupNeedsManualRematch = Boolean(groupMatchNotice && groupMatchState === 'idle');
  const nextStartingMatch = useMemo(
    () => findNextStartingMatchedMatch(visibleUpcomingMatches, syncedNowMs),
    [syncedNowMs, visibleUpcomingMatches],
  );
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
  const visibleCountdownEntry = nextStartingMatch
    ? {
        title: nextStartingMatch.match.mode === 'duel' ? '1대1 대결 곧 시작' : '그룹 대결 곧 시작',
        subtitle: `${nextStartingMatch.match.counterpartLabel} · ${nextStartingMatch.match.summary}`,
        remainingSeconds: nextStartingMatch.remainingSeconds,
      }
    : fallbackCountdownEntry;
  const roomParticipantsCount = visibleMatchRoom?.participants.length ?? 0;
  const roomCountdownRemainingSeconds = visibleMatchRoom?.linkedMatchSlotStartAt
    ? getMatchStartRemainingSeconds(visibleMatchRoom.linkedMatchSlotStartAt, syncedNowMs)
    : null;
  const canOpenRoomArena = Boolean(
    visibleMatchRoom?.linkedMatchSlotStartAt
    && (
      visibleMatchRoom.linkedMatchStatus === 'active'
      || shouldAutoOpenMatchArena(roomCountdownRemainingSeconds)
    ),
  );
  const roomFriendOptions = useMemo(
    () => (friendLeaderboard?.ranks ?? []).slice(0, 12),
    [friendLeaderboard],
  );
  const effectiveRoomMode = matchRoom?.mode ?? roomMatchMode;
  const roomDateOptions = effectiveRoomMode === 'group' ? groupDateOptions : duelDateOptions;
  const selectedRoomDateKey = effectiveRoomMode === 'group' ? selectedGroupDateKey : selectedDuelDateKey;
  const selectedRoomTimeSection = effectiveRoomMode === 'group' ? selectedGroupTimeSection : selectedDuelTimeSection;
  const roomVisibleSlotOptions = effectiveRoomMode === 'group' ? visibleGroupSlotOptions : visibleDuelSlotOptions;
  const activeRoomSlotStartAt = effectiveRoomMode === 'group' ? activeGroupSlotStartAt : activeDuelSlotStartAt;
  const activeRoomDistanceKm = effectiveRoomMode === 'group' ? groupDistanceKm : duelDistanceKm;
  const groupLiveStandings = useMemo(
    () => buildGroupLiveStandings(effectiveGroupParticipants, effectiveGroupSeedRank, distanceKm, elapsedSeconds),
    [distanceKm, elapsedSeconds, effectiveGroupParticipants, effectiveGroupSeedRank],
  );
  const currentGroupStanding = groupLiveStandings.find((participant) => participant.isCurrentUser) ?? null;
  const currentGroupLeader = groupLiveStandings[0] ?? null;
  const groupAheadParticipant = currentGroupStanding
    ? groupLiveStandings.find((participant) => participant.rank === currentGroupStanding.rank - 1) ?? null
    : null;
  const groupBehindParticipant = currentGroupStanding
    ? groupLiveStandings.find((participant) => participant.rank === currentGroupStanding.rank + 1) ?? null
    : null;
  const featuredGroupArenaParticipantIds = useMemo(() => {
    const ids = new Set<string>();
    groupLiveStandings.slice(0, 3).forEach((participant) => ids.add(participant.id));
    if (currentGroupStanding) {
      ids.add(currentGroupStanding.id);
    }
    if (groupAheadParticipant) {
      ids.add(groupAheadParticipant.id);
    }
    if (groupBehindParticipant) {
      ids.add(groupBehindParticipant.id);
    }
    return ids;
  }, [currentGroupStanding, groupAheadParticipant, groupBehindParticipant, groupLiveStandings]);
  const duelLiveGapKm = useMemo(() => {
    if (!effectiveDuelOpponent || typeof effectiveDuelOpponent.liveDistanceKm !== 'number') {
      return null;
    }

    return Number((distanceKm - effectiveDuelOpponent.liveDistanceKm).toFixed(2));
  }, [distanceKm, effectiveDuelOpponent]);
  const duelLiveTitle = duelLiveGapKm === null
    ? '거리 동기화 중'
    : duelLiveGapKm >= 0
      ? `${duelLiveGapKm.toFixed(2)}km 앞서고 있어요`
      : `${Math.abs(duelLiveGapKm).toFixed(2)}km 따라가는 중이에요`;
  const duelLiveSummary = effectiveDuelOpponent
    ? `${effectiveDuelOpponent.name}님 · ${effectiveDuelOpponent.averagePace}${effectiveDuelOpponentStatusLabel ? ` · ${effectiveDuelOpponentStatusLabel}` : ''}`
    : '상대 러너 정보를 불러오는 중이에요.';
  const duelStatusAlert = useMemo(() => {
    if (!effectiveDuelOpponent?.liveStatus || ['running', 'finished'].includes(effectiveDuelOpponent.liveStatus)) {
      return null;
    }

    if (effectiveDuelOpponent.liveStatus === 'forfeited') {
      return {
        tone: 'danger' as const,
        title: '상대가 매치를 포기했어요',
        summary: '이제 혼자 이어서 달리거나 바로 결과를 정리할 수 있어요.',
      };
    }

    if (effectiveDuelOpponent.liveStatus === 'disconnected') {
      return {
        tone: 'danger' as const,
        title: '상대 연결이 끊겼어요',
        summary: '잠시 뒤 자동 정리되거나 다시 찾기 흐름으로 넘어갈 수 있어요.',
      };
    }

    if (effectiveDuelOpponent.liveStatus === 'background') {
      return {
        tone: 'warning' as const,
        title: '상대가 백그라운드 상태예요',
        summary: '앱으로 돌아오면 진행 상태가 다시 이어서 반영돼요.',
      };
    }

    if (effectiveDuelOpponent.liveStatus === 'paused') {
      return {
        tone: 'warning' as const,
        title: '상대가 잠시 멈췄어요',
        summary: '다시 움직이기 시작하면 거리 차이도 이어서 갱신돼요.',
      };
    }

    return {
      tone: 'neutral' as const,
      title: '상대 상태를 다시 확인 중이에요',
      summary: '곧 최신 상태로 반영될 거예요.',
    };
  }, [effectiveDuelOpponent?.liveStatus]);
  const groupStatusAlert = useMemo(() => {
    const others = groupLiveStandings.filter((participant) => !participant.isCurrentUser);
    const forfeitedCount = others.filter((participant) => participant.liveStatus === 'forfeited').length;
    const disconnectedCount = others.filter((participant) => participant.liveStatus === 'disconnected').length;
    const backgroundCount = others.filter((participant) => participant.liveStatus === 'background').length;
    const pausedCount = others.filter((participant) => participant.liveStatus === 'paused').length;

    if (!forfeitedCount && !disconnectedCount && !backgroundCount && !pausedCount) {
      return null;
    }

    if (forfeitedCount > 0 || disconnectedCount > 0) {
      const titleParts = [];
      if (forfeitedCount > 0) {
        titleParts.push(`포기 ${forfeitedCount}명`);
      }
      if (disconnectedCount > 0) {
        titleParts.push(`연결 끊김 ${disconnectedCount}명`);
      }
      return {
        tone: 'danger' as const,
        title: titleParts.join(' · '),
        summary: forfeitedCount > 0
          ? '남은 러너 기준으로 순위가 다시 정리되고 있어요.'
          : '잠시 뒤 자동 정리되거나 순위 구성이 다시 달라질 수 있어요.',
      };
    }

    return {
      tone: 'warning' as const,
      title: `백그라운드 ${backgroundCount}명 · 일시정지 ${pausedCount}명`,
      summary: '앱으로 돌아오거나 다시 달리면 실시간 순위가 계속 갱신돼요.',
    };
  }, [groupLiveStandings]);
  const duelFinishSummary = useMemo(() => {
    if (!effectiveDuelOpponent) {
      return null;
    }

    const opponentDistanceKm = typeof effectiveDuelOpponent.liveDistanceKm === 'number'
      ? effectiveDuelOpponent.liveDistanceKm
      : buildEstimatedCompetitiveDistanceKm(effectiveDuelOpponent.averagePace, elapsedSeconds, 2);
    const gapKm = Number(Math.abs(distanceKm - opponentDistanceKm).toFixed(2));
    const isDraw = gapKm < 0.03;
    const resultTone: RunMatchResult['resultTone'] = isDraw ? 'draw' : distanceKm > opponentDistanceKm ? 'win' : 'lose';
    const title = isDraw
      ? `${effectiveDuelOpponent.name}님과 비슷한 흐름으로 마쳤어요`
      : resultTone === 'win'
        ? `${effectiveDuelOpponent.name}님을 이겼어요`
        : `${effectiveDuelOpponent.name}님에게 졌어요`;
    const summary = isDraw
      ? `두 러너 차이가 ${gapKm.toFixed(2)}km 안쪽으로 거의 비슷했어요.`
      : resultTone === 'win'
        ? `${gapKm.toFixed(2)}km 차이로 앞서 마무리했어요.`
        : `${gapKm.toFixed(2)}km 차이로 뒤에서 마무리했어요.`;
    const badgeLabel = isDraw ? '무승부' : resultTone === 'win' ? '승리' : '패배';

    return {
      title,
      summary,
      resultTone,
      badgeLabel,
      opponentDistanceKm,
      gapKm,
    };
  }, [distanceKm, effectiveDuelOpponent, elapsedSeconds]);
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
  const isPaused = status === 'paused';
  const isSaving = status === 'saving';
  const isIdle = status === 'idle';
  const isTabMode = mode === 'tab';
  const hasMatchResultPage = isPaused && matchMode !== 'solo' && Boolean(trackedMatchResult);
  const liveArenaPageWidth = Math.max(windowWidth - 32, 280);
  const currentUserLivePace = currentPace !== '--:--/km' ? currentPace : averagePace;
  const duelArenaParticipants = useMemo(
    () => (effectiveDuelOpponent
      ? [
          {
            id: 'me',
            name: '나',
            paceLabel: currentUserLivePace,
            distanceKm,
            isCurrentUser: true,
            isLeader: duelLiveGapKm !== null ? duelLiveGapKm >= 0 : false,
            showPaceBubble: true,
          },
          {
            id: effectiveDuelOpponent.id,
            name: effectiveDuelOpponent.name,
            paceLabel: effectiveDuelOpponent.livePace ?? effectiveDuelOpponent.averagePace,
            distanceKm: effectiveDuelOpponent.liveDistanceKm ?? 0,
            isLeader: duelLiveGapKm !== null ? duelLiveGapKm < 0 : true,
            showPaceBubble: true,
          },
        ]
      : []),
    [currentUserLivePace, distanceKm, duelLiveGapKm, effectiveDuelOpponent],
  );
  const groupArenaParticipants = useMemo(
    () =>
      groupLiveStandings.map((participant) => ({
        id: participant.id,
        name: participant.isCurrentUser ? '나' : participant.name,
        paceLabel: participant.livePace ?? participant.averagePace,
        distanceKm: participant.currentDistanceKm,
        rankLabel: String(participant.rank),
        isCurrentUser: participant.isCurrentUser,
        isLeader: participant.rank === 1,
        showPaceBubble: true,
        emphasis: featuredGroupArenaParticipantIds.has(participant.id) ? ('featured' as const) : ('compact' as const),
      })),
    [featuredGroupArenaParticipantIds, groupLiveStandings],
  );
  const duelShouldOpenCountdownArena = duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds);
  const groupShouldOpenCountdownArena = groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds);
  const duelShouldHoldArenaDuringActivation = duelMatchState === 'matched' && forceOpenActiveMatch;
  const groupShouldHoldArenaDuringActivation = groupMatchState === 'matched' && forceOpenActiveMatch;
  const canRenderLiveArena =
    (matchMode === 'duel'
      && ['matched', 'active'].includes(duelMatchState)
      && duelArenaParticipants.length === 2
      && (duelMatchState === 'active' || duelShouldOpenCountdownArena || duelShouldHoldArenaDuringActivation))
    || (matchMode === 'group'
      && ['matched', 'active'].includes(groupMatchState)
      && groupArenaParticipants.length > 0
      && (groupMatchState === 'active' || groupShouldOpenCountdownArena || groupShouldHoldArenaDuringActivation));
  const showLiveArena =
    canRenderLiveArena
    && (
      isRunning
      || hasMatchResultPage
      || forceOpenActiveMatch
      || (status === 'idle' && (
        duelShouldOpenCountdownArena
        || groupShouldOpenCountdownArena
        || (matchMode === 'duel' && isDuelTestFlow)
        || (matchMode === 'group' && isGroupTestFlow)
      ))
    );
  const testMatchExitSource =
    matchMode === 'duel'
      ? (isDuelTestFlow && ['matched', 'active'].includes(duelMatchState) ? 'duel' : null)
      : matchMode === 'group'
        ? (isGroupTestFlow && ['matched', 'active'].includes(groupMatchState) ? 'group' : null)
        : null;
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
    const opponentPace = effectiveDuelOpponent.livePace ?? effectiveDuelOpponent.averagePace;

    if (isDraw) {
      return [
        {
          id: 'me',
          resultLabel: 'DRAW',
          name: '나',
          paceLabel: currentUserLivePace,
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
        paceLabel: meWon ? currentUserLivePace : opponentPace,
        durationLabel: formatDuration(meWon ? elapsedSeconds : opponentElapsedSeconds),
        distanceKm: meWon ? distanceKm : opponentDistanceKm,
        isCurrentUser: meWon,
      },
      {
        id: meWon ? effectiveDuelOpponent.id : 'me',
        resultLabel: 'LOSER',
        name: meWon ? effectiveDuelOpponent.name : '나',
        paceLabel: meWon ? opponentPace : currentUserLivePace,
        durationLabel: formatDuration(meWon ? opponentElapsedSeconds : elapsedSeconds),
        distanceKm: meWon ? opponentDistanceKm : distanceKm,
        isCurrentUser: !meWon,
      },
    ];
  }, [
    averagePace,
    currentUserLivePace,
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
      paceLabel: participant.livePace ?? participant.averagePace,
      durationLabel: formatDuration(participant.liveElapsedSeconds ?? elapsedSeconds),
      distanceKm: participant.currentDistanceKm,
      isCurrentUser: participant.isCurrentUser,
      liveStatus: participant.liveStatus,
    })),
    [elapsedSeconds, groupLiveStandings],
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
    const nextStatus = await updateRunningMatchProgress({
      ...input,
      currentPace: normalizeMatchProgressPace(input.currentPace, averagePace),
    });

    if (input.matchId === duelMatchStatus?.matchId) {
      setDuelMatchStatus(nextStatus);
    }

    if (input.matchId === groupMatchStatus?.matchId) {
      setGroupMatchStatus(nextStatus);
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
    options?: { testMode?: boolean; distanceKm?: number },
  ) => {
    const payload = await fetchRunningMatchStatus({
      mode: 'duel',
      distanceKm: options?.distanceKm ?? duelDistanceKm,
      slotStartAt,
      testMode: options?.testMode ?? isDuelTestFlow,
    });
    syncServerClock(payload.serverNow);
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
    options?: { testMode?: boolean; distanceKm?: number },
  ) => {
    const payload = await fetchRunningMatchStatus({
      mode: 'group',
      distanceKm: options?.distanceKm ?? groupDistanceKm,
      slotStartAt,
      testMode: options?.testMode ?? isGroupTestFlow,
    });
    syncServerClock(payload.serverNow);
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
    syncServerClock(payload.serverNow);
    setUpcomingMatches(payload.items);
    return payload.items;
  };

  const loadMatchRoom = async () => {
    const payload = await fetchRunningMatchRoom();
    syncServerClock(payload.serverNow);
    setMatchRoom(payload.room);
    return payload.room;
  };

  const loadFriendLeaderboardData = async () => {
    const payload = await fetchFriendLeaderboard();
    setFriendLeaderboard(payload);
    return payload;
  };

  const openRoomLinkedMatch = async (room: RunningMatchRoom) => {
    if (!room.linkedMatchSlotStartAt) {
      return null;
    }

    return focusRunningMatch({
      mode: room.mode,
      distanceKm: room.linkedMatchDistanceKm ?? room.distanceKm,
      slotStartAt: room.linkedMatchSlotStartAt,
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
      setMatchRoom(payload.room);
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
      setMatchRoom(payload.room);
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
      setMatchRoom(payload.room);
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
      setMatchRoom(payload.room);
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
      setMatchRoom(payload.room);
      setSelectedRoomFriendIds([]);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : '방에서 나가지 못했어.');
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
    distanceKm,
    slotStartAt,
    isTestMatch,
    preferArena = false,
  }: {
    mode: Extract<RunMatchMode, 'duel' | 'group'>;
    distanceKm?: number;
    slotStartAt?: string;
    isTestMatch?: boolean;
    preferArena?: boolean;
  }) => {
    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
    setForceOpenActiveMatch(true);
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

        const payload = await loadDuelMatchStatus(slotStartAt ?? activeDuelSlotStartAt, {
          distanceKm,
          testMode: isTestMatch,
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

      const payload = await loadGroupMatchStatus(slotStartAt ?? activeGroupSlotStartAt, {
        distanceKm,
        testMode: isTestMatch,
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
    setDuelMatchResult(null);
    setDuelMatchStatus(null);
    setDuelMatchNotice(notice ?? null);
  };

  const clearLocalGroupMatchState = (notice?: string | null) => {
    setGroupMatchResult(null);
    setGroupMatchStatus(null);
    setGroupMatchNotice(notice ?? null);
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
  }, [matchMode, duelDistanceKm, activeDuelSlotStartAt, focusRequestedDuelTest, isDuelTestFlow]);

  useEffect(() => {
    if (matchMode !== 'group') {
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
  }, [matchMode, groupDistanceKm, activeGroupSlotStartAt, focusRequestedGroupTest, isGroupTestFlow]);

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
        setMatchRoom(null);
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
    const timer = setInterval(() => {
      void loadMatchRoom().catch(() => {});
    }, 5000);

    return () => clearInterval(timer);
  }, []);

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
      distanceKm: focusMatchDistanceKm,
      slotStartAt: focusMatchSlotStartAt,
      isTestMatch: focusMatchIsTest,
      preferArena: Boolean(forceMatchArena),
    }).catch(() => {});
  }, [focusMatchDistanceKm, focusMatchIsTest, focusMatchMode, focusMatchNonce, focusMatchSlotStartAt, forceMatchArena]);

  useEffect(() => {
    if (!roomInviteToken || handledRoomInviteTokenRef.current === roomInviteToken) {
      return;
    }

    handledRoomInviteTokenRef.current = roomInviteToken;
    setRoomInviteTokenInput(roomInviteToken);
    void joinRunningMatchRoom({ inviteToken: roomInviteToken })
      .then((payload) => {
        setMatchRoom(payload.room);
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
      && !(forceOpenActiveMatch && (duelMatchState === 'matched' || groupMatchState === 'matched'))
    ) {
      setForceOpenActiveMatch(false);
    }
  }, [duelMatchState, duelShouldOpenCountdownArena, forceOpenActiveMatch, groupMatchState, groupShouldOpenCountdownArena, isResolvingFocusedMatch]);

  useEffect(() => {
    if (duelMatchState === 'active' || groupMatchState === 'active') {
      setForceOpenActiveMatch(true);
      setLiveArenaPage(0);
      livePagerRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [duelMatchState, groupMatchState]);

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
    && showLiveArena;

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
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!showLiveArena) {
      return;
    }

    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [duelMatchStatus?.matchId, groupMatchStatus?.matchId, showLiveArena]);

  useEffect(() => {
    const warmupMatchId = matchMode === 'duel'
      ? duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds)
        ? duelMatchStatus?.matchId ?? null
        : null
      : matchMode === 'group'
        ? groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds)
          ? groupMatchStatus?.matchId ?? null
          : null
        : null;

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

    autoStartedMatchIdRef.current = warmupMatchId;
    void handleStartTracking({ allowCountdownWarmup: true }).catch(() => {
      autoStartedMatchIdRef.current = null;
    });
  }, [
    duelMatchState,
    duelMatchStatus?.matchId,
    duelStartCountdownSeconds,
    groupMatchState,
    groupMatchStatus?.matchId,
    groupStartCountdownSeconds,
    matchMode,
    status,
  ]);

  useEffect(() => {
    const activeMatchId = matchMode === 'duel'
      ? duelMatchStatus?.state === 'active'
        ? duelMatchStatus.matchId
        : null
      : matchMode === 'group'
        ? groupMatchStatus?.state === 'active'
          ? groupMatchStatus.matchId
          : null
        : null;

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
      officialStartBaselineRef.current = {
        matchId: activeMatchId,
        distanceKm: currentSnapshot.distanceKm,
        elapsedSeconds: getBackgroundRunElapsedSeconds(currentSnapshot),
        routeStartIndex: Math.max(0, currentSnapshot.route.length - 1),
        startedAt: currentSnapshot.route[currentSnapshot.route.length - 1]?.timestamp ?? new Date().toISOString(),
      };
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

    autoStartedMatchIdRef.current = activeMatchId;
    void handleStartTracking().catch(() => {
      autoStartedMatchIdRef.current = null;
    });
  }, [
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    groupMatchStatus?.matchId,
    groupMatchStatus?.state,
    matchMode,
    status,
  ]);

  useEffect(() => {
    if (matchMode !== 'duel' || !duelMatchStatus || !['waiting', 'matched', 'active'].includes(duelMatchStatus.state)) {
      return;
    }

    const remainingSeconds = getMatchStartRemainingSeconds(duelMatchStatus.slotStartAt, syncedNowMs);
    const intervalMs = duelMatchStatus.state === 'active' || shouldAutoOpenMatchArena(remainingSeconds) ? 1000 : 15000;
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
    const intervalMs = groupMatchStatus.state === 'active' || shouldAutoOpenMatchArena(remainingSeconds) ? 1000 : 15000;
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
    elapsedSecondsRef.current = 0;
    totalStepsRef.current = 0;
    pedometerStepOffsetRef.current = 0;
    routeRef.current = [];
    setRoute([]);
    setDistanceKm(0);
    setElapsedSeconds(0);
    setCurrentPace('--:--/km');
    setElevationGainM(0);
    setCadenceSpm(null);
  };

  const getDisplayedTrackingSnapshot = (
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot(),
  ) => {
    const rawElapsedSeconds = getBackgroundRunElapsedSeconds(snapshot);
    const baseline = officialStartBaselineRef.current;

    if (baseline) {
      const adjustedRoute = snapshot.route.slice(Math.max(0, baseline.routeStartIndex));
      return {
        route: adjustedRoute,
        distanceKm: Math.max(0, Number((snapshot.distanceKm - baseline.distanceKm).toFixed(2))),
        elevationGainM: calculateElevationGainM(adjustedRoute),
        currentPace: snapshot.currentPace,
        elapsedSeconds: Math.max(0, rawElapsedSeconds - baseline.elapsedSeconds),
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
    return {
      distanceKm: displayedSnapshot.distanceKm,
      elapsedSeconds: displayedSnapshot.elapsedSeconds,
      currentPace: displayedSnapshot.currentPace,
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

  const ensureBackgroundLocationPermission = async () => {
    const currentBackgroundPermission = await Location.getBackgroundPermissionsAsync();
    let granted = currentBackgroundPermission.granted || currentBackgroundPermission.status === 'granted';

    if (!granted) {
      const requestedBackgroundPermission = await Location.requestBackgroundPermissionsAsync();
      granted = requestedBackgroundPermission.granted || requestedBackgroundPermission.status === 'granted';
    }

    setBackgroundLocationPermissionGranted(granted);

    if (!granted) {
      throw new Error(
        Platform.OS === 'ios'
          ? '백그라운드에서도 계속 측정하려면 설정 > RunningGround > 위치에서 `항상 허용`을 켜주세요.'
          : '백그라운드에서도 계속 측정하려면 RunningGround 위치 권한을 `항상 허용`으로 바꿔주세요.',
      );
    }
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

    const activeMatchId = matchMode === 'duel'
      ? (duelMatchState === 'active' ? duelMatchStatus?.matchId : null)
      : matchMode === 'group'
        ? (groupMatchState === 'active' ? groupMatchStatus?.matchId : null)
        : null;

    if (!activeMatchId) {
      return;
    }

    const now = Date.now();

    if (now - matchProgressHeartbeatRef.current < 5000) {
      return;
    }

    matchProgressHeartbeatRef.current = now;
    const progress = buildDisplayedMatchProgress(snapshot);
    void pushRunningMatchProgress({
      matchId: activeMatchId,
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

    if (matchMode === 'duel' && !['matched', 'active'].includes(duelMatchState)) {
      setError('1대1 매칭이 잡힌 뒤에만 시작할 수 있어요.');
      return;
    }

    if (matchMode === 'group' && !['matched', 'active'].includes(groupMatchState)) {
      setError('그룹 매칭이 잡힌 뒤에만 시작할 수 있어요.');
      return;
    }

    if (matchMode === 'duel' && duelMatchState === 'matched' && !duelMatchStatus?.readyToStart && !options?.allowCountdownWarmup) {
      setError('예약된 시작 시간이 되면 1대1 대결을 시작할 수 있어요.');
      return;
    }

    if (matchMode === 'group' && groupMatchState === 'matched' && !groupMatchStatus?.readyToStart && !options?.allowCountdownWarmup) {
      setError('예약된 시작 시간이 되면 그룹 대결을 시작할 수 있어요.');
      return;
    }

    try {
      setError(null);
      await ensureLocationPermission();
      await ensureBackgroundLocationPermission();
      resetForegroundTrackingState();
      await resetBackgroundRunTracking();

      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      setLocationPermissionGranted(true);

      if (options?.allowCountdownWarmup) {
        const warmupMatchId = matchMode === 'duel' ? duelMatchStatus?.matchId : groupMatchStatus?.matchId;
        preStartWarmupMatchIdRef.current = warmupMatchId ?? null;
        officialStartBaselineRef.current = null;
      } else {
        preStartWarmupMatchIdRef.current = null;
      }

      await startBackgroundRunTracking(initialLocation);
      syncFromBackgroundTracking();

      try {
        if (liveShareEnabledRef.current) {
          const initialLabel = await resolveLiveShareLabel({
            latitude: initialLocation.coords.latitude,
            longitude: initialLocation.coords.longitude,
          });
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

  const handleContinueSoloFromMatch = (source: 'duel' | 'group') => {
    Alert.alert(
      '혼자 계속 달릴까요?',
      '지금 매치 표시는 정리하고, 러닝 측정은 그대로 이어갈게요.',
      [
        { text: '계속 볼게요', style: 'cancel' },
        {
          text: '혼자 계속',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            const matchId = source === 'duel' ? duelMatchStatus?.matchId : groupMatchStatus?.matchId;

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
                setDuelMatchNotice('매치에서는 빠졌고, 지금 러닝은 혼자 계속 이어가요.');
              } else {
                setGroupMatchResult(null);
                setGroupMatchStatus(null);
                setGroupMatchNotice('그룹전에서는 빠졌고, 지금 러닝은 혼자 계속 이어가요.');
              }

              setMatchMode('solo');
            } catch (matchError) {
              setError(matchError instanceof Error ? matchError.message : '혼자 계속 달리기 전환에 실패했어.');
            } finally {
              if (source === 'duel') {
                setIsLeavingDuelMatch(false);
              } else {
                setIsLeavingGroupMatch(false);
              }
            }
          },
        },
      ],
    );
  };

  const handlePauseTracking = async () => {
    await pauseBackgroundRunTracking();
    stopForegroundTrackingHelpers();
    syncFromBackgroundTracking();

    const activeMatchId = matchMode === 'duel'
      ? duelMatchStatus?.matchId
      : matchMode === 'group'
        ? groupMatchStatus?.matchId
        : null;

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

      const activeMatchId = matchMode === 'duel'
        ? duelMatchStatus?.matchId
        : matchMode === 'group'
          ? groupMatchStatus?.matchId
          : null;

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

  const handleSaveTracking = async () => {
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

      const activeMatchId = matchMode === 'duel'
        ? duelMatchStatus?.matchId
        : matchMode === 'group'
          ? groupMatchStatus?.matchId
          : null;

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

      router.replace({
        pathname: '/run-detail',
        params: {
          runId: savedRun.run.id,
          origin: isTabMode ? 'running' : 'activity',
        },
      });
    } catch (saveError) {
      setStatus('paused');
      setError(saveError instanceof Error ? saveError.message : '러닝 기록 저장에 실패했어.');
    }
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
            `내 페이스 ${currentUserLivePace}`,
            `상대 페이스 ${effectiveDuelOpponent.livePace ?? effectiveDuelOpponent.averagePace}`,
            duelLiveGapKm === null
              ? '거리 동기화 중'
              : duelLiveGapKm >= 0
                ? `${duelLiveGapKm.toFixed(2)}km 앞섬`
                : `${Math.abs(duelLiveGapKm).toFixed(2)}km 뒤짐`,
          ]}
          participants={duelArenaParticipants}
          footer={
            duelLiveGapKm === null
              ? '두 러너의 위치를 맞추는 중이에요.'
              : `내 거리 ${distanceKm.toFixed(2)}km · 상대 ${typeof effectiveDuelOpponent.liveDistanceKm === 'number' ? `${effectiveDuelOpponent.liveDistanceKm.toFixed(2)}km` : '동기화 중'}`
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
            `내 페이스 ${currentUserLivePace}`,
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

    return null;
  };

  const renderLiveRaceBoardPage = () => {
    if (matchMode === 'duel' && effectiveDuelOpponent) {
      const duelRows = [
        {
          id: 'current-user',
          name: '나',
          paceLabel: currentUserLivePace,
          distanceKm,
          remainingKm: Math.max(0, duelDistanceKm - distanceKm),
          progress: duelDistanceKm > 0 ? distanceKm / duelDistanceKm : 0,
          isCurrentUser: true,
        },
        {
          id: effectiveDuelOpponent.id,
          name: effectiveDuelOpponent.name,
          paceLabel: effectiveDuelOpponent.livePace ?? effectiveDuelOpponent.averagePace,
          distanceKm: effectiveDuelOpponent.liveDistanceKm ?? 0,
          remainingKm: Math.max(0, duelDistanceKm - (effectiveDuelOpponent.liveDistanceKm ?? 0)),
          progress: duelDistanceKm > 0 ? (effectiveDuelOpponent.liveDistanceKm ?? 0) / duelDistanceKm : 0,
          isCurrentUser: false,
        },
      ]
        .sort((left, right) => right.distanceKm - left.distanceKm)
        .map((row, index) => ({
          ...row,
          rank: index + 1,
        }));

      return (
        <LiveMatchRaceBoard
          title="1대1 레이스 보드"
          subtitle="누가 더 앞서 있는지, 각자 얼마 남았는지 한눈에 볼 수 있어요."
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
            paceLabel: participant.livePace ?? participant.averagePace,
            distanceKm: participant.currentDistanceKm,
            remainingKm: Math.max(0, groupDistanceKm - participant.currentDistanceKm),
            progress: groupDistanceKm > 0 ? participant.currentDistanceKm / groupDistanceKm : 0,
            isCurrentUser: participant.isCurrentUser,
          }))}
        />
      );
    }

    return null;
  };

  const renderMatchResultPage = () => {
    if (matchMode === 'duel' && duelResultRows.length) {
      return (
        <Card style={styles.matchResultCard}>
          <View style={styles.matchResultHeader}>
            <View style={styles.matchResultHeaderCopy}>
              <Text style={styles.matchResultEyebrow}>DUEL RESULT</Text>
              <Text style={styles.matchResultTitle}>1대1 대결 결과</Text>
              <Text style={styles.matchResultSubtitle}>먼저 들어온 러너가 위에 정렬돼요.</Text>
            </View>
            <View style={styles.finishSummaryPointPill}>
              <Text style={styles.finishSummaryPointPillText}>매치 포인트 +{estimatedMatchBonusPoints}P</Text>
            </View>
          </View>
          <View style={styles.matchResultList}>
            {duelResultRows.map((row) => (
              <View
                key={row.id}
                style={[
                  styles.matchResultRow,
                  row.resultLabel === 'WIN'
                    ? styles.matchResultRowWin
                    : row.resultLabel === 'LOSER'
                      ? styles.matchResultRowLose
                      : styles.matchResultRowDraw,
                ]}
              >
                <View style={styles.matchResultLabelColumn}>
                  <Text style={styles.matchResultLabel}>{row.resultLabel}</Text>
                </View>
                <View style={styles.matchResultCopy}>
                  <Text style={styles.matchResultName}>
                    {row.name}
                    {row.isCurrentUser ? ' (나)' : ''}
                  </Text>
                  <Text style={styles.matchResultMeta}>
                    페이스 {row.paceLabel} · 시간 {row.durationLabel}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      );
    }

    if (matchMode === 'group' && groupResultRows.length) {
      return (
        <Card style={styles.matchResultCard}>
          <View style={styles.matchResultHeader}>
            <View style={styles.matchResultHeaderCopy}>
              <Text style={styles.matchResultEyebrow}>GROUP RESULT</Text>
              <Text style={styles.matchResultTitle}>그룹 대결 순위표</Text>
              <Text style={styles.matchResultSubtitle}>들어오는 기록 순서대로 계속 업데이트돼요.</Text>
            </View>
            <View style={styles.finishSummaryPointPill}>
              <Text style={styles.finishSummaryPointPillText}>매치 포인트 +{estimatedMatchBonusPoints}P</Text>
            </View>
          </View>
          <View style={styles.matchResultList}>
            {groupResultRows.map((row) => (
              <View
                key={row.id}
                style={[styles.groupResultRow, row.isCurrentUser ? styles.groupResultRowCurrent : undefined]}
              >
                <Text style={styles.groupResultRank}>{row.rank}등</Text>
                <View style={styles.groupResultCopy}>
                  <Text style={styles.groupResultName}>
                    {row.name}
                    {row.isCurrentUser ? ' (나)' : ''}
                  </Text>
                  <Text style={styles.groupResultMeta}>
                    페이스 {row.paceLabel} · 시간 {row.durationLabel}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          {groupResultStatusLabel ? (
            <View style={styles.matchResultStatusPill}>
              <Text style={styles.matchResultStatusText}>{groupResultStatusLabel}</Text>
            </View>
          ) : null}
        </Card>
      );
    }

    return (
      <Card style={styles.matchResultCard}>
        <Text style={styles.matchResultTitle}>결과를 정리하는 중이에요</Text>
        <Text style={styles.matchResultSubtitle}>조금만 더 지나면 여기서 바로 결과를 볼 수 있어요.</Text>
      </Card>
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
                  {typeof effectiveDuelOpponent.liveDistanceKm === 'number'
                    ? `${effectiveDuelOpponent.liveDistanceKm.toFixed(2)}km`
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

      <View style={styles.metricGrid}>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>시간</Text>
          <Text style={styles.metricValue}>{formatDuration(elapsedSeconds)}</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>거리</Text>
          <Text style={styles.metricValue}>{formatMetricDistance(distanceKm)}</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>평균 페이스</Text>
          <Text style={styles.metricValue}>{averagePace}</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>현재 페이스</Text>
          <Text style={styles.metricValue}>{currentPace}</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>케이던스</Text>
          <Text style={styles.metricValue}>{formatCadence(cadenceSpm)}</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>고도 상승</Text>
          <Text style={styles.metricValue}>{formatElevation(elevationGainM)}</Text>
        </Card>
      </View>

      {!includeMatchCards && testMatchExitSource ? (
        <Card style={styles.testExitCard}>
          <Text style={styles.testExitTitle}>테스트 대결을 여기서 끝낼 수 있어요</Text>
          <Text style={styles.testExitText}>
            테스트 상대 표시는 정리하고, 지금 러닝 기록은 혼자 계속 이어갈게요.
          </Text>
          <SecondaryButton
            label={
              testMatchExitSource === 'duel'
                ? (isLeavingDuelMatch ? '정리 중...' : '테스트 대결 그만')
                : (isLeavingGroupMatch ? '정리 중...' : '테스트 대결 그만')
            }
            onPress={() => {
              handleContinueSoloFromMatch(testMatchExitSource);
            }}
            disabled={testMatchExitSource === 'duel' ? isLeavingDuelMatch : isLeavingGroupMatch}
          />
        </Card>
      ) : null}
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
            {visibleUpcomingMatches.length ? (
              <View style={styles.upcomingMatchCard}>
                <Text style={styles.upcomingMatchEyebrow}>다가오는 매치</Text>
                {visibleUpcomingMatches.slice(0, 2).map((match) => {
                  const remainingSeconds = getMatchStartRemainingSeconds(match.slotStartAt, syncedNowMs);
                  const canOpenArena = match.status === 'active'
                    || (match.status === 'matched' && shouldAutoOpenMatchArena(remainingSeconds));

                  return (
                  <Pressable
                    key={match.matchId}
                    style={styles.upcomingMatchRow}
                    disabled={!canOpenArena}
                    onPress={() => {
                      if (!canOpenArena) {
                        return;
                      }

                      void focusRunningMatch({
                        mode: match.mode,
                        distanceKm: match.distanceKm,
                        slotStartAt: match.slotStartAt,
                        isTestMatch: match.isTestMatch,
                      }).catch(() => {});
                    }}
                  >
                    <View style={styles.upcomingMatchCopy}>
                      <Text style={styles.upcomingMatchTitle}>
                        {match.isTestMatch ? '테스트 ' : ''}{match.mode === 'duel' ? '1대1 대결' : '그룹 대결'} · {match.summary}
                      </Text>
                      <Text style={styles.upcomingMatchMeta}>{match.counterpartLabel}</Text>
                      {(() => {
                        return shouldShowMatchCardCountdown(remainingSeconds) ? (
                          <View style={styles.upcomingMatchCountdownPill}>
                            <Text style={styles.upcomingMatchCountdownText}>시작까지 {formatMatchCountdown(remainingSeconds!)}</Text>
                          </View>
                        ) : null;
                      })()}
                      {match.status === 'matched' ? (
                        match.canCancel ? (
                          <Pressable
                            style={styles.upcomingMatchCancelButton}
                            onPress={() => {
                              void handleCancelUpcomingMatch(match);
                            }}
                          >
                            <Text style={styles.upcomingMatchCancelText}>
                              {cancelingUpcomingMatchId === match.matchId ? '취소 중...' : '예약 취소'}
                            </Text>
                          </Pressable>
                        ) : (
                          <Text style={styles.upcomingMatchHelperText}>출발 1시간 전부터는 취소할 수 없어요.</Text>
                        )
                      ) : null}
                      {canOpenArena ? (
                        <Text style={styles.upcomingMatchHelperText}>누르면 바로 대결 보기로 이동해요.</Text>
                      ) : null}
                    </View>
                    <Text style={styles.upcomingMatchState}>
                      {match.status === 'active' ? '진행 중' : canOpenArena ? '곧 시작' : '예약됨'}
                    </Text>
                  </Pressable>
                );
                })}
              </View>
            ) : null}
            <View style={styles.matchCard}>
              <View style={styles.matchOptionRow}>
                {matchOptions.map((option) => {
                  const isSelected = option.mode === matchMode;

                  return (
                    <Pressable
                      key={option.mode}
                      style={[styles.matchOption, isSelected ? styles.matchOptionSelected : styles.matchOptionIdle]}
                      onPress={() => {
                        if (option.mode === 'room' && visibleMatchRoom) {
                          router.push('/match-room' as Href);
                          return;
                        }

                        setMatchMode(option.mode);
                      }}
                      >
                        <Text style={[styles.matchOptionTitle, isSelected ? styles.matchOptionTitleSelected : undefined]}>
                          {option.title}
                        </Text>
                      </Pressable>
                    );
                  })}
              </View>
              {visibleMatchRoom ? (
                <Pressable
                  style={styles.partyRoomEntryButton}
                  onPress={() => {
                    router.push('/match-room' as Href);
                  }}
                >
                  <Text style={styles.partyRoomEntryButtonText}>파티런 대기실로 가기</Text>
                </Pressable>
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

          {isRunning ? (
            <View style={styles.actionColumn}>
              <PrimaryButton
                label={matchMode === 'solo' ? '러닝 종료하고 저장' : '러닝 종료하고 결과 보기'}
                onPress={matchMode === 'solo' ? handleSaveTracking : handlePauseTracking}
              />
              <SecondaryButton label="일시정지" onPress={handlePauseTracking} />
            </View>
          ) : null}

          {isPaused ? (
            <>
              <View style={styles.actionColumn}>
                <PrimaryButton label="이 기록 저장하기" onPress={handleSaveTracking} />
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
  upcomingMatchCard: {
    gap: 10,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
  upcomingMatchEyebrow: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  upcomingMatchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
  },
  upcomingMatchCopy: {
    flex: 1,
    gap: 4,
  },
  upcomingMatchTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  upcomingMatchMeta: {
    color: '#D0D5DD',
    lineHeight: 18,
  },
  upcomingMatchCountdownPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.32)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  upcomingMatchCountdownText: {
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '800',
  },
  upcomingMatchCancelButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  upcomingMatchCancelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  upcomingMatchHelperText: {
    color: '#A5B4FC',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  upcomingMatchState: {
    color: '#A5B4FC',
    fontSize: 12,
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
  matchOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
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
  matchOption: {
    width: '48%',
    gap: 4,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchOptionIdle: {
    borderColor: '#374151',
    backgroundColor: '#111827',
  },
  matchOptionSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
  },
  matchOptionLabel: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  matchOptionLabelSelected: {
    color: '#E0E7FF',
  },
  matchOptionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  matchOptionTitleSelected: {
    color: '#FFFFFF',
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
  matchResultCard: {
    gap: 16,
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#312E81',
    backgroundColor: '#111827',
  },
  matchResultHeader: {
    gap: 12,
  },
  matchResultHeaderCopy: {
    gap: 4,
  },
  matchResultEyebrow: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  matchResultTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  matchResultSubtitle: {
    color: '#D0D5DD',
    lineHeight: 20,
  },
  matchResultList: {
    gap: 10,
  },
  matchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
  },
  matchResultRowWin: {
    borderColor: 'rgba(129, 140, 248, 0.42)',
    backgroundColor: 'rgba(67, 56, 202, 0.24)',
  },
  matchResultRowLose: {
    borderColor: 'rgba(244, 114, 182, 0.28)',
    backgroundColor: 'rgba(136, 19, 55, 0.22)',
  },
  matchResultRowDraw: {
    borderColor: 'rgba(148, 163, 184, 0.32)',
    backgroundColor: 'rgba(30, 41, 59, 0.72)',
  },
  matchResultLabelColumn: {
    minWidth: 54,
  },
  matchResultLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  matchResultCopy: {
    flex: 1,
    gap: 2,
  },
  matchResultName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  matchResultMeta: {
    color: '#E5E7EB',
    lineHeight: 19,
  },
  groupResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  groupResultRowCurrent: {
    borderColor: 'rgba(129, 140, 248, 0.48)',
    backgroundColor: 'rgba(67, 56, 202, 0.18)',
  },
  groupResultRank: {
    width: 34,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  groupResultCopy: {
    flex: 1,
    gap: 2,
  },
  groupResultName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  groupResultMeta: {
    color: '#D0D5DD',
    lineHeight: 19,
  },
  matchResultStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.28)',
    backgroundColor: 'rgba(79, 70, 229, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  matchResultStatusText: {
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '800',
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
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48.5%',
    minHeight: 96,
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  metricLabel: {
    color: '#98A2B3',
    fontWeight: '700',
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
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
