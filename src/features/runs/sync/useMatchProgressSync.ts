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
import {
  clearPendingFinish,
  hydratePendingFinishes,
  listPendingFinishes,
  rememberPendingFinish,
} from '@/features/runs/sync/pendingFinishStore';
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
  // Bundle A2 — THE single guarded apply funnel (registered by TrackRunExperienceRuntimeModel,
  // where the canonical forfeitedMatchIdsRef + per-mode serverNow monotonic refs live). The
  // heartbeat hands its progress-POST response here instead of writing duel/groupMatchStatus
  // directly, so a late heartbeat obeys the SAME forfeit + monotonic-serverNow ordering as the
  // poll/background paths and can neither resurrect a forfeited match nor apply out of order.
  applyMatchStatusSnapshot: (
    status: RunningMatchStatusResponse,
    options?: { source?: string; forceAccept?: boolean },
  ) => void;
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
  applyMatchStatusSnapshot,
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
    applyMatchStatusSnapshot,
    updateRunningMatchProgress,
  });

  callbackRef.current = {
    buildDisplayedMatchProgress,
    setLastSyncedMatchProgress,
    applyMatchStatusSnapshot,
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

  // NOTE: the background→React status applier (which unfreezes the OPPONENT while the screen is
  // off) is intentionally NOT wired here. It is registered in TrackRunExperienceRuntimeModel,
  // where the canonical guarded refs live (forfeitedMatchIdsRef + the serverNow monotonic refs),
  // so the background apply goes through the same forfeit / out-of-order guards as the foreground
  // and poll paths. Wiring it here would have only the weak live-id guard and could resurrect a
  // forfeited match or apply a stale snapshot.

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

    // Bundle A2 step 1 (the keystone) — route the heartbeat response through THE ONE guarded
    // apply funnel instead of the former bare setDuel/GroupMatchStatus. The funnel resolves the
    // duel/group/linked apply target itself (resolveBackgroundMatchStatusApplyTarget, same routing
    // these three branches used to do), then applies the forfeit guard FIRST and the monotonic
    // serverNow guard SECOND. RESULT: a late heartbeat can no longer overwrite a newer poll/background
    // snapshot (newest serverNow wins), and a heartbeat for a forfeited matchId is dropped. The
    // heartbeat's nextStatus carries the same serverNow/matchId/mode/currentUserLiveStatus shape the
    // funnel expects, so the equal-or-newer heartbeat snapshot is still accepted (never dropped vs
    // itself) and still drives syncServerClock + setX through the funnel.
    callbackRef.current.applyMatchStatusSnapshot(nextStatus, { source: 'heartbeat' });

    return nextStatus;
  }, []);

  // C1: decide whether a successful finish push counts as ACKed (so we can stop re-sending).
  // The server ACKs by reporting this runner's terminal status. An OLDER backend that does
  // not expose those fields still froze the finish first-write-wins on a successful push, so
  // we treat "push succeeded + no signal that the user is still mid-run" as delivered — this
  // avoids an infinite resend loop against a backend (or the mock) that omits the ack fields.
  // We keep re-sending ONLY when the response actively contradicts the finish (the user is
  // reported as still running/background/paused for this match).
  const isFinishAcknowledged = useCallback((status: RunningMatchStatusResponse | null | undefined, matchId: string) => {
    if (!status || status.matchId !== matchId) {
      // Status for a different/cleared match — the push still landed; do not loop forever.
      return true;
    }
    if (status.currentUserLiveStatus === 'finished'
      || typeof status.currentUserFinishElapsedSeconds === 'number') {
      return true;
    }
    const stillRunning = status.currentUserLiveStatus === 'running'
      || status.currentUserLiveStatus === 'background'
      || status.currentUserLiveStatus === 'paused';
    return !stillRunning;
  }, []);

  // C1: send (or re-send) the durable finish push for one pending intent. Idempotent — the
  // server freezes the finish first-write-wins, so re-sends are always safe. Clears the
  // intent only when the response confirms the finish landed.
  const sendPendingFinishPush = useCallback(async (intent: {
    matchId: string;
    finishElapsedSeconds: number;
    distanceKm: number;
    pace: string;
  }): Promise<boolean> => {
    const input: UpdateRunningMatchProgressInput = {
      matchId: intent.matchId,
      distanceKm: intent.distanceKm,
      // Never push a 0 elapsed as the finish — the intent store already rejects 0, but guard
      // again here so a corrupted intent can never freeze 00:00 into the official record.
      elapsedSeconds: intent.finishElapsedSeconds > 0 ? intent.finishElapsedSeconds : 0,
      currentPace: intent.pace,
      status: 'finished',
    };
    if (input.elapsedSeconds <= 0) {
      // A 0-elapsed finish is meaningless and would clobber a real time — drop the intent
      // rather than push it.
      clearPendingFinish(intent.matchId);
      return false;
    }
    try {
      const nextStatus = await pushRunningMatchProgress(input);
      if (isFinishAcknowledged(nextStatus, intent.matchId)) {
        clearPendingFinish(intent.matchId);
        return true;
      }
      // The push succeeded but the response still reports this runner mid-run (race against
      // a not-yet-applied finish) — keep the intent and let the next tick re-send.
      return true;
    } catch {
      // Keep the intent for the next foreground/poll tick.
      return false;
    }
  }, [isFinishAcknowledged, pushRunningMatchProgress]);

  // C1: re-send every outstanding pending-finish intent. Driven from the foreground/poll
  // tick AND a self-contained interval (below) so delivery survives the match-end teardown,
  // app backgrounding, and even a cold restart (hydrated intents are re-sent too).
  const resendPendingFinishes = useCallback(async () => {
    const intents = listPendingFinishes();
    if (!intents.length) {
      return;
    }
    // Sequential to avoid hammering the API with all pending pushes at once.
    for (const intent of intents) {
      await sendPendingFinishPush(intent);
    }
  }, [sendPendingFinishPush]);

  // Match-end final status delivery. When a match ends the active target collapses to
  // null, so the regular heartbeat (which gates on getActiveMatchProgressTarget) stops
  // firing. Without a terminal push the OPPONENT keeps seeing this runner frozen at the
  // last synced position forever. C1 makes this DURABLE: persist a pending-finish intent
  // FIRST, then attempt the push; if it does not land, the resend loop re-delivers it on
  // every foreground/poll tick (and after a cold restart) until the server ACKs.
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
    // Guard: never persist/push a 0 elapsed finish (no-startedAt / warmup snapshot).
    if (!(progress.elapsedSeconds > 0)) {
      return;
    }
    rememberPendingFinish({
      matchId: endedTarget.matchId,
      finishElapsedSeconds: progress.elapsedSeconds,
      distanceKm: progress.distanceKm,
      pace: progress.currentPace,
    });
    rgPerfMark('match end final status push', {
      matchId: endedTarget.matchId,
      status: 'finished',
    });
    await sendPendingFinishPush({
      matchId: endedTarget.matchId,
      finishElapsedSeconds: progress.elapsedSeconds,
      distanceKm: progress.distanceKm,
      pace: progress.currentPace,
    });
  }, [sendPendingFinishPush]);

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

  // C1: durable finish-delivery driver. Rehydrate any pending-finish intent that outlived a
  // previous app session, then re-send all outstanding intents on a slow interval — this is
  // the channel that survives the match-end teardown (the active heartbeat above stops once
  // the match ends) and even a cold restart. Each intent self-clears once the server ACKs.
  // The single-flight + first-write-wins server semantics make the periodic re-send safe.
  useEffect(() => {
    if (!heartbeatEnabled) {
      return undefined;
    }

    let cancelled = false;
    void hydratePendingFinishes().then(() => {
      if (!cancelled) {
        void resendPendingFinishes();
      }
    });

    const intervalId = setInterval(() => {
      void resendPendingFinishes();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [heartbeatEnabled, resendPendingFinishes]);

  return {
    getActiveMatchProgressTarget,
    pushRunningMatchProgress,
    refreshMatchProgressHeartbeat,
    resendPendingFinishes,
    syncMatchLifecycleStatus,
  };
}
