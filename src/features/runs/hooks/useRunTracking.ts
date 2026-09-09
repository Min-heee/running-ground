import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RunMatchResult, RunRoutePoint } from '@/domain';
import { buildAveragePace } from '@/features/runs/tracking';
import { type LastSyncedMatchProgress } from '@/features/runs/viewModels/matchProgress';
import { type OfficialStartBaseline } from '@/features/runs/tracking/trackingSession';
import { applyLiveRunSettings } from '@/features/runs/cheer/liveRunSettingsStore';
import {
  createCadenceWatchdogState,
  type CadenceWatchdogState,
} from '@/features/runs/integrity/cadenceWatchdogModel';
import { setGlobalTrackerBusy } from '@/features/runs/tracking/globalTrackerActivity';
import { fetchNotificationSettings } from '@/services';

export type TrackerStatus = 'idle' | 'starting' | 'running' | 'paused' | 'saving';

// 페도미터 센서 상태 (케이던스 워치독 재료, 2026-09-09).
// - available: 기기에 센서가 있고 모션 권한이 허용됨 — 저장 시 cadenceAudit.sensorAvailable.
// - active: watchStepCount 구독이 살아 있음 — 워치독 틱의 sensorReady. 안드로이드는 앱이
//   백그라운드로 가면 expo-sensors가 구독을 끊으므로 포그라운드 창에서만 true다.
export type PedometerSensorState = {
  available: boolean;
  active: boolean;
};

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
  // 케이던스 워치독 (오너 2026-09-09): 순수 판정 상태는 렌더와 무관한 ref로 든다 — 1초 틱이
  // 트리를 다시 그리면 안 되고, 저장 커맨드가 같은 원장(cadenceAudit)을 읽어야 한다.
  const cadenceWatchdogRef = useRef<CadenceWatchdogState>(createCadenceWatchdogState());
  const pedometerSensorRef = useRef<PedometerSensorState>({ available: false, active: false });

  const [status, setStatus] = useState<TrackerStatus>('idle');

  // 홈/레이스 탭의 아레나 자동 핸드오프가 "기록 중엔 발동 금지" 게이트로 읽는 모듈 미러
  // (globalTrackerActivity). status가 유일한 근원 — 언마운트 시엔 반드시 유휴로 되돌린다.
  useEffect(() => {
    setGlobalTrackerBusy(status !== 'idle');
  }, [status]);
  useEffect(() => () => setGlobalTrackerBusy(false), []);
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
    cadenceWatchdogRef,
    pedometerSensorRef,
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
