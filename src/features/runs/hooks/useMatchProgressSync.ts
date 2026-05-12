import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  updateRunningMatchProgress as updateRunningMatchProgressService,
} from '@/lib/api/services';
import type {
  RunningMatchStatusResponse,
  UpdateRunningMatchProgressInput,
} from '@/lib/api/types';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/backgroundTracking';
import {
  getBackgroundRunTrackingSnapshot,
} from '@/features/runs/backgroundTracking';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/matchStateMachine';
import type { LastSyncedMatchProgress } from '@/features/runs/matchProgress';
import {
  buildSyncedMatchProgressSnapshot,
  resolveActiveMatchProgressTarget,
  shouldSendMatchProgressHeartbeat,
} from '@/features/runs/matchProgressSync';

type DisplayedMatchProgress = {
  distanceKm: number;
  elapsedSeconds: number;
  currentPace: string;
};

type UseMatchProgressSyncInput = {
  matchModeRef: MutableRefObject<RunMatchMode>;
  duelMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  groupMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  roomLinkedMatchContextRef: MutableRefObject<PartyRunLinkedMatchContext | null>;
  matchProgressHeartbeatRef: MutableRefObject<number>;
  buildDisplayedMatchProgress: (snapshot?: BackgroundRunTrackingSnapshot) => DisplayedMatchProgress;
  setLastSyncedMatchProgress: (progress: LastSyncedMatchProgress | null) => void;
  setDuelMatchStatus: (status: RunningMatchStatusResponse | null) => void;
  setGroupMatchStatus: (status: RunningMatchStatusResponse | null) => void;
  updateRunningMatchProgress?: typeof updateRunningMatchProgressService;
};

export function useMatchProgressSync({
  matchModeRef,
  duelMatchStatusRef,
  groupMatchStatusRef,
  roomLinkedMatchContextRef,
  matchProgressHeartbeatRef,
  buildDisplayedMatchProgress,
  setLastSyncedMatchProgress,
  setDuelMatchStatus,
  setGroupMatchStatus,
  updateRunningMatchProgress = updateRunningMatchProgressService,
}: UseMatchProgressSyncInput) {
  const callbackRef = useRef({
    buildDisplayedMatchProgress,
    setLastSyncedMatchProgress,
    setDuelMatchStatus,
    setGroupMatchStatus,
    updateRunningMatchProgress,
  });

  callbackRef.current = {
    buildDisplayedMatchProgress,
    setLastSyncedMatchProgress,
    setDuelMatchStatus,
    setGroupMatchStatus,
    updateRunningMatchProgress,
  };

  const getActiveMatchProgressTarget = useCallback(() => resolveActiveMatchProgressTarget({
    matchMode: matchModeRef.current,
    duelMatchStatus: duelMatchStatusRef.current,
    groupMatchStatus: groupMatchStatusRef.current,
    roomLinkedMatchContext: roomLinkedMatchContextRef.current,
  }), [
    duelMatchStatusRef,
    groupMatchStatusRef,
    matchModeRef,
    roomLinkedMatchContextRef,
  ]);

  const pushRunningMatchProgress = useCallback(async (input: UpdateRunningMatchProgressInput) => {
    const syncedProgress = buildSyncedMatchProgressSnapshot(input);
    const nextStatus = await callbackRef.current.updateRunningMatchProgress({
      ...input,
      currentPace: syncedProgress.currentPace,
    });
    callbackRef.current.setLastSyncedMatchProgress(syncedProgress);

    if (input.matchId === duelMatchStatusRef.current?.matchId) {
      callbackRef.current.setDuelMatchStatus(nextStatus);
    }

    if (input.matchId === groupMatchStatusRef.current?.matchId) {
      callbackRef.current.setGroupMatchStatus(nextStatus);
    }

    if (input.matchId === roomLinkedMatchContextRef.current?.matchId) {
      if (roomLinkedMatchContextRef.current.mode === 'duel') {
        callbackRef.current.setDuelMatchStatus(nextStatus);
      } else {
        callbackRef.current.setGroupMatchStatus(nextStatus);
      }
    }

    return nextStatus;
  }, [
    duelMatchStatusRef,
    groupMatchStatusRef,
    roomLinkedMatchContextRef,
  ]);

  const syncMatchLifecycleStatus = useCallback(async (
    nextStatus: Extract<UpdateRunningMatchProgressInput['status'], 'running' | 'background'>,
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot(),
  ) => {
    const target = getActiveMatchProgressTarget();
    if (!target) {
      return;
    }

    const progress = callbackRef.current.buildDisplayedMatchProgress(snapshot);
    await pushRunningMatchProgress({
      matchId: target.matchId,
      distanceKm: progress.distanceKm,
      elapsedSeconds: progress.elapsedSeconds,
      currentPace: progress.currentPace,
      status: nextStatus,
    });
    matchProgressHeartbeatRef.current = Date.now();
  }, [getActiveMatchProgressTarget, matchProgressHeartbeatRef, pushRunningMatchProgress]);

  const refreshMatchProgressHeartbeat = useCallback((snapshot: BackgroundRunTrackingSnapshot) => {
    const now = Date.now();
    if (!shouldSendMatchProgressHeartbeat({
      trackingStatus: snapshot.status,
      lastHeartbeatAt: matchProgressHeartbeatRef.current,
      nowMs: now,
    })) {
      return;
    }

    const target = getActiveMatchProgressTarget();
    if (!target) {
      return;
    }

    matchProgressHeartbeatRef.current = now;
    const progress = callbackRef.current.buildDisplayedMatchProgress(snapshot);
    void pushRunningMatchProgress({
      matchId: target.matchId,
      distanceKm: progress.distanceKm,
      elapsedSeconds: progress.elapsedSeconds,
      currentPace: progress.currentPace,
      status: 'running',
    }).catch(() => {
      // Keep the run going even if the optional match heartbeat fails.
    });
  }, [getActiveMatchProgressTarget, matchProgressHeartbeatRef, pushRunningMatchProgress]);

  return {
    getActiveMatchProgressTarget,
    pushRunningMatchProgress,
    refreshMatchProgressHeartbeat,
    syncMatchLifecycleStatus,
  };
}
