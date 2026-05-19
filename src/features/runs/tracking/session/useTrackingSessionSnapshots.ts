import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import {
  getBackgroundRunElapsedSeconds,
  getBackgroundRunTrackingSnapshot,
  isBackgroundRunWarmupSnapshot,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import {
  buildAveragePace,
  calculateCadenceSpm,
} from '@/features/runs/tracking';
import {
  buildOfficialStartBaseline,
} from '@/features/runs/tracking/trackingSession';
import { buildDisplayedTrackingSnapshot } from '@/features/runs/viewModels/trackingDisplayModel';
import {
  normalizeMatchProgressPace,
} from '@/features/runs/viewModels/matchProgress';
import { LIVE_MATCH_UI_DISPLAY_INTERVAL_MS } from '@/features/runs/sync/liveMatchCadence';
import type {
  DisplayedMatchProgress,
  DisplayedTrackingSnapshot,
  UseRunTrackingFlowInput,
} from '@/features/runs/types/runTrackingFlow';

type TrackingUiFrame = {
  currentPace: string;
  distanceKm: number;
  elapsedSeconds: number;
  elevationGainM: number;
  status: BackgroundRunTrackingSnapshot['status'] | 'starting';
};

type UseTrackingSessionSnapshotsInput = Pick<
  UseRunTrackingFlowInput,
  | 'routeRef'
  | 'elapsedSecondsRef'
  | 'totalStepsRef'
  | 'preStartWarmupMatchIdRef'
  | 'officialStartBaselineRef'
  | 'roomLinkedMatchContextRef'
  | 'duelMatchStatusRef'
  | 'groupMatchStatusRef'
  | 'matchModeRef'
  | 'setStatus'
  | 'setRoute'
  | 'setDistanceKm'
  | 'setElapsedSeconds'
  | 'setCurrentPace'
  | 'setElevationGainM'
  | 'setCadenceSpm'
  | 'officialStartDistanceNoiseGraceSeconds'
  | 'officialStartDistanceNoiseGraceKm'
  | 'getSyncedNowMs'
>;

function buildTrackingUiFrame(
  snapshot: BackgroundRunTrackingSnapshot,
  displayedSnapshot: DisplayedTrackingSnapshot,
): TrackingUiFrame {
  return {
    currentPace: displayedSnapshot.currentPace,
    distanceKm: displayedSnapshot.distanceKm,
    elapsedSeconds: displayedSnapshot.elapsedSeconds,
    elevationGainM: displayedSnapshot.elevationGainM,
    status: isBackgroundRunWarmupSnapshot(snapshot) ? 'starting' : snapshot.status,
  };
}

function hasCriticalTrackingUiChange(
  previousFrame: TrackingUiFrame | null,
  nextFrame: TrackingUiFrame,
) {
  if (!previousFrame) {
    return true;
  }

  return previousFrame.status !== nextFrame.status
    || nextFrame.elapsedSeconds < previousFrame.elapsedSeconds
    || nextFrame.distanceKm < previousFrame.distanceKm;
}

export function useTrackingSessionSnapshots({
  routeRef,
  elapsedSecondsRef,
  totalStepsRef,
  preStartWarmupMatchIdRef,
  officialStartBaselineRef,
  roomLinkedMatchContextRef,
  duelMatchStatusRef,
  groupMatchStatusRef,
  matchModeRef,
  setStatus,
  setRoute,
  setDistanceKm,
  setElapsedSeconds,
  setCurrentPace,
  setElevationGainM,
  setCadenceSpm,
  officialStartDistanceNoiseGraceSeconds,
  officialStartDistanceNoiseGraceKm,
  getSyncedNowMs,
}: UseTrackingSessionSnapshotsInput) {
  const lastTrackingUiFlushMsRef = useRef(0);
  const lastTrackingUiFrameRef = useRef<TrackingUiFrame | null>(null);

  const syncElapsedSeconds = useCallback((nextElapsedSeconds: number, options?: { commitState?: boolean }) => {
    const commitState = options?.commitState ?? true;
    elapsedSecondsRef.current = nextElapsedSeconds;

    if (commitState) {
      setElapsedSeconds(nextElapsedSeconds);
      setCadenceSpm(calculateCadenceSpm(totalStepsRef.current, nextElapsedSeconds));
    }
  }, [
    elapsedSecondsRef,
    setCadenceSpm,
    setElapsedSeconds,
    totalStepsRef,
  ]);

  const resolveWarmupOfficialStartTarget = useCallback(() => {
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
  }, [
    duelMatchStatusRef,
    groupMatchStatusRef,
    preStartWarmupMatchIdRef,
    roomLinkedMatchContextRef,
  ]);

  const ensureOfficialStartBaseline = useCallback((snapshot: BackgroundRunTrackingSnapshot) => {
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
  }, [
    getSyncedNowMs,
    officialStartBaselineRef,
    preStartWarmupMatchIdRef,
    resolveWarmupOfficialStartTarget,
  ]);

  const getDisplayedTrackingSnapshot = useCallback((
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
  ): DisplayedTrackingSnapshot => {
    ensureOfficialStartBaseline(snapshot);
    return buildDisplayedTrackingSnapshot({
      snapshot,
      rawElapsedSeconds: getBackgroundRunElapsedSeconds(snapshot),
      officialStartBaseline: officialStartBaselineRef.current,
      hasPreStartWarmup: Boolean(preStartWarmupMatchIdRef.current),
      startNoiseGraceSeconds: officialStartDistanceNoiseGraceSeconds,
      startNoiseGraceKm: officialStartDistanceNoiseGraceKm,
    });
  }, [
    ensureOfficialStartBaseline,
    officialStartBaselineRef,
    officialStartDistanceNoiseGraceKm,
    officialStartDistanceNoiseGraceSeconds,
    preStartWarmupMatchIdRef,
  ]);

  const buildDisplayedMatchProgress = useCallback((
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
  ): DisplayedMatchProgress => {
    const displayedSnapshot = getDisplayedTrackingSnapshot(snapshot);
    const displayedAveragePace = buildAveragePace(displayedSnapshot.distanceKm, displayedSnapshot.elapsedSeconds);
    return {
      distanceKm: displayedSnapshot.distanceKm,
      elapsedSeconds: displayedSnapshot.elapsedSeconds,
      currentPace: normalizeMatchProgressPace(displayedSnapshot.currentPace, displayedAveragePace),
    };
  }, [getDisplayedTrackingSnapshot]);

  const syncFromBackgroundTracking = useCallback((
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
  ) => {
    const displayedSnapshot = getDisplayedTrackingSnapshot(snapshot);
    // Route points are needed for saving, but rendering the growing array every tick is expensive on Android.
    routeRef.current = displayedSnapshot.route;

    const nextUiFrame = buildTrackingUiFrame(snapshot, displayedSnapshot);
    const shouldThrottleLiveMatchUi = Platform.OS === 'android'
      && matchModeRef.current !== 'solo'
      && snapshot.status === 'running';
    const nowMs = Date.now();
    const shouldCommitUiState = !shouldThrottleLiveMatchUi
      || hasCriticalTrackingUiChange(lastTrackingUiFrameRef.current, nextUiFrame)
      || nowMs - lastTrackingUiFlushMsRef.current >= LIVE_MATCH_UI_DISPLAY_INTERVAL_MS;

    if (!shouldCommitUiState) {
      syncElapsedSeconds(displayedSnapshot.elapsedSeconds, { commitState: false });
      return;
    }

    lastTrackingUiFlushMsRef.current = nowMs;
    lastTrackingUiFrameRef.current = nextUiFrame;
    setDistanceKm(displayedSnapshot.distanceKm);
    setElevationGainM(displayedSnapshot.elevationGainM);
    setCurrentPace(displayedSnapshot.currentPace);
    setStatus(snapshot.status);
    syncElapsedSeconds(displayedSnapshot.elapsedSeconds);
  }, [
    getDisplayedTrackingSnapshot,
    matchModeRef,
    routeRef,
    setCurrentPace,
    setDistanceKm,
    setElevationGainM,
    setStatus,
    syncElapsedSeconds,
  ]);

  return {
    buildDisplayedMatchProgress,
    getDisplayedTrackingSnapshot,
    syncElapsedSeconds,
    syncFromBackgroundTracking,
  };
}
