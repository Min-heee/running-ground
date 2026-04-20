import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { RunRoutePoint } from '@/domain/types';
import { createTrackedRun } from '@/lib/api/services';
import {
  buildAveragePace,
  buildRunDateFromTimestamp,
  calculateCadenceSpm,
  calculateDistanceBetweenPoints,
  calculateElevationGainM,
  calculateRouteDistanceKm,
  formatDuration,
  formatPaceFromSpeedMps,
  getRunMapRegion,
} from '@/features/runs/tracking';

type TrackerStatus = 'idle' | 'running' | 'paused' | 'saving';

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

export default function TrackRunScreen() {
  const mapRef = useRef<MapView | null>(null);
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

  const averagePace = useMemo(() => buildAveragePace(distanceKm, elapsedSeconds), [distanceKm, elapsedSeconds]);
  const mapRegion = useMemo(() => getRunMapRegion(route), [route]);
  const latestPoint = route.length ? route[route.length - 1] : null;
  const routeCoordinates = useMemo(
    () => route.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
    [route],
  );
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isSaving = status === 'saving';

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

  const resetTrackingState = () => {
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
    setError(null);
    setStatus('idle');
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

  const handleStartTracking = async () => {
    if (Platform.OS === 'web') {
      setError('실시간 러닝 측정은 iPhone이나 Android 앱에서 사용할 수 있어.');
      return;
    }

    try {
      setError(null);
      await ensureLocationPermission();
      resetTrackingState();

      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const initialPoint = buildRoutePoint(initialLocation);
      routeRef.current = [initialPoint];
      setRoute([initialPoint]);
      sessionStartedAtRef.current = initialPoint.timestamp;
      setLocationPermissionGranted(true);

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
          resetTrackingState();
          router.replace('/my-activity');
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

  useEffect(() => {
    if (!mapRef.current || routeCoordinates.length < 2) {
      return;
    }

    mapRef.current.fitToCoordinates(routeCoordinates, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [routeCoordinates]);

  return (
    <Screen>
      <AuthHeader
        title="실시간 러닝 측정"
        subtitle="앱 안에서 바로 달리기를 시작하고 경로, 페이스, 거리, 케이던스를 함께 기록할 수 있어."
        showBack
        backHref="/my-activity"
      />

      <Card style={styles.mapCard}>
        <Text style={styles.mapLabel}>실시간 러닝 맵</Text>
        <View style={styles.mapWrap}>
          {mapRegion ? (
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={mapRegion}
              showsUserLocation
              followsUserLocation={isRunning}
              toolbarEnabled={false}
            >
              {routeCoordinates.length > 1 ? (
                <Polyline coordinates={routeCoordinates} strokeColor="#6D5EF7" strokeWidth={5} />
              ) : null}
              {latestPoint ? <Marker coordinate={{ latitude: latestPoint.latitude, longitude: latestPoint.longitude }} /> : null}
            </MapView>
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
          <Text style={styles.guideTitle}>측정 상태</Text>
          <View style={[styles.statusBadge, isRunning ? styles.statusRunning : isPaused ? styles.statusPaused : styles.statusIdle]}>
            <Text style={[styles.statusBadgeText, isRunning ? styles.statusRunningText : isPaused ? styles.statusPausedText : styles.statusIdleText]}>
              {isRunning ? '러닝 중' : isPaused ? '일시정지' : isSaving ? '저장 중' : '준비됨'}
            </Text>
          </View>
        </View>
        <Text style={styles.guideText}>위치 권한: {locationPermissionGranted === null ? '아직 확인 전' : locationPermissionGranted ? '허용됨' : '허용 안 됨'}</Text>
        <Text style={styles.guideText}>모션 권한: {motionPermissionGranted === null ? '아직 확인 전' : motionPermissionGranted ? '허용됨' : '케이던스 측정 제한'}</Text>
        <Text style={styles.guideHint}>실시간 경로와 거리는 앱이 열려 있는 동안 가장 안정적으로 측정돼요.</Text>
      </Card>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {isSaving ? <ActivityIndicator size="small" color="#6D5EF7" /> : null}

      {status === 'idle' ? (
        <PrimaryButton label="러닝 측정 시작" onPress={handleStartTracking} />
      ) : null}

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapCard: {
    gap: 12,
  },
  mapLabel: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
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
  guideTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusRunning: {
    backgroundColor: '#ECFDF3',
  },
  statusPaused: {
    backgroundColor: '#FFF4ED',
  },
  statusIdle: {
    backgroundColor: '#F2F4F7',
  },
  statusBadgeText: {
    fontWeight: '800',
  },
  statusRunningText: {
    color: '#067647',
  },
  statusPausedText: {
    color: '#B54708',
  },
  statusIdleText: {
    color: '#475467',
  },
  guideText: {
    color: '#344054',
    fontWeight: '700',
  },
  guideHint: {
    color: '#667085',
    lineHeight: 20,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
  actionColumn: {
    gap: 10,
  },
  discardButton: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  discardButtonText: {
    color: '#B42318',
    fontWeight: '800',
  },
});
