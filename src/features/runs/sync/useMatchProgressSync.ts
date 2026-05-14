import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  updateRunningMatchProgress as updateRunningMatchProgressService,
} from '@/services';
import type {
  RunningMatchStatusResponse,
  UpdateRunningMatchProgressInput,
} from '@/lib/api/types';
import type { BackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import {
  getBackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { LastSyncedMatchProgress } from '@/features/runs/viewModels/matchProgress';
import {
  buildSyncedMatchProgressSnapshot,
  resolveActiveMatchProgressTarget,
  shouldSendMatchProgressHeartbeat,
} from '@/features/runs/sync/matchProgressSync';
import { rgPerfMark, rgPerfMeasureStart, rgPerfTrackResource } from '@/utils/rgPerfTrace';
import {
  acquireRgHeartbeatSlot,
  canUseRgHeartbeatSlot,
  runRgHeartbeatSingleFlight,
} from '@/utils/rgHeartbeatRegistry';

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
  heartbeatEnabled?: boolean;
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
  heartbeatEnabled = true,
}: UseMatchProgressSyncInput) {
  const firstLiveProgressReceivedRef = useRef(false);
  const heartbeatSlotOwnerRef = useRef<{ key: string; ownerId: number } | null>(null);
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
  const activeHeartbeatTarget = heartbeatEnabled ? getActiveMatchProgressTarget() : null;
  const activeHeartbeatMatchId = activeHeartbeatTarget?.matchId ?? null;

  useEffect(() => {
    if (!heartbeatEnabled || !activeHeartbeatMatchId) {
      return undefined;
    }

    const heartbeatKey = `match-progress:${activeHeartbeatMatchId}`;
    const heartbeatSlot = acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat', {
      cadence: 'on tracking tick',
      heartbeatKey,
      matchId: activeHeartbeatMatchId,
    });

    if (!heartbeatSlot.acquired) {
      return undefined;
    }

    heartbeatSlotOwnerRef.current = {
      key: heartbeatKey,
      ownerId: heartbeatSlot.ownerId,
    };

    const stopHeartbeatTrace = rgPerfTrackResource('heartbeat', 'match progress heartbeat', {
      cadence: 'on tracking tick',
      heartbeatKey,
      matchId: activeHeartbeatMatchId,
    });

    return () => {
      stopHeartbeatTrace();
      heartbeatSlot.release();
      if (heartbeatSlotOwnerRef.current?.ownerId === heartbeatSlot.ownerId) {
        heartbeatSlotOwnerRef.current = null;
      }
    };
  }, [activeHeartbeatMatchId, heartbeatEnabled]);

  const canSendMatchProgressHeartbeat = useCallback((matchId: string) => {
    const heartbeatKey = `match-progress:${matchId}`;
    const owner = heartbeatSlotOwnerRef.current;
    const canSend = canUseRgHeartbeatSlot(
      heartbeatKey,
      owner?.key === heartbeatKey ? owner.ownerId : undefined,
    );

    if (!canSend) {
      rgPerfMark('progress heartbeat skipped', {
        heartbeatKey,
        matchId,
        reason: 'duplicate-heartbeat-owner',
      });
    }

    return canSend;
  }, []);

  const pushRunningMatchProgress = useCallback(async (input: UpdateRunningMatchProgressInput) => {
    const syncedProgress = buildSyncedMatchProgressSnapshot(input);
    const heartbeatKey = `match-progress:${input.matchId}`;
    const heartbeatRequest = runRgHeartbeatSingleFlight(heartbeatKey, async () => {
      const endHeartbeatApiTrace = rgPerfMeasureStart('progress heartbeat API', {
        heartbeatKey,
        matchId: input.matchId,
        status: input.status,
      });
      try {
        const nextStatus = await callbackRef.current.updateRunningMatchProgress({
          ...input,
          currentPace: syncedProgress.currentPace,
        });
        endHeartbeatApiTrace({ success: true });
        return nextStatus;
      } catch (progressError) {
        endHeartbeatApiTrace({ success: false });
        throw progressError;
      }
    }, {
      matchId: input.matchId,
      status: input.status,
    });

    if (!heartbeatRequest.started) {
      return heartbeatRequest.promise;
    }

    const nextStatus = await heartbeatRequest.promise;
    callbackRef.current.setLastSyncedMatchProgress(syncedProgress);

    if (!firstLiveProgressReceivedRef.current) {
      firstLiveProgressReceivedRef.current = true;
      rgPerfMark('first live progress received', {
        matchId: input.matchId,
        state: nextStatus.state,
      });
    }

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
    snapshot: BackgroundRunTrackingSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
  ) => {
    const target = getActiveMatchProgressTarget();
    if (!target) {
      return;
    }

    if (!canSendMatchProgressHeartbeat(target.matchId)) {
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
  }, [canSendMatchProgressHeartbeat, getActiveMatchProgressTarget, matchProgressHeartbeatRef, pushRunningMatchProgress]);

  const refreshMatchProgressHeartbeat = useCallback((snapshot: BackgroundRunTrackingSnapshot) => {
    const now = Date.now();
    if (!heartbeatEnabled) {
      matchProgressHeartbeatRef.current = now;
      return;
    }

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

    if (!canSendMatchProgressHeartbeat(target.matchId)) {
      return;
    }

    matchProgressHeartbeatRef.current = now;
    const progress = callbackRef.current.buildDisplayedMatchProgress(snapshot);
    rgPerfMark('progress heartbeat start', {
      matchId: target.matchId,
      status: 'running',
    });
    void pushRunningMatchProgress({
      matchId: target.matchId,
      distanceKm: progress.distanceKm,
      elapsedSeconds: progress.elapsedSeconds,
      currentPace: progress.currentPace,
      status: 'running',
    }).catch(() => {
      // Keep the run going even if the optional match heartbeat fails.
    });
  }, [canSendMatchProgressHeartbeat, getActiveMatchProgressTarget, heartbeatEnabled, matchProgressHeartbeatRef, pushRunningMatchProgress]);

  return {
    getActiveMatchProgressTarget,
    pushRunningMatchProgress,
    refreshMatchProgressHeartbeat,
    syncMatchLifecycleStatus,
  };
}
