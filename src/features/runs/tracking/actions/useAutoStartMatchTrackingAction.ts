import { useCallback } from 'react';
import { Platform } from 'react-native';
import { getBackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import type { StartTrackingActionInput, StartTrackingOptions } from './types';

type UseAutoStartMatchTrackingActionInput = Pick<
  StartTrackingActionInput,
  | 'androidLiveMatchGpsStartDelayMs'
  | 'autoStartedMatchIdRef'
  | 'autoStartingMatchTrackingRef'
  | 'matchMode'
  | 'preStartWarmupMatchIdRef'
> & {
  gpsStartGuard: StartTrackingActionInput['gpsStartGuard'];
  handleStartTracking: (options?: StartTrackingOptions) => Promise<void>;
};

function finishDetachedAutoStart(input: {
  autoStartedMatchIdRef: UseAutoStartMatchTrackingActionInput['autoStartedMatchIdRef'];
  autoStartingMatchTrackingRef: UseAutoStartMatchTrackingActionInput['autoStartingMatchTrackingRef'];
  delayedGpsStartKeyRef?: UseAutoStartMatchTrackingActionInput['gpsStartGuard']['delayedGpsStartKeyRef'];
  delayedKey?: string;
}) {
  if (input.delayedGpsStartKeyRef && input.delayedGpsStartKeyRef.current === input.delayedKey) {
    input.delayedGpsStartKeyRef.current = null;
  }
  input.autoStartingMatchTrackingRef.current = false;
  if (getBackgroundRunTrackingSnapshot({ cloneRoute: false }).status !== 'running') {
    input.autoStartedMatchIdRef.current = null;
  }
}

function skipAndroidCountdownWarmup(input: {
  androidLiveMatchGpsStartDelayMs: number;
  matchId: string;
  matchMode: UseAutoStartMatchTrackingActionInput['matchMode'];
  preStartWarmupMatchIdRef: UseAutoStartMatchTrackingActionInput['preStartWarmupMatchIdRef'];
  skippedAndroidWarmupMatchIdRef: UseAutoStartMatchTrackingActionInput['gpsStartGuard']['skippedAndroidWarmupMatchIdRef'];
}) {
  input.preStartWarmupMatchIdRef.current = input.matchId;
  input.skippedAndroidWarmupMatchIdRef.current = input.matchId;
  rgPerfMark('GPS tracking start delayed after mount', {
    delayMs: input.androidLiveMatchGpsStartDelayMs,
    matchId: input.matchId,
    matchMode: input.matchMode,
    reason: 'android-countdown-warmup-disabled',
    source: 'match auto warmup',
  });
  rgPerfMark('GPS tracking start UI detached', {
    matchId: input.matchId,
    matchMode: input.matchMode,
    reason: 'countdown warmup disabled on android',
    source: 'match auto warmup',
  });
}

function startImmediately(input: {
  autoStartedMatchIdRef: UseAutoStartMatchTrackingActionInput['autoStartedMatchIdRef'];
  autoStartingMatchTrackingRef: UseAutoStartMatchTrackingActionInput['autoStartingMatchTrackingRef'];
  handleStartTracking: UseAutoStartMatchTrackingActionInput['handleStartTracking'];
  matchId: string;
  options?: { allowCountdownWarmup?: boolean };
}) {
  void input.handleStartTracking({ ...input.options, matchId: input.matchId })
    .finally(() => finishDetachedAutoStart({
      autoStartedMatchIdRef: input.autoStartedMatchIdRef,
      autoStartingMatchTrackingRef: input.autoStartingMatchTrackingRef,
    }));
}

function scheduleAndroidDelayedStart(input: {
  androidLiveMatchGpsStartDelayMs: number;
  autoStartedMatchIdRef: UseAutoStartMatchTrackingActionInput['autoStartedMatchIdRef'];
  autoStartingMatchTrackingRef: UseAutoStartMatchTrackingActionInput['autoStartingMatchTrackingRef'];
  gpsStartGuard: UseAutoStartMatchTrackingActionInput['gpsStartGuard'];
  handleStartTracking: UseAutoStartMatchTrackingActionInput['handleStartTracking'];
  matchId: string;
  matchMode: UseAutoStartMatchTrackingActionInput['matchMode'];
  options?: { allowCountdownWarmup?: boolean };
}) {
  const {
    clearDelayedGpsStart,
    delayedGpsStartKeyRef,
    delayedGpsStartTimerRef,
  } = input.gpsStartGuard;
  const delayedKey = `${input.matchMode}:${input.matchId}:active`;
  if (delayedGpsStartKeyRef.current === delayedKey && delayedGpsStartTimerRef.current) {
    rgPerfMark('GPS tracking start skipped duplicate', {
      delayed: true,
      matchId: input.matchId,
      trackingStartKey: delayedKey,
    });
    return;
  }

  clearDelayedGpsStart();
  delayedGpsStartKeyRef.current = delayedKey;
  rgPerfMark('GPS tracking start delayed after mount', {
    delayMs: input.androidLiveMatchGpsStartDelayMs,
    matchId: input.matchId,
    matchMode: input.matchMode,
    source: 'match auto start',
  });
  delayedGpsStartTimerRef.current = setTimeout(() => {
    delayedGpsStartTimerRef.current = null;
    if (delayedGpsStartKeyRef.current !== delayedKey) {
      rgPerfMark('GPS result ignored without screen change', {
        matchId: input.matchId,
        matchMode: input.matchMode,
        reason: 'stale delayed start',
        source: 'match auto start',
      });
      return;
    }

    rgPerfMark('GPS tracking start UI detached', {
      matchId: input.matchId,
      matchMode: input.matchMode,
      source: 'match auto start',
    });
    void input.handleStartTracking({ ...input.options, matchId: input.matchId })
      .catch(() => {
        rgPerfMark('GPS result ignored without screen change', {
          matchId: input.matchId,
          matchMode: input.matchMode,
          reason: 'detached start failed',
          source: 'match auto start',
        });
      })
      .finally(() => finishDetachedAutoStart({
        autoStartedMatchIdRef: input.autoStartedMatchIdRef,
        autoStartingMatchTrackingRef: input.autoStartingMatchTrackingRef,
        delayedGpsStartKeyRef,
        delayedKey,
      }));
  }, input.androidLiveMatchGpsStartDelayMs);
}

export function useAutoStartMatchTrackingAction(input: UseAutoStartMatchTrackingActionInput) {
  const {
    androidLiveMatchGpsStartDelayMs,
    autoStartedMatchIdRef,
    autoStartingMatchTrackingRef,
    gpsStartGuard,
    handleStartTracking,
    matchMode,
    preStartWarmupMatchIdRef,
  } = input;

  return useCallback((
    matchId: string,
    options?: { allowCountdownWarmup?: boolean },
  ) => {
    if (autoStartingMatchTrackingRef.current) {
      return;
    }

    const isAndroidLiveMatchAutoStart = Platform.OS === 'android' && matchMode !== 'solo';
    if (isAndroidLiveMatchAutoStart && options?.allowCountdownWarmup) {
      skipAndroidCountdownWarmup({
        androidLiveMatchGpsStartDelayMs,
        matchId,
        matchMode,
        preStartWarmupMatchIdRef,
        skippedAndroidWarmupMatchIdRef: gpsStartGuard.skippedAndroidWarmupMatchIdRef,
      });
      return;
    }

    autoStartingMatchTrackingRef.current = true;
    autoStartedMatchIdRef.current = matchId;

    if (isAndroidLiveMatchAutoStart) {
      scheduleAndroidDelayedStart({
        androidLiveMatchGpsStartDelayMs,
        autoStartedMatchIdRef,
        autoStartingMatchTrackingRef,
        gpsStartGuard,
        handleStartTracking,
        matchId,
        matchMode,
        options,
      });
      return;
    }

    startImmediately({
      autoStartedMatchIdRef,
      autoStartingMatchTrackingRef,
      handleStartTracking,
      matchId,
      options,
    });
  }, [
    androidLiveMatchGpsStartDelayMs,
    autoStartedMatchIdRef,
    autoStartingMatchTrackingRef,
    gpsStartGuard,
    handleStartTracking,
    matchMode,
    preStartWarmupMatchIdRef,
  ]);
}
