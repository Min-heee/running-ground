import { useCallback, useEffect, useRef } from 'react';
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
import {
  buildDisplayedTrackingSnapshot,
  resolveSlotAnchoredElapsedSeconds,
} from '@/features/runs/viewModels/trackingDisplayModel';
import {
  normalizeMatchProgressPace,
} from '@/features/runs/viewModels/matchProgress';
import { LIVE_MATCH_UI_DISPLAY_INTERVAL_MS } from '@/features/runs/sync/liveMatchCadence';
import { rgDiagLog } from '@/utils/rgPerfTrace';
import {
  resolveActiveMatchSlotStartAt,
  resolveSlotElapsedTickerDelayMs,
  shouldRunSlotElapsedTicker,
} from './trackingSessionMatchSlot';
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

type SlotElapsedTickerHandle = ReturnType<typeof setTimeout>;

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
  | 'matchLifecycleController'
  | 'slotElapsedTickerEnabled'
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
  matchLifecycleController,
  matchModeRef,
  slotElapsedTickerEnabled = true,
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
  const slotElapsedTickerRef = useRef<SlotElapsedTickerHandle | null>(null);
  const slotElapsedTickerActiveRef = useRef(false);
  const activeMatchSlotStartAt = resolveActiveMatchSlotStartAt(matchLifecycleController);
  const syncElapsedSeconds = useCallback((nextElapsedSeconds: number, options?: {
    commitState?: boolean;
    source?: string;
  }) => {
    const commitState = options?.commitState ?? true;
    rgDiagLog('elapsed-trace syncElapsedSeconds', {
      commitState,
      nowMs: Date.now(),
      prevRef: elapsedSecondsRef.current,
      slotActive: slotElapsedTickerActiveRef.current,
      source: options?.source ?? 'unknown',
      value: nextElapsedSeconds,
    });
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

  useEffect(() => {
    const slotStartAt = activeMatchSlotStartAt;
    if (!slotStartAt || !shouldRunSlotElapsedTicker({
      activeMatchSlotStartAt: slotStartAt,
      enabled: slotElapsedTickerEnabled,
    })) {
      if (slotElapsedTickerActiveRef.current) {
        rgDiagLog('elapsed-trace slot ticker DISABLE', {
          enabled: slotElapsedTickerEnabled,
          nowMs: Date.now(),
          prevElapsedRef: elapsedSecondsRef.current,
          reason: !slotStartAt ? 'no-slot-start'
            : !slotElapsedTickerEnabled ? 'gate-off'
              : 'helper-false',
          slotStartAt,
        });
      }
      slotElapsedTickerActiveRef.current = false;
      return undefined;
    }

    const slotStartMs = Date.parse(slotStartAt);
    if (!Number.isFinite(slotStartMs)) {
      if (slotElapsedTickerActiveRef.current) {
        rgDiagLog('elapsed-trace slot ticker DISABLE', {
          reason: 'invalid-slotStartMs',
          slotStartAt,
        });
      }
      slotElapsedTickerActiveRef.current = false;
      return undefined;
    }

    let tickCount = 0;
    rgDiagLog('elapsed-trace slot ticker ENABLE', {
      nowMs: Date.now(),
      prevElapsedRef: elapsedSecondsRef.current,
      slotStartAt,
      slotStartMs,
    });
    slotElapsedTickerActiveRef.current = true;

    const clearSlotElapsedTicker = (ticker: SlotElapsedTickerHandle) => {
      clearTimeout(ticker);
      if (slotElapsedTickerRef.current === ticker) {
        slotElapsedTickerRef.current = null;
      }
      slotElapsedTickerActiveRef.current = false;
    };

    const commitSlotElapsedSeconds = () => {
      const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      const syncedNowMs = getSyncedNowMs();
      const slotElapsedSeconds = resolveSlotAnchoredElapsedSeconds({
        matchSlotStartAt: slotStartAt,
        snapshot,
        syncedNowMs,
      });

      if (slotElapsedSeconds === null) {
        return;
      }

      const nextElapsedSeconds = Math.max(elapsedSecondsRef.current, slotElapsedSeconds);
      rgDiagLog('elapsed-trace slot tick', {
        computedNext: nextElapsedSeconds,
        prevRef: elapsedSecondsRef.current,
        slotElapsedSeconds,
        slotStartMs,
        snapshotElapsedSeconds: getBackgroundRunElapsedSeconds(snapshot, Date.now()),
        snapshotStatus: snapshot.status,
        syncedNowMs,
        tickCount,
      });
      syncElapsedSeconds(nextElapsedSeconds, { source: 'slot-ticker' });
      tickCount += 1;
    };

    commitSlotElapsedSeconds();
    let ticker: SlotElapsedTickerHandle | null = null;
    let cancelled = false;

    const scheduleNextSlotElapsedTick = () => {
      if (cancelled) {
        return;
      }

      const delayMs = resolveSlotElapsedTickerDelayMs({
        slotStartMs,
        syncedNowMs: getSyncedNowMs(),
      });

      ticker = setTimeout(() => {
        if (cancelled) {
          return;
        }
        commitSlotElapsedSeconds();
        scheduleNextSlotElapsedTick();
      }, delayMs);
      slotElapsedTickerRef.current = ticker;
    };

    scheduleNextSlotElapsedTick();

    return () => {
      cancelled = true;
      rgDiagLog('elapsed-trace slot ticker CLEANUP', {
        nowMs: Date.now(),
        prevElapsedRef: elapsedSecondsRef.current,
        reason: 'effect-rerun-or-unmount',
      });
      if (ticker) {
        clearSlotElapsedTicker(ticker);
      } else {
        slotElapsedTickerActiveRef.current = false;
      }
    };
  }, [
    activeMatchSlotStartAt,
    elapsedSecondsRef,
    getSyncedNowMs,
    slotElapsedTickerEnabled,
    syncElapsedSeconds,
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
    const syncedNowMs = getSyncedNowMs();
    return buildDisplayedTrackingSnapshot({
      snapshot,
      rawElapsedSeconds: getBackgroundRunElapsedSeconds(
        snapshot,
        matchModeRef.current === 'solo' ? Date.now() : syncedNowMs,
      ),
      officialStartBaseline: officialStartBaselineRef.current,
      hasPreStartWarmup: Boolean(preStartWarmupMatchIdRef.current),
      matchSlotStartAt: activeMatchSlotStartAt,
      startNoiseGraceSeconds: officialStartDistanceNoiseGraceSeconds,
      startNoiseGraceKm: officialStartDistanceNoiseGraceKm,
      syncedNowMs,
    });
  }, [
    activeMatchSlotStartAt,
    ensureOfficialStartBaseline,
    getSyncedNowMs,
    matchModeRef,
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

    const shouldUseSlotElapsedTicker = slotElapsedTickerActiveRef.current;
    const nextUiFrame = buildTrackingUiFrame(snapshot, displayedSnapshot);
    if (shouldUseSlotElapsedTicker) {
      nextUiFrame.elapsedSeconds = elapsedSecondsRef.current;
    }
    const shouldThrottleLiveMatchUi = Platform.OS === 'android'
      && matchModeRef.current !== 'solo'
      && snapshot.status === 'running';
    const nowMs = Date.now();
    const shouldCommitUiState = !shouldThrottleLiveMatchUi
      || hasCriticalTrackingUiChange(lastTrackingUiFrameRef.current, nextUiFrame)
      || nowMs - lastTrackingUiFlushMsRef.current >= LIVE_MATCH_UI_DISPLAY_INTERVAL_MS;

    if (!shouldCommitUiState) {
      if (!shouldUseSlotElapsedTicker) {
        const nextElapsedSeconds = displayedSnapshot.elapsedSeconds;
        if (nextElapsedSeconds >= elapsedSecondsRef.current) {
          rgDiagLog('elapsed-trace GPS-path ref-only', {
            displayedElapsed: nextElapsedSeconds,
            prevRef: elapsedSecondsRef.current,
            snapshotStatus: snapshot.status,
          });
          syncElapsedSeconds(nextElapsedSeconds, {
            commitState: false,
            source: 'gps-no-commit',
          });
        } else {
          rgDiagLog('elapsed-trace GPS-path ref-only REJECTED (would regress)', {
            next: nextElapsedSeconds,
            prevRef: elapsedSecondsRef.current,
            snapshotStatus: snapshot.status,
          });
        }
      }
      return;
    }

    lastTrackingUiFlushMsRef.current = nowMs;
    lastTrackingUiFrameRef.current = nextUiFrame;
    setDistanceKm(displayedSnapshot.distanceKm);
    setElevationGainM(displayedSnapshot.elevationGainM);
    setCurrentPace(displayedSnapshot.currentPace);
    setStatus(snapshot.status);
    if (!shouldUseSlotElapsedTicker) {
      const nextElapsedSeconds = displayedSnapshot.elapsedSeconds;
      if (nextElapsedSeconds >= elapsedSecondsRef.current) {
        rgDiagLog('elapsed-trace GPS-path commit', {
          displayedElapsed: nextElapsedSeconds,
          nowMs: Date.now(),
          prevRef: elapsedSecondsRef.current,
          snapshotElapsedSeconds: getBackgroundRunElapsedSeconds(snapshot, Date.now()),
          snapshotStartedAt: snapshot.startedAt,
          snapshotStatus: snapshot.status,
        });
        syncElapsedSeconds(nextElapsedSeconds, { source: 'gps-commit' });
      } else {
        rgDiagLog('elapsed-trace GPS-path commit REJECTED (would regress)', {
          next: nextElapsedSeconds,
          prevRef: elapsedSecondsRef.current,
          snapshotStatus: snapshot.status,
        });
      }
    }
  }, [
    elapsedSecondsRef,
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
