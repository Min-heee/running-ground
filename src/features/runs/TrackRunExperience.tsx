import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type Href, router } from 'expo-router';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { RunMatchResult, RunRoutePoint } from '@/domain/types';
import {
  acceptRunningMatch,
  cancelRunningMatch,
  createTrackedRun,
  fetchMatchDemandSummary,
  fetchRunningMatchStatus,
  leaveRunningMatch,
  requestDuelMatch,
  requestGroupMatch,
  updateRunningMatchProgress,
  updateRunningLiveShare,
} from '@/lib/api/services';
import {
  type DuelMatchOpponent,
  type GroupMatchParticipant,
  type MatchDemandSummaryResponse,
  type RequestDuelMatchResponse,
  type RequestGroupMatchResponse,
  type RunningMatchStatusResponse,
  type UpdateRunningMatchProgressInput,
} from '@/lib/api/types';
import { buildSuggestedArtRoute, type SuggestedArtRoute } from '@/features/runs/routeArt';
import { RunRouteMap } from '@/features/runs/RunRouteMap';
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
  calculateDistanceBetweenPoints,
  calculateElevationGainM,
  calculateRouteDistanceKm,
  formatDuration,
  formatPaceFromSpeedMps,
  getMapRegion,
} from '@/features/runs/tracking';

type TrackerStatus = 'idle' | 'running' | 'paused' | 'saving';
type TrackRunMode = 'tab' | 'stack';
type ExternalMapProvider = 'kakao' | 'naver';
type RunMatchMode = 'solo' | 'duel' | 'group';
type ConfirmedStartLocation = {
  query: string;
  label: string;
  resolvedAddress?: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
};
type GroupLiveStanding = GroupMatchParticipant & {
  rank: number;
  currentDistanceKm: number;
  gapAheadKm: number | null;
  gapLeaderKm: number;
  isForfeited: boolean;
  isCurrentUser: boolean;
};
type MatchParticipantLiveStatus = DuelMatchOpponent['liveStatus'];
type MatchSlotOption = ReturnType<typeof buildUpcomingHalfHourSlots>[number];
type MatchSlotSectionKey = 'dawn' | 'morning' | 'afternoon' | 'night';
type MatchExpansionSuggestion = {
  slotStartAt: string;
  slotLabel: string;
  directionLabel: string;
  summary: MatchDemandSummaryResponse;
};
const RECOMMENDED_MATCH_DISTANCES = [3, 5, 7, 10, 15, 21.1, 42.2];
const MATCH_SLOT_SECTIONS: { key: MatchSlotSectionKey; label: string }[] = [
  { key: 'dawn', label: '새벽' },
  { key: 'morning', label: '오전' },
  { key: 'afternoon', label: '오후' },
  { key: 'night', label: '밤' },
];

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

function parseDesiredDistanceKm(value: string) {
  const nextValue = Number(value.replace(',', '.'));
  if (!Number.isFinite(nextValue)) {
    return 5;
  }

  return Math.min(20, Math.max(2, nextValue));
}

function getRouteProviderLabel() {
  return '무료 MVP 그림 초안';
}

function getRouteProviderDescription() {
  return '지금은 키워드와 문장의 분위기를 기준으로 그림 목표선을 먼저 만들어요. 도로에 딱 맞춰주는 기능은 추후 무료 지도 대안을 검증한 뒤 확장할게요.';
}

function formatCoordinateForUrl(coordinate: { latitude: number; longitude: number }) {
  return `${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`;
}

function encodeRouteName(value: string) {
  return value.trim() || 'RunningGround 경로';
}

function sampleExternalMapWaypoints(coordinates: SuggestedArtRoute['coordinates'], maximumWaypoints = 5) {
  if (coordinates.length <= 2) {
    return [];
  }

  const intermediateCoordinates = coordinates.slice(1, -1);

  if (intermediateCoordinates.length <= maximumWaypoints) {
    return intermediateCoordinates;
  }

  return Array.from({ length: maximumWaypoints }, (_, index) => {
    const sourceIndex = Math.round((index / (maximumWaypoints - 1)) * (intermediateCoordinates.length - 1));
    return intermediateCoordinates[sourceIndex];
  });
}

function buildKakaoWalkRouteUrl(route: SuggestedArtRoute, useWebFallback = false) {
  const [startCoordinate] = route.coordinates;
  const endCoordinate = route.coordinates[route.coordinates.length - 1];
  const waypoints = sampleExternalMapWaypoints(route.coordinates);
  const params = new URLSearchParams({
    sp: formatCoordinateForUrl(startCoordinate),
    ep: formatCoordinateForUrl(endCoordinate),
    by: 'foot',
  });

  waypoints.forEach((waypoint, index) => {
    params.set(index === 0 ? 'vp' : `vp${index + 1}`, formatCoordinateForUrl(waypoint));
  });

  return `${useWebFallback ? 'https://m.map.kakao.com/scheme/route' : 'kakaomap://route'}?${params.toString()}`;
}

function buildNaverWalkRouteUrl(route: SuggestedArtRoute) {
  const [startCoordinate] = route.coordinates;
  const endCoordinate = route.coordinates[route.coordinates.length - 1];
  const waypoints = sampleExternalMapWaypoints(route.coordinates);
  const params = new URLSearchParams({
    slat: startCoordinate.latitude.toFixed(6),
    slng: startCoordinate.longitude.toFixed(6),
    sname: encodeRouteName(route.startLabel),
    dlat: endCoordinate.latitude.toFixed(6),
    dlng: endCoordinate.longitude.toFixed(6),
    dname: encodeRouteName(route.displayTitle),
    appname: 'com.minheee.runningground',
  });

  waypoints.forEach((waypoint, index) => {
    const waypointNumber = index + 1;
    params.set(`v${waypointNumber}lat`, waypoint.latitude.toFixed(6));
    params.set(`v${waypointNumber}lng`, waypoint.longitude.toFixed(6));
    params.set(`v${waypointNumber}name`, encodeRouteName(`경유 ${waypointNumber}`));
  });

  return `nmap://route/walk?${params.toString()}`;
}

function getExternalMapFallbackUrl(provider: ExternalMapProvider, route: SuggestedArtRoute) {
  if (provider === 'kakao') {
    return buildKakaoWalkRouteUrl(route, true);
  }

  return Platform.select({
    ios: 'https://apps.apple.com/kr/app/naver-map-navigation/id311867728',
    android: 'market://details?id=com.nhn.android.nmap',
    default: 'https://map.naver.com',
  })!;
}

function formatReverseGeocodedAddress(address: Location.LocationGeocodedAddress) {
  const parts = [
    address.region,
    address.city,
    address.district,
    address.street,
    address.name,
  ].filter(Boolean);

  return parts.join(' ');
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

function buildLiveShareFallbackLabel(location?: ConfirmedStartLocation | null) {
  if (!location) {
    return '현재 위치 근처';
  }

  if (location.resolvedAddress) {
    return `${location.resolvedAddress.split(' ').slice(-1)[0] || location.resolvedAddress} 근처`;
  }

  return `${location.label} 근처`;
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

function shouldSuggestExpandedSlot(mode: 'duel' | 'group', currentSummary: MatchDemandSummaryResponse, candidateSummary: MatchDemandSummaryResponse) {
  if (candidateSummary.competitiveParticipantsCount <= currentSummary.competitiveParticipantsCount) {
    return false;
  }

  if (mode === 'duel') {
    return currentSummary.competitiveParticipantsCount < currentSummary.capacity;
  }

  return currentSummary.competitiveParticipantsCount < 4;
}

function buildMatchExpansionSuggestion(
  mode: 'duel' | 'group',
  currentSummary: MatchDemandSummaryResponse,
  slotOptions: MatchSlotOption[],
  selectedSlotStartAt: string,
  nearbySummaries: MatchDemandSummaryResponse[],
): MatchExpansionSuggestion | null {
  const currentIndex = slotOptions.findIndex((slot) => slot.startsAt === selectedSlotStartAt);

  if (currentIndex < 0) {
    return null;
  }

  const candidates = nearbySummaries
    .map((summary) => {
      const slotIndex = slotOptions.findIndex((slot) => slot.startsAt === summary.slotStartAt);

      if (slotIndex < 0 || !shouldSuggestExpandedSlot(mode, currentSummary, summary)) {
        return null;
      }

      return {
        slotStartAt: summary.slotStartAt,
        slotLabel: summary.slotLabel,
        directionLabel: slotIndex < currentIndex ? '30분 앞' : '30분 뒤',
        summary,
      };
    })
    .filter((entry): entry is MatchExpansionSuggestion => Boolean(entry))
    .sort((left, right) => {
      if (right.summary.participantsCount !== left.summary.participantsCount) {
        return right.summary.participantsCount - left.summary.participantsCount;
      }

      return Math.abs(new Date(left.slotStartAt).getTime() - new Date(selectedSlotStartAt).getTime())
        - Math.abs(new Date(right.slotStartAt).getTime() - new Date(selectedSlotStartAt).getTime());
    });

  return candidates[0] ?? null;
}

function buildUpcomingHalfHourSlots(count = 6, referenceDate = new Date()) {
  const nextSlot = new Date(referenceDate);
  nextSlot.setSeconds(0, 0);
  const currentMinutes = nextSlot.getMinutes();

  if (currentMinutes === 0 || currentMinutes === 30) {
    nextSlot.setMinutes(currentMinutes + 30);
  } else if (currentMinutes < 30) {
    nextSlot.setMinutes(30);
  } else {
    nextSlot.setHours(nextSlot.getHours() + 1, 0, 0, 0);
  }

  return Array.from({ length: count }, (_, index) => {
    const slotStart = new Date(nextSlot.getTime() + index * 30 * 60 * 1000);
    const startHours = String(slotStart.getHours()).padStart(2, '0');
    const startMinutes = String(slotStart.getMinutes()).padStart(2, '0');

    return {
      startsAt: slotStart.toISOString(),
      label: `${startHours}:${startMinutes}`,
    };
  });
}

function getMatchSlotSectionKey(slotStartAt: string): MatchSlotSectionKey {
  const slotDate = new Date(slotStartAt);
  const hour = slotDate.getHours();

  if (hour < 6) {
    return 'dawn';
  }

  if (hour < 12) {
    return 'morning';
  }

  if (hour < 18) {
    return 'afternoon';
  }

  return 'night';
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

  if ((previousState === 'ready' || previousState === 'countdown') && nextState === 'waiting') {
    return mode === 'duel'
      ? '상대가 빠져서 다시 비슷한 상대를 찾는 중이에요.'
      : '일부 참가자가 빠져서 다시 비슷한 그룹을 모으는 중이에요.';
  }

  if ((previousState === 'ready' || previousState === 'countdown') && nextState === 'idle') {
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

export function TrackRunExperience({ mode }: { mode: TrackRunMode }) {
  const insets = useSafeAreaInsets();
  const pedometerSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
  const [shapeKeyword, setShapeKeyword] = useState('고구마');
  const [desiredDistanceText, setDesiredDistanceText] = useState('5');
  const [startLocationQuery, setStartLocationQuery] = useState('');
  const [confirmedStartLocation, setConfirmedStartLocation] = useState<ConfirmedStartLocation | null>(null);
  const [isGeneratingRoute, setIsGeneratingRoute] = useState(false);
  const [suggestedRoute, setSuggestedRoute] = useState<SuggestedArtRoute | null>(null);
  const [plannerExpanded, setPlannerExpanded] = useState(false);
  const [liveShareEnabled, setLiveShareEnabled] = useState(false);
  const [liveShareLabel, setLiveShareLabel] = useState<string | null>(null);
  const [matchMode, setMatchMode] = useState<RunMatchMode>('duel');
  const [duelDistanceText, setDuelDistanceText] = useState('5');
  const [showDuelCustomDistanceInput, setShowDuelCustomDistanceInput] = useState(false);
  const [selectedDuelSlotStartAt, setSelectedDuelSlotStartAt] = useState(() => buildUpcomingHalfHourSlots(48)[0]?.startsAt ?? new Date().toISOString());
  const [selectedDuelSlotSection, setSelectedDuelSlotSection] = useState<MatchSlotSectionKey>(() => getMatchSlotSectionKey(buildUpcomingHalfHourSlots(48)[0]?.startsAt ?? new Date().toISOString()));
  const [isRequestingDuelMatch, setIsRequestingDuelMatch] = useState(false);
  const [duelMatchResult, setDuelMatchResult] = useState<RequestDuelMatchResponse | null>(null);
  const [duelMatchStatus, setDuelMatchStatus] = useState<RunningMatchStatusResponse | null>(null);
  const [isAcceptingDuelMatch, setIsAcceptingDuelMatch] = useState(false);
  const [isCancelingDuelMatch, setIsCancelingDuelMatch] = useState(false);
  const [isLeavingDuelMatch, setIsLeavingDuelMatch] = useState(false);
  const [duelDemandSummary, setDuelDemandSummary] = useState<MatchDemandSummaryResponse | null>(null);
  const [isLoadingDuelDemandSummary, setIsLoadingDuelDemandSummary] = useState(false);
  const [duelExpansionSuggestion, setDuelExpansionSuggestion] = useState<MatchExpansionSuggestion | null>(null);
  const [duelMatchNotice, setDuelMatchNotice] = useState<string | null>(null);
  const [groupDistanceText, setGroupDistanceText] = useState('5');
  const [showGroupCustomDistanceInput, setShowGroupCustomDistanceInput] = useState(false);
  const [selectedGroupSlotStartAt, setSelectedGroupSlotStartAt] = useState(() => buildUpcomingHalfHourSlots(48)[0]?.startsAt ?? new Date().toISOString());
  const [selectedGroupSlotSection, setSelectedGroupSlotSection] = useState<MatchSlotSectionKey>(() => getMatchSlotSectionKey(buildUpcomingHalfHourSlots(48)[0]?.startsAt ?? new Date().toISOString()));
  const [isRequestingGroupMatch, setIsRequestingGroupMatch] = useState(false);
  const [groupMatchResult, setGroupMatchResult] = useState<RequestGroupMatchResponse | null>(null);
  const [groupMatchStatus, setGroupMatchStatus] = useState<RunningMatchStatusResponse | null>(null);
  const [isAcceptingGroupMatch, setIsAcceptingGroupMatch] = useState(false);
  const [isCancelingGroupMatch, setIsCancelingGroupMatch] = useState(false);
  const [isLeavingGroupMatch, setIsLeavingGroupMatch] = useState(false);
  const [groupDemandSummary, setGroupDemandSummary] = useState<MatchDemandSummaryResponse | null>(null);
  const [isLoadingGroupDemandSummary, setIsLoadingGroupDemandSummary] = useState(false);
  const [groupExpansionSuggestion, setGroupExpansionSuggestion] = useState<MatchExpansionSuggestion | null>(null);
  const [groupMatchNotice, setGroupMatchNotice] = useState<string | null>(null);

  const averagePace = useMemo(() => buildAveragePace(distanceKm, elapsedSeconds), [distanceKm, elapsedSeconds]);
  const routeCoordinates = useMemo(
    () => route.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
    [route],
  );
  const plannedCoordinates = suggestedRoute?.coordinates ?? [];
  const previewMapRegion = useMemo(() => getMapRegion(plannedCoordinates), [plannedCoordinates]);
  const liveMapRegion = useMemo(
    () => getMapRegion(plannedCoordinates.length ? [...plannedCoordinates, ...routeCoordinates] : routeCoordinates),
    [plannedCoordinates, routeCoordinates],
  );
  const matchTargetDistanceKm = useMemo(
    () => suggestedRoute?.requestedDistanceKm ?? parseDesiredDistanceKm(desiredDistanceText),
    [desiredDistanceText, suggestedRoute],
  );
  const duelDistanceKm = useMemo(() => parseDuelMatchDistanceKm(duelDistanceText), [duelDistanceText]);
  const groupDistanceKm = useMemo(() => parseDuelMatchDistanceKm(groupDistanceText), [groupDistanceText]);
  const duelSlotOptions = useMemo(() => buildUpcomingHalfHourSlots(48), []);
  const selectedDuelSlot = duelSlotOptions.find((slot) => slot.startsAt === selectedDuelSlotStartAt) ?? duelSlotOptions[0] ?? null;
  const visibleDuelSlotOptions = useMemo(
    () => duelSlotOptions.filter((slot) => getMatchSlotSectionKey(slot.startsAt) === selectedDuelSlotSection),
    [duelSlotOptions, selectedDuelSlotSection],
  );
  const activeDuelSlotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt;
  const groupSlotOptions = useMemo(() => buildUpcomingHalfHourSlots(48), []);
  const selectedGroupSlot = groupSlotOptions.find((slot) => slot.startsAt === selectedGroupSlotStartAt) ?? groupSlotOptions[0] ?? null;
  const visibleGroupSlotOptions = useMemo(
    () => groupSlotOptions.filter((slot) => getMatchSlotSectionKey(slot.startsAt) === selectedGroupSlotSection),
    [groupSlotOptions, selectedGroupSlotSection],
  );
  const activeGroupSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;
  const matchOptions = useMemo(
    () => [
      {
        mode: 'solo' as const,
        label: '혼자',
        title: '혼자 러닝',
        summary: '기록에만 집중하는 기본 러닝 모드예요.',
        meta: '지금 페이스와 거리 흐름에만 집중',
        startLabel: '바로 런닝 시작',
        liveTitle: '개인 러닝 진행 중',
        liveText: '내 페이스와 현재 리듬을 지켜가는 데 집중하기 좋아요.',
      },
      {
        mode: 'duel' as const,
        label: '1대1',
        title: '1대1 매치',
        summary: '비슷한 목표 러너 한 명과 바로 붙는 대결 모드예요.',
        meta: `${formatMatchTargetDistance(duelDistanceKm)} 기준 · 30분 단위 시간대 매칭`,
        startLabel: '1대1 매치로 시작',
        liveTitle: '1대1 매치 진행 중',
        liveText: '완주 시간과 평균 페이스를 중심으로 오늘 결과를 비교하기 좋은 모드예요.',
      },
      {
        mode: 'group' as const,
        label: '그룹',
        title: '그룹 대결',
        summary: '최대 30명까지 모아 순위 흐름을 보는 그룹전 모드예요.',
        meta: `${formatMatchTargetDistance(groupDistanceKm)} 기준 · 30분 단위 그룹 매칭`,
        startLabel: '그룹 대결로 시작',
        liveTitle: '그룹 대결 진행 중',
        liveText: '비슷한 러너들과 함께 뛰면서 내 순위를 보는 재미를 주는 모드예요.',
      },
    ],
    [duelDistanceKm, groupDistanceKm],
  );

  useEffect(() => {
    if (selectedDuelSlot) {
      setSelectedDuelSlotSection(getMatchSlotSectionKey(selectedDuelSlot.startsAt));
    }
  }, [selectedDuelSlot]);

  useEffect(() => {
    if (selectedGroupSlot) {
      setSelectedGroupSlotSection(getMatchSlotSectionKey(selectedGroupSlot.startsAt));
    }
  }, [selectedGroupSlot]);
  const latestPoint = route.length ? route[route.length - 1] : null;
  const selectedMatch = matchOptions.find((option) => option.mode === matchMode) ?? matchOptions[0];
  const duelMatchState = duelMatchStatus?.state ?? 'idle';
  const groupMatchState = groupMatchStatus?.state ?? 'idle';
  const effectiveDuelOpponent = duelMatchStatus?.opponent ?? duelMatchResult?.opponent ?? null;
  const effectiveDuelOpponentStatusLabel = effectiveDuelOpponent
    ? buildMatchParticipantStatusLabel(effectiveDuelOpponent.liveStatus)
    : null;
  const effectiveDuelSlotLabel = duelMatchStatus?.slotLabel ?? duelMatchResult?.slotLabel ?? selectedDuelSlot?.label ?? '시간 미정';
  const duelExpiryCountdownLabel = formatMatchExpiryCountdown(duelMatchStatus?.expiresInSeconds);
  const effectiveGroupParticipants = groupMatchStatus?.participants ?? groupMatchResult?.participants ?? [];
  const effectiveGroupParticipantCount = groupMatchStatus?.participantCount ?? groupMatchResult?.participantsCount ?? effectiveGroupParticipants.length;
  const effectiveGroupSeedRank = groupMatchStatus?.mySeedRank ?? groupMatchResult?.mySeedRank;
  const effectiveGroupSlotLabel = groupMatchStatus?.slotLabel ?? groupMatchResult?.slotLabel ?? selectedGroupSlot?.label ?? '시간 미정';
  const groupExpiryCountdownLabel = formatMatchExpiryCountdown(groupMatchStatus?.expiresInSeconds);
  const duelNeedsManualRematch = Boolean(duelMatchNotice && duelMatchState === 'idle');
  const groupNeedsManualRematch = Boolean(groupMatchNotice && groupMatchState === 'idle');
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

    const opponentDistanceKm = buildEstimatedCompetitiveDistanceKm(effectiveDuelOpponent.averagePace, elapsedSeconds, 2);
    const gapKm = Number(Math.abs(distanceKm - opponentDistanceKm).toFixed(2));
    const isDraw = gapKm < 0.03;
    const resultTone: RunMatchResult['resultTone'] = isDraw ? 'draw' : distanceKm > opponentDistanceKm ? 'win' : 'lose';
    const title = isDraw
      ? `${effectiveDuelOpponent.name}님과 거의 같은 흐름으로 마쳤어요`
      : resultTone === 'win'
        ? `${effectiveDuelOpponent.name}님보다 앞서서 마쳤어요`
        : `${effectiveDuelOpponent.name}님이 조금 앞섰어요`;
    const summary = isDraw
      ? `현재 기준으로 두 러너 차이가 ${gapKm.toFixed(2)}km 안쪽이에요.`
      : resultTone === 'win'
        ? `${gapKm.toFixed(2)}km 앞선 상태로 종료했어요.`
        : `${gapKm.toFixed(2)}km 차이로 따라가는 흐름이었어요.`;

    return {
      title,
      summary,
      resultTone,
      opponentDistanceKm,
      gapKm,
    };
  }, [distanceKm, effectiveDuelOpponent, elapsedSeconds]);
  const groupFinishSummary = useMemo(() => {
    if (!currentGroupStanding || !effectiveGroupParticipantCount) {
      return null;
    }

    const title = currentGroupStanding.rank === 1
      ? '선두로 마무리했어요'
      : `${effectiveGroupParticipantCount}명 중 ${currentGroupStanding.rank}위로 마쳤어요`;
    const summary = currentGroupStanding.rank === 1
      ? '마지막까지 페이스를 잘 지켜서 선두를 유지했어요.'
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
        badgeLabel: duelFinishSummary.resultTone === 'win'
          ? 'WIN'
          : duelFinishSummary.resultTone === 'lose'
            ? 'CHASE'
            : 'DRAW',
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
        badgeLabel: `${currentGroupStanding.rank}/${effectiveGroupParticipantCount}`,
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
      : duelMatchState === 'countdown'
        ? `${duelMatchStatus?.countdownRemainingSeconds ?? 0}초 뒤 시작`
        : duelMatchState === 'ready'
          ? duelMatchStatus?.userAccepted
            ? '상대 수락 대기 중'
            : '수락 후 시작'
          : duelMatchState === 'waiting'
            ? (duelMatchStatus?.competitiveParticipantsCount ?? 0) >= 2
              ? '상대 연결 정리 중'
              : '상대 잡히면 수락 가능'
            : '매칭 완료 후 시작'
    : matchMode === 'group'
      ? groupMatchState === 'active'
        ? `${effectiveGroupParticipantCount}명 그룹으로 시작`
        : groupMatchState === 'countdown'
          ? `${groupMatchStatus?.countdownRemainingSeconds ?? 0}초 뒤 시작`
          : groupMatchState === 'ready'
            ? groupMatchStatus?.userAccepted
              ? '모두 수락 대기 중'
              : '수락 후 시작'
            : '그룹 완료 후 시작'
      : selectedMatch.startLabel;
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isSaving = status === 'saving';
  const isIdle = status === 'idle';
  const isTabMode = mode === 'tab';
  const duelCompatibleCount = duelMatchStatus?.competitiveParticipantsCount ?? 0;
  const duelWaitingHasOtherApplicants = (duelMatchStatus?.participantCount ?? 0) > 1;
  const duelWaitingTitle = duelWaitingHasOtherApplicants
    ? duelCompatibleCount >= 2
      ? '지금 바로 붙을 상대를 정리하는 중이에요'
      : '신청은 들어왔지만 아직 바로 붙이진 않았어요'
    : '비슷한 상대를 찾는 중이에요';
  const duelWaitingMeta = duelWaitingHasOtherApplicants
    ? duelCompatibleCount >= 2
      ? `실제 신청 ${duelMatchStatus?.participantCount ?? 0}/${duelMatchStatus?.capacity ?? 2}명 · 바로 붙을 수 있는 상대 ${duelCompatibleCount}/${duelMatchStatus?.capacity ?? 2}명`
      : `실제 신청 ${duelMatchStatus?.participantCount ?? 0}/${duelMatchStatus?.capacity ?? 2}명 · 지금 바로 붙을 수 있는 상대 ${duelCompatibleCount}/${duelMatchStatus?.capacity ?? 2}명`
    : '같은 거리와 시간대에서 먼저 찾기한 러너들 중 페이스와 레벨이 잘 맞는 상대를 찾고 있어요.';
  const duelWaitingHint = duelWaitingHasOtherApplicants
    ? duelCompatibleCount >= 2
      ? '상대 연결이 마무리되면 READY로 바뀌고, 그때 수락 버튼이 나타나요.'
      : '수락 버튼은 페이스와 레벨이 맞는 상대가 실제로 잡혔을 때만 나타나요.'
    : '지금은 먼저 대기열에 들어간 상태예요. 잘 맞는 상대가 잡히면 수락 버튼이 바로 나타나요.';
  const backHref: Href = '/my-activity';
  const discardRedirectHref: Href | null = isTabMode ? null : '/my-activity';

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

    await pushRunningMatchProgressRef.current({
      matchId: target.matchId,
      distanceKm: snapshot.distanceKm,
      elapsedSeconds: getBackgroundRunElapsedSeconds(snapshot),
      currentPace: snapshot.currentPace,
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

      const activeSlotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt;
      return current.distanceKm === duelDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setDuelMatchStatus((current) => {
      if (!current) {
        return null;
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

      const activeSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;
      return current.distanceKm === groupDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setGroupMatchStatus((current) => {
      if (!current) {
        return null;
      }

      const activeSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;
      return current.distanceKm === groupDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setGroupMatchNotice(null);
  }, [groupDistanceKm, matchMode, selectedGroupSlot, selectedGroupSlotStartAt]);

  useEffect(() => {
    if (matchMode !== 'duel') {
      setDuelExpansionSuggestion(null);
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
      setGroupExpansionSuggestion(null);
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

  useEffect(() => {
    if (matchMode !== 'duel' || !duelDemandSummary) {
      setDuelExpansionSuggestion(null);
      return;
    }

    const currentIndex = duelSlotOptions.findIndex((slot) => slot.startsAt === (selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt));
    const nearbySlots = [duelSlotOptions[currentIndex - 1], duelSlotOptions[currentIndex + 1]].filter(Boolean);

    if (!nearbySlots.length) {
      setDuelExpansionSuggestion(null);
      return;
    }

    let canceled = false;
    void Promise.all(nearbySlots.map((slot) => fetchMatchDemandSummary({
      mode: 'duel',
      distanceKm: duelDistanceKm,
      slotStartAt: slot.startsAt,
    })))
      .then((summaries) => {
        if (!canceled) {
          setDuelExpansionSuggestion(
            buildMatchExpansionSuggestion('duel', duelDemandSummary, duelSlotOptions, selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt, summaries),
          );
        }
      })
      .catch(() => {
        if (!canceled) {
          setDuelExpansionSuggestion(null);
        }
      });

    return () => {
      canceled = true;
    };
  }, [duelDemandSummary, duelDistanceKm, duelSlotOptions, matchMode, selectedDuelSlot, selectedDuelSlotStartAt]);

  useEffect(() => {
    if (matchMode !== 'group' || !groupDemandSummary) {
      setGroupExpansionSuggestion(null);
      return;
    }

    const currentIndex = groupSlotOptions.findIndex((slot) => slot.startsAt === (selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt));
    const nearbySlots = [groupSlotOptions[currentIndex - 1], groupSlotOptions[currentIndex + 1]].filter(Boolean);

    if (!nearbySlots.length) {
      setGroupExpansionSuggestion(null);
      return;
    }

    let canceled = false;
    void Promise.all(nearbySlots.map((slot) => fetchMatchDemandSummary({
      mode: 'group',
      distanceKm: groupDistanceKm,
      slotStartAt: slot.startsAt,
    })))
      .then((summaries) => {
        if (!canceled) {
          setGroupExpansionSuggestion(
            buildMatchExpansionSuggestion('group', groupDemandSummary, groupSlotOptions, selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt, summaries),
          );
        }
      })
      .catch(() => {
        if (!canceled) {
          setGroupExpansionSuggestion(null);
        }
      });

    return () => {
      canceled = true;
    };
  }, [groupDemandSummary, groupDistanceKm, groupSlotOptions, matchMode, selectedGroupSlot, selectedGroupSlotStartAt]);

  const loadDuelMatchStatus = async (slotStartAt = activeDuelSlotStartAt) => {
    const payload = await fetchRunningMatchStatus({
      mode: 'duel',
      distanceKm: duelDistanceKm,
      slotStartAt,
    });
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

  const loadGroupMatchStatus = async (slotStartAt = activeGroupSlotStartAt) => {
    const payload = await fetchRunningMatchStatus({
      mode: 'group',
      distanceKm: groupDistanceKm,
      slotStartAt,
    });
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

  useEffect(() => {
    if (matchMode !== 'duel') {
      return;
    }

    let canceled = false;
    void loadDuelMatchStatus(activeDuelSlotStartAt).catch(() => {
      if (!canceled) {
        setDuelMatchStatus(null);
      }
    });

    return () => {
      canceled = true;
    };
  }, [matchMode, duelDistanceKm, activeDuelSlotStartAt]);

  useEffect(() => {
    if (matchMode !== 'group') {
      return;
    }

    let canceled = false;
    void loadGroupMatchStatus(activeGroupSlotStartAt).catch(() => {
      if (!canceled) {
        setGroupMatchStatus(null);
      }
    });

    return () => {
      canceled = true;
    };
  }, [matchMode, groupDistanceKm, activeGroupSlotStartAt]);

  useEffect(() => {
    if (matchMode !== 'duel' || !duelMatchStatus || !['waiting', 'ready', 'countdown', 'active'].includes(duelMatchStatus.state)) {
      return;
    }

    const intervalMs = duelMatchStatus.state === 'countdown' ? 1000 : 5000;
    const timer = setInterval(() => {
      void loadDuelMatchStatus().catch(() => {});
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [matchMode, duelMatchStatus?.state, duelMatchStatus?.matchId, duelDistanceKm, activeDuelSlotStartAt]);

  useEffect(() => {
    if (matchMode !== 'group' || !groupMatchStatus || !['waiting', 'ready', 'countdown', 'active'].includes(groupMatchStatus.state)) {
      return;
    }

    const intervalMs = groupMatchStatus.state === 'countdown' ? 1000 : 5000;
    const timer = setInterval(() => {
      void loadGroupMatchStatus().catch(() => {});
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [matchMode, groupMatchStatus?.state, groupMatchStatus?.matchId, groupDistanceKm, activeGroupSlotStartAt]);

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

  const syncFromBackgroundTracking = (snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot()) => {
    routeRef.current = snapshot.route;
    setRoute(snapshot.route);
    setDistanceKm(snapshot.distanceKm);
    setElevationGainM(snapshot.elevationGainM);
    setCurrentPace(snapshot.currentPace);
    setStatus(snapshot.status);
    syncElapsedSeconds(getBackgroundRunElapsedSeconds(snapshot));
  };

  const startElapsedTicker = () => {
    clearElapsedTicker();
    timerRef.current = setInterval(() => {
      syncElapsedSeconds(getBackgroundRunElapsedSeconds());
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
      const fallbackLabel = buildLiveShareFallbackLabel(confirmedStartLocation);
      setLiveShareLabel(fallbackLabel);
      return fallbackLabel;
    }

    try {
      const [address] = await Location.reverseGeocodeAsync(coordinate);
      const nextLabel = buildLiveShareLabelFromAddress(address) || buildLiveShareFallbackLabel(confirmedStartLocation);
      setLiveShareLabel(nextLabel);
      return nextLabel;
    } catch {
      const fallbackLabel = buildLiveShareFallbackLabel(confirmedStartLocation);
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
    void pushRunningMatchProgress({
      matchId: activeMatchId,
      distanceKm: snapshot.distanceKm,
      elapsedSeconds: getBackgroundRunElapsedSeconds(snapshot),
      currentPace: snapshot.currentPace,
      status: 'running',
    }).catch(() => {
      // Keep the run going even if the optional match heartbeat fails.
    });
  };

  const resolveTypedStartLocation = async (trimmedStartLocation: string): Promise<ConfirmedStartLocation> => {
    const geocoded = await Location.geocodeAsync(trimmedStartLocation);

    if (!geocoded.length) {
      throw new Error('출발지 위치를 찾지 못했어요. 지하철역명, 건물명, 도로명처럼 조금 더 구체적으로 입력해주세요.');
    }

    const coordinate = {
      latitude: geocoded[0].latitude,
      longitude: geocoded[0].longitude,
    };
    let resolvedAddress = '';

    try {
      const [address] = await Location.reverseGeocodeAsync(coordinate);
      resolvedAddress = address ? formatReverseGeocodedAddress(address) : '';
    } catch {
      resolvedAddress = '';
    }

    return {
      query: trimmedStartLocation,
      label: trimmedStartLocation,
      resolvedAddress,
      coordinate,
    };
  };

  const handleUseCurrentLocationAsStart = async () => {
    try {
      setIsGeneratingRoute(true);
      setError(null);
      await ensureLocationPermission();
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinate = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };
      let resolvedAddress = '현재 위치';

      try {
        const [address] = await Location.reverseGeocodeAsync(coordinate);
        resolvedAddress = address ? formatReverseGeocodedAddress(address) || '현재 위치' : '현재 위치';
      } catch {
        resolvedAddress = '현재 위치';
      }

      setStartLocationQuery(resolvedAddress);
      setConfirmedStartLocation({
        query: resolvedAddress,
        label: '현재 위치',
        resolvedAddress,
        coordinate,
      });
    } catch (locationError) {
      setConfirmedStartLocation(null);
      setError(locationError instanceof Error ? locationError.message : '현재 위치를 확인하지 못했어요.');
    } finally {
      setIsGeneratingRoute(false);
    }
  };

  const handleConfirmStartLocation = async () => {
    const trimmedStartLocation = startLocationQuery.trim();

    if (!trimmedStartLocation) {
      setError('출발지를 입력하면 위치를 먼저 확인할 수 있어요. 비워두면 현재 위치를 사용합니다.');
      return;
    }

    try {
      setIsGeneratingRoute(true);
      setError(null);
      const nextConfirmedStartLocation = await resolveTypedStartLocation(trimmedStartLocation);
      setConfirmedStartLocation(nextConfirmedStartLocation);
    } catch (locationError) {
      setConfirmedStartLocation(null);
      setError(locationError instanceof Error ? locationError.message : '출발지 위치를 확인하지 못했어요.');
    } finally {
      setIsGeneratingRoute(false);
    }
  };

  const resolveRoutePreviewStart = async () => {
    const trimmedStartLocation = startLocationQuery.trim();

    if (trimmedStartLocation) {
      const start = confirmedStartLocation?.query === trimmedStartLocation
        ? confirmedStartLocation
        : await resolveTypedStartLocation(trimmedStartLocation);

      setConfirmedStartLocation(start);
      return {
        coordinate: start.coordinate,
        label: start.label,
      };
    }

    await ensureLocationPermission();
    const currentLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      coordinate: {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      },
      label: '현재 위치',
    };
  };

  const handleCreateRoutePreview = async () => {
    if (Platform.OS === 'web') {
      setError('모양 러닝 미리보기는 iPhone이나 Android 앱에서 사용하는 게 가장 정확해.');
      return;
    }

    try {
      setIsGeneratingRoute(true);
      setError(null);

      const start = await resolveRoutePreviewStart();
      const nextSuggestedRoute = buildSuggestedArtRoute({
        keyword: shapeKeyword || '시그니처',
        desiredDistanceKm: parseDesiredDistanceKm(desiredDistanceText),
        startCoordinate: start.coordinate,
        startLabel: start.label,
      });

      setDesiredDistanceText(String(nextSuggestedRoute.requestedDistanceKm));
      setSuggestedRoute(nextSuggestedRoute);
      setPlannerExpanded(true);
    } catch (planningError) {
      setError(planningError instanceof Error ? planningError.message : '추천 그림 경로를 만들지 못했어.');
    } finally {
      setIsGeneratingRoute(false);
    }
  };

  const handleOpenExternalMap = async (provider: ExternalMapProvider) => {
    if (!suggestedRoute || suggestedRoute.coordinates.length < 2) {
      setError('먼저 지도로 그림 경로를 만들어주세요.');
      return;
    }

    const primaryUrl = provider === 'kakao'
      ? buildKakaoWalkRouteUrl(suggestedRoute)
      : buildNaverWalkRouteUrl(suggestedRoute);
    const fallbackUrl = getExternalMapFallbackUrl(provider, suggestedRoute);
    const providerName = provider === 'kakao' ? '카카오맵' : '네이버지도';

    try {
      await Linking.openURL(primaryUrl);
    } catch {
      try {
        await Linking.openURL(fallbackUrl);
      } catch {
        setError(`${providerName}을 열지 못했어요. 지도 앱 설치 상태를 확인해주세요.`);
      }
    }
  };

  const handleStartTracking = async () => {
    if (Platform.OS === 'web') {
      setError('실시간 러닝 측정은 iPhone이나 Android 앱에서 사용할 수 있어.');
      return;
    }

    if (matchMode === 'duel' && duelMatchState !== 'active') {
      setError('1대1 매칭이 모두 수락되고 카운트다운이 끝나야 시작할 수 있어요.');
      return;
    }

    if (matchMode === 'group' && groupMatchState !== 'active') {
      setError('그룹 매칭이 모두 수락되고 카운트다운이 끝나야 시작할 수 있어요.');
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

      if (suggestedRoute?.coordinates.length) {
        const initialPoint = buildRoutePoint(initialLocation);
        const gapFromSuggestedStartMeters = calculateDistanceBetweenPoints(initialPoint, suggestedRoute.coordinates[0]);

        if (gapFromSuggestedStartMeters > 200) {
          setError(`현재 위치가 추천 경로 시작점에서 ${Math.round(gapFromSuggestedStartMeters)}m 정도 떨어져 있어요. 안내선은 참고선으로 보시면 좋아요.`);
        }
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

  const handleRequestDuelMatch = async (slotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt) => {
    try {
      setError(null);
      setDuelMatchNotice(null);
      setIsRequestingDuelMatch(true);

      const payload = await requestDuelMatch({
        distanceKm: duelDistanceKm,
        slotStartAt,
      });

      setDuelMatchResult(payload);
      const [nextSummary] = await Promise.all([
        fetchMatchDemandSummary({
          mode: 'duel',
          distanceKm: duelDistanceKm,
          slotStartAt,
        }),
        loadDuelMatchStatus(slotStartAt),
      ]);
      setDuelDemandSummary(nextSummary);
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : '1대1 매칭을 찾지 못했어.');
    } finally {
      setIsRequestingDuelMatch(false);
    }
  };

  const handleRequestGroupMatch = async (slotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt) => {
    try {
      setError(null);
      setGroupMatchNotice(null);
      setIsRequestingGroupMatch(true);

      const payload = await requestGroupMatch({
        distanceKm: groupDistanceKm,
        slotStartAt,
      });

      setGroupMatchResult(payload);
      const [nextSummary] = await Promise.all([
        fetchMatchDemandSummary({
          mode: 'group',
          distanceKm: groupDistanceKm,
          slotStartAt,
        }),
        loadGroupMatchStatus(slotStartAt),
      ]);
      setGroupDemandSummary(nextSummary);
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : '그룹 매칭을 찾지 못했어.');
    } finally {
      setIsRequestingGroupMatch(false);
    }
  };

  const handleAcceptDuelMatch = async () => {
    if (!duelMatchStatus?.matchId) {
      return;
    }

    try {
      setError(null);
      setDuelMatchNotice(null);
      setIsAcceptingDuelMatch(true);
      const payload = await acceptRunningMatch({
        matchId: duelMatchStatus.matchId,
      });
      setDuelMatchStatus(payload);
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : '1대1 매치 수락을 반영하지 못했어.');
    } finally {
      setIsAcceptingDuelMatch(false);
    }
  };

  const handleCancelDuelMatch = async () => {
    try {
      setError(null);
      setDuelMatchNotice(null);
      setIsCancelingDuelMatch(true);
      await cancelRunningMatch({
        mode: 'duel',
        distanceKm: duelDistanceKm,
        slotStartAt: activeDuelSlotStartAt,
        ...(duelMatchStatus?.matchId ? { matchId: duelMatchStatus.matchId } : {}),
      });
      setDuelMatchResult(null);
      const [nextSummary, nextStatus] = await Promise.all([
        fetchMatchDemandSummary({
          mode: 'duel',
          distanceKm: duelDistanceKm,
          slotStartAt: activeDuelSlotStartAt,
        }),
        loadDuelMatchStatus(activeDuelSlotStartAt),
      ]);
      setDuelDemandSummary(nextSummary);
      if (nextStatus.state === 'idle') {
        setDuelMatchStatus(null);
      }
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : '1대1 매치를 취소하지 못했어.');
    } finally {
      setIsCancelingDuelMatch(false);
    }
  };

  const handleAcceptGroupMatch = async () => {
    if (!groupMatchStatus?.matchId) {
      return;
    }

    try {
      setError(null);
      setGroupMatchNotice(null);
      setIsAcceptingGroupMatch(true);
      const payload = await acceptRunningMatch({
        matchId: groupMatchStatus.matchId,
      });
      setGroupMatchStatus(payload);
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : '그룹 매치 수락을 반영하지 못했어.');
    } finally {
      setIsAcceptingGroupMatch(false);
    }
  };

  const handleCancelGroupMatch = async () => {
    try {
      setError(null);
      setGroupMatchNotice(null);
      setIsCancelingGroupMatch(true);
      await cancelRunningMatch({
        mode: 'group',
        distanceKm: groupDistanceKm,
        slotStartAt: activeGroupSlotStartAt,
        ...(groupMatchStatus?.matchId ? { matchId: groupMatchStatus.matchId } : {}),
      });
      setGroupMatchResult(null);
      const [nextSummary, nextStatus] = await Promise.all([
        fetchMatchDemandSummary({
          mode: 'group',
          distanceKm: groupDistanceKm,
          slotStartAt: activeGroupSlotStartAt,
        }),
        loadGroupMatchStatus(activeGroupSlotStartAt),
      ]);
      setGroupDemandSummary(nextSummary);
      if (nextStatus.state === 'idle') {
        setGroupMatchStatus(null);
      }
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : '그룹 매치를 취소하지 못했어.');
    } finally {
      setIsCancelingGroupMatch(false);
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

  const handleApplyDuelExpansionSuggestion = async () => {
    if (!duelExpansionSuggestion) {
      return;
    }

    setSelectedDuelSlotStartAt(duelExpansionSuggestion.slotStartAt);
    await handleRequestDuelMatch(duelExpansionSuggestion.slotStartAt);
  };

  const handleApplyGroupExpansionSuggestion = async () => {
    if (!groupExpansionSuggestion) {
      return;
    }

    setSelectedGroupSlotStartAt(groupExpansionSuggestion.slotStartAt);
    await handleRequestGroupMatch(groupExpansionSuggestion.slotStartAt);
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
        await pushRunningMatchProgress({
          matchId: activeMatchId,
          distanceKm,
          elapsedSeconds,
          currentPace,
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
        await pushRunningMatchProgress({
          matchId: activeMatchId,
          distanceKm: currentSnapshot.distanceKm,
          elapsedSeconds: getBackgroundRunElapsedSeconds(currentSnapshot),
          currentPace: currentSnapshot.currentPace,
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

  const handleSaveTracking = async ({ rematchAfterSave = false }: { rematchAfterSave?: boolean } = {}) => {
    try {
      setError(null);

      if (status === 'running') {
        await pauseBackgroundRunTracking();
        stopForegroundTrackingHelpers();
      }

      const trackingSnapshot = getBackgroundRunTrackingSnapshot();
      syncFromBackgroundTracking(trackingSnapshot);
      const finalElapsedSeconds = getBackgroundRunElapsedSeconds(trackingSnapshot);
      syncElapsedSeconds(finalElapsedSeconds);

      const startedAt = trackingSnapshot.startedAt ?? new Date().toISOString();
      const endedAt = trackingSnapshot.route.length
        ? trackingSnapshot.route[trackingSnapshot.route.length - 1].timestamp
        : new Date().toISOString();
      const finalDistanceKm = trackingSnapshot.distanceKm;
      const finalElevationGainM = trackingSnapshot.elevationGainM;
      const finalCadenceSpm = calculateCadenceSpm(totalStepsRef.current, finalElapsedSeconds);
      const averagePaceLabel = buildAveragePace(finalDistanceKm, finalElapsedSeconds);

      if (trackingSnapshot.route.length < 2 || finalDistanceKm < 0.1) {
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
          await pushRunningMatchProgress({
            matchId: activeMatchId,
            distanceKm: finalDistanceKm,
            elapsedSeconds: finalElapsedSeconds,
            currentPace: averagePaceLabel,
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
        route: trackingSnapshot.route,
        startedAt,
        endedAt,
        ...(trackedMatchResult ? { matchResult: trackedMatchResult } : {}),
      });

      await syncLiveSharing({
        enabled: false,
        status: 'idle',
      }).catch(() => {});

      if (rematchAfterSave && matchMode !== 'solo') {
        await resetBackgroundRunTracking();
        resetForegroundTrackingState();
        matchProgressHeartbeatRef.current = 0;
        setStatus('idle');

        if (matchMode === 'duel') {
          setDuelMatchResult(null);
          setDuelMatchStatus(null);
          setDuelMatchNotice(null);
          await handleRequestDuelMatch(activeDuelSlotStartAt);
          return;
        }

        if (matchMode === 'group') {
          setGroupMatchResult(null);
          setGroupMatchStatus(null);
          setGroupMatchNotice(null);
          await handleRequestGroupMatch(activeGroupSlotStartAt);
          return;
        }
      }

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

  return (
    <Screen>
      <AuthHeader
        title="실시간 러닝"
        showBack={!isTabMode}
        backHref={backHref}
      />

      {isIdle ? (
        <>
          <Card style={[styles.readyCard, { paddingBottom: 18 + Math.max(insets.bottom, 10) }]}>
            <View style={styles.readyHero}>
              <Text style={styles.readyTitle}>러닝 준비</Text>
            </View>
            <View style={styles.liveShareCard}>
              <View style={styles.liveShareHeader}>
                <View style={styles.liveShareCopy}>
                  <Text style={styles.liveShareTitle}>위치 공유</Text>
                  <Text style={styles.liveShareText}>
                    {liveShareEnabled ? (liveShareLabel ?? '동네 단위로 공개 중') : '친구에게 현재 위치를 공개하지 않음'}
                  </Text>
                </View>
                <View style={styles.liveShareModeBadge}>
                  <Text style={styles.liveShareModeBadgeText}>{liveShareEnabled ? 'ON' : 'OFF'}</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: liveShareEnabled }}
                style={[styles.liveShareToggle, liveShareEnabled ? styles.liveShareToggleEnabled : styles.liveShareToggleDisabled]}
                onPress={() => setLiveShareEnabled((current) => !current)}
              >
                <View style={[styles.liveShareThumb, liveShareEnabled ? styles.liveShareThumbEnabled : styles.liveShareThumbDisabled]} />
                <View style={styles.liveShareToggleLabels}>
                  <Text
                    style={[
                      styles.liveShareToggleText,
                      liveShareEnabled ? styles.liveShareToggleTextActive : styles.liveShareToggleTextInactiveLight,
                    ]}
                  >
                    공유 O
                  </Text>
                  <Text
                    style={[
                      styles.liveShareToggleText,
                      liveShareEnabled ? styles.liveShareToggleTextInactiveDark : styles.liveShareToggleTextActive,
                    ]}
                  >
                    공유 X
                  </Text>
                </View>
              </Pressable>
            </View>
            <View style={styles.matchCard}>
              <View style={styles.matchHeader}>
                <View style={styles.matchHeaderCopy}>
                  <Text style={styles.matchTitle}>경쟁 매칭</Text>
                </View>
                <View style={styles.matchBadge}>
                  <Text style={styles.matchBadgeText}>{selectedMatch.label}</Text>
                </View>
              </View>
              <View style={styles.matchOptionRow}>
                {matchOptions.map((option) => {
                  const isSelected = option.mode === matchMode;

                  return (
                    <Pressable
                      key={option.mode}
                      style={[styles.matchOption, isSelected ? styles.matchOptionSelected : styles.matchOptionIdle]}
                      onPress={() => setMatchMode(option.mode)}
                      >
                        <Text style={[styles.matchOptionLabel, isSelected ? styles.matchOptionLabelSelected : undefined]}>
                          {option.label}
                        </Text>
                        <Text style={[styles.matchOptionTitle, isSelected ? styles.matchOptionTitleSelected : undefined]}>
                          {option.title}
                        </Text>
                      </Pressable>
                    );
                  })}
              </View>
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
                    <View style={styles.slotSectionRow}>
                      {MATCH_SLOT_SECTIONS.map((section) => {
                        const isSelected = section.key === selectedDuelSlotSection;

                        return (
                          <Pressable
                            key={`duel-section-${section.key}`}
                            style={[styles.slotSectionChip, isSelected ? styles.slotSectionChipSelected : undefined]}
                            onPress={() => setSelectedDuelSlotSection(section.key)}
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
                            style={[styles.duelSlotChip, isSelected ? styles.duelSlotChipSelected : undefined]}
                            onPress={() => {
                              setSelectedDuelSlotStartAt(slot.startsAt);
                              setSelectedDuelSlotSection(getMatchSlotSectionKey(slot.startsAt));
                            }}
                          >
                            <Text style={[styles.duelSlotLabel, isSelected ? styles.duelSlotLabelSelected : undefined]}>
                              {slot.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.duelHelperText}>
                      찾기 누르면 이 시간대에 먼저 대기한 러너들 중에서 페이스와 레벨이 비슷한 상대를 바로 붙여줘요.
                    </Text>
                  </View>

                  {duelExpansionSuggestion ? (
                    <View style={styles.matchExpansionCard}>
                      <Text style={styles.matchExpansionTitle}>옆 시간대 제안</Text>
                      <Text style={styles.matchExpansionText}>
                        지금 슬롯보다 {duelExpansionSuggestion.directionLabel} {duelExpansionSuggestion.slotLabel}에 비슷한 러너가 더 많아요.
                      </Text>
                      <Text style={styles.matchExpansionMeta}>
                        {duelExpansionSuggestion.summary.averagePace} · {duelExpansionSuggestion.summary.fillRatioLabel}
                      </Text>
                      <Pressable style={styles.matchExpansionButton} onPress={() => { void handleApplyDuelExpansionSuggestion(); }}>
                        <Text style={styles.matchExpansionButtonText}>{duelExpansionSuggestion.slotLabel}로 넓혀서 다시 찾기</Text>
                      </Pressable>
                    </View>
                  ) : null}

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

                  {duelMatchState === 'ready' && effectiveDuelOpponent ? (
                    <View style={styles.duelResultCard}>
                      <Text style={styles.duelResultEyebrow}>READY</Text>
                      <Text style={styles.duelResultTitle}>{effectiveDuelOpponent.name}님이 대기 중이에요</Text>
                      <Text style={styles.duelResultMeta}>
                        {effectiveDuelOpponent.averagePace} · {effectiveDuelOpponent.levelLabel} · {effectiveDuelSlotLabel}
                        {effectiveDuelOpponentStatusLabel ? ` · ${effectiveDuelOpponentStatusLabel}` : ''}
                      </Text>
                      <Text style={styles.duelResultMeta}>
                        수락 {duelMatchStatus?.acceptedCount ?? 0}/{duelMatchStatus?.participantCount ?? 2}
                      </Text>
                      {duelExpiryCountdownLabel ? (
                        <Text style={styles.duelResultMeta}>수락이 없으면 {duelExpiryCountdownLabel} 뒤 자동 정리돼요</Text>
                      ) : null}
                      <Text style={styles.duelResultMeta}>{duelMatchStatus?.criteriaSummary}</Text>
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

                  {duelMatchState === 'countdown' && effectiveDuelOpponent ? (
                    <View style={styles.duelResultCard}>
                      <Text style={styles.duelResultEyebrow}>COUNTDOWN</Text>
                      <Text style={styles.duelResultTitle}>{duelMatchStatus?.countdownRemainingSeconds ?? 0}초 뒤 출발해요</Text>
                      <Text style={styles.duelResultMeta}>
                        {effectiveDuelOpponent.name}님 · {effectiveDuelSlotLabel}
                        {effectiveDuelOpponentStatusLabel ? ` · ${effectiveDuelOpponentStatusLabel}` : ''}
                      </Text>
                      <Text style={styles.duelResultMeta}>{duelMatchStatus?.criteriaSummary}</Text>
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

                  {duelMatchState === 'ready' ? (
                    <View style={styles.matchActionRow}>
                      {!duelMatchStatus?.userAccepted ? (
                        <View style={styles.matchActionItem}>
                          <PrimaryButton label={isAcceptingDuelMatch ? '수락 중...' : '수락하기'} onPress={handleAcceptDuelMatch} />
                        </View>
                      ) : null}
                      <View style={styles.matchActionItem}>
                        <SecondaryButton
                          label={isCancelingDuelMatch ? '취소 중...' : '대기 취소'}
                          onPress={() => {
                            void handleCancelDuelMatch();
                          }}
                        />
                      </View>
                    </View>
                  ) : duelMatchState === 'waiting' ? (
                    <SecondaryButton
                      label={isCancelingDuelMatch ? '취소 중...' : '1대1 대기 취소'}
                      onPress={() => {
                        void handleCancelDuelMatch();
                      }}
                    />
                  ) : duelMatchState === 'countdown' ? (
                    <SecondaryButton
                      label={isCancelingDuelMatch ? '취소 중...' : '매치 취소'}
                      onPress={() => {
                        void handleCancelDuelMatch();
                      }}
                    />
                  ) : duelMatchState === 'active' ? null : (
                    <SecondaryButton
                      label="1대1 매칭 찾기"
                      onPress={() => {
                        void handleRequestDuelMatch();
                      }}
                    />
                  )}
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
                    <View style={styles.slotSectionRow}>
                      {MATCH_SLOT_SECTIONS.map((section) => {
                        const isSelected = section.key === selectedGroupSlotSection;

                        return (
                          <Pressable
                            key={`group-section-${section.key}`}
                            style={[styles.slotSectionChip, isSelected ? styles.slotSectionChipSelected : undefined]}
                            onPress={() => setSelectedGroupSlotSection(section.key)}
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
                            style={[styles.duelSlotChip, isSelected ? styles.duelSlotChipSelected : undefined]}
                            onPress={() => {
                              setSelectedGroupSlotStartAt(slot.startsAt);
                              setSelectedGroupSlotSection(getMatchSlotSectionKey(slot.startsAt));
                            }}
                          >
                            <Text style={[styles.duelSlotLabel, isSelected ? styles.duelSlotLabelSelected : undefined]}>
                              {slot.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

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

                  {groupExpansionSuggestion ? (
                    <View style={styles.matchExpansionCard}>
                      <Text style={styles.matchExpansionTitle}>옆 시간대 제안</Text>
                      <Text style={styles.matchExpansionText}>
                        지금 슬롯보다 {groupExpansionSuggestion.directionLabel} {groupExpansionSuggestion.slotLabel}에 비슷한 러너가 더 많이 모여 있어요.
                      </Text>
                      <Text style={styles.matchExpansionMeta}>
                        {groupExpansionSuggestion.summary.averagePace} · {groupExpansionSuggestion.summary.fillRatioLabel}
                      </Text>
                      <Pressable style={styles.matchExpansionButton} onPress={() => { void handleApplyGroupExpansionSuggestion(); }}>
                        <Text style={styles.matchExpansionButtonText}>{groupExpansionSuggestion.slotLabel}로 넓혀서 다시 찾기</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {isRequestingGroupMatch ? <ActivityIndicator size="small" color="#818CF8" /> : null}

                  {groupMatchState === 'waiting' ? (
                    <View style={styles.duelResultCard}>
                      <Text style={styles.duelResultEyebrow}>WAITING</Text>
                      <Text style={styles.duelResultTitle}>비슷한 그룹을 모으는 중이에요</Text>
                      <Text style={styles.duelResultMeta}>
                        현재 {groupMatchStatus?.participantCount ?? 0}/{groupMatchStatus?.capacity ?? 30}명 대기 · 평균 {groupDemandSummary?.averagePace ?? '페이스 계산 중'}
                      </Text>
                      {groupExpiryCountdownLabel ? (
                        <Text style={styles.duelResultMeta}>자동 정리까지 {groupExpiryCountdownLabel} 남음</Text>
                      ) : null}
                      <Text style={styles.duelResultMeta}>{groupMatchStatus?.criteriaSummary}</Text>
                    </View>
                  ) : null}

                  {(groupMatchState === 'ready' || groupMatchState === 'countdown' || groupMatchState === 'active') && effectiveGroupParticipantCount ? (
                    <View style={styles.duelResultCard}>
                      <Text style={styles.duelResultEyebrow}>
                        {groupMatchState === 'ready' ? 'GROUP READY' : groupMatchState === 'countdown' ? 'COUNTDOWN' : 'GROUP ACTIVE'}
                      </Text>
                      <Text style={styles.duelResultTitle}>
                        {groupMatchState === 'ready'
                          ? `${effectiveGroupParticipantCount}명 그룹이 잡혔어요`
                          : groupMatchState === 'countdown'
                            ? `${groupMatchStatus?.countdownRemainingSeconds ?? 0}초 뒤 그룹전이 시작돼요`
                            : `${effectiveGroupParticipantCount}명 그룹전 바로 시작 가능`}
                      </Text>
                      <Text style={styles.duelResultMeta}>
                        {effectiveGroupSlotLabel} · 내 시작 시드 {effectiveGroupSeedRank ?? 1}위
                      </Text>
                      {groupMatchState !== 'active' ? (
                        <Text style={styles.duelResultMeta}>
                          수락 {groupMatchStatus?.acceptedCount ?? 0}/{groupMatchStatus?.participantCount ?? effectiveGroupParticipantCount}
                        </Text>
                      ) : null}
                      {groupMatchState === 'ready' && groupExpiryCountdownLabel ? (
                        <Text style={styles.duelResultMeta}>수락이 없으면 {groupExpiryCountdownLabel} 뒤 자동 정리돼요</Text>
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
                                {typeof participant.accepted === 'boolean' ? ` · ${participant.accepted ? '수락 완료' : '수락 대기'}` : ''}
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

                  {groupMatchState === 'ready' ? (
                    <View style={styles.matchActionRow}>
                      {!groupMatchStatus?.userAccepted ? (
                        <View style={styles.matchActionItem}>
                          <PrimaryButton label={isAcceptingGroupMatch ? '수락 중...' : '수락하기'} onPress={handleAcceptGroupMatch} />
                        </View>
                      ) : null}
                      <View style={styles.matchActionItem}>
                        <SecondaryButton
                          label={isCancelingGroupMatch ? '취소 중...' : '대기 취소'}
                          onPress={() => {
                            void handleCancelGroupMatch();
                          }}
                        />
                      </View>
                    </View>
                  ) : groupMatchState === 'waiting' ? (
                    <SecondaryButton
                      label={isCancelingGroupMatch ? '취소 중...' : '그룹 대기 취소'}
                      onPress={() => {
                        void handleCancelGroupMatch();
                      }}
                    />
                  ) : groupMatchState === 'countdown' ? (
                    <SecondaryButton
                      label={isCancelingGroupMatch ? '취소 중...' : '그룹전 취소'}
                      onPress={() => {
                        void handleCancelGroupMatch();
                      }}
                    />
                  ) : groupMatchState === 'active' ? null : (
                    <SecondaryButton
                      label="그룹 매칭 찾기"
                      onPress={() => {
                        void handleRequestGroupMatch();
                      }}
                    />
                  )}
                </View>
              ) : null}
            </View>
            <PrimaryButton label={readyActionLabel} onPress={handleStartTracking} />
          </Card>

          <Card style={styles.plannerCard}>
            <View style={styles.plannerHeader}>
              <Text style={styles.sectionTitle}>지도로 그림 그리기</Text>
              <Pressable style={styles.toggleButton} onPress={() => setPlannerExpanded((current) => !current)}>
                <Text style={styles.toggleButtonText}>{plannerExpanded ? '접기' : '펼치기'}</Text>
              </Pressable>
            </View>

            {plannerExpanded ? (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>그리고 싶은 모양</Text>
                  <TextInput
                    value={shapeKeyword}
                    onChangeText={setShapeKeyword}
                    placeholder="예: 고구마, 고양이 얼굴, 번개처럼 꺾이는 모양"
                    placeholderTextColor="#98A2B3"
                    style={[styles.input, styles.promptInput]}
                    autoCapitalize="none"
                    multiline
                  />
                  <Text style={styles.fieldHelp}>정해진 선택지가 아니라 문장으로 적어도 돼요. 지금은 비용 없는 템플릿 방식으로 분위기에 맞는 그림 목표선을 먼저 만들어드려요.</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>희망 거리 (km)</Text>
                  <TextInput
                    value={desiredDistanceText}
                    onChangeText={setDesiredDistanceText}
                    placeholder="희망 거리를 입력하세요"
                    placeholderTextColor="#98A2B3"
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>출발지</Text>
                  <TextInput
                    value={startLocationQuery}
                    onChangeText={(nextValue) => {
                      setStartLocationQuery(nextValue);
                      setConfirmedStartLocation(null);
                    }}
                    placeholder="예: 강남역 11번 출구, 여의나루역, 서울숲"
                    placeholderTextColor="#98A2B3"
                    style={styles.input}
                  />
                  <Text style={styles.fieldHelp}>
                    입력한 출발지 최대한 근처로 시작점을 잡아요. 이름이 비슷하거나 오타가 있을 수 있으니, 경로를 만들기 전에 위치를 확인해주세요.
                  </Text>
                  <View style={styles.inlineActionRow}>
                    <View style={styles.inlineAction}>
                      <SecondaryButton label="출발지 위치 확인" onPress={handleConfirmStartLocation} />
                    </View>
                    <View style={styles.inlineAction}>
                      <SecondaryButton label="현재 위치 사용" onPress={handleUseCurrentLocationAsStart} />
                    </View>
                  </View>
                  {confirmedStartLocation ? (
                    <View style={styles.confirmedLocationCard}>
                      <Text style={styles.confirmedLocationTitle}>확인된 출발지</Text>
                      <Text style={styles.confirmedLocationText}>{confirmedStartLocation.label}</Text>
                      {confirmedStartLocation.resolvedAddress ? (
                        <Text style={styles.confirmedLocationAddress}>{confirmedStartLocation.resolvedAddress}</Text>
                      ) : null}
                      <Text style={styles.confirmedLocationMeta}>
                        {confirmedStartLocation.coordinate.latitude.toFixed(5)}, {confirmedStartLocation.coordinate.longitude.toFixed(5)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.routeRuleCard}>
                  <Text style={styles.routeRuleTitle}>경로 생성 기준</Text>
                  <Text style={styles.routeRuleText}>최대한 입력한 모양과 비슷하게 만들어요.</Text>
                  <Text style={styles.routeRuleText}>무료 MVP에서는 도로를 자동으로 따라붙이기보다 그림 목표선을 먼저 보여드려요.</Text>
                  <Text style={styles.routeRuleText}>건물이나 횡단보도가 아닌 도로를 가로지르지 않도록 지도 앱에서 도보 경로를 한 번 더 확인해주세요.</Text>
                </View>

                {isGeneratingRoute ? <ActivityIndicator size="small" color="#6D5EF7" /> : null}

                <PrimaryButton label={suggestedRoute ? '추천 그림 경로 다시 보기' : '추천 그림 경로 보기'} onPress={handleCreateRoutePreview} />

                {suggestedRoute ? (
                  <>
                    <View style={styles.previewHeader}>
                      <View style={styles.previewHeaderCopy}>
                        <Text style={styles.previewTitle}>{suggestedRoute.displayTitle}</Text>
                        <Text style={styles.previewDescription}>{suggestedRoute.description}</Text>
                      </View>
                      <View style={styles.previewBadge}>
                        <Text style={styles.previewBadgeText}>{suggestedRoute.estimatedDistanceKm}km</Text>
                      </View>
                    </View>

                    <View style={styles.previewMapWrap}>
                      {previewMapRegion ? (
                        <RunRouteMap
                          plannedCoordinates={plannedCoordinates}
                          initialRegion={previewMapRegion}
                          emptyTitle="추천 그림 경로를 준비 중이에요."
                          emptyText="잠시만 기다려주세요."
                        />
                      ) : (
                        <View style={styles.mapEmptyState}>
                          <Text style={styles.mapEmptyTitle}>추천 그림 경로를 준비 중이에요.</Text>
                          <Text style={styles.mapEmptyText}>출발지와 거리 정보를 확인한 뒤 다시 시도해보세요.</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.previewStats}>
                      <Card style={styles.previewStatCard}>
                        <Text style={styles.previewStatLabel}>출발지</Text>
                        <Text style={styles.previewStatValue}>{suggestedRoute.startLabel}</Text>
                      </Card>
                      <Card style={styles.previewStatCard}>
                        <Text style={styles.previewStatLabel}>희망 거리</Text>
                        <Text style={styles.previewStatValue}>{suggestedRoute.requestedDistanceKm}km</Text>
                      </Card>
                    </View>

                    <Card style={styles.previewStatCard}>
                      <Text style={styles.previewStatLabel}>경로 기준</Text>
                      <Text style={styles.previewStatValue}>{getRouteProviderLabel()}</Text>
                      <Text style={styles.previewProviderText}>{getRouteProviderDescription()}</Text>
                    </Card>

                    <Text style={styles.previewFootnote}>
                      회색 선은 그림 목표선이에요. 앱 안 지도는 비용 없는 기본 지도 흐름으로 보여드리고, 실제 도보 이동 가능 여부는 카카오맵이나 네이버지도에서 한 번 더 확인할 수 있어요.
                    </Text>
                    {suggestedRoute.warning ? <Text style={styles.previewWarning}>{suggestedRoute.warning}</Text> : null}

                    <View style={styles.actionColumn}>
                      <SecondaryButton label="카카오맵으로 도보 길 확인" onPress={() => handleOpenExternalMap('kakao')} />
                      <SecondaryButton label="네이버지도로 도보 길 확인" onPress={() => handleOpenExternalMap('naver')} />
                      <PrimaryButton label="이 길로 런닝 시작" onPress={handleStartTracking} />
                      <SecondaryButton label="그림 경로 다시 만들기" onPress={handleCreateRoutePreview} />
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <Card style={styles.mapCard}>
            <View style={styles.mapHeader}>
              <View style={styles.mapLabelWrap}>
                <Text style={styles.mapKicker}>LIVE TRACKING</Text>
                <Text style={styles.mapLabel}>실시간 러닝 맵</Text>
              </View>
              <View style={[styles.statusBadge, isRunning ? styles.statusRunningDark : isPaused ? styles.statusPausedDark : styles.statusIdleDark]}>
                <Text style={[styles.statusBadgeText, isRunning ? styles.statusRunningDarkText : isPaused ? styles.statusPausedDarkText : styles.statusIdleDarkText]}>
                  {isRunning ? '러닝 중' : isPaused ? '일시정지' : isSaving ? '저장 중' : '준비됨'}
                </Text>
              </View>
            </View>
            <View style={styles.mapWrap}>
              {liveMapRegion ? (
                <RunRouteMap
                  actualCoordinates={routeCoordinates}
                  plannedCoordinates={plannedCoordinates}
                  latestCoordinate={latestPoint ? { latitude: latestPoint.latitude, longitude: latestPoint.longitude } : null}
                  initialRegion={liveMapRegion}
                  live={isRunning}
                  emptyTitle="러닝을 시작하면 경로가 여기에 표시돼요."
                  emptyText="위치 권한을 허용한 뒤 측정을 시작해보세요."
                />
              ) : (
                <View style={styles.mapEmptyState}>
                  <Text style={styles.mapEmptyTitle}>러닝을 시작하면 경로가 여기에 표시돼요.</Text>
                  <Text style={styles.mapEmptyText}>위치 권한을 허용한 뒤 측정을 시작해보세요.</Text>
                </View>
              )}
            </View>
            {matchMode !== 'solo' ? (
              <View style={styles.liveMatchCard}>
                <Text style={styles.liveMatchEyebrow}>MATCH MODE</Text>
                <Text style={styles.liveMatchTitle}>{liveMatchTitle}</Text>
                <Text style={styles.liveMatchText}>{liveMatchText}</Text>
              </View>
            ) : null}
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

          <Card style={styles.guideCard}>
            <View style={styles.guideHeader}>
              <Text style={styles.sectionTitle}>측정 상태</Text>
              <View style={[styles.statusBadge, isRunning ? styles.statusRunning : isPaused ? styles.statusPaused : styles.statusIdle]}>
                <Text style={[styles.statusBadgeText, isRunning ? styles.statusRunningText : isPaused ? styles.statusPausedText : styles.statusIdleText]}>
                  {isRunning ? '러닝 중' : isPaused ? '일시정지' : isSaving ? '저장 중' : '준비됨'}
                </Text>
              </View>
            </View>
            <Text style={styles.guideText}>
              위치 권한: {locationPermissionGranted === null ? '아직 확인 전' : locationPermissionGranted ? '허용됨' : '허용 안 됨'}
            </Text>
            <Text style={styles.guideText}>
              백그라운드 위치: {backgroundLocationPermissionGranted === null ? '아직 확인 전' : backgroundLocationPermissionGranted ? '항상 허용됨' : '항상 허용 필요'}
            </Text>
            <Text style={styles.guideText}>
              모션 권한: {motionPermissionGranted === null ? '아직 확인 전' : motionPermissionGranted ? '허용됨' : '케이던스 측정 제한'}
            </Text>
            {suggestedRoute ? <Text style={styles.guideText}>추천 경로: {suggestedRoute.displayTitle}</Text> : null}
            <Text style={styles.guideHint}>백그라운드 위치가 허용되면 화면을 벗어나도 계속 측정돼요. 다만 앱을 강제로 종료하면 측정이 중단될 수 있어요.</Text>
          </Card>

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
              {matchMode === 'duel' && effectiveDuelOpponent && duelFinishSummary ? (
                <Card style={styles.finishSummaryCard}>
                  <View style={styles.finishSummaryHeader}>
                    <View style={styles.finishSummaryCopy}>
                      <Text style={styles.finishSummaryEyebrow}>MATCH RESULT</Text>
                      <Text style={styles.finishSummaryTitle}>{duelFinishSummary.title}</Text>
                      <Text style={styles.finishSummaryText}>{duelFinishSummary.summary}</Text>
                    </View>
                    <View
                      style={[
                        styles.finishSummaryBadge,
                        duelFinishSummary.resultTone === 'win'
                          ? styles.finishSummaryBadgeWin
                          : duelFinishSummary.resultTone === 'lose'
                            ? styles.finishSummaryBadgeLose
                            : styles.finishSummaryBadgeDraw,
                      ]}
                    >
                      <Text style={styles.finishSummaryBadgeText}>
                        {duelFinishSummary.resultTone === 'win' ? 'WIN' : duelFinishSummary.resultTone === 'lose' ? 'CHASE' : 'DRAW'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.finishSummaryMeta}>
                    내 거리 {distanceKm.toFixed(2)}km · {effectiveDuelOpponent.name}님 추정 {duelFinishSummary.opponentDistanceKm.toFixed(2)}km
                  </Text>
                  <Text style={styles.finishSummaryHint}>상대 기록은 현재 매치 페이스 기준 추정치예요. 저장 후 최종 기록 비교를 이어서 볼 수 있게 확장할 예정입니다.</Text>
                </Card>
              ) : null}

              {matchMode === 'group' && groupFinishSummary ? (
                <Card style={styles.finishSummaryCard}>
                  <View style={styles.finishSummaryHeader}>
                    <View style={styles.finishSummaryCopy}>
                      <Text style={styles.finishSummaryEyebrow}>GROUP RESULT</Text>
                      <Text style={styles.finishSummaryTitle}>{groupFinishSummary.title}</Text>
                      <Text style={styles.finishSummaryText}>{groupFinishSummary.summary}</Text>
                    </View>
                    <View style={styles.finishSummaryBadge}>
                      <Text style={styles.finishSummaryBadgeText}>
                        {currentGroupStanding?.rank ?? 1}/{effectiveGroupParticipantCount}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.finishSummaryPodium}>
                    {groupFinishSummary.podium.map((participant) => (
                      <View key={participant.id} style={styles.finishSummaryPodiumRow}>
                        <Text style={styles.finishSummaryPodiumRank}>{participant.rank}</Text>
                        <View style={styles.finishSummaryPodiumCopy}>
                          <Text style={styles.finishSummaryPodiumName}>
                            {participant.name}
                            {participant.isCurrentUser ? ' (나)' : ''}
                          </Text>
                          <Text style={styles.finishSummaryPodiumMeta}>{participant.currentDistanceKm.toFixed(2)}km · {participant.averagePace}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.finishSummaryHint}>지금 보이는 순위는 종료 시점 기준 임시 순위예요. 이후 실시간 동기화 결과에 따라 조금 조정될 수 있어요.</Text>
                </Card>
              ) : null}

              <View style={styles.actionColumn}>
                <PrimaryButton label="이 기록 저장하기" onPress={handleSaveTracking} />
                {matchMode !== 'solo' ? (
                  <SecondaryButton
                    label="저장 후 다시 매칭"
                    onPress={() => {
                      void handleSaveTracking({ rematchAfterSave: true });
                    }}
                  />
                ) : null}
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
  );
}

const styles = StyleSheet.create({
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
  matchOptionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  matchOption: {
    flex: 1,
    gap: 2,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
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
  duelSlotLabel: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  duelSlotLabelSelected: {
    color: '#E0E7FF',
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
