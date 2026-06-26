import type {
  UpdateRunningMatchProgressInput,
  UpdateRunningMatchProgressResponse,
} from '@/lib/api/types';
import {
  getBackgroundSyncDiagnostics,
  recordBackgroundHeartbeatAttempt,
} from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import {
  getSnapshotState,
  resolveSnapshotElapsedMs,
} from '@/features/runs/tracking/background/snapshotStore';
import {
  buildSyncedMatchProgressSnapshot,
  MATCH_GOAL_DISTANCE_TOLERANCE_KM,
} from '@/features/runs/sync/matchProgressSync';
import {
  PERIODIC_MATCH_UPLOAD_INTERVAL_MS,
  startPeriodicMatchUpload,
  stopPeriodicMatchUpload,
} from '@/features/runs/tracking/background/periodicMatchUploadController';
import {
  getMergeableNativeDistanceMeters,
  resolveMergedDistanceKm,
  seedNativeDistanceAccumulatorToMeters,
  startNativeDistanceAccumulator,
  stopNativeDistanceAccumulator,
} from '@/features/runs/tracking/background/distanceAccumulatorController';
import { isMyMatchDistanceStale } from '@/features/runs/sync/matchDistanceStaleness';
// NAME CLASH: routeAccumulator's getAccumulatedDistanceMeters is the JS AUTHORITATIVE total (the
// source of truth this whole feature seeds the NATIVE accumulator from). Alias it so it is never
// confused with the native getAccumulatedDistanceMeters wrapper in the module.
import { getAccumulatedDistanceMeters as getJsAccumulatedDistanceMeters } from '@/features/runs/tracking/background/routeAccumulator';

// 3s (was 5s): tighten how stale a backgrounded runner's progress is on the server so the
// opponent's live distance lags less. Aligned with BACKGROUND_MATCH_PROGRESS_TIMER_MS (3s).
export const BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS = 3_000;
// 6s (was 12s): backstop for a hung JS-fallback push that holds the single-flight slot,
// blocking the next push + opponent-bearing response. The per-request timeout below should
// normally self-abort a stalled push first; this 6s stale guard is the BACKSTOP that
// force-aborts and retries ~one interval late if the request timeout somehow does not fire,
// instead of starving the boards for 12s. Kept above the 4s push timeout so a healthy
// in-flight request is never force-aborted early.
export const BACKGROUND_MATCH_PROGRESS_INFLIGHT_STALE_MS = 6_000;
// 4s: explicit per-request timeout for the background JS push, deliberately SHORTER than the
// 6s stale window above. The request self-aborts before the stale guard would otherwise have
// to force-abort it, so a hung push frees the single-flight slot for the next push (which
// carries the fresh opponent-bearing response) instead of starving the boards. This timeout
// IS a JS timeout (apiClient.ts wires AbortController + setTimeout); the 6s stale guard above
// is the backstop for the case where that JS timer cannot fire because JS was frozen.
export const BACKGROUND_MATCH_PROGRESS_PUSH_TIMEOUT_MS = 4_000;
// COMPETITIVE-INTEGRITY GUARD — when the native distance accumulator (which omits some JS jitter
// filters and can OVER-COUNT) would push the sent distance up to/over the goal before the
// authoritative JS pipeline has actually reached it, the sent distance is capped to
// (goalThreshold - EPSILON). This tiny epsilon keeps the capped value STRICTLY below the goal
// threshold so the server's own `reachedGoalDistance = distanceKm >= goal - tolerance` check
// cannot trip from native over-count. The finish only fires when JS itself crosses the goal.
export const NATIVE_SUBGOAL_CAP_EPSILON_KM = 0.001;

export type BackgroundMatchProgressContext = {
  matchId: string;
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string | null;
};

type BackgroundMatchProgressUploader = (
  input: UpdateRunningMatchProgressInput,
  options?: { signal?: AbortSignal; timeoutMs?: number },
) => Promise<UpdateRunningMatchProgressResponse>;

// NATIVE (Android, next build): the native uploader now resolves with the raw response body
// string (or null on non-2xx / failure) so the Android branch can apply the opponent's live
// state into React instead of discarding it.
type NativeBackgroundMatchProgressUploader = (
  url: string,
  authToken: string,
  jsonBody: string,
) => Promise<string | null>;
type NativeMatchProgressUploaderModule = {
  isNativeMatchProgressUploaderAvailable(): boolean;
  uploadMatchProgressNative: NativeBackgroundMatchProgressUploader;
};

// Fix A.1 — module-level applier injected from React (same pattern as the context injection
// above). When set, the background flush hands the fresh match status response back into React
// so the opponent's live distance/pace/gap unfreezes while the screen is off. Null until the
// owning component wires it up, and reset to null on that component's unmount.
type BackgroundMatchStatusApplier = (status: UpdateRunningMatchProgressResponse) => void;
let applyBackgroundMatchStatus: BackgroundMatchStatusApplier | null = null;

export function setBackgroundMatchStatusApplier(fn: BackgroundMatchStatusApplier | null) {
  applyBackgroundMatchStatus = fn;
}

// Fix M2 — identity-scoped teardown. Mirrors the match-id-scoped clearBackgroundMatchProgressContext:
// an unmounting runtime instance must only clear the applier if it still owns it. Given this
// codebase's duplicate-runtime-mount history (#135) / StrictMode, an UNCONDITIONAL null on unmount
// could wipe the SURVIVING instance's applier and silently disable the whole background fix. So the
// owner captures the exact stable fn it registered and clears by identity only.
export function clearBackgroundMatchStatusApplier(fn: BackgroundMatchStatusApplier) {
  if (applyBackgroundMatchStatus === fn) {
    applyBackgroundMatchStatus = null;
  }
}

// Best-effort: hand a resolved/parsed match status back into React. Never throws — a missing
// applier or a malformed/absent status must not break the background flush.
function applyBackgroundMatchStatusSafe(status: UpdateRunningMatchProgressResponse | null | undefined) {
  if (!status || !applyBackgroundMatchStatus) {
    return;
  }

  try {
    applyBackgroundMatchStatus(status);
  } catch {
    // The applier guards its own teardown; swallow so the next push still runs.
  }
}

// iOS Live Activity (lock-screen card) — FIRE-AND-FORGET hook injected from React, same pattern as
// the applier above. When set, the background flush ALSO hands every fresh match status response to
// the live-card updater so the lock-screen card refreshes WITHOUT a JS timer while the screen is
// off. This is a SIDE CHANNEL only: it is invoked from the .then handlers but is NEVER awaited and
// never touches the awaited sync promise / throttle / inflight guards, so the bg-sync hardening
// stays intact. No-op on every current binary (the native module is absent → the hook itself
// no-ops). Null until the runtime wires it, reset to null on unmount (by identity, like the applier).
type LiveCardMatchStatusHook = (status: UpdateRunningMatchProgressResponse) => void;
let liveCardMatchStatusHook: LiveCardMatchStatusHook | null = null;

export function setLiveCardMatchStatusHook(fn: LiveCardMatchStatusHook | null) {
  liveCardMatchStatusHook = fn;
}

export function clearLiveCardMatchStatusHook(fn: LiveCardMatchStatusHook) {
  if (liveCardMatchStatusHook === fn) {
    liveCardMatchStatusHook = null;
  }
}

// Best-effort, fire-and-forget: push the resolved match status to the Live Activity card. Never
// throws and never returns a value the flush waits on, so it cannot perturb the sync promise /
// throttle / inflight guards.
function updateLiveCardFromMatchStatusSafe(status: UpdateRunningMatchProgressResponse | null | undefined) {
  if (!status || !liveCardMatchStatusHook) {
    return;
  }

  try {
    liveCardMatchStatusHook(status);
  } catch {
    // Live Activity is a non-essential affordance; swallow so the flush is unaffected.
  }
}

// Fix B1 (defense-in-depth) — before applying a resolved response, re-check that the active
// context is STILL the match this request was sent for. The applier in React also guards on
// the forfeited-match set + the live-match id, but the context can be cleared (by forfeit /
// finish teardown calling clearBackgroundMatchProgressContext) WHILE this request is in flight.
// Dropping a response whose context vanished mid-flight keeps a late 'active'/'running' reply
// from re-applying onto a match that was already torn down.
function applyBackgroundMatchStatusForRequest(
  requestedMatchId: string,
  status: UpdateRunningMatchProgressResponse | null | undefined,
) {
  if (getBackgroundMatchProgressContext()?.matchId !== requestedMatchId) {
    return;
  }

  applyBackgroundMatchStatusSafe(status);
}

// NATIVE (Android, next build): parse the raw response body the native uploader now returns and
// apply it. Guards against null/non-JSON bodies so a parse failure can never throw out of flush.
function applyNativeMatchStatusBody(requestedMatchId: string, body: string | null) {
  if (!body) {
    return;
  }

  try {
    applyBackgroundMatchStatusForRequest(
      requestedMatchId,
      JSON.parse(body) as UpdateRunningMatchProgressResponse,
    );
  } catch {
    // Non-JSON body (e.g. an error page); ignore — the next push retries with fresh data.
  }
}

// NATIVE PERIODIC UPLOADER: apply a 2xx body emitted by the onMatchProgressResponse listener. The
// emitter is not tied to a specific in-flight request (the native cadence re-POSTs on its own
// thread), so scope it to the CURRENTLY ACTIVE context's matchId — the same defense-in-depth guard
// applyBackgroundMatchStatusForRequest uses — so a late body whose match was torn down is dropped.
// Routes through the EXACT same applier guards (B1 forfeit, B2 monotonic serverNow, identity
// teardown) as the JS-fallback path, so the opponent board unfreezes WITHOUT a JS timer.
function applyPeriodicNativeMatchStatusBody(body: string) {
  const activeMatchId = getBackgroundMatchProgressContext()?.matchId;
  if (!activeMatchId) {
    return;
  }

  applyNativeMatchStatusBody(activeMatchId, body);
}

type BackgroundMatchProgressPlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos' | string;

type FlushBackgroundMatchProgressOptions = {
  apiBaseUrl?: string;
  getAccessToken?: () => Promise<string | null>;
  getApiBaseUrl?: () => Promise<string>;
  getNativeMatchProgressUploader?: () => Promise<NativeMatchProgressUploaderModule | null>;
  isAppBackground?: boolean;
  nowMs?: number;
  platform?: BackgroundMatchProgressPlatform;
  updateRunningMatchProgress?: BackgroundMatchProgressUploader;
};

let activeMatchProgressContext: BackgroundMatchProgressContext | null = null;
let lastBackgroundMatchProgressSyncAtMs = 0;
let inFlightBackgroundMatchProgressSync: Promise<unknown> | null = null;
let inFlightBackgroundMatchProgressSyncStartedAtMs = 0;
let inFlightBackgroundMatchProgressAbort: AbortController | null = null;

// Fix A.2(b) — self-healing single-flight teardown. Clears the in-flight slot (promise +
// started-at + AbortController) ONLY when `token` is still the slot we registered, so a late
// finally from a previously-reclaimed/aborted request can never wipe a NEWER in-flight request's
// slot. Called from finally / abort / timeout / catch on EVERY background push path so a frozen
// or aborted fetch can never wedge the channel until foreground.
function clearInFlightBackgroundMatchProgressSync(token: Promise<unknown>) {
  if (inFlightBackgroundMatchProgressSync === token) {
    inFlightBackgroundMatchProgressSync = null;
    inFlightBackgroundMatchProgressSyncStartedAtMs = 0;
    inFlightBackgroundMatchProgressAbort = null;
  }
}

async function updateRunningMatchProgressService(
  input: UpdateRunningMatchProgressInput,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<UpdateRunningMatchProgressResponse> {
  const { updateRunningMatchProgress } = await import('@/services');
  return updateRunningMatchProgress(input, options);
}

async function getAccessTokenService() {
  const { getAccessToken } = await import('@/lib/session/sessionState');
  return getAccessToken();
}

async function getApiBaseUrlService() {
  const { API_CONFIG } = await import('@/services/apiClient');
  return API_CONFIG.baseUrl;
}

async function getNativeMatchProgressUploaderService(): Promise<NativeMatchProgressUploaderModule | null> {
  try {
    return await import('../../../../../modules/match-progress-uploader');
  } catch {
    return null;
  }
}

function normalizeBackgroundMatchProgressContext(
  context: BackgroundMatchProgressContext | null,
): BackgroundMatchProgressContext | null {
  if (!context) {
    return null;
  }

  const matchId = context.matchId.trim();

  if (!matchId) {
    return null;
  }

  return {
    matchId,
    mode: context.mode,
    distanceKm: Number.isFinite(context.distanceKm) ? Math.max(0, context.distanceKm) : 0,
    slotStartAt: context.slotStartAt ?? null,
  };
}

export function setBackgroundMatchProgressContext(context: BackgroundMatchProgressContext | null) {
  activeMatchProgressContext = normalizeBackgroundMatchProgressContext(context);

  if (!activeMatchProgressContext) {
    lastBackgroundMatchProgressSyncAtMs = 0;
  }
}

export function clearBackgroundMatchProgressContext(matchId?: string | null) {
  if (matchId && activeMatchProgressContext?.matchId !== matchId) {
    return;
  }

  activeMatchProgressContext = null;
  lastBackgroundMatchProgressSyncAtMs = 0;
  // Stop the native periodic cadence (and unsubscribe its response listener) the moment the live
  // match is torn down so the second iOS location consumer / Android executor can never leak past
  // the match. No-op on current binaries (availability gate). Fire-and-forget — never block clear.
  void stopPeriodicMatchUpload().catch(() => undefined);
  // Stop the native DISTANCE accumulator too — strictly gated to an active match, so its GPS
  // consumer must tear down the instant the match ends (no battery drain after the run). No-op on
  // current binaries (availability gate). Fire-and-forget — never block clear.
  void stopNativeDistanceAccumulator().catch(() => undefined);
}

export function getBackgroundMatchProgressContext() {
  return activeMatchProgressContext;
}

export function resetBackgroundMatchProgressSyncForTest() {
  activeMatchProgressContext = null;
  lastBackgroundMatchProgressSyncAtMs = 0;
  inFlightBackgroundMatchProgressSync = null;
  inFlightBackgroundMatchProgressSyncStartedAtMs = 0;
  inFlightBackgroundMatchProgressAbort?.abort();
  inFlightBackgroundMatchProgressAbort = null;
}

export function resolveBackgroundHeartbeatStatus(
  distanceKm: number,
  targetDistanceKm: number,
): UpdateRunningMatchProgressInput['status'] {
  return distanceKm >= targetDistanceKm - MATCH_GOAL_DISTANCE_TOLERANCE_KM
    ? 'finished'
    : 'running';
}

export function isBackgroundMatchProgressInFlightStale(startedAtMs: number, nowMs: number) {
  return nowMs - startedAtMs > BACKGROUND_MATCH_PROGRESS_INFLIGHT_STALE_MS;
}

export async function flushBackgroundMatchProgressSync({
  apiBaseUrl,
  getAccessToken = getAccessTokenService,
  getApiBaseUrl = getApiBaseUrlService,
  getNativeMatchProgressUploader = getNativeMatchProgressUploaderService,
  isAppBackground = getBackgroundSyncDiagnostics().isAppBackground,
  nowMs = Date.now(),
  platform = 'unknown',
  updateRunningMatchProgress = updateRunningMatchProgressService,
}: FlushBackgroundMatchProgressOptions = {}) {
  const context = activeMatchProgressContext;

  // [RG flush] TEMP diagnostic — remove after on-device verification.
  try {
    const diagSnapshot = getSnapshotState();
    globalThis.console.log(
      `[RG flush] platform=${platform} bg=${isAppBackground} ctx=${context ? context.matchId : 'null'} status=${diagSnapshot.status} dist=${
        typeof diagSnapshot.distanceKm === 'number' ? diagSnapshot.distanceKm.toFixed(3) : String(diagSnapshot.distanceKm)
      } thr=${nowMs - lastBackgroundMatchProgressSyncAtMs} inflight=${inFlightBackgroundMatchProgressSync ? 1 : 0}`,
    );
  } catch {
    // diagnostic only
  }

  if (!isAppBackground || !context) {
    return false;
  }

  const snapshot = getSnapshotState();

  if (snapshot.status !== 'running') {
    return false;
  }

  if (nowMs - lastBackgroundMatchProgressSyncAtMs < BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS) {
    return false;
  }

  if (inFlightBackgroundMatchProgressSync) {
    // Fix A.2(c) — stale-reclaim guard. A still-fresh in-flight push dedupes the new one (no
    // double-POST). But an in-flight older than the small stale threshold is RECLAIMED: abort it
    // and clear the slot so a frozen background fetch (JS timer suspended mid-request) can never
    // wedge the channel until foreground. The abort fires the in-flight's own finally, which is a
    // no-op now that we clear the slot here by identity.
    if (!isBackgroundMatchProgressInFlightStale(inFlightBackgroundMatchProgressSyncStartedAtMs, nowMs)) {
      return false;
    }

    inFlightBackgroundMatchProgressAbort?.abort();
    inFlightBackgroundMatchProgressSync = null;
    inFlightBackgroundMatchProgressSyncStartedAtMs = 0;
    inFlightBackgroundMatchProgressAbort = null;
  }

  const elapsedSeconds = Math.floor(resolveSnapshotElapsedMs(snapshot, nowMs) / 1000);
  // VARIANT 1 (POST-only) native distance merge. getMergeableNativeDistanceMeters() returns 0 unless
  // BOTH the native accumulator is available AND ENABLE_NATIVE_DISTANCE_MERGE is on, so when native
  // is unavailable / the kill-switch is off this is max(jsKm, 0) === jsKm === EXACTLY today's
  // behavior. In the foreground the JS pipeline is ahead, so max() === jsKm and the foreground UI
  // path is unchanged. This merged value drives the POST payload ONLY — the snapshot store / UI is
  // NOT mutated here (that is a later variant-2 follow-up), so the foreground UI stays 100% on the
  // existing JS path. The native total is SEEDED to the JS total at start and merged with max(), so
  // it can never double-count or jump the distance backward.
  //
  // COMPETITIVE-INTEGRITY GUARD — native distance is a GAP-ONLY FLOOR that NEVER crosses the goal.
  // The native accumulator mirrors only SOME of the JS distance filters (it omits the JS
  // lateral-jitter collapse, cold-start, and noisy-segment filters), so under real GPS jitter the
  // native total can OVER-COUNT vs the authoritative JS pipeline. Because the merge is max(), that
  // over-count can only push the value UP — which, if it fed the finish status or an un-capped sent
  // distance, could flip a runner to 'finished' (or trip the server's own
  // `reachedGoalDistance = distanceKm >= goal - tolerance` check) BEFORE they actually reached the
  // goal — a premature/unfair finish in a 1v1/group match. To make that impossible while still
  // letting the opponent see my distance advance screen-off:
  //   (1) FINISH STATUS comes from the JS snapshot ONLY (snapshot.distanceKm, fully filtered), never
  //       the merged value, so native over-count can never flip the status to 'finished'.
  //   (2) The SENT distance is CAPPED strictly below the goal threshold until JS itself reaches the
  //       goal, so the server's own reachedGoalDistance can't trip from a native over-count either.
  // When the JS pipeline (accurate, all filters) crosses the goal, the cap lifts: the full merged
  // distance is sent with status 'finished' — a legit finish. This lines up with the shipped
  // "turn your screen on near the finish" reminder. FUTURE REFINEMENT (out of scope here): porting
  // the remaining JS jitter/cold-start/noisy-segment filters into the native accumulators would
  // tighten the live-gap accuracy — do NOT port them now.
  // COLD-START OVER-COUNT FIX — re-seed the native total to the JS authoritative total whenever MY
  // JS distance is FRESH. The native accumulator is SEEDED to the JS total at start (so it inherits
  // every JS filter at t0) but afterward accumulates on its OWN GPS deltas, which mirror only SOME
  // JS filters (it omits the JS cold-start cluster collapse). At GPS cold start the native therefore
  // OVER-COUNTS the warmup jitter the JS pipeline discards; because the POST merge is max(jsKm,
  // nativeKm), that one-time over-count would otherwise be preserved forever as a CONSTANT offset
  // (real-device build-41: a fixed ~55m lead from the start despite near-equal pace).
  //
  // Re-seeding the native total to the CURRENT JS total on every fresh flush overwrites any native
  // cold-start over-count with the fully-JS-filtered value, so foreground the merge is exactly the
  // JS total (no offset). The native keeps its GPS anchor and accumulates correct deltas afterward.
  // It only DIVERGES (leads) once JS goes STALE (screen off, JS suspended) and we STOP re-seeding —
  // which is the existing screen-off behavior that fills the frozen distance, now from a clean
  // (offset-free) baseline. Freshness uses the SAME isMyMatchDistanceStale signal used elsewhere; the
  // freshness clock is the last committed JS snapshot (lastSnapshotAtMs), which stops advancing the
  // instant the JS thread is suspended. No-op on every current binary (the wrapper no-ops when the
  // native accumulator is unavailable / the kill-switch is off / build-40 lacks seedDistanceAccumulator).
  const isMyDistanceStaleNow = isMyMatchDistanceStale({
    lastUpdatedAtMs: getBackgroundSyncDiagnostics().lastSnapshotAtMs,
    nowMs,
  });
  if (!isMyDistanceStaleNow) {
    seedNativeDistanceAccumulatorToMeters(getJsAccumulatedDistanceMeters());
  }
  const mergedRawKm = resolveMergedDistanceKm({
    jsDistanceKm: snapshot.distanceKm,
    nativeMeters: getMergeableNativeDistanceMeters(),
    nativeAvailable: true,
  });
  // (1) Finish status from the JS snapshot ONLY — native over-count can never flip to 'finished'.
  const status = resolveBackgroundHeartbeatStatus(snapshot.distanceKm, context.distanceKm);
  // (2) Cap the sent distance strictly below the goal threshold until JS reaches the goal. EPSILON
  // keeps the capped value below the threshold so the server's reachedGoalDistance can't trip from
  // native. Once JS has reached the goal, send the full merged distance (legit finish).
  const goalThresholdKm = context.distanceKm - MATCH_GOAL_DISTANCE_TOLERANCE_KM;
  const jsReachedGoal = snapshot.distanceKm >= goalThresholdKm;
  const distanceToSendKm = jsReachedGoal
    ? mergedRawKm
    : Math.min(mergedRawKm, goalThresholdKm - NATIVE_SUBGOAL_CAP_EPSILON_KM);
  const mergedDistanceKm = distanceToSendKm;
  const progress = buildSyncedMatchProgressSnapshot({
    matchId: context.matchId,
    distanceKm: mergedDistanceKm,
    elapsedSeconds,
    currentPace: snapshot.currentPace,
    status,
  }, nowMs);
  const input: UpdateRunningMatchProgressInput = {
    matchId: context.matchId,
    distanceKm: progress.distanceKm,
    elapsedSeconds: progress.elapsedSeconds,
    currentPace: progress.currentPace,
    status,
  };

  // NATIVE branch (Android always; iOS ONLY on the new build whose Swift module reports
  // available=true). Fix A.5 — widen from android-only to ALSO take iOS, but gate iOS on the
  // RUNTIME availability check so the OTA stays safe: the current iOS no-op binary reports
  // available=false → it skips this branch and keeps the JS-fallback push below (today's
  // behavior, unchanged); only the new iOS build (real Swift module → available=true) routes
  // here. Android keeps using the real Kotlin native uploader exactly as before.
  if (platform === 'android' || platform === 'ios') {
    const nativeUploader = await getNativeMatchProgressUploader();

    if (nativeUploader?.isNativeMatchProgressUploaderAvailable()) {
      const token = await getAccessToken();

      if (token) {
        const resolvedApiBaseUrl = apiBaseUrl ?? await getApiBaseUrl();
        const requestBody = JSON.stringify({
          ...input,
          distanceKm: Number(input.distanceKm.toFixed(2)),
          elapsedSeconds: Math.max(0, Math.round(input.elapsedSeconds)),
        });

        // NATIVE PERIODIC UPLOADER (next build only — OTA-safe via the controller's availability
        // gate, which no-ops on every current binary). Hand the EXACT same {url, token, body} this
        // flush is about to POST to the native wall-clock cadence so it re-sends the latest payload
        // every ~3s while the screen is off, GPS+JS-independent. The native side NEVER recomputes —
        // it only re-sends this body. On first flush for the match this starts the cadence + wires
        // the onMatchProgressResponse listener (which applies the opponent board WITHOUT a JS
        // timer); subsequent flushes just refresh the cached payload (no thread/listener churn).
        // Fire-and-forget so the periodic wiring never blocks the existing one-shot push below.
        const periodicUrl = `${resolvedApiBaseUrl}/running/matches/progress`;
        void startPeriodicMatchUpload(
          input.matchId,
          { url: periodicUrl, authToken: token, jsonBody: requestBody },
          applyPeriodicNativeMatchStatusBody,
          PERIODIC_MATCH_UPLOAD_INTERVAL_MS,
        ).catch(() => undefined);

        // NATIVE DISTANCE ACCUMULATOR (next build only — OTA-safe via the controller's availability
        // gate + the ENABLE_NATIVE_DISTANCE_MERGE kill-switch, which no-op on every current binary).
        // Start the native GPS distance accumulation for this match and SEED it to the JS
        // authoritative total at THIS instant, so native and JS share one origin (the merge above
        // then takes max(jsKm, nativeKm) — never a sum, never a backward jump). Idempotent for the
        // same match (a re-start just re-seeds). Fire-and-forget so it never blocks the push.
        void startNativeDistanceAccumulator(
          input.matchId,
          getJsAccumulatedDistanceMeters(),
        ).catch(() => undefined);

        recordBackgroundHeartbeatAttempt();
        globalThis.console.log(
          `[RG flush] path=native fired matchId=${context.matchId} dist=${input.distanceKm.toFixed(3)} status=${status}`,
        );
        // NATIVE: the native uploader resolves with the response body it already reads on a
        // native thread. Register it in the single-flight slot so a frozen native upload is
        // reclaimable by the stale guard above (it cannot wedge the channel). Fix A.2(a) — the
        // throttle timestamp is advanced ONLY after a successful round-trip (in .then), never
        // before the request; Fix A.2(b) — .finally ALWAYS clears the slot by identity.
        // Best-effort: a network/parse failure must not throw out of the flush.
        const nativePromise = nativeUploader.uploadMatchProgressNative(
          `${resolvedApiBaseUrl}/running/matches/progress`,
          token,
          requestBody,
        )
          .then((nativeBody) => {
            lastBackgroundMatchProgressSyncAtMs = nowMs;
            applyNativeMatchStatusBody(input.matchId, nativeBody);
            // Live Activity side channel — fire-and-forget, after the React apply. Parse-guarded
            // and never awaited, so it can't affect the sync promise / throttle / inflight guards.
            if (nativeBody) {
              try {
                updateLiveCardFromMatchStatusSafe(
                  JSON.parse(nativeBody) as UpdateRunningMatchProgressResponse,
                );
              } catch {
                // Non-JSON body — the next push refreshes the card.
              }
            }
          })
          .catch(() => {
            // Best-effort background upload; the next location tick retries with fresher data.
            // Throttle is NOT advanced on failure so the next tick can retry immediately.
          })
          .finally(() => {
            clearInFlightBackgroundMatchProgressSync(nativePromise);
          });
        inFlightBackgroundMatchProgressSync = nativePromise;
        inFlightBackgroundMatchProgressSyncStartedAtMs = nowMs;
        inFlightBackgroundMatchProgressAbort = null;

        await nativePromise;
        return true;
      }

      globalThis.console.log('[RG flush] path=native NO_TOKEN — JS fallback');
    } else {
      globalThis.console.log('[RG flush] path=native UNAVAILABLE (module not linked) — JS fallback');
    }
  }

  recordBackgroundHeartbeatAttempt();
  const abortController = new AbortController();
  inFlightBackgroundMatchProgressAbort = abortController;
  inFlightBackgroundMatchProgressSyncStartedAtMs = nowMs;
  // Fix A.2 — capture the resolved status and apply it. This is the channel the CURRENT iOS
  // no-op binary uses in background (its native uploader is unavailable), so applying the
  // response here is what unfreezes the opponent on today's iOS. Fix B — pass an explicit
  // timeout SHORTER than the stale window so a hung request self-aborts and frees the slot.
  // Fix A.2(a) — the throttle timestamp is advanced ONLY after a successful round-trip (in
  // .then), never before the request, so a hung/aborted push does not pre-commit the throttle
  // and starve the next tick. Fix A.2(b) — .finally ALWAYS clears the slot by identity (on
  // resolve, reject, abort, and timeout) so a frozen or aborted fetch can never wedge the
  // channel until foreground.
  const syncPromise = updateRunningMatchProgress(input, {
    signal: abortController.signal,
    timeoutMs: BACKGROUND_MATCH_PROGRESS_PUSH_TIMEOUT_MS,
  })
    .then((nextStatus) => {
      lastBackgroundMatchProgressSyncAtMs = nowMs;
      // Fix B1 (defense-in-depth) — drop the response if the context was cleared (forfeit /
      // finish teardown) while this request was in flight, so a late reply can't re-apply onto
      // a torn-down match. The React applier guards forfeit + serverNow on top of this.
      applyBackgroundMatchStatusForRequest(input.matchId, nextStatus);
      // Live Activity side channel — fire-and-forget, after the React apply. Never awaited, so it
      // cannot perturb the awaited sync promise / throttle / inflight guards.
      updateLiveCardFromMatchStatusSafe(nextStatus);
      return nextStatus;
    })
    .finally(() => {
      clearInFlightBackgroundMatchProgressSync(syncPromise);
    });
  inFlightBackgroundMatchProgressSync = syncPromise;

  await inFlightBackgroundMatchProgressSync;
  return true;
}
