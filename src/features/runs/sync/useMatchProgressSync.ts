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
  getBackgroundSyncDiagnostics,
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
  HEARTBEAT_SLOT_STEAL_STALL_MS,
  armHeartbeatSlotAcquireRetry,
} from '@/features/runs/sync/heartbeatSlotRetry';
import {
  MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS,
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
import {
  buildPendingFinishIntentFromFreeze,
  getLocalGoalFreeze,
  hydrateLocalGoalFreezes,
  recordLocalGoalFreezeOnce,
} from '@/features/runs/sync/localGoalFreezeStore';
import { presentFinishCelebrationOnce } from '@/features/runs/finishReminder/finishApproachNotification';
import { rgPerfMark, rgPerfMeasureStart, rgPerfTrackResource } from '@/utils/rgPerfTrace';
import {
  acquireRgHeartbeatSlot,
  canUseRgHeartbeatSlot,
  evictRgHeartbeatSlot,
  runRgHeartbeatSingleFlight,
} from '@/utils/rgHeartbeatRegistry';

type DisplayedMatchProgress = {
  distanceKm: number;
  elapsedSeconds: number;
  currentPace: string;
};

// §3.① (fair-verdict design) — NATIVE one-shot routing for the durable pending-finish push. The
// JS fetch freezes with the JS thread the instant iOS suspends a backgrounded app (#203), which is
// exactly when the terminal 'finished' push is most likely to be sent — so when the native
// uploader module is available (Android APK; iOS from build 43) and the app is BACKGROUNDED (or
// the JS fetch just threw), the finished body is POSTed on a native thread instead. The FOREGROUND
// JS path stays first-choice untouched: its response feeds the guarded apply funnel.
//
// Everything is lazily imported (mirroring the background flush's service getters) so this module
// keeps loading under the node test runner, where the native binding cannot resolve.
type NativePendingFinishUploaderModule = {
  isNativeMatchProgressUploaderAvailable(): boolean;
  uploadMatchProgressNative(url: string, authToken: string, jsonBody: string): Promise<string | null>;
};

async function resolveNativePendingFinishUploader(): Promise<NativePendingFinishUploaderModule | null> {
  try {
    return await import('../../../../modules/match-progress-uploader');
  } catch {
    return null;
  }
}

// POST one pending-finish body via the native uploader. Resolves with the parsed 2xx status
// response, or null when the native module is unavailable / there is no token / the upload failed
// (non-2xx, network) / the body is not JSON — every null lets the caller fall back to the JS push
// so no existing delivery channel is ever weakened.
async function uploadPendingFinishViaNative(
  input: UpdateRunningMatchProgressInput,
): Promise<RunningMatchStatusResponse | null> {
  try {
    const uploader = await resolveNativePendingFinishUploader();
    if (!uploader?.isNativeMatchProgressUploaderAvailable()) {
      return null;
    }

    const { getAccessToken } = await import('@/lib/session/sessionState');
    const token = await getAccessToken();
    if (!token) {
      return null;
    }

    const { API_CONFIG } = await import('@/services/apiClient');
    // Same body normalization the background flush's native branch applies.
    const requestBody = JSON.stringify({
      ...input,
      distanceKm: Number(input.distanceKm.toFixed(2)),
      elapsedSeconds: Math.max(0, Math.round(input.elapsedSeconds)),
    });

    const responseBody = await uploader.uploadMatchProgressNative(
      `${API_CONFIG.baseUrl}/running/matches/progress`,
      token,
      requestBody,
    );
    if (!responseBody) {
      return null;
    }

    return JSON.parse(responseBody) as RunningMatchStatusResponse;
  } catch {
    // Best-effort: any failure here just falls back to the JS push / next resend tick.
    return null;
  }
}

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
      // Heartbeat-slot latch fix (4th organ of the no-retry latch; mirrors the shipped
      // armBlockingMatchStatusPollRetry pattern) — a LOST acquire used to return silently, and
      // this effect's deps (matchId + enabled) stay value-identical for the whole match, so the
      // loser stayed latched out of the send gate forever: canSendMatchProgressHeartbeat kept
      // reading canUseRgHeartbeatSlot(key, undefined) → false, every foreground send skipped as
      // 'duplicate-heartbeat-owner', and NOTHING ever re-attempted the acquire (AppState resumes
      // re-render but do not re-run a deps-stable effect). Keep re-attempting the SAME acquire at
      // the heartbeat cadence; the moment the owner releases (unmount / unfreeze-processed
      // cleanup / enabled-flip render) install the exact success-path bookkeeping and fire ONE
      // catch-up heartbeat through the same refreshMatchProgressHeartbeat the 1s keep-alive tick
      // uses — its throttle stamp never advanced during the latch (it only moves after canSend
      // passes), so the catch-up sends immediately.
      // STALE-OWNER STEAL (closes the former silent-live-holder RESIDUAL): a LIVE silent holder
      // (frozen tab instance whose match target collapsed via a non-render ref mutation) never
      // releases, so the retry alone never wins against it. The steal option below evicts such
      // an owner once (a) the module-wide push-activity ATTEMPT stamp (lastHeartbeatAtMs —
      // advanced by EVERY instance's pushRunningMatchProgress plus both background flush paths,
      // so a fresh stamp means SOMEONE is pushing → never steal) has been silent past
      // HEARTBEAT_SLOT_STEAL_STALL_MS AND (b) THIS instance can actually send right now (live
      // match target — the SAFETY INVARIANT: ownership never migrates to a non-viable sender, so
      // a ghost's own ticking retry can never steal from a healthy owner; see
      // heartbeatSlotRetry.ts). A pusher whose HTTP hangs keeps the stamp fresh and is handled
      // by the single-flight 12s eviction instead. On-device discriminators: a latched-but-
      // blocked instance marks 'progress heartbeat skipped' reason:'duplicate-heartbeat-owner'
      // ~1/s and the registry marks 'heartbeat duplicate blocked' per retry attempt; a steal
      // marks 'heartbeat slot evicted stale owner' (registry, with the evicted ownerId) +
      // 'progress heartbeat slot stolen from stale owner' then 'progress heartbeat slot
      // reacquired after retry'; the silent holder itself still emits nothing.
      rgPerfMark('progress heartbeat slot lost acquire', {
        activeOwnerId: heartbeatSlot.ownerId,
        heartbeatKey,
        matchId: activeHeartbeatMatchId,
      });
      const retry = armHeartbeatSlotAcquireRetry({
        intervalMs: MATCH_PROGRESS_HEARTBEAT_INTERVAL_MS,
        acquireSlot: () => acquireRgHeartbeatSlot(heartbeatKey, 'match progress heartbeat', {
          cadence: 'on tracking tick',
          heartbeatKey,
          matchId: activeHeartbeatMatchId,
        }),
        onReacquired: (retriedSlot) => {
          heartbeatSlotOwnerRef.current = {
            key: heartbeatKey,
            ownerId: retriedSlot.ownerId,
          };
          rgPerfMark('progress heartbeat slot reacquired after retry', {
            heartbeatKey,
            matchId: activeHeartbeatMatchId,
            ownerId: retriedSlot.ownerId,
          });
          const stopRetriedHeartbeatTrace = rgPerfTrackResource('heartbeat', 'match progress heartbeat', {
            cadence: 'on tracking tick',
            heartbeatKey,
            matchId: activeHeartbeatMatchId,
          });
          return () => {
            stopRetriedHeartbeatTrace();
            if (heartbeatSlotOwnerRef.current?.ownerId === retriedSlot.ownerId) {
              heartbeatSlotOwnerRef.current = null;
            }
          };
        },
        onCatchUp: () => refreshMatchProgressHeartbeatRef.current(
          getBackgroundRunTrackingSnapshot({ cloneRoute: false }),
        ),
        steal: {
          stallMs: HEARTBEAT_SLOT_STEAL_STALL_MS,
          getLastPushActivityAtMs: () => getBackgroundSyncDiagnostics().lastHeartbeatAtMs,
          isViableSender: () => getActiveMatchProgressTargetRef.current() != null,
          evict: () => evictRgHeartbeatSlot(heartbeatKey, {
            heartbeatKey,
            matchId: activeHeartbeatMatchId,
          }),
          onStolen: ({ evictedAfterMs }) => rgPerfMark('progress heartbeat slot stolen from stale owner', {
            evictedAfterMs,
            heartbeatKey,
            matchId: activeHeartbeatMatchId,
          }),
        },
      });

      return () => {
        retry.stop();
      };
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

  // §3.⑥ — terminal drop: the response carries a FINAL sealed verdict with me as DNF (resolved,
  // NOT provisional, outcome 'lose', my official finish elapsed absent). Beyond the server's
  // revision window every further 'finished' push is downgraded, so re-sending the intent every
  // 5s forever is pure waste — drop it. `provisional` is additive (fair-verdict Stage 1): while
  // it is true the seal is still revisable and the resend MUST continue (a landed finish annuls
  // the seal); older backends omit the field entirely and their seals are immediately final, so
  // treating `undefined` as final is correct against them too.
  const isFinishTerminallySealedAsDnf = useCallback((status: RunningMatchStatusResponse | null | undefined, matchId: string) => {
    if (!status || status.matchId !== matchId) {
      return false;
    }
    const verdict = status.duelVerdict as
      | (NonNullable<RunningMatchStatusResponse['duelVerdict']> & { provisional?: boolean })
      | undefined;
    return verdict?.resolved === true
      && verdict.provisional !== true
      && verdict.outcome === 'lose'
      && verdict.myFinishElapsedSeconds === null;
  }, []);

  // Shared settle step for BOTH pending-finish channels (JS push + native one-shot): clear the
  // intent on a server ACK or on the final sealed-DNF terminal shape; otherwise keep it so the
  // next tick re-sends.
  const settlePendingFinishFromStatus = useCallback((
    nextStatus: RunningMatchStatusResponse | null | undefined,
    matchId: string,
  ) => {
    if (isFinishTerminallySealedAsDnf(nextStatus, matchId)) {
      // §3.⑥ — the verdict is FINAL with me sealed as DNF; the server will downgrade every
      // further finish push, so the resend loop must stop here.
      clearPendingFinish(matchId);
      return;
    }
    if (isFinishAcknowledged(nextStatus, matchId)) {
      clearPendingFinish(matchId);
      return;
    }
    // The push landed but the response still reports this runner mid-run (race against a
    // not-yet-applied finish) — keep the intent and let the next tick re-send.
  }, [isFinishAcknowledged, isFinishTerminallySealedAsDnf]);

  // C1: send (or re-send) the durable finish push for one pending intent. Idempotent — the
  // server freezes the finish first-write-wins, so re-sends are always safe. Clears the
  // intent only when the response confirms the finish landed (or is terminally sealed, §3.⑥).
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

    // §3.① — app BACKGROUNDED: the JS fetch freezes with the suspended JS thread (#203), so
    // route the finished body through the native one-shot uploader first. A null resolution
    // (module unavailable on this binary / no token / non-2xx / network failure) falls through
    // to the JS push below — today's channel for the current iOS binary stays fully intact.
    if (getBackgroundSyncDiagnostics().isAppBackground) {
      const nativeStatus = await uploadPendingFinishViaNative(input);
      if (nativeStatus) {
        settlePendingFinishFromStatus(nativeStatus, intent.matchId);
        return true;
      }
    }

    // FOREGROUND (and background native-miss fallback): the JS push — kept first-choice in
    // foreground because its response feeds the guarded apply funnel via pushRunningMatchProgress.
    try {
      const nextStatus = await pushRunningMatchProgress(input);
      settlePendingFinishFromStatus(nextStatus, intent.matchId);
      return true;
    } catch {
      // §3.① — the JS fetch threw (aborted / network / frozen-then-resumed): retry this one
      // push via the native one-shot before giving the tick up.
      const nativeStatus = await uploadPendingFinishViaNative(input);
      if (nativeStatus) {
        settlePendingFinishFromStatus(nativeStatus, intent.matchId);
        return true;
      }
      // Keep the intent for the next foreground/poll tick.
      return false;
    }
  }, [pushRunningMatchProgress, settlePendingFinishFromStatus]);

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
    // HANDS-FREE FINISH (Stage 3b, last-resort record site) — local first-write-wins: this only
    // lands when neither the background flush nor the foreground heartbeat recorded the crossing.
    recordLocalGoalFreezeOnce({
      matchId: endedTarget.matchId,
      elapsedSeconds: progress.elapsedSeconds,
      distanceKm: progress.distanceKm,
      pace: progress.currentPace,
      crossedAtIso: new Date().toISOString(),
    });
    // HANDS-FREE FINISH (Stage 3c) — build the intent PREFERRING the at-crossing freeze over the
    // live progress: a screen-off crossing whose delivery failed used to fall through here with
    // the DRIFTED foreground values, and the server froze that drift first-write-wins as the
    // official finish. With a freeze the crossing-time values win; without one this is exactly
    // the live progress (today's behavior). Idempotent server-side either way.
    const intent = buildPendingFinishIntentFromFreeze(getLocalGoalFreeze(endedTarget.matchId), {
      matchId: endedTarget.matchId,
      elapsedSeconds: progress.elapsedSeconds,
      distanceKm: progress.distanceKm,
      pace: progress.currentPace,
    });
    rememberPendingFinish(intent);
    // HANDS-FREE FINISH (Stage 2, call site B) — celebration for the backgrounded-but-flush-missed
    // and iOS late-detection crossings, with the SAME values the durable intent carries. Fire-and-
    // forget; the module-level fired-set dedupes against the flush's call site A, and the internal
    // isAppBackground gate suppresses it while the app is foregrounded (result UI shows instead).
    void presentFinishCelebrationOnce(endedTarget.matchId, intent.distanceKm, intent.finishElapsedSeconds);
    rgPerfMark('match end final status push', {
      matchId: endedTarget.matchId,
      status: 'finished',
    });
    await sendPendingFinishPush(intent);
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
    // HANDS-FREE FINISH (Stage 3b, screen-ON record site) — the foreground heartbeat is the first
    // place a screen-on crossing computes 'finished'; freeze the at-crossing values before the
    // slot-anchored display model drifts past them. Synchronous, first-write-wins, and does not
    // gate/reorder the push below.
    if (heartbeatStatus === 'finished') {
      recordLocalGoalFreezeOnce({
        matchId: target.matchId,
        elapsedSeconds: progress.elapsedSeconds,
        distanceKm: progress.distanceKm,
        pace: progress.currentPace,
        crossedAtIso: new Date(now).toISOString(),
      });
    }
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

  // Heartbeat-slot latch fix — render-updated ref through which the slot effect above (deps
  // deliberately kept [matchId, enabled]) fires its post-reacquire catch-up using the SAME send
  // function the 1s keep-alive tick uses. A direct reference up there is impossible: the effect
  // sits textually above this declaration, so putting the callback in its dep array would read a
  // TDZ binding during render, while capturing it without the dep would trip exhaustive-deps.
  // Assigned every render, so the closure always sees the current identity (which only changes
  // with heartbeatEnabled — already a dep of that effect).
  const refreshMatchProgressHeartbeatRef = useRef(refreshMatchProgressHeartbeat);
  refreshMatchProgressHeartbeatRef.current = refreshMatchProgressHeartbeat;

  // Heartbeat-slot steal — render-updated ref (same precedent as refreshMatchProgressHeartbeatRef
  // above) through which the slot effect's steal gate reads the LIVE match target for its
  // isViableSender check without touching that effect's deliberately-frozen dep array.
  const getActiveMatchProgressTargetRef = useRef(getActiveMatchProgressTarget);
  getActiveMatchProgressTargetRef.current = getActiveMatchProgressTarget;

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
    // HANDS-FREE FINISH — hydrate persisted goal freezes alongside the pending-finish intents so
    // the freeze-preferred intent builder (3c) and the save clamp see cold-start survivors.
    // Fire-and-forget ADDITION: nothing about the resend loop below gates on it.
    void hydrateLocalGoalFreezes();
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
