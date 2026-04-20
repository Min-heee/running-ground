import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { createRunningRoutePreview, createTrackedRun } from '@/lib/api/services';
import { buildSuggestedArtRoute, type SuggestedArtRoute } from '@/features/runs/routeArt';
import { RunRouteMap } from '@/features/runs/RunRouteMap';
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

function getRouteProviderLabel(provider: SuggestedArtRoute['provider']) {
  switch (provider) {
    case 'tmap_pedestrian':
      return 'TMAP 도보 경로';
    case 'kakao_mobility':
      return '카카오 길찾기';
    default:
      return '그림 윤곽선';
  }
}

function getRouteProviderDescription(route: SuggestedArtRoute) {
  switch (route.provider) {
    case 'tmap_pedestrian':
      return '국내 도보 길찾기 기준으로 추천선을 다시 맞춘 경로예요.';
    case 'kakao_mobility':
      return '길찾기 엔진으로 한 번 더 보정한 추천선이에요.';
    default:
      return '아직 도보 길찾기 엔진이 연결되지 않아 그림 윤곽선을 먼저 보여드리는 상태예요.';
  }
}

export function TrackRunExperience({ mode }: { mode: TrackRunMode }) {
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const pedometerSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routeRef = useRef<RunRoutePoint[]>([]);
  const elapsedBeforePauseRef = useRef(0);
  const lastResumeAtRef = useRef<number | null>(null);
  const elapsedSecondsRef = useRef(0);
  const totalStepsRef = useRef(0);
  const pedometerStepOffsetRef = useRef(0);
  const sessionStartedAtRef = useRef<string | null>(null);

  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [route, setRoute] = useState<RunRoutePoint[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentPace, setCurrentPace] = useState('--:--/km');
  const [elevationGainM, setElevationGainM] = useState(0);
  const [cadenceSpm, setCadenceSpm] = useState<number | null>(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean | null>(null);
  const [motionPermissionGranted, setMotionPermissionGranted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shapeKeyword, setShapeKeyword] = useState('고구마');
  const [desiredDistanceText, setDesiredDistanceText] = useState('5');
  const [startLocationQuery, setStartLocationQuery] = useState('');
  const [isGeneratingRoute, setIsGeneratingRoute] = useState(false);
  const [suggestedRoute, setSuggestedRoute] = useState<SuggestedArtRoute | null>(null);
  const [plannerExpanded, setPlannerExpanded] = useState(false);

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
  const latestPoint = route.length ? route[route.length - 1] : null;
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isSaving = status === 'saving';
  const isIdle = status === 'idle';
  const isTabMode = mode === 'tab';
  const backHref: Href = '/my-activity';
  const discardRedirectHref: Href | null = isTabMode ? null : '/my-activity';

  const syncElapsedSeconds = (nextElapsedSeconds: number) => {
    elapsedSecondsRef.current = nextElapsedSeconds;
    setElapsedSeconds(nextElapsedSeconds);
    setCadenceSpm(calculateCadenceSpm(totalStepsRef.current, nextElapsedSeconds));
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopLocationSubscription = () => {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
  };

  const stopPedometerSubscription = () => {
    pedometerSubscriptionRef.current?.remove();
    pedometerSubscriptionRef.current = null;
  };

  const stopLiveSubscriptions = () => {
    stopLocationSubscription();
    stopPedometerSubscription();
  };

  const pauseClock = () => {
    clearTimer();

    if (lastResumeAtRef.current) {
      elapsedBeforePauseRef.current += Date.now() - lastResumeAtRef.current;
      lastResumeAtRef.current = null;
    }

    syncElapsedSeconds(Math.floor(elapsedBeforePauseRef.current / 1000));
  };

  const startClock = () => {
    lastResumeAtRef.current = Date.now();
    clearTimer();
    timerRef.current = setInterval(() => {
      if (!lastResumeAtRef.current) {
        return;
      }

      const nextElapsedSeconds = Math.floor((elapsedBeforePauseRef.current + (Date.now() - lastResumeAtRef.current)) / 1000);
      syncElapsedSeconds(nextElapsedSeconds);
    }, 1000);
  };

  const resetLiveTrackingState = () => {
    stopLiveSubscriptions();
    clearTimer();
    elapsedBeforePauseRef.current = 0;
    lastResumeAtRef.current = null;
    elapsedSecondsRef.current = 0;
    totalStepsRef.current = 0;
    pedometerStepOffsetRef.current = 0;
    sessionStartedAtRef.current = null;
    routeRef.current = [];
    setRoute([]);
    setDistanceKm(0);
    setElapsedSeconds(0);
    setCurrentPace('--:--/km');
    setElevationGainM(0);
    setCadenceSpm(null);
  };

  const returnToIdleState = ({ keepSuggestedRoute = true }: { keepSuggestedRoute?: boolean } = {}) => {
    resetLiveTrackingState();
    setStatus('idle');
    setError(null);

    if (!keepSuggestedRoute) {
      setSuggestedRoute(null);
    }
  };

  const appendLocationPoint = (location: Location.LocationObject) => {
    const nextPoint = buildRoutePoint(location);
    const previousPoint = routeRef.current.length ? routeRef.current[routeRef.current.length - 1] : null;

    if (previousPoint) {
      const segmentDistanceMeters = calculateDistanceBetweenPoints(previousPoint, nextPoint);
      const timeDelta = new Date(nextPoint.timestamp).getTime() - new Date(previousPoint.timestamp).getTime();

      if (segmentDistanceMeters < 2 && timeDelta < 4000) {
        if (typeof location.coords.speed === 'number') {
          setCurrentPace(formatPaceFromSpeedMps(location.coords.speed));
        }
        return;
      }
    }

    const nextRoute = [...routeRef.current, nextPoint];
    routeRef.current = nextRoute;
    setRoute(nextRoute);
    setDistanceKm(calculateRouteDistanceKm(nextRoute));
    setElevationGainM(calculateElevationGainM(nextRoute));
    setCurrentPace(formatPaceFromSpeedMps(location.coords.speed));
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

  const startLocationUpdates = async () => {
    locationSubscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 4,
        mayShowUserSettingsDialog: true,
      },
      appendLocationPoint,
    );
  };

  const ensureLocationPermission = async () => {
    const foregroundPermission = await Location.requestForegroundPermissionsAsync();
    const granted = foregroundPermission.granted || foregroundPermission.status === 'granted';
    setLocationPermissionGranted(granted);

    if (!granted) {
      throw new Error('위치 권한을 허용해야 지도와 거리 측정이 가능해.');
    }
  };

  const resolveRoutePreviewStart = async () => {
    const trimmedStartLocation = startLocationQuery.trim();

    if (trimmedStartLocation) {
      const geocoded = await Location.geocodeAsync(trimmedStartLocation);

      if (!geocoded.length) {
        throw new Error('출발지 위치를 찾지 못했어. 조금 더 구체적으로 입력해줘.');
      }

      return {
        coordinate: {
          latitude: geocoded[0].latitude,
          longitude: geocoded[0].longitude,
        },
        label: trimmedStartLocation,
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
      let previewToShow = nextSuggestedRoute;

      try {
        const routedPreview = await createRunningRoutePreview({
          keyword: nextSuggestedRoute.requestedKeyword || shapeKeyword || '시그니처',
          desiredDistanceKm: nextSuggestedRoute.requestedDistanceKm,
          startLabel: nextSuggestedRoute.startLabel,
          displayTitle: nextSuggestedRoute.displayTitle,
          description: nextSuggestedRoute.description,
          roughCoordinates: nextSuggestedRoute.coordinates,
        });

        previewToShow = {
          ...nextSuggestedRoute,
          displayTitle: routedPreview.displayTitle,
          description: routedPreview.description,
          startLabel: routedPreview.startLabel,
          requestedKeyword: routedPreview.requestedKeyword,
          requestedDistanceKm: routedPreview.requestedDistanceKm,
          estimatedDistanceKm: routedPreview.estimatedDistanceKm,
          coordinates: routedPreview.coordinates,
          provider: routedPreview.provider,
          roadFollowed: routedPreview.roadFollowed,
          warning: routedPreview.warning,
        };
      } catch (previewError) {
        previewToShow = {
          ...nextSuggestedRoute,
          warning: previewError instanceof Error
            ? `${previewError.message} 우선 그림 윤곽선을 먼저 보여드릴게요.`
            : '도로 기반 추천선을 아직 만들지 못해서, 우선 그림 윤곽선을 먼저 보여드려요.',
        };
      }

      setDesiredDistanceText(String(nextSuggestedRoute.requestedDistanceKm));
      setSuggestedRoute(previewToShow);
      setPlannerExpanded(true);
    } catch (planningError) {
      setError(planningError instanceof Error ? planningError.message : '추천 그림 경로를 만들지 못했어.');
    } finally {
      setIsGeneratingRoute(false);
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
      resetLiveTrackingState();

      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const initialPoint = buildRoutePoint(initialLocation);
      routeRef.current = [initialPoint];
      setRoute([initialPoint]);
      sessionStartedAtRef.current = initialPoint.timestamp;
      setLocationPermissionGranted(true);

      if (suggestedRoute?.coordinates.length) {
        const gapFromSuggestedStartMeters = calculateDistanceBetweenPoints(initialPoint, suggestedRoute.coordinates[0]);

        if (gapFromSuggestedStartMeters > 200) {
          setError(`현재 위치가 추천 경로 시작점에서 ${Math.round(gapFromSuggestedStartMeters)}m 정도 떨어져 있어요. 안내선은 참고선으로 보시면 좋아요.`);
        }
      }

      await startLocationUpdates();
      await startPedometerUpdates();
      setStatus('running');
      startClock();
    } catch (trackingError) {
      setError(trackingError instanceof Error ? trackingError.message : '러닝 측정을 시작하지 못했어.');
      stopLiveSubscriptions();
      clearTimer();
      setStatus('idle');
    }
  };

  const handlePauseTracking = () => {
    stopLiveSubscriptions();
    pauseClock();
    setCurrentPace('--:--/km');
    setStatus('paused');
  };

  const handleResumeTracking = async () => {
    try {
      setError(null);
      await startLocationUpdates();
      await startPedometerUpdates();
      startClock();
      setStatus('running');
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : '러닝 측정을 다시 시작하지 못했어.');
      stopLiveSubscriptions();
      pauseClock();
      setStatus('paused');
    }
  };

  const handleDiscardTracking = () => {
    Alert.alert('기록 버리기', '지금까지 측정한 경로와 기록을 지울까요?', [
      { text: '계속 측정할게요', style: 'cancel' },
      {
        text: '버릴게요',
        style: 'destructive',
        onPress: () => {
          returnToIdleState({ keepSuggestedRoute: true });

          if (discardRedirectHref) {
            router.replace(discardRedirectHref);
          }
        },
      },
    ]);
  };

  const handleSaveTracking = async () => {
    try {
      setError(null);

      if (status === 'running') {
        handlePauseTracking();
      }

      const startedAt = sessionStartedAtRef.current ?? new Date().toISOString();
      const endedAt = routeRef.current.length ? routeRef.current[routeRef.current.length - 1].timestamp : new Date().toISOString();
      const finalDistanceKm = calculateRouteDistanceKm(routeRef.current);
      const finalElevationGainM = calculateElevationGainM(routeRef.current);
      const finalCadenceSpm = calculateCadenceSpm(totalStepsRef.current, elapsedSecondsRef.current);
      const averagePaceLabel = buildAveragePace(finalDistanceKm, elapsedSecondsRef.current);

      if (routeRef.current.length < 2 || finalDistanceKm < 0.1) {
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
        durationSeconds: elapsedSecondsRef.current,
        cadenceSpm: finalCadenceSpm,
        elevationGainM: finalElevationGainM,
        route: routeRef.current,
        startedAt,
        endedAt,
      });

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
    return () => {
      stopLiveSubscriptions();
      clearTimer();
    };
  }, []);

  return (
    <Screen>
      <AuthHeader
        title="실시간 러닝"
        subtitle={
          isTabMode
            ? '바로 달리기를 시작하거나, 원하는 그림 모양 경로를 먼저 만들어보고 따라 뛸 수 있어.'
            : '원하는 그림 경로를 먼저 미리 보고, 마음에 들면 바로 달리기를 시작할 수 있어.'
        }
        showBack={!isTabMode}
        backHref={backHref}
      />

      {isIdle ? (
        <>
          <Card style={styles.readyCard}>
            <Text style={styles.sectionTitle}>런닝 시작 준비</Text>
            <Text style={styles.readyText}>
              실시간 맵과 기록 카드는 러닝을 시작하면 열려요. 바로 시작할 수도 있고, 먼저 그림 러닝을 만들어볼 수도 있어요.
            </Text>
            <PrimaryButton label="바로 런닝 시작" onPress={handleStartTracking} />
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
                  <Text style={styles.fieldLabel}>원하는 모양</Text>
                  <TextInput
                    value={shapeKeyword}
                    onChangeText={setShapeKeyword}
                    placeholder="원하는 모양을 입력하세요"
                    placeholderTextColor="#98A2B3"
                    style={styles.input}
                    autoCapitalize="none"
                  />
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
                    onChangeText={setStartLocationQuery}
                    placeholder="출발지를 입력하세요"
                    placeholderTextColor="#98A2B3"
                    style={styles.input}
                  />
                  <Text style={styles.fieldHelp}>비워두면 현재 위치 기준으로 추천선을 만들어드려요.</Text>
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
                      <Text style={styles.previewStatValue}>{getRouteProviderLabel(suggestedRoute.provider)}</Text>
                      <Text style={styles.previewProviderText}>{getRouteProviderDescription(suggestedRoute)}</Text>
                    </Card>

                    <Text style={styles.previewFootnote}>
                      {suggestedRoute.roadFollowed
                        ? '회색 선은 실제로 이동 가능한 도보 경로 기준 추천선이에요. 러닝을 시작하면 실제로 뛴 길이 다른 색으로 함께 표시돼요.'
                        : '회색 선은 그림 윤곽을 먼저 보여주는 추천선이에요. 러닝을 시작하면 실제로 뛴 길이 다른 색으로 함께 표시돼요.'}
                    </Text>
                    {suggestedRoute.warning ? <Text style={styles.previewWarning}>{suggestedRoute.warning}</Text> : null}

                    <View style={styles.actionColumn}>
                      <PrimaryButton label="권장 길대로 뛰기" onPress={handleStartTracking} />
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
            <Text style={styles.mapLabel}>실시간 러닝 맵</Text>
            <Text style={styles.mapLegend}>
              {suggestedRoute ? '회색은 추천 경로, 보라는 실제로 뛴 경로예요.' : '달리기를 시작한 뒤 실제로 뛴 경로가 여기에 표시돼요.'}
            </Text>
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
              모션 권한: {motionPermissionGranted === null ? '아직 확인 전' : motionPermissionGranted ? '허용됨' : '케이던스 측정 제한'}
            </Text>
            {suggestedRoute ? <Text style={styles.guideText}>추천 경로: {suggestedRoute.displayTitle}</Text> : null}
            <Text style={styles.guideHint}>앱이 열려 있는 동안 실시간 경로와 거리 측정이 가장 안정적이에요.</Text>
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
    gap: 12,
  },
  readyText: {
    color: '#667085',
    lineHeight: 21,
  },
  plannerCard: {
    gap: 16,
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
    backgroundColor: '#F2F4F7',
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
    backgroundColor: '#FFFFFF',
    color: '#111827',
    fontSize: 15,
  },
  fieldHelp: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 18,
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
    gap: 12,
  },
  mapLabel: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  mapLegend: {
    color: '#667085',
    lineHeight: 20,
  },
  mapWrap: {
    height: 280,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
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
  },
  metricLabel: {
    color: '#667085',
    fontWeight: '700',
  },
  metricValue: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
  },
  guideCard: {
    gap: 10,
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
