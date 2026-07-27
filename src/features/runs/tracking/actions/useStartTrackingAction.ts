import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  commitWarmupBaseline,
  resetBackgroundRunTracking,
  startBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import { setActiveChaseArena } from '@/features/runs/chase/chaseRunContext';
import { leaveChaseArena } from '@/services';
import { clearPendingMatchSaveContext } from '@/features/runs/hooks/runSaveFlow/pendingMatchSaveContext';
import { requestAndroidRunTrackingNotificationPermission } from '@/features/runs/tracking/runTrackingNotificationPermission';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { maybeShowBatteryOptimizationNudge } from './batteryOptimizationNudge';
import { getTrackingStartKey, resolveStartBlockedMessage } from './startTrackingGuards';
import {
  runSoloStartWarmupFlow,
  shouldRunSoloGpsWarmupCountdown,
} from './soloStartWarmupFlow';
import { useAutoStartMatchTrackingAction } from './useAutoStartMatchTrackingAction';
import type {
  StartTrackingActionInput,
  StartTrackingActionResult,
  StartTrackingOptions,
} from './types';

export function useStartTrackingAction({
  androidLiveMatchGpsStartDelayMs,
  appStateRef,
  autoStartedMatchIdRef,
  autoStartingMatchTrackingRef,
  duelMatchState,
  duelMatchStatus,
  ensureBackgroundLocationPermission,
  ensureLocationPermission,
  gpsStartGuard,
  groupMatchState,
  groupMatchStatus,
  handleStartFailure,
  liveShareEnabledRef,
  matchMode,
  officialStartBaselineRef,
  preStartWarmupMatchIdRef,
  resetForegroundTrackingState,
  resolveLiveShareLabel,
  roomLinkedMatchContext,
  runSoloStartCountdown,
  setError,
  syncFromBackgroundTracking,
  syncLiveSharing,
}: StartTrackingActionInput): StartTrackingActionResult {
  const {
    clearDelayedGpsStart,
    runSingleFlightStart,
  } = gpsStartGuard;

  const handleStartTrackingInternal = useCallback(async (options?: StartTrackingOptions) => {
    if (Platform.OS === 'web') {
      setError('실시간 러닝 측정은 iPhone이나 Android 앱에서 사용할 수 있어요.');
      return;
    }

    const roomLinkedStartContext = roomLinkedMatchContext?.mode === matchMode
      ? roomLinkedMatchContext
      : null;
    const blockedMessage = resolveStartBlockedMessage({
      allowCountdownWarmup: Boolean(options?.allowCountdownWarmup),
      duelMatchState,
      duelMatchStatus,
      groupMatchState,
      groupMatchStatus,
      matchMode,
      roomLinkedStartContext,
    });

    if (blockedMessage) {
      setError(blockedMessage);
      return;
    }

    const endGpsStartTrace = rgPerfMeasureStart('GPS tracking start', {
      allowCountdownWarmup: Boolean(options?.allowCountdownWarmup),
      matchMode,
    });
    const trackingStartKey = getTrackingStartKey(matchMode, options);
    const persistenceMatchId = matchMode === 'solo' || matchMode === 'chase'
      ? null
      : options?.matchId ?? (
        matchMode === 'duel'
          ? duelMatchStatus?.matchId ?? roomLinkedStartContext?.matchId ?? null
          : groupMatchStatus?.matchId ?? roomLinkedStartContext?.matchId ?? null
      );

    try {
      setError(null);
      const shouldUseSoloStartCountdown = shouldRunSoloGpsWarmupCountdown(matchMode, options);
      const shouldRequireBackgroundPermission = matchMode !== 'solo';
      await ensureLocationPermission();
      await ensureBackgroundLocationPermission(
        shouldRequireBackgroundPermission ? { required: true } : undefined,
      );
      void requestAndroidRunTrackingNotificationPermission().catch(() => false);
      resetForegroundTrackingState();
      // FIX-2 — a fresh start abandons any un-retried failed save: drop its pending
      // match-save context here so it can never attach an old match's verdict to the run
      // that is about to begin.
      clearPendingMatchSaveContext();
      // 경찰과 도둑런: chase 모드 시작이면 '입장에 성공한' 경기장을 이 러닝의 태그로 잠그고,
      // 다른 모드면 반드시 비운다 — 이전 chase 태그가 다음 혼자런에 새는 것 차단.
      setActiveChaseArena(matchMode === 'chase' ? options?.chaseArena ?? null : null);
      await resetBackgroundRunTracking();

      if (options?.allowCountdownWarmup) {
        const warmupMatchId = matchMode === 'duel'
          ? duelMatchStatus?.matchId ?? roomLinkedStartContext?.matchId
          : groupMatchStatus?.matchId ?? roomLinkedStartContext?.matchId;
        preStartWarmupMatchIdRef.current = warmupMatchId ?? null;
        officialStartBaselineRef.current = null;
      } else {
        preStartWarmupMatchIdRef.current = null;
      }

      const shouldDetachLocationTask = Platform.OS === 'android' && matchMode !== 'solo';

      const syncInitialLiveShareState = async () => {
        if (liveShareEnabledRef.current) {
          const initialLabel = await resolveLiveShareLabel();
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
      };

      if (shouldUseSoloStartCountdown) {
        const soloWarmupCompleted = await runSoloStartWarmupFlow({
          commitWarmupBaseline,
          endGpsStartTrace,
          resetWarmupTracking: resetBackgroundRunTracking,
          runSoloStartCountdown,
          startGpsWarmup: () => startBackgroundRunTracking(undefined, {
            appState: appStateRef.current,
            detachLocationTask: shouldDetachLocationTask,
            persistenceMatchId,
            trackingKey: trackingStartKey,
            warmupMode: true,
          }),
          syncFromBackgroundTracking,
        });

        if (!soloWarmupCompleted) {
          return;
        }

        try {
          await syncInitialLiveShareState();
        } catch {
          // Non-fatal: the run is tracking and the live-share heartbeat re-syncs the
          // status every cycle, so a transient init failure self-heals. Don't alarm the
          // user with a persistent banner — just record it.
          rgPerfMark('live share initial sync failed', { matchMode, phase: 'solo' });
        }
        return;
      }

      if (shouldDetachLocationTask) {
        rgPerfMark('GPS tracking start UI detached', {
          allowCountdownWarmup: Boolean(options?.allowCountdownWarmup),
          matchId: options?.matchId ?? null,
          matchMode,
          source: 'handleStartTrackingInternal',
        });
      }
      await startBackgroundRunTracking(undefined, {
        appState: appStateRef.current,
        detachLocationTask: shouldDetachLocationTask,
        persistenceMatchId,
        trackingKey: trackingStartKey,
      });
      syncFromBackgroundTracking();
      endGpsStartTrace({
        detachedLocationTask: shouldDetachLocationTask,
        success: true,
        status: 'running',
      });

      // ONE-TIME Android battery-optimization nudge for live-match runs: if the new native build
      // can control battery optimization AND the app is not yet exempt, offer a single,
      // non-blocking prompt so screen-off match recording does not freeze under Doze. Fire-and-
      // forget so the run NEVER waits on it; no-op on iOS, on solo runs, and on old binaries.
      if (matchMode !== 'solo') {
        void maybeShowBatteryOptimizationNudge().catch(() => undefined);
      }

      try {
        await syncInitialLiveShareState();
      } catch {
        // Non-fatal: the live-share heartbeat re-syncs the status every cycle, so this
        // self-heals. Record it instead of showing a persistent, misleading banner.
        rgPerfMark('live share initial sync failed', { matchMode, phase: 'match' });
      }
    } catch (trackingError) {
      // 경찰과 도둑런: 입장(join)까지 됐는데 GPS 시작이 실패하면 슬롯이 3시간 유령으로
      // 남는다 — 즉시 반납하고 컨텍스트를 비운다.
      if (matchMode === 'chase') {
        setActiveChaseArena(null);
        void leaveChaseArena().catch(() => {});
      }

      await handleStartFailure(trackingError, endGpsStartTrace);
    }
  }, [
    appStateRef,
    duelMatchState,
    duelMatchStatus,
    ensureBackgroundLocationPermission,
    ensureLocationPermission,
    groupMatchState,
    groupMatchStatus,
    handleStartFailure,
    liveShareEnabledRef,
    matchMode,
    officialStartBaselineRef,
    preStartWarmupMatchIdRef,
    resetForegroundTrackingState,
    resolveLiveShareLabel,
    roomLinkedMatchContext,
    runSoloStartCountdown,
    setError,
    syncFromBackgroundTracking,
    syncLiveSharing,
  ]);

  const handleStartTracking = useCallback((options?: StartTrackingOptions) => {
    const trackingStartKey = getTrackingStartKey(matchMode, options);
    return runSingleFlightStart(
      trackingStartKey,
      { matchId: options?.matchId ?? null },
      () => handleStartTrackingInternal(options),
    );
  }, [handleStartTrackingInternal, matchMode, runSingleFlightStart]);

  const startMatchTrackingAutomatically = useAutoStartMatchTrackingAction({
    androidLiveMatchGpsStartDelayMs,
    autoStartedMatchIdRef,
    autoStartingMatchTrackingRef,
    gpsStartGuard,
    handleStartTracking,
    matchMode,
    preStartWarmupMatchIdRef,
  });

  useEffect(() => () => {
    clearDelayedGpsStart();
  }, [clearDelayedGpsStart]);

  return {
    handleStartTracking,
    startMatchTrackingAutomatically,
  };
}
