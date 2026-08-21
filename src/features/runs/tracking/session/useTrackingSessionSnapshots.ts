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
  getLiveTrackingMetricFrameSnapshot,
  publishLiveTrackingMetricFrame,
} from '@/features/runs/tracking/liveTrackingMetricStore';
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
  resolveDisplayElapsedTick,
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
  | 'trackerStatusRef'
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
  trackerStatusRef,
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
    const nextCadenceSpm = calculateCadenceSpm(totalStepsRef.current, nextElapsedSeconds);
    const previousMetricFrame = getLiveTrackingMetricFrameSnapshot();
    publishLiveTrackingMetricFrame({
      elapsedSeconds: nextElapsedSeconds,
      averagePace: buildAveragePace(previousMetricFrame.distanceKm, nextElapsedSeconds),
      cadenceSpm: nextCadenceSpm,
    });
    rgDiagLog('elapsed-trace syncElapsedSeconds', {
      commitState,
      nowMs: Date.now(),
      prevRef: elapsedSecondsRef.current,
      slotActive: slotElapsedTickerActiveRef.current,
      source: options?.source ?? 'unknown',
      value: nextElapsedSeconds,
    });
    elapsedSecondsRef.current = nextElapsedSeconds;

    const shouldCommitReactState = commitState && !(
      Platform.OS === 'android' && matchModeRef.current !== 'solo'
    );

    if (shouldCommitReactState) {
      setElapsedSeconds(nextElapsedSeconds);
      setCadenceSpm(nextCadenceSpm);
    }
  }, [
    elapsedSecondsRef,
    matchModeRef,
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
      // 원시 경과는 **반드시 기기 시계로** 뺀다. snapshot.startedAt은 기기 시계 스탬프인데
      // (background/index.ts의 Date.now()/GPS 타임스탬프) 여기에 서버 보정 now를 빼면
      // 결과가 '진짜 경과 + 기기·서버 시계 오차'가 된다 — 갤럭시(서버보다 ~18초 느린 시계)에서
      // 기록 탭의 시간이 두 계열(34:31 ↔ 34:50)로 갈려 초당 두 번 튀던 원인이 정확히 이것이다.
      // 서버 기준이 필요한 매치 시간은 여기가 아니라 슬롯 앵커(syncedNowMs − slotStartAt)가
      // 담당하고, 그 경로가 항상 이 원시값보다 우선한다(trackingDisplayModel).
      rawElapsedSeconds: getBackgroundRunElapsedSeconds(snapshot, Date.now()),
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
    officialStartBaselineRef,
    officialStartDistanceNoiseGraceKm,
    officialStartDistanceNoiseGraceSeconds,
    preStartWarmupMatchIdRef,
  ]);

  const buildDisplayedMatchProgress = useCallback((
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
  ): DisplayedMatchProgress => {
    const displayedSnapshot = getDisplayedTrackingSnapshot(snapshot);
    // C1 no-0 guard: a snapshot with no startedAt (snapshotStore returns 0) or one stuck in
    // the pre-start warmup branch (trackingDisplayModel returns 0) yields elapsed=0. Pushing
    // or saving 0 over a known-good measured elapsed would clobber the runner's real time
    // (and on a finish push freeze a 00:00 into the official record). Prefer the last
    // known-good elapsed ref whenever the displayed value collapsed to 0 but we already had
    // a positive measured elapsed.
    const knownGoodElapsedSeconds = elapsedSecondsRef.current;
    const elapsedSeconds = displayedSnapshot.elapsedSeconds > 0
      ? displayedSnapshot.elapsedSeconds
      : knownGoodElapsedSeconds > 0
        ? knownGoodElapsedSeconds
        : displayedSnapshot.elapsedSeconds;
    const displayedAveragePace = buildAveragePace(displayedSnapshot.distanceKm, elapsedSeconds);
    return {
      distanceKm: displayedSnapshot.distanceKm,
      elapsedSeconds,
      currentPace: normalizeMatchProgressPace(displayedSnapshot.currentPace, displayedAveragePace),
    };
  }, [elapsedSecondsRef, getDisplayedTrackingSnapshot]);

  // 표시 시간 티커 (오너 2026-08-03: 솔로 러닝 시간이 '멈췄다 점프'). 솔로는 elapsed가
  // GPS 스냅샷 이벤트에만 실려서, 초반 정확도 게이트로 샘플이 뜸하면 시간이 멈췄다가
  // 다음 프레임에 한꺼번에 따라잡았다. 1초마다 스냅샷의 표시 elapsed를 다시 읽어 앞으로만
  // 민다 — 매치는 슬롯 티커가 시간을 소유하므로 그때는 건드리지 않고, 일시정지·미시작
  // 구간은 스냅샷 elapsed가 멈춰 있어 자연히 no-op이다.
  useEffect(() => {
    const displayTicker = setInterval(() => {
      const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      const nextElapsedSeconds = resolveDisplayElapsedTick({
        slotTickerActive: slotElapsedTickerActiveRef.current,
        snapshotStatus: snapshot.status,
        nextElapsedSeconds: getDisplayedTrackingSnapshot(snapshot).elapsedSeconds,
        currentElapsedSeconds: elapsedSecondsRef.current,
      });

      if (nextElapsedSeconds !== null) {
        syncElapsedSeconds(nextElapsedSeconds, { source: 'display-ticker' });
      }
    }, 1000);

    return () => clearInterval(displayTicker);
  }, [elapsedSecondsRef, getDisplayedTrackingSnapshot, syncElapsedSeconds]);

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
    const nextCadenceSpm = calculateCadenceSpm(totalStepsRef.current, nextUiFrame.elapsedSeconds);
    // RC-4: MY average/arena pace must use the wall-clock elapsed (slot/start-anchored,
    // computed from syncedNow with NO JS timer) so it stays correct while the screen is off.
    // `nextUiFrame.elapsedSeconds` is the slot-ticker / frozen-ref value the OS suspends in the
    // background, which would freeze the avg pace while GPS keeps growing distanceKm. The
    // on-screen 시간 metric stays pinned to `nextUiFrame.elapsedSeconds` (unchanged); only the
    // avg-pace denominator switches to the wall-clock `displayedSnapshot.elapsedSeconds`.
    publishLiveTrackingMetricFrame({
      distanceKm: displayedSnapshot.distanceKm,
      elapsedSeconds: nextUiFrame.elapsedSeconds,
      arenaElapsedSeconds: displayedSnapshot.elapsedSeconds,
      currentPace: displayedSnapshot.currentPace,
      averagePace: buildAveragePace(displayedSnapshot.distanceKm, displayedSnapshot.elapsedSeconds),
      cadenceSpm: nextCadenceSpm,
      elevationGainM: displayedSnapshot.elevationGainM,
    });
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
    // C-3 — never downgrade 'saving' from a background snapshot. The bg store is 'paused' the
    // whole time createTrackedRun runs, so a foreground resume mid-save flipped isSaving false
    // and reopened the save buttons (duplicate-save window). 'saving' is a purely foreground
    // stage; only the save flow itself may leave it.
    if (!(trackerStatusRef.current === 'saving' && snapshot.status === 'paused')) {
      setStatus(snapshot.status);
    }
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
    totalStepsRef,
    trackerStatusRef,
  ]);

  return {
    buildDisplayedMatchProgress,
    getDisplayedTrackingSnapshot,
    syncElapsedSeconds,
    syncFromBackgroundTracking,
  };
}
