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

export const BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS = 5_000;

export type BackgroundMatchProgressContext = {
  matchId: string;
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string | null;
};

type BackgroundMatchProgressUploader = (
  input: UpdateRunningMatchProgressInput,
) => Promise<unknown>;

type FlushBackgroundMatchProgressOptions = {
  isAppBackground?: boolean;
  nowMs?: number;
  updateRunningMatchProgress?: BackgroundMatchProgressUploader;
};

let activeMatchProgressContext: BackgroundMatchProgressContext | null = null;
let lastBackgroundMatchProgressSyncAtMs = 0;
let inFlightBackgroundMatchProgressSync: Promise<unknown> | null = null;

async function updateRunningMatchProgressService(input: UpdateRunningMatchProgressInput) {
  const { updateRunningMatchProgress } = await import('@/services');
  return updateRunningMatchProgress(input);
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
}

function resolveBackgroundHeartbeatStatus(
  distanceKm: number,
  targetDistanceKm: number,
): UpdateRunningMatchProgressInput['status'] {
  return distanceKm >= targetDistanceKm - MATCH_GOAL_DISTANCE_TOLERANCE_KM
    ? 'finished'
    : 'background';
}

export async function flushBackgroundMatchProgressSync({
  isAppBackground = getBackgroundSyncDiagnostics().isAppBackground,
  nowMs = Date.now(),
  updateRunningMatchProgress = updateRunningMatchProgressService,
}: FlushBackgroundMatchProgressOptions = {}) {
  const context = activeMatchProgressContext;

  if (!isAppBackground || !context) {
    return false;
  }

  const snapshot = getSnapshotState();

  if (snapshot.status !== 'running') {
    return false;
  }

  if (
    nowMs - lastBackgroundMatchProgressSyncAtMs < BACKGROUND_MATCH_PROGRESS_SYNC_INTERVAL_MS
    || inFlightBackgroundMatchProgressSync
  ) {
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

  lastBackgroundMatchProgressSyncAtMs = nowMs;
  recordBackgroundHeartbeatAttempt();
  inFlightBackgroundMatchProgressSync = updateRunningMatchProgress(input)
    .finally(() => {
      inFlightBackgroundMatchProgressSync = null;
    });

  await inFlightBackgroundMatchProgressSync;
  return true;
}
