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
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { RunRoutePoint } from '@/domain/types';
import { createTrackedRun, updateRunningLiveShare } from '@/lib/api/services';
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

export function TrackRunExperience({ mode }: { mode: TrackRunMode }) {
  const pedometerSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routeRef = useRef<RunRoutePoint[]>([]);
  const elapsedSecondsRef = useRef(0);
  const totalStepsRef = useRef(0);
  const pedometerStepOffsetRef = useRef(0);
  const liveShareEnabledRef = useRef(false);
  const liveShareLabelRef = useRef<string | null>(null);
  const liveShareHeartbeatRef = useRef(0);

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
        meta: `${formatMatchTargetDistance(matchTargetDistanceKm)} 기준 · 시간과 페이스 비교`,
        startLabel: '1대1 매치로 시작',
        liveTitle: '1대1 매치 진행 중',
        liveText: '완주 시간과 평균 페이스를 중심으로 오늘 결과를 비교하기 좋은 모드예요.',
      },
      {
        mode: 'group' as const,
        label: '그룹',
        title: '그룹 대결',
        summary: '4명 안팎 러너와 순위표를 보는 그룹전 모드예요.',
        meta: `${formatMatchTargetDistance(matchTargetDistanceKm)} 기준 · 누적 거리와 페이스 순위`,
        startLabel: '그룹 대결로 시작',
        liveTitle: '그룹 대결 진행 중',
        liveText: '중간에 흔들리지 않고 꾸준히 밀어붙일 때 더 재미있는 모드예요.',
      },
    ],
    [matchTargetDistanceKm],
  );
  const latestPoint = route.length ? route[route.length - 1] : null;
  const selectedMatch = matchOptions.find((option) => option.mode === matchMode) ?? matchOptions[0];
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isSaving = status === 'saving';
  const isIdle = status === 'idle';
  const isTabMode = mode === 'tab';
  const backHref: Href = '/my-activity';
  const discardRedirectHref: Href | null = isTabMode ? null : '/my-activity';

  useEffect(() => {
    liveShareEnabledRef.current = liveShareEnabled;
  }, [liveShareEnabled]);

  useEffect(() => {
    liveShareLabelRef.current = liveShareLabel;
  }, [liveShareLabel]);

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

  const handlePauseTracking = async () => {
    await pauseBackgroundRunTracking();
    stopForegroundTrackingHelpers();
    syncFromBackgroundTracking();

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

  const handleSaveTracking = async () => {
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
      });

      await syncLiveSharing({
        enabled: false,
        status: 'idle',
      }).catch(() => {});

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

      if (snapshot.status === 'running') {
        startElapsedTicker();
      } else {
        clearElapsedTicker();
      }
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncFromBackgroundTracking();
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
          <Card style={styles.readyCard}>
            <View style={styles.readyHero}>
              <Text style={styles.readyEyebrow}>RunningGround</Text>
              <Text style={styles.readyTitle}>런닝 시작 준비</Text>
              <View style={styles.readyPillRow}>
                <View style={styles.readyPill}>
                  <Text style={styles.readyPillText}>실시간 맵</Text>
                </View>
                <View style={styles.readyPill}>
                  <Text style={styles.readyPillText}>거리 · 페이스</Text>
                </View>
                <View style={styles.readyPill}>
                  <Text style={styles.readyPillText}>백그라운드 측정</Text>
                </View>
              </View>
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
                  <Text style={styles.matchDescription}>혼자 뛰기 아쉬운 날엔 바로 매칭 모드를 고르고 시작할 수 있어요.</Text>
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
                      <Text style={[styles.matchOptionSummary, isSelected ? styles.matchOptionSummarySelected : undefined]}>
                        {option.summary}
                      </Text>
                      <Text style={[styles.matchOptionMeta, isSelected ? styles.matchOptionMetaSelected : undefined]}>
                        {option.meta}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.matchSummaryCard}>
                <Text style={styles.matchSummaryTitle}>{selectedMatch.title}</Text>
                <Text style={styles.matchSummaryText}>{selectedMatch.summary}</Text>
                <Text style={styles.matchSummaryMeta}>{selectedMatch.meta}</Text>
              </View>
            </View>
            <PrimaryButton label={selectedMatch.startLabel} onPress={handleStartTracking} />
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
                <Text style={styles.liveMatchTitle}>{selectedMatch.liveTitle}</Text>
                <Text style={styles.liveMatchText}>{selectedMatch.liveText}</Text>
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
              <PrimaryButton label="러닝 종료하고 저장" onPress={handleSaveTracking} />
              <SecondaryButton label="일시정지" onPress={handlePauseTracking} />
            </View>
          ) : null}

          {isPaused ? (
            <View style={styles.actionColumn}>
              <PrimaryButton label="이 기록 저장하기" onPress={handleSaveTracking} />
              <SecondaryButton label="측정 다시 시작" onPress={handleResumeTracking} />
              <Pressable style={styles.discardButton} onPress={handleDiscardTracking}>
                <Text style={styles.discardButtonText}>이 기록 버리기</Text>
              </Pressable>
            </View>
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
    gap: 12,
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
    gap: 4,
  },
  matchTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  matchDescription: {
    color: '#D0D5DD',
    lineHeight: 19,
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
    gap: 10,
  },
  matchOption: {
    gap: 6,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
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
  matchOptionSummary: {
    color: '#D0D5DD',
    lineHeight: 19,
  },
  matchOptionSummarySelected: {
    color: '#E5E7EB',
  },
  matchOptionMeta: {
    color: '#98A2B3',
    fontSize: 12,
    fontWeight: '700',
  },
  matchOptionMetaSelected: {
    color: '#C7D2FE',
  },
  matchSummaryCard: {
    gap: 6,
    borderRadius: 18,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    padding: 14,
  },
  matchSummaryTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  matchSummaryText: {
    color: '#D0D5DD',
    lineHeight: 19,
  },
  matchSummaryMeta: {
    color: '#98A2B3',
    fontSize: 12,
    fontWeight: '700',
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
