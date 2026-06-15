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
import {
  recordBackgroundHeartbeatAttempt,
} from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import {
  clearBackgroundMatchProgressContext,
  setBackgroundMatchProgressContext,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import {
  stopBackgroundMatchProgressTimer,
} from '@/features/runs/tracking/background/backgroundMatchProgressTimer';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { LastSyncedMatchProgress } from '@/features/runs/viewModels/matchProgress';
import {
  buildSyncedMatchProgressSnapshot,
  resolveActiveMatchProgressTarget,
  resolveMatchProgressHeartbeatStatus,
  shouldSendMatchProgressHeartbeat,
} from '@/features/runs/sync/matchProgressSync';
import { buildMatchProgressRegistryKey } from '@/features/runs/sync/registryKeys';
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
  // Remembers the most recent active match target so that when the match ends and the
  // active target collapses to null, we can still deliver a FINAL status push for the
  // just-ended match before tearing the context down (see the cleanup effect below).
  const lastActiveHeartbeatTargetRef = useRef<{ matchId: string; distanceKm: number } | null>(null);
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
  const activeHeartbeatDistanceKm = activeHeartbeatTarget?.distanceKm ?? null;

  useEffect(() => {
    if (!heartbeatEnabled || !activeHeartbeatMatchId || activeHeartbeatDistanceKm === null) {
      // Match ended (or heartbeat disabled): do NOT abruptly null the background context
      // here. The dedicated match-end teardown effect below first delivers a FINAL status
      // push for the just-ended match, then stops the background timer, then clears the
      // context — in that order — so an in-flight/final push is never orphaned.
      return undefined;
    }

    lastActiveHeartbeatTargetRef.current = {
      matchId: activeHeartbeatMatchId,
      distanceKm: activeHeartbeatDistanceKm,
    };

    const duelMatchStatus = duelMatchStatusRef.current;
    const groupMatchStatus = groupMatchStatusRef.current;
    const roomLinkedMatchContext = roomLinkedMatchContextRef.current;
    const roomLinkedContextMatches = roomLinkedMatchContext?.matchId === activeHeartbeatMatchId;
    const duelStatusMatches = duelMatchStatus?.matchId === activeHeartbeatMatchId;
    const groupStatusMatches = groupMatchStatus?.matchId === activeHeartbeatMatchId;
    const mode = roomLinkedContextMatches
      ? roomLinkedMatchContext.mode
      : duelStatusMatches
        ? 'duel'
        : groupStatusMatches
          ? 'group'
          : matchModeRef.current === 'group'
            ? 'group'
            : 'duel';
    const slotStartAt = roomLinkedContextMatches
      ? roomLinkedMatchContext.slotStartAt
      : duelStatusMatches
        ? duelMatchStatus.slotStartAt
        : groupStatusMatches
          ? groupMatchStatus.slotStartAt
          : null;

    setBackgroundMatchProgressContext({
      matchId: activeHeartbeatMatchId,
      mode,
      distanceKm: activeHeartbeatDistanceKm,
      slotStartAt,
    });

    return undefined;
  }, [
    activeHeartbeatDistanceKm,
    activeHeartbeatMatchId,
    duelMatchStatusRef,
    groupMatchStatusRef,
    heartbeatEnabled,
    matchModeRef,
    roomLinkedMatchContextRef,
  ]);

  useEffect(() => {
    if (!heartbeatEnabled || !activeHeartbeatMatchId) {
      return undefined;
    }

    const heartbeatKey = buildMatchProgressRegistryKey(activeHeartbeatMatchId);
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

  // Defensive unmount-only cleanup. The match-end teardown above handles the normal
  // end-of-match path; this only fires if the hook unmounts while a context is still set
  // (e.g. navigating away mid-match) so the background context never leaks for a dead run.
  useEffect(() => () => {
    stopBackgroundMatchProgressTimer();
    clearBackgroundMatchProgressContext();
  }, []);

  const canSendMatchProgressHeartbeat = useCallback((matchId: string) => {
    const heartbeatKey = buildMatchProgressRegistryKey(matchId);
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
    const heartbeatKey = buildMatchProgressRegistryKey(input.matchId);
    recordBackgroundHeartbeatAttempt();
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

  // Match-end final status delivery. When a match ends the active target collapses to
  // null, so the regular heartbeat (which gates on getActiveMatchProgressTarget) stops
  // firing. Without a terminal push the OPPONENT keeps seeing this runner frozen at the
  // last synced position forever. Deliver one explicit FINAL 'finished' progress push for
  // the just-ended match — outside the active-target gate — so the server marks this
  // runner done and the opponent's board unfreezes. Best-effort with a single retry.
  const deliverFinalMatchStatus = useCallback(async (endedTarget: { matchId: string; distanceKm: number }) => {
    const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
    const progress = callbackRef.current.buildDisplayedMatchProgress(snapshot);
    const finalStatus = resolveMatchProgressHeartbeatStatus({
      progressDistanceKm: progress.distanceKm,
      targetDistanceKm: endedTarget.distanceKm,
    });
    // Only a genuine finish needs a terminal push — that's the status whose loss freezes
    // the opponent's board. If the match ended for any other reason (forfeit / opponent
    // ended it / cancel), the live-progress channel must NOT push 'running': that could
    // flip this runner back to "running" after they forfeited. Those cases are covered by
    // leaveRunningMatch + status polling, not here.
    if (finalStatus !== 'finished') {
      return;
    }
    const input: UpdateRunningMatchProgressInput = {
      matchId: endedTarget.matchId,
      distanceKm: progress.distanceKm,
      elapsedSeconds: progress.elapsedSeconds,
      currentPace: progress.currentPace,
      status: 'finished',
    };
    rgPerfMark('match end final status push', {
      matchId: endedTarget.matchId,
      status: input.status,
    });

    try {
      await pushRunningMatchProgress(input);
    } catch {
      // Retry once: this is the last chance to unfreeze the opponent's board, so a single
      // transient failure (flaky mobile network at match end) should not be the end of it.
      try {
        await pushRunningMatchProgress(input);
      } catch {
        // Give up after the retry; teardown still proceeds so the dead context is cleared.
      }
    }
  }, [pushRunningMatchProgress]);

  // Ordered match-end teardown. Fires only on the real end transition: a previously
  // active match target collapses to null (finish / forfeit / goal reached). Order:
  //   1) deliver the FINAL status push for the just-ended match (unfreezes the opponent),
  //   2) stop the Android background match-progress timer (no more dead-context flushes),
  //   3) clear the background context.
  // Keeping these in order means the final push runs while the context is still alive.
  useEffect(() => {
    if (activeHeartbeatMatchId) {
      return undefined;
    }

    const endedTarget = lastActiveHeartbeatTargetRef.current;
    if (!endedTarget) {
      return undefined;
    }

    lastActiveHeartbeatTargetRef.current = null;

    void (async () => {
      try {
        if (heartbeatEnabled) {
          await deliverFinalMatchStatus(endedTarget);
        }
      } finally {
        stopBackgroundMatchProgressTimer();
        clearBackgroundMatchProgressContext(endedTarget.matchId);
      }
    })();

    return undefined;
  }, [activeHeartbeatMatchId, deliverFinalMatchStatus, heartbeatEnabled]);

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
    const heartbeatStatus = resolveMatchProgressHeartbeatStatus({
      progressDistanceKm: progress.distanceKm,
      targetDistanceKm: target.distanceKm,
    });
    rgPerfMark('progress heartbeat start', {
      matchId: target.matchId,
      status: heartbeatStatus,
    });
    void pushRunningMatchProgress({
      matchId: target.matchId,
      distanceKm: progress.distanceKm,
      elapsedSeconds: progress.elapsedSeconds,
      currentPace: progress.currentPace,
      status: heartbeatStatus,
    }).catch(() => {
      // Keep the run going even if the optional match heartbeat fails.
    });
  }, [canSendMatchProgressHeartbeat, getActiveMatchProgressTarget, heartbeatEnabled, matchProgressHeartbeatRef, pushRunningMatchProgress]);

  // Stationary keep-alive. The heartbeat is the channel that brings the OTHER
  // participants' liveStatus (forfeited/finished) back into duel/groupMatchStatus, but
  // it was fired only from GPS snapshot emissions — a runner standing still stopped
  // hearing about the match entirely (an opponent's forfeit never arrived; worse with
  // group sizes, where any one of N runners may stop). Tick the same heartbeat on a
  // plain timer: refreshMatchProgressHeartbeat's own gates (running status + interval
  // since the last beat + single-flight) make this a no-op while GPS is already
  // covering, and the only sender when stationary.
  useEffect(() => {
    if (!heartbeatEnabled || !activeHeartbeatMatchId) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      refreshMatchProgressHeartbeat(getBackgroundRunTrackingSnapshot({ cloneRoute: false }));
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeHeartbeatMatchId, heartbeatEnabled, refreshMatchProgressHeartbeat]);

  return {
    getActiveMatchProgressTarget,
    pushRunningMatchProgress,
    refreshMatchProgressHeartbeat,
    syncMatchLifecycleStatus,
  };
}
