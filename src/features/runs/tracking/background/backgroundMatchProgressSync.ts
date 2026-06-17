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

// 3s (was 5s): tighten how stale a backgrounded runner's progress is on the server so the
// opponent's live distance lags less. Aligned with ANDROID_BACKGROUND_MATCH_PROGRESS_TIMER_MS (3s).
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

function resolveBackgroundHeartbeatStatus(
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
    if (!isBackgroundMatchProgressInFlightStale(inFlightBackgroundMatchProgressSyncStartedAtMs, nowMs)) {
      return false;
    }

    inFlightBackgroundMatchProgressAbort?.abort();
    inFlightBackgroundMatchProgressSync = null;
    inFlightBackgroundMatchProgressSyncStartedAtMs = 0;
    inFlightBackgroundMatchProgressAbort = null;
  }

  if (nowMs - lastBackgroundMatchProgressSyncAtMs < BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS) {
    return false;
  }

  const elapsedSeconds = Math.floor(resolveSnapshotElapsedMs(snapshot, nowMs) / 1000);
  const status = resolveBackgroundHeartbeatStatus(snapshot.distanceKm, context.distanceKm);
  const progress = buildSyncedMatchProgressSnapshot({
    matchId: context.matchId,
    distanceKm: snapshot.distanceKm,
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

  // iOS NOTE: iOS deliberately never reaches this native-uploader branch (platform is never
  // 'android' there) and so always takes the JS-fallback push below. The iOS Swift uploader
  // stays a no-op on purpose — the JS path is what applies the opponent-bearing response on iOS.
  if (platform === 'android') {
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

        lastBackgroundMatchProgressSyncAtMs = nowMs;
        recordBackgroundHeartbeatAttempt();
        globalThis.console.log(
          `[RG flush] path=native fired matchId=${context.matchId} dist=${input.distanceKm.toFixed(3)} status=${status}`,
        );
        // NATIVE (Android, next build): the native uploader resolves with the response body it
        // already reads. Await + apply it so the opponent's live state unfreezes while the
        // screen is off. Best-effort: a network/parse failure must not throw out of the flush.
        try {
          const nativeBody = await nativeUploader.uploadMatchProgressNative(
            `${resolvedApiBaseUrl}/running/matches/progress`,
            token,
            requestBody,
          );
          applyNativeMatchStatusBody(input.matchId, nativeBody);
        } catch {
          // Best-effort background upload; the next location tick retries with fresher data.
        }
        return true;
      }

      globalThis.console.log('[RG flush] path=native NO_TOKEN — JS fallback');
    } else {
      globalThis.console.log('[RG flush] path=native UNAVAILABLE (module not linked) — JS fallback');
    }
  }

  lastBackgroundMatchProgressSyncAtMs = nowMs;
  recordBackgroundHeartbeatAttempt();
  const abortController = new AbortController();
  inFlightBackgroundMatchProgressAbort = abortController;
  inFlightBackgroundMatchProgressSyncStartedAtMs = nowMs;
  // Fix A.2 — capture the resolved status and apply it. This is the channel iOS uses in
  // background (its native uploader is a no-op), so applying the response here is what
  // unfreezes the opponent on iOS. Fix B — pass an explicit timeout SHORTER than the stale
  // window so a hung request self-aborts and frees the single-flight slot.
  const syncPromise = updateRunningMatchProgress(input, {
    signal: abortController.signal,
    timeoutMs: BACKGROUND_MATCH_PROGRESS_PUSH_TIMEOUT_MS,
  })
    .then((nextStatus) => {
      // Fix B1 (defense-in-depth) — drop the response if the context was cleared (forfeit /
      // finish teardown) while this request was in flight, so a late reply can't re-apply onto
      // a torn-down match. The React applier guards forfeit + serverNow on top of this.
      applyBackgroundMatchStatusForRequest(input.matchId, nextStatus);
      return nextStatus;
    })
    .finally(() => {
      if (inFlightBackgroundMatchProgressSync === syncPromise) {
        inFlightBackgroundMatchProgressSync = null;
        inFlightBackgroundMatchProgressSyncStartedAtMs = 0;
        inFlightBackgroundMatchProgressAbort = null;
      }
    });
  inFlightBackgroundMatchProgressSync = syncPromise;

  await inFlightBackgroundMatchProgressSync;
  return true;
}
