import { useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RunMatchResult, RunRoutePoint } from '@/domain';
import { buildAveragePace } from '@/features/runs/tracking';
import { type LastSyncedMatchProgress } from '@/features/runs/viewModels/matchProgress';
import { type OfficialStartBaseline } from '@/features/runs/tracking/trackingSession';

export type TrackerStatus = 'idle' | 'starting' | 'running' | 'paused' | 'saving';

export type SaveTrackingOptions = {
  allowShortDistanceSave?: boolean;
  allowStationaryForfeitSave?: boolean;
  exitIfUnsavable?: boolean;
  matchResultOverride?: RunMatchResult | null;
  onSavedRun?: (runId: string) => void;
  resetAfterSave?: boolean;
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
  const [liveShareEnabled, setLiveShareEnabled] = useState(false);
  const [liveShareLabel, setLiveShareLabel] = useState<string | null>(null);

  const averagePace = useMemo(() => buildAveragePace(distanceKm, elapsedSeconds), [distanceKm, elapsedSeconds]);

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
