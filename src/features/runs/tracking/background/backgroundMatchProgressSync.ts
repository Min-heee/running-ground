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
  getLastFreshJsAuthoritativeKm,
  getMergeableNativeDistanceMeters,
  recordFreshJsAuthoritativeMeters,
  resolveMergedDistanceKm,
  seedNativeDistanceAccumulatorToMeters,
  startNativeDistanceAccumulator,
  stopNativeDistanceAccumulator,
} from '@/features/runs/tracking/background/distanceAccumulatorController';
import { isMyMatchDistanceStale } from '@/features/runs/sync/matchDistanceStaleness';
import { getPendingFinish } from '@/features/runs/sync/pendingFinishStore';
import { recordLocalGoalFreezeOnce } from '@/features/runs/sync/localGoalFreezeStore';
import { presentFinishCelebrationOnce } from '@/features/runs/finishReminder/finishApproachNotification';
import { isApiError } from '@/services/apiError';
import { rgDiagLog } from '@/utils/rgPerfTrace';
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
  // §3.② — ACK detection for a pending finish runs BEFORE the context guard: after the deferred
  // teardown the context is already null, but the held cadence keeps re-POSTing the finished body
  // and its 2xx responses still arrive here — the ACK is what finally stops it.
  notePendingNativeFinishResponseBody(body);

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

// TERMINAL-STOP (P1-3) — matchIds the server has DEFINITIVELY declared gone: HTTP 410
// { code: 'match_gone' } for a pruned/tombstoned match, HTTP 404 for an unknown one. A background
// push for such a match can never succeed again, so retrying it every ~3s strands the device in a
// permanent upload loop. Once a matchId lands here it is torn down (same teardown a normal finish
// uses) and can NEVER be re-armed. ONLY a definitive HTTP 404/410 (ApiError with that status) may
// add to this set — network errors/timeouts MUST keep retrying (screen-off runs depend on it, #203).
const terminallyGoneMatchIds = new Set<string>();

function isDefinitiveMatchGoneError(error: unknown): boolean {
  // ApiError carries `status` ONLY when an actual HTTP response arrived (apiClient sets it from
  // response.status). Timeouts ('timeout') and connection failures ('network') never have a
  // status, so they can never match here — they stay retryable by construction.
  return isApiError(error) && (error.status === 404 || error.status === 410);
}

function markMatchTerminallyGone(matchId: string) {
  terminallyGoneMatchIds.add(matchId);
  rgDiagLog(`[RG flush] terminal-stop matchId=${matchId} — HTTP 404/410, match gone; upload loop stopped`);
  // Same teardown a normal finish/forfeit uses: clears the active context (matchId-scoped, so a
  // different live match is untouched) AND stops the native periodic cadence + distance
  // accumulator, so nothing keeps re-posting for the pruned match.
  clearBackgroundMatchProgressContext(matchId);
}

export function isBackgroundMatchTerminallyGone(matchId: string) {
  return terminallyGoneMatchIds.has(matchId);
}

// PENDING NATIVE FINISH (fair-verdict design §3.②) — once the background flush computes
// status==='finished' in the NATIVE branch, the native periodic cadence carries the FINISHED body
// and must keep re-sending it until the server ACKs, even across the normal match-end teardown
// (clearBackgroundMatchProgressContext). This record tracks that in-flight finish:
//   - armed on the first native flush that computes 'finished' (armedAtMs anchors the hard cap),
//   - settled on server ACK (a 2xx cadence/one-shot body confirming my frozen finish, or the
//     FINAL sealed-DNF terminal shape — re-sending can never change a finalized seal),
//   - settled on terminal 404/410 (the existing terminallyGoneMatchIds set),
//   - hard-capped at 10 minutes (the client mirror of the server's seal-revision window) so a
//     never-ACKing server can't keep the native cadence alive forever.
// While the record is unACKed, clearBackgroundMatchProgressContext defers stopPeriodicMatchUpload
// (holding=true) and the ACK/terminal/cap observation points perform the deferred stop instead.
export const PENDING_NATIVE_FINISH_MAX_HOLD_MS = 10 * 60 * 1000;

type PendingNativeFinishState = {
  matchId: string;
  armedAtMs: number;
  // True once a context clear was DEFERRED for this finish: the cadence is intentionally left
  // running and must be stopped by whichever of ACK / terminal / cap observes the end first.
  holding: boolean;
  capTimerId: ReturnType<typeof setTimeout> | null;
};

let pendingNativeFinish: PendingNativeFinishState | null = null;

// Settle (forget) the pending finish. stopCadence=true performs the DEFERRED stop — used when the
// record was holding the cadence open past its context clear. stopCadence=false only drops the
// record: the cadence either keeps serving the still-armed context (ACK mid-match) or has been
// taken over by a newer match (supersession) — stopping it there would break a live channel.
function settlePendingNativeFinish(stopCadence: boolean) {
  const pending = pendingNativeFinish;
  if (!pending) {
    return;
  }

  if (pending.capTimerId != null) {
    clearTimeout(pending.capTimerId);
  }
  pendingNativeFinish = null;

  if (stopCadence) {
    void stopPeriodicMatchUpload().catch(() => undefined);
  }
}

function armPendingNativeFinish(matchId: string, nowMs: number) {
  if (pendingNativeFinish?.matchId === matchId) {
    // Already armed for this match — keep the ORIGINAL armedAtMs so the 10min cap is measured
    // from the first finished computation, not perpetually re-extended by retries.
    return;
  }

  // A different match's finish was still pending: the cadence now belongs to the new match, so
  // drop the stale record WITHOUT stopping the cadence.
  settlePendingNativeFinish(false);

  const record: PendingNativeFinishState = {
    matchId,
    armedAtMs: nowMs,
    holding: false,
    capTimerId: null,
  };
  // Best-effort hard-cap timer (JS may be suspended when it is due — every observation point
  // below re-checks the cap with real timestamps, so the timer is a convenience, not the guard).
  const capTimerId = setTimeout(() => {
    if (pendingNativeFinish === record) {
      settlePendingNativeFinish(record.holding);
    }
  }, PENDING_NATIVE_FINISH_MAX_HOLD_MS);
  // Under node (tests) unref the timer so a pending 10min cap never holds the process open; on
  // React Native timers are plain numbers and this safely no-ops.
  (capTimerId as unknown as { unref?: () => void })?.unref?.();
  record.capTimerId = capTimerId;
  pendingNativeFinish = record;
}

// Enforce the 10min hard cap at an observation point (flush tick / cadence response / clear).
// Returns true when the pending finish is still armed and within the cap afterwards.
function enforcePendingNativeFinishCap(nowMs: number): boolean {
  const pending = pendingNativeFinish;
  if (!pending) {
    return false;
  }

  if (nowMs - pending.armedAtMs >= PENDING_NATIVE_FINISH_MAX_HOLD_MS) {
    rgDiagLog(`[RG flush] pending-finish hard cap matchId=${pending.matchId} — 10min without ACK; cadence released`);
    settlePendingNativeFinish(pending.holding);
    return false;
  }

  return true;
}

// Server ACK shapes for a pending finish. Either my finish is frozen (liveStatus 'finished' /
// the official finish elapsed is present), or the duel verdict is FINAL (not provisional) with me
// sealed as DNF (design §3.⑥ terminal shape) — in both cases re-sending the finished body can
// never change anything, so the cadence must stop. `provisional` is additive server-side (fair
// verdict Stage 1); older backends omit it, and their seals are immediately final, so treating
// `undefined` as final is correct for them too.
function isPendingFinishAckStatus(status: UpdateRunningMatchProgressResponse): boolean {
  if (
    status.currentUserLiveStatus === 'finished'
    || typeof status.currentUserFinishElapsedSeconds === 'number'
  ) {
    return true;
  }

  const verdict = status.duelVerdict as
    | (NonNullable<UpdateRunningMatchProgressResponse['duelVerdict']> & { provisional?: boolean })
    | undefined;
  return verdict?.resolved === true
    && verdict.provisional !== true
    && verdict.outcome === 'lose'
    && verdict.myFinishElapsedSeconds === null;
}

// Inspect a resolved 2xx status (native cadence response, one-shot native upload response, or the
// JS-fallback push response) for the pending finish's ACK. Runs BEFORE any context guard so an ACK
// arriving after the deferred teardown (context already null) still stops the held cadence.
function notePendingNativeFinishResponseStatus(
  status: UpdateRunningMatchProgressResponse | null | undefined,
  nowMs = Date.now(),
) {
  const pending = pendingNativeFinish;
  if (!pending || !status) {
    return;
  }

  if (!enforcePendingNativeFinishCap(nowMs)) {
    return;
  }

  if (typeof status.matchId === 'string' && status.matchId !== pending.matchId) {
    return;
  }

  if (isPendingFinishAckStatus(status)) {
    rgDiagLog(`[RG flush] pending-finish ACK matchId=${pending.matchId} holding=${pending.holding ? 1 : 0}`);
    settlePendingNativeFinish(pending.holding);
  }
}

// String-body variant for the native channels (their responses arrive as raw body strings).
function notePendingNativeFinishResponseBody(body: string | null | undefined, nowMs = Date.now()) {
  if (!pendingNativeFinish || !body) {
    return;
  }

  try {
    notePendingNativeFinishResponseStatus(JSON.parse(body) as UpdateRunningMatchProgressResponse, nowMs);
  } catch {
    // Non-JSON body — the next cadence response re-checks.
  }
}

// True when the context clear for `matchId` must LEAVE the native periodic cadence running: an
// unACKed pending finish exists for it, the match is not terminally gone, and the 10min hard cap
// has not expired. Marks the record as holding so the eventual ACK/terminal/cap performs the stop.
function deferCadenceStopForPendingFinish(matchId: string | null, nowMs: number): boolean {
  const pending = pendingNativeFinish;
  if (!pending) {
    return false;
  }

  // An unscoped clear (no matchId — e.g. the defensive unmount cleanup) must not kill a held
  // finish either; only a clear for a DIFFERENT match falls through to the normal stop.
  if (matchId != null && pending.matchId !== matchId) {
    return false;
  }

  if (terminallyGoneMatchIds.has(pending.matchId)) {
    settlePendingNativeFinish(false);
    return false;
  }

  if (!enforcePendingNativeFinishCap(nowMs)) {
    return false;
  }

  pending.holding = true;
  rgDiagLog(`[RG flush] pending-finish hold matchId=${pending.matchId} — cadence kept alive until ACK/terminal/10min`);
  return true;
}

// Test-only visibility: whether an unACKed pending finish is currently tracked for the matchId.
export function hasUnackedPendingNativeFinishForTest(matchId: string): boolean {
  return pendingNativeFinish?.matchId === matchId;
}

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

// §3.④ — native handoff deps PRE-RESOLVED at context-arm time. Every `await` is a point where iOS
// can suspend the JS thread (#203); resolving the native module handle + access token + apiBaseUrl
// when the context is ARMED means the flush can hand a freshly-built FINISHED payload to the native
// uploader without a single await sitting between the payload build and the handoff. The cache is
// matchId-scoped and refreshed fire-and-forget after each native flush so the token stays current;
// when it has not resolved yet (first tick / tests injecting their own getters) the flush falls
// back to awaiting the injected getters exactly as before.
type PreResolvedNativeHandoffDeps = {
  matchId: string;
  uploader: NativeMatchProgressUploaderModule | null;
  token: string | null;
  apiBaseUrl: string | null;
};

let preResolvedNativeHandoffDeps: PreResolvedNativeHandoffDeps | null = null;

function preResolveNativeHandoffDeps(matchId: string) {
  void (async () => {
    const [uploader, token, apiBaseUrl] = await Promise.all([
      getNativeMatchProgressUploaderService().catch(() => null),
      getAccessTokenService().catch(() => null),
      getApiBaseUrlService().catch(() => null),
    ]);

    // The context may have moved on while resolving — only cache for the still-armed match so a
    // stale token/url can never be handed to a different match's upload.
    if (activeMatchProgressContext?.matchId === matchId) {
      preResolvedNativeHandoffDeps = { matchId, uploader, token, apiBaseUrl };
    }
  })().catch(() => undefined);
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
  const normalized = normalizeBackgroundMatchProgressContext(context);

  // TERMINAL-STOP (P1-3) — a matchId the server declared gone (HTTP 404/410) can NEVER be re-armed.
  // The runtime layers re-set the context on their own cadence; without this guard a stranded
  // device would immediately re-arm the pruned match and resume the forever-retry loop the
  // terminal-stop just tore down. No-op (leave whatever context is active untouched).
  if (normalized && terminallyGoneMatchIds.has(normalized.matchId)) {
    rgDiagLog(`[RG flush] re-arm refused matchId=${normalized.matchId} — terminally gone (404/410)`);
    return;
  }

  activeMatchProgressContext = normalized;

  if (!activeMatchProgressContext) {
    lastBackgroundMatchProgressSyncAtMs = 0;
    return;
  }

  // §3.④ — kick off the native-handoff dep prefetch the moment the match context is armed, so a
  // later finished payload can be handed to the native uploader with zero awaits in between.
  preResolveNativeHandoffDeps(activeMatchProgressContext.matchId);
}

export function clearBackgroundMatchProgressContext(matchId?: string | null) {
  if (matchId && activeMatchProgressContext?.matchId !== matchId) {
    return;
  }

  const clearedMatchId = matchId ?? activeMatchProgressContext?.matchId ?? null;
  activeMatchProgressContext = null;
  lastBackgroundMatchProgressSyncAtMs = 0;

  // §3.② — do NOT stop the native periodic cadence while an unACKed pending FINISH exists for the
  // cleared match: the cadence is carrying the finished body and is the screen-off runner's only
  // remaining delivery channel after this teardown. The deferred stop happens on server ACK, on a
  // terminal 404/410, or at the 10min hard cap — whichever is observed first. Every other clear
  // stops the cadence exactly as before.
  if (!deferCadenceStopForPendingFinish(clearedMatchId, Date.now())) {
    // Stop the native periodic cadence (and unsubscribe its response listener) the moment the live
    // match is torn down so the second iOS location consumer / Android executor can never leak past
    // the match. No-op on current binaries (availability gate). Fire-and-forget — never block clear.
    void stopPeriodicMatchUpload().catch(() => undefined);
  }
  // Stop the native DISTANCE accumulator too — strictly gated to an active match, so its GPS
  // consumer must tear down the instant the match ends (no battery drain after the run). No-op on
  // current binaries (availability gate). Fire-and-forget — never block clear. (A held pending
  // finish does NOT need GPS — its payload is frozen — so the accumulator always stops here.)
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
  terminallyGoneMatchIds.clear();
  if (pendingNativeFinish?.capTimerId != null) {
    clearTimeout(pendingNativeFinish.capTimerId);
  }
  pendingNativeFinish = null;
  preResolvedNativeHandoffDeps = null;
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

// The regular (non-finish) progress payload — extracted verbatim from the flush so the
// pending-finish path (§3.③, which sends the frozen intent instead) can skip it wholesale.
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
function buildRunningProgressInput(
  context: BackgroundMatchProgressContext,
  snapshot: ReturnType<typeof getSnapshotState>,
  nowMs: number,
): UpdateRunningMatchProgressInput {
  const elapsedSeconds = Math.floor(resolveSnapshotElapsedMs(snapshot, nowMs) / 1000);
  const isMyDistanceStaleNow = isMyMatchDistanceStale({
    lastUpdatedAtMs: getBackgroundSyncDiagnostics().lastSnapshotAtMs,
    nowMs,
  });
  if (!isMyDistanceStaleNow) {
    // FRESH: re-seed native to the JS total AND record that total as the last-fresh baseline. The
    // merge below then returns jsKm EXACTLY while fresh (native can never win an interval the JS
    // chain already filtered); the recorded baseline is the floor the STALE branch fills the gap
    // from. Record the JS authoritative total (meters) regardless of whether the native re-seed
    // actually fired, so the baseline is correct the moment native becomes available.
    const jsAuthoritativeMeters = getJsAccumulatedDistanceMeters();
    recordFreshJsAuthoritativeMeters(jsAuthoritativeMeters);
    seedNativeDistanceAccumulatorToMeters(jsAuthoritativeMeters);
  }
  // FRESH-JS-WINS + native-delta-only merge (replaces the old unconditional max()): fresh → jsKm
  // EXACTLY; stale (screen off) → max(lastFreshJsKm, nativeKm) so native fills the gap additively
  // from the last fresh JS baseline (advances screen-off, never below the last fresh total, never a
  // re-add of pre-seed jitter). No-op on current binaries (native unavailable → jsKm).
  const mergedRawKm = resolveMergedDistanceKm({
    jsDistanceKm: snapshot.distanceKm,
    nativeMeters: getMergeableNativeDistanceMeters(),
    nativeAvailable: true,
    jsIsFresh: !isMyDistanceStaleNow,
    lastFreshJsKm: getLastFreshJsAuthoritativeKm(),
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

  return {
    matchId: context.matchId,
    distanceKm: progress.distanceKm,
    elapsedSeconds: progress.elapsedSeconds,
    currentPace: progress.currentPace,
    status,
  };
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

  // [RG flush] TEMP diagnostic for #203 (still open) — gated behind the rgPerfTrace debug flag so
  // it stays available on a debug device but is silent in release.
  try {
    const diagSnapshot = getSnapshotState();
    rgDiagLog(
      `[RG flush] platform=${platform} bg=${isAppBackground} ctx=${context ? context.matchId : 'null'} status=${diagSnapshot.status} dist=${
        typeof diagSnapshot.distanceKm === 'number' ? diagSnapshot.distanceKm.toFixed(3) : String(diagSnapshot.distanceKm)
      } thr=${nowMs - lastBackgroundMatchProgressSyncAtMs} inflight=${inFlightBackgroundMatchProgressSync ? 1 : 0}`,
    );
  } catch {
    // diagnostic only
  }

  // TERMINAL-STOP (P1-3) — belt-and-braces: if a terminally-gone matchId somehow ended up as the
  // active context (e.g. it was armed before the 404/410 landed), tear it down here instead of
  // pushing. clearBackgroundMatchProgressContext is the same finish teardown (stops the native
  // periodic cadence + distance accumulator), matchId-scoped so any other match is untouched.
  if (context && terminallyGoneMatchIds.has(context.matchId)) {
    clearBackgroundMatchProgressContext(context.matchId);
    return false;
  }

  // §3.② hard cap — the cap timer may not fire while JS is suspended, so every surviving flush
  // tick re-checks it with the tick's clock. This also releases a HELD cadence whose context is
  // already gone (the tick still runs while any other tracking work survives).
  enforcePendingNativeFinishCap(nowMs);

  if (!isAppBackground || !context) {
    return false;
  }

  const snapshot = getSnapshotState();

  // §3.③ — a durable pending-finish intent for the ACTIVE context relaxes the running-only gate
  // and the 3s throttle, so EVERY surviving TaskManager tick retries the finish delivery: after
  // the goal is crossed the tracking snapshot can flip away from 'running' (run teardown) and a
  // throttled tick may be the last one iOS ever grants. Regular (non-finish) progress keeps the
  // exact same gates as before — nothing about the non-finish retry path is weakened.
  const pendingFinishIntent = getPendingFinish(context.matchId);

  if (snapshot.status !== 'running' && !pendingFinishIntent) {
    return false;
  }

  if (
    !pendingFinishIntent
    && nowMs - lastBackgroundMatchProgressSyncAtMs < BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS
  ) {
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

  // §3.④ — resolve the NATIVE handoff dependencies BEFORE building the payload, preferring the
  // values pre-resolved at context-arm time. An `await` is exactly where iOS can suspend the JS
  // thread (#203), so once a FINISHED payload is built below there must be NO await left between
  // it and the native handoff. When the arm-time cache has not landed yet (first tick, or tests
  // injecting their own getters) this falls back to awaiting the getters — still before the
  // payload exists, so the invariant holds either way.
  let nativeUploader: NativeMatchProgressUploaderModule | null = null;
  let nativeToken: string | null = null;
  let nativeApiBaseUrl: string | null = null;
  if (platform === 'android' || platform === 'ios') {
    const preResolved = preResolvedNativeHandoffDeps?.matchId === context.matchId
      ? preResolvedNativeHandoffDeps
      : null;
    nativeUploader = preResolved?.uploader ?? await getNativeMatchProgressUploader();
    if (nativeUploader?.isNativeMatchProgressUploaderAvailable()) {
      nativeToken = preResolved?.token ?? await getAccessToken();
      if (nativeToken) {
        nativeApiBaseUrl = apiBaseUrl ?? preResolved?.apiBaseUrl ?? await getApiBaseUrl();
      }
    }
  }

  let input: UpdateRunningMatchProgressInput;

  if (pendingFinishIntent) {
    // §3.③ — the payload IS the frozen finish: the durable intent remembered at the goal carries
    // the measured elapsed/distance/pace, while the tracking snapshot may already be reset by the
    // run teardown (re-deriving from it could emit a bogus post-run 'running' body). The server
    // freezes the finish first-write-wins, so re-sending the same finished body is idempotent.
    const finishProgress = buildSyncedMatchProgressSnapshot({
      matchId: context.matchId,
      distanceKm: pendingFinishIntent.distanceKm,
      elapsedSeconds: pendingFinishIntent.finishElapsedSeconds,
      currentPace: pendingFinishIntent.pace,
      status: 'finished',
    }, nowMs);
    input = {
      matchId: context.matchId,
      distanceKm: finishProgress.distanceKm,
      elapsedSeconds: finishProgress.elapsedSeconds,
      currentPace: finishProgress.currentPace,
      status: 'finished',
    };
  } else {
    input = buildRunningProgressInput(context, snapshot, nowMs);
  }

  const status = input.status;

  // HANDS-FREE FINISH (Stage 2 call site A + Stage 3b record site) — the flush computed a
  // FINISHED payload: fire the one-shot at-crossing celebration notification AND freeze the
  // at-crossing record locally. Placed BEFORE the native/JS branch split so both delivery paths
  // get it, and STRICTLY fire-and-forget/synchronous (no await) so the §3.④ zero-await invariant
  // between the built finished payload and the native handoff below is untouched. The
  // pendingFinishIntent re-send branch above also produces 'finished' on every retry tick; the
  // module-level fired-set + the store's local first-write-wins collapse those to one each. The
  // isAppBackground gate lives inside the presenter — a foreground finish shows the result UI
  // instead. input.elapsedSeconds is wall-clock-anchored (resolveSnapshotElapsedMs), i.e. the
  // crossing-time value even after a JS suspension.
  if (status === 'finished') {
    void presentFinishCelebrationOnce(input.matchId, input.distanceKm, input.elapsedSeconds);
    recordLocalGoalFreezeOnce({
      matchId: input.matchId,
      elapsedSeconds: input.elapsedSeconds,
      distanceKm: input.distanceKm,
      pace: input.currentPace,
      crossedAtIso: new Date(nowMs).toISOString(),
    });
  }

  // NATIVE branch (Android always; iOS ONLY on the new build whose Swift module reports
  // available=true). Fix A.5 — widen from android-only to ALSO take iOS, but gate iOS on the
  // RUNTIME availability check so the OTA stays safe: the current iOS no-op binary reports
  // available=false → it skips this branch and keeps the JS-fallback push below (today's
  // behavior, unchanged); only the new iOS build (real Swift module → available=true) routes
  // here. Android keeps using the real Kotlin native uploader exactly as before.
  if (platform === 'android' || platform === 'ios') {
    // §3.④ — nativeUploader/nativeToken/nativeApiBaseUrl were resolved ABOVE, before the payload
    // was built, so from here to the native handoff there is no await left for iOS to suspend on.
    if (nativeUploader?.isNativeMatchProgressUploaderAvailable()) {
      if (nativeToken && nativeApiBaseUrl) {
        const token = nativeToken;
        const resolvedApiBaseUrl = nativeApiBaseUrl;
        const requestBody = JSON.stringify({
          ...input,
          distanceKm: Number(input.distanceKm.toFixed(2)),
          elapsedSeconds: Math.max(0, Math.round(input.elapsedSeconds)),
        });

        // §3.② — pending-finish bookkeeping for the native cadence, BEFORE the handoff:
        //   - a still-pending finish for a DIFFERENT match no longer owns the cadence (this match
        //     is taking it over right now) — drop that stale record without stopping anything;
        //   - once this flush computes status==='finished', arm the pending finish so the cadence
        //     below keeps re-sending the FINISHED body until the server ACKs (2xx confirming the
        //     frozen finish / final sealed-DNF), the match turns terminal (404/410), or the 10min
        //     hard cap expires — surviving the normal match-end teardown in between.
        if (pendingNativeFinish && pendingNativeFinish.matchId !== input.matchId) {
          settlePendingNativeFinish(false);
        }
        if (input.status === 'finished') {
          armPendingNativeFinish(input.matchId, nowMs);
        }

        // NATIVE PERIODIC UPLOADER (next build only — OTA-safe via the controller's availability
        // gate, which no-ops on every current binary). Hand the EXACT same {url, token, body} this
        // flush is about to POST to the native wall-clock cadence so it re-sends the latest payload
        // every ~3s while the screen is off, GPS+JS-independent. The native side NEVER recomputes —
        // it only re-sends this body. On first flush for the match this starts the cadence + wires
        // the onMatchProgressResponse listener (which applies the opponent board WITHOUT a JS
        // timer); subsequent flushes just refresh the cached payload (no thread/listener churn).
        // §3.② — when the payload above is the FINISHED body this call IS the cadence switch to
        // finished-body re-sends. Fire-and-forget so the periodic wiring never blocks the existing
        // one-shot push below.
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
        rgDiagLog(
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
            // §3.② — a 2xx one-shot response is a finish ACK too (same shapes as the cadence
            // listener), so a pending finish settles here without waiting for the next re-POST.
            notePendingNativeFinishResponseBody(nativeBody);
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

        // §3.④ — refresh the arm-time dep cache (token can rotate mid-match) AFTER the handoff,
        // fire-and-forget, so the next tick again has zero awaits between payload and handoff.
        preResolveNativeHandoffDeps(input.matchId);

        await nativePromise;
        return true;
      }

      rgDiagLog('[RG flush] path=native NO_TOKEN — JS fallback');
    } else {
      rgDiagLog('[RG flush] path=native UNAVAILABLE (module not linked) — JS fallback');
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
      // §3.② — even on the JS-fallback path a 2xx response can ACK a pending finish (e.g. the
      // native cadence armed it earlier and the token then rotated to the JS path).
      notePendingNativeFinishResponseStatus(nextStatus);
      // Fix B1 (defense-in-depth) — drop the response if the context was cleared (forfeit /
      // finish teardown) while this request was in flight, so a late reply can't re-apply onto
      // a torn-down match. The React applier guards forfeit + serverNow on top of this.
      applyBackgroundMatchStatusForRequest(input.matchId, nextStatus);
      // Live Activity side channel — fire-and-forget, after the React apply. Never awaited, so it
      // cannot perturb the awaited sync promise / throttle / inflight guards.
      updateLiveCardFromMatchStatusSafe(nextStatus);
      return nextStatus;
    })
    .catch((error: unknown) => {
      // TERMINAL-STOP (P1-3) — a DEFINITIVE HTTP 404 (unknown match) or 410 { code: 'match_gone' }
      // (pruned/tombstoned match) means this matchId can never be uploaded again: mark it
      // terminally gone and tear the context down (same teardown a normal finish uses) so the
      // ~3s retry loop stops for good. ONLY an ApiError carrying that HTTP status qualifies —
      // network errors / timeouts have no status and MUST keep retrying (screen-off runs depend
      // on it, #203). The error is rethrown so the flush keeps its existing rejection contract
      // (throttle not advanced, caller's fire-and-forget catch swallows).
      if (isDefinitiveMatchGoneError(error)) {
        markMatchTerminallyGone(input.matchId);
      }
      throw error;
    })
    .finally(() => {
      clearInFlightBackgroundMatchProgressSync(syncPromise);
    });
  inFlightBackgroundMatchProgressSync = syncPromise;

  await inFlightBackgroundMatchProgressSync;
  return true;
}
