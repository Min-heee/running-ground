import type {
  UpdateRunningMatchProgressInput,
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
export const BACKGROUND_MATCH_PROGRESS_INFLIGHT_STALE_MS = 12_000;

export type BackgroundMatchProgressContext = {
  matchId: string;
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string | null;
};

type BackgroundMatchProgressUploader = (
  input: UpdateRunningMatchProgressInput,
  options?: { signal?: AbortSignal },
) => Promise<unknown>;

type NativeBackgroundMatchProgressUploader = (url: string, authToken: string, jsonBody: string) => void;
type NativeMatchProgressUploaderModule = {
  isNativeMatchProgressUploaderAvailable(): boolean;
  uploadMatchProgressNative: NativeBackgroundMatchProgressUploader;
};
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
  options?: { signal?: AbortSignal },
) {
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
        nativeUploader.uploadMatchProgressNative(`${resolvedApiBaseUrl}/running/matches/progress`, token, requestBody);
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
  const syncPromise = updateRunningMatchProgress(input, { signal: abortController.signal })
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
