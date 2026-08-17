import * as FileSystem from 'expo-file-system/legacy';
import type { RunRoutePoint } from '@/domain';
import {
  getAccumulatedDistanceMeters,
  getAccumulatedElevationGainMeters,
  getExternalCreditMeters,
  setAccumulatedDistanceMeters,
  setExternalCreditMeters,
  setAccumulatedElevationGainMeters,
} from '@/features/runs/tracking/background/routeAccumulator';
import {
  getLocalGoalFreeze,
  hydrateLocalGoalFreezes,
} from '@/features/runs/sync/localGoalFreezeStore';
import {
  emitSnapshot,
  getSnapshotState,
  setSnapshotState,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background/snapshotStore';

const STORAGE_DIR_NAME = 'rg-bg-tracking';
const STALE_THRESHOLD_MS = 30 * 60 * 1000;
// HANDS-FREE FINISH (Stage 4a) — when a local goal freeze exists for the match, the persisted
// snapshot is a REAL finished run (the goal was crossed), not an abandoned one: deleting it at
// the 30min mark would destroy the only local copy of the route/record before the user reopens
// the app. Keep it restorable for a day instead.
const GOAL_FROZEN_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

type PersistedSnapshot = {
  accumulatedDistanceMeters: number;
  // 화면꺼짐 갭 크레딧 몫 — 총거리에 이미 포함돼 있지만 따로도 든다. 복원 후의 경로 기반
  // 재계산(냉시동 이탈·지터 붕괴)은 경로에 점이 없는 크레딧 구간을 모르므로, 이 몫을 도로
  // 알려주지 않으면 복원된 크레딧이 다음 커브에서 지워진다. 예전 파일엔 없던 필드 — 0으로 읽는다.
  externalCreditMeters?: number;
  accumulatedElevationGainMeters: number;
  matchId: string;
  savedAt: number;
  snapshot: Pick<
    BackgroundRunTrackingSnapshot,
    | 'accumulatedPausedMs'
    | 'currentPace'
    | 'distanceKm'
    | 'elevationGainM'
    | 'pausedAt'
    | 'route'
    | 'startedAt'
  >;
  version: 1;
};

function getStorageDirectory() {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  return `${FileSystem.documentDirectory}${STORAGE_DIR_NAME}/`;
}

function getStorageUri(matchId: string) {
  const directory = getStorageDirectory();
  if (!directory) {
    return null;
  }

  return `${directory}${encodeURIComponent(matchId)}.json`;
}

async function ensureStorageDirectory() {
  const directory = getStorageDirectory();
  if (!directory) {
    return null;
  }

  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }

  return directory;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function isRunRoutePoint(value: unknown): value is RunRoutePoint {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RunRoutePoint>;
  return typeof candidate.latitude === 'number'
    && typeof candidate.longitude === 'number'
    && typeof candidate.timestamp === 'string';
}

function normalizeRoute(value: unknown): RunRoutePoint[] {
  return Array.isArray(value) ? value.filter(isRunRoutePoint) : [];
}

function parsePersistedSnapshot(raw: string, matchId: string): PersistedSnapshot | null {
  const parsed = JSON.parse(raw) as Partial<PersistedSnapshot>;

  if (!parsed || parsed.matchId !== matchId || parsed.version !== 1) {
    return null;
  }

  const snapshot = parsed.snapshot;
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  return {
    accumulatedDistanceMeters: asNumber(parsed.accumulatedDistanceMeters),
    externalCreditMeters: asNumber(parsed.externalCreditMeters),
    accumulatedElevationGainMeters: asNumber(parsed.accumulatedElevationGainMeters),
    matchId,
    savedAt: asNumber(parsed.savedAt),
    snapshot: {
      accumulatedPausedMs: asNumber(snapshot.accumulatedPausedMs),
      currentPace: typeof snapshot.currentPace === 'string' ? snapshot.currentPace : '--:--/km',
      distanceKm: asNumber(snapshot.distanceKm),
      elevationGainM: Math.round(asNumber(snapshot.elevationGainM)),
      pausedAt: asNullableString(snapshot.pausedAt),
      route: normalizeRoute(snapshot.route),
      startedAt: asNullableString(snapshot.startedAt),
    },
    version: 1,
  };
}

export async function persistBackgroundRunSnapshot(matchId: string | null): Promise<void> {
  if (!matchId) {
    return;
  }

  const snapshot = getSnapshotState();
  if (snapshot.status !== 'running') {
    return;
  }

  try {
    await ensureStorageDirectory();
    const uri = getStorageUri(matchId);
    if (!uri) {
      return;
    }

    const payload: PersistedSnapshot = {
      accumulatedDistanceMeters: getAccumulatedDistanceMeters(),
      externalCreditMeters: getExternalCreditMeters(),
      accumulatedElevationGainMeters: getAccumulatedElevationGainMeters(),
      matchId,
      savedAt: Date.now(),
      snapshot: {
        accumulatedPausedMs: snapshot.accumulatedPausedMs,
        currentPace: snapshot.currentPace,
        distanceKm: snapshot.distanceKm,
        elevationGainM: snapshot.elevationGainM,
        pausedAt: snapshot.pausedAt,
        route: snapshot.route,
        startedAt: snapshot.startedAt,
      },
      version: 1,
    };
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload));
  } catch {
    // Persistence is a best-effort safety net for process death.
  }
}

export async function restoreBackgroundRunSnapshot(matchId: string): Promise<boolean> {
  try {
    // HANDS-FREE FINISH (Stage 4a) — make sure cold-start hydration has landed before consulting
    // the freeze for the staleness decision below (idempotent; resolves instantly once hydrated).
    await hydrateLocalGoalFreezes();

    const uri = getStorageUri(matchId);
    if (!uri) {
      return false;
    }

    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return false;
    }

    const data = parsePersistedSnapshot(await FileSystem.readAsStringAsync(uri), matchId);
    if (!data) {
      return false;
    }

    // HANDS-FREE FINISH (Stage 4a) — freeze-aware staleness: a snapshot whose match already
    // crossed the goal holds a real finished run, so it stays restorable for 24h instead of 30min.
    const staleThresholdMs = getLocalGoalFreeze(matchId)
      ? GOAL_FROZEN_STALE_THRESHOLD_MS
      : STALE_THRESHOLD_MS;
    if (Date.now() - data.savedAt > staleThresholdMs) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      return false;
    }

    const current = getSnapshotState();
    setAccumulatedDistanceMeters(data.accumulatedDistanceMeters);
    setExternalCreditMeters(data.externalCreditMeters ?? 0);
    setAccumulatedElevationGainMeters(data.accumulatedElevationGainMeters);
    setSnapshotState({
      ...current,
      ...data.snapshot,
      pausedAt: null,
      route: data.snapshot.route,
      startedAt: data.snapshot.startedAt ?? current.startedAt,
      status: 'running',
    });
    emitSnapshot();
    return true;
  } catch {
    return false;
  }
}

export async function clearBackgroundRunSnapshot(matchId: string | null): Promise<void> {
  if (!matchId) {
    return;
  }

  try {
    const uri = getStorageUri(matchId);
    if (uri) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Ignore cleanup failures; stale snapshots expire on restore.
  }
}
