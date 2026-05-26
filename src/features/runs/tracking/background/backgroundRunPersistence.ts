import * as FileSystem from 'expo-file-system/legacy';
import type { RunRoutePoint } from '@/domain';
import {
  getAccumulatedDistanceMeters,
  getAccumulatedElevationGainMeters,
  setAccumulatedDistanceMeters,
  setAccumulatedElevationGainMeters,
} from '@/features/runs/tracking/background/routeAccumulator';
import {
  emitSnapshot,
  getSnapshotState,
  setSnapshotState,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background/snapshotStore';

const STORAGE_DIR_NAME = 'rg-bg-tracking';
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

type PersistedSnapshot = {
  accumulatedDistanceMeters: number;
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

    if (Date.now() - data.savedAt > STALE_THRESHOLD_MS) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      return false;
    }

    const current = getSnapshotState();
    setAccumulatedDistanceMeters(data.accumulatedDistanceMeters);
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
