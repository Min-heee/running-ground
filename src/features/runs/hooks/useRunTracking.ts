import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RunMatchResult, RunRoutePoint } from '@/domain';
import { buildAveragePace } from '@/features/runs/tracking';
import { type LastSyncedMatchProgress } from '@/features/runs/viewModels/matchProgress';
import { type OfficialStartBaseline } from '@/features/runs/tracking/trackingSession';
import { applyLiveRunSettings } from '@/features/runs/cheer/liveRunSettingsStore';
import { fetchNotificationSettings } from '@/services';

export type TrackerStatus = 'idle' | 'starting' | 'running' | 'paused' | 'saving';

export type SaveTrackingOptions = {
  allowShortDistanceSave?: boolean;
  allowStationaryForfeitSave?: boolean;
  exitIfUnsavable?: boolean;
  matchResultOverride?: RunMatchResult | null;
  onSavedRun?: (runId: string) => void;
  resetAfterSave?: boolean;
  // C-1 — the caller navigates to run-detail itself (with matchId params), so the save
  // command must NOT also fire runPointRankingPostProcessor's matchId-less router.replace:
  // that double-replace mounted run-detail twice and doubled the reconcile fetches.
  skipPostProcessorNavigation?: boolean;
};

export function useRunTracking() {
  const pedometerSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soloStartCountdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soloStartCountdownResolveRef = useRef<((completed: boolean) => void) | null>(null);
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
  const officialStartBaselineRef = useRef<OfficialStartBaseline | null>(null);

  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [soloStartCountdownSeconds, setSoloStartCountdownSeconds] = useState<number | null>(null);
  const [route, setRoute] = useState<RunRoutePoint[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentPace, setCurrentPace] = useState('--:--/km');
  const [lastSyncedMatchProgress, setLastSyncedMatchProgress] = useState<LastSyncedMatchProgress | null>(null);
  const [elevationGainM, setElevationGainM] = useState(0);
  const [cadenceSpm, setCadenceSpm] = useState<number | null>(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean | null>(null);
  const [backgroundLocationPermissionGranted, setBackgroundLocationPermissionGranted] = useState<boolean | null>(null);
  const [motionPermissionGranted, setMotionPermissionGranted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 라이브 공개는 마이탭 설정이 정한다 (기본 공개). 설정을 못 불러와도 기본값 유지 —
  // 비공개 유저만 명시적으로 꺼진다.
  const [liveShareEnabled, setLiveShareEnabled] = useState(true);
  const [liveShareLabel, setLiveShareLabel] = useState<string | null>(null);

  const averagePace = useMemo(() => buildAveragePace(distanceKm, elapsedSeconds), [distanceKm, elapsedSeconds]);

  // 마이탭 설정(라이브 공개/응원 수신)을 러닝 파이프에 반영한다. 실패하면 기본값(공개+수신)
  // 유지 — 설정 조회가 안 된다고 러닝이 막히면 안 된다.
  useEffect(() => {
    let active = true;

    fetchNotificationSettings()
      .then((settings) => {
        applyLiveRunSettings(settings);

        if (active) {
          setLiveShareEnabled(settings.liveRunPublic !== false);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return {
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
  };
}
