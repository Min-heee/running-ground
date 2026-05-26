import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  commitWarmupBaseline,
  resetBackgroundRunTracking,
  startBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
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
      setError('실시간 러닝 측정은 iPhone이나 Android 앱에서 사용할 수 있어.');
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

    try {
      setError(null);
      const shouldUseSoloStartCountdown = shouldRunSoloGpsWarmupCountdown(matchMode, options);
      const shouldRequireBackgroundPermission = matchMode !== 'solo';
      await ensureLocationPermission();
      await ensureBackgroundLocationPermission(
        shouldRequireBackgroundPermission ? { required: true } : undefined,
      );
      resetForegroundTrackingState();
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
          setError('러닝은 시작됐지만 위치 공유 상태를 반영하지 못했어요.');
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
        trackingKey: trackingStartKey,
      });
      syncFromBackgroundTracking();
      endGpsStartTrace({
        detachedLocationTask: shouldDetachLocationTask,
        success: true,
        status: 'running',
      });

      try {
        await syncInitialLiveShareState();
      } catch {
        setError('러닝은 시작됐지만 위치 공유 상태를 반영하지 못했어요.');
      }
    } catch (trackingError) {
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
