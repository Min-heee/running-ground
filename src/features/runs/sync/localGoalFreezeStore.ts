// HANDS-FREE FINISH (Stage 3a) — the LOCAL mirror of the server's first-write-wins finish seal.
// The FIRST place any code computes 'finished' for a match records the at-crossing
// {elapsed, distance, pace, crossedAt} here EXACTLY ONCE; every downstream consumer (the save
// clamp, route truncation, deliverFinalMatchStatus, the save-time finish push, kill-restore
// staleness) reads this record instead of re-deriving the finish from live/drifted state — the
// slot-anchored elapsed keeps ticking after the crossing, which is the 26:46→+minutes drift bug.
//
// Deliberately NOT pendingFinishStore: that intent is cleared on server ACK, which on Android
// lands seconds BEFORE the local save runs. The freeze must survive until save-success (cleared
// in runCleanupAfterSave) or a resetBackgroundRunTracking-driven discard — never on server ACK.
//
// ANTI-CORRUPTION INVARIANT (consumed via goalFreezeClamp): every clamp is Math.min / strictly
// downward; a freeze can NEVER inflate a value, and it applies only to the exact matchId it was
// recorded for.

import type { PendingFinishIntent } from '@/features/runs/sync/pendingFinishStore';

const LOCAL_GOAL_FREEZE_STORAGE_KEY = 'runningground.localGoalFreeze.v1';

export type LocalGoalFreeze = {
  matchId: string;
  // The MEASURED elapsed at the goal crossing (whole seconds, wall-clock anchored) — never a 0
  // placeholder.
  elapsedSeconds: number;
  // The measured-at-crossing distance (≈goal), matching what the server froze — never the raw
  // goal constant.
  distanceKm: number;
  pace: string;
  // ISO timestamp of the tick that computed the crossing; the save flow truncates the route here.
  crossedAtIso: string;
};

// Minimal persistence surface (same idiom as pendingFinishStore): lazy-load expo-secure-store at
// runtime so importing this module in a plain node test runner does not pull a native module, and
// fall back to a no-op when it is unavailable. The in-memory map below is the live source of
// truth either way.
type LocalGoalFreezeStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let storageOverride: LocalGoalFreezeStorage | null = null;
let cachedStorage: LocalGoalFreezeStorage | null = null;

function resolveStorage(): LocalGoalFreezeStorage {
  if (storageOverride) {
    return storageOverride;
  }
  if (cachedStorage) {
    return cachedStorage;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as {
      getItemAsync: (key: string) => Promise<string | null>;
      setItemAsync: (key: string, value: string) => Promise<void>;
    };
    cachedStorage = {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
    };
  } catch {
    cachedStorage = {
      getItem: async () => null,
      setItem: async () => {},
    };
  }
  return cachedStorage;
}

// In-memory mirror so every consumer (flush tick, save clamp, restore staleness check) can read
// synchronously. The persistent backing store only matters for a cold restart.
const localGoalFreezes = new Map<string, LocalGoalFreeze>();
// Hydration memoized as a PROMISE (not a boolean) so a second caller awaiting mid-hydration —
// e.g. the restore path racing the fire-and-forget kick — resolves only after the storage read
// actually finished, never with a still-empty map (adversarial-review Finding A).
let hydrationPromise: Promise<LocalGoalFreeze[]> | null = null;

function persist() {
  const value = JSON.stringify(Array.from(localGoalFreezes.values()));
  // Fire-and-forget: the in-memory map drives the live session; the persisted blob only matters
  // for a cold restart, so a transient write failure is acceptable.
  void resolveStorage().setItem(LOCAL_GOAL_FREEZE_STORAGE_KEY, value).catch(() => {
    // Ignore persistence failures; the in-memory freeze still drives the live session.
  });
}

function isValidFreeze(value: unknown): value is LocalGoalFreeze {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const freeze = value as Record<string, unknown>;
  return typeof freeze.matchId === 'string'
    && freeze.matchId.length > 0
    && typeof freeze.elapsedSeconds === 'number'
    && Number.isFinite(freeze.elapsedSeconds)
    && freeze.elapsedSeconds > 0
    && typeof freeze.distanceKm === 'number'
    && Number.isFinite(freeze.distanceKm)
    && freeze.distanceKm > 0
    && typeof freeze.pace === 'string'
    && typeof freeze.crossedAtIso === 'string';
}

// LOCAL first-write-wins: record the at-crossing freeze for a match EXACTLY ONCE — a later call
// for the same matchId is a no-op, so retry ticks / the last-resort delivery site can never
// overwrite the first (crossing-time) values with drifted ones. Invalid freezes (0/NaN elapsed,
// non-positive distance) are rejected outright — a freeze that could corrupt a save is worse
// than no freeze (the clamp simply stays inactive).
export function recordLocalGoalFreezeOnce(freeze: LocalGoalFreeze) {
  if (!isValidFreeze(freeze)) {
    return;
  }
  if (localGoalFreezes.has(freeze.matchId)) {
    return;
  }
  localGoalFreezes.set(freeze.matchId, freeze);
  persist();
}

export function getLocalGoalFreeze(matchId: string): LocalGoalFreeze | null {
  return localGoalFreezes.get(matchId) ?? null;
}

// Cleared ONLY on save success (runCleanupAfterSave) and on a resetBackgroundRunTracking-driven
// discard — never on server ACK (the freeze must outlive the pending-finish intent).
export function clearLocalGoalFreeze(matchId: string) {
  if (localGoalFreezes.delete(matchId)) {
    persist();
  }
}

export function listLocalGoalFreezes(): LocalGoalFreeze[] {
  return Array.from(localGoalFreezes.values());
}

// Cold-start rehydration: pull any freezes that outlived a previous app session so the save
// clamp / restore staleness / final delivery see them. Safe to call repeatedly; hydrates once.
export function hydrateLocalGoalFreezes(): Promise<LocalGoalFreeze[]> {
  hydrationPromise ??= (async () => {
    try {
      const raw = await resolveStorage().getItem(LOCAL_GOAL_FREEZE_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            // First-write-wins holds across hydration too: a freeze recorded THIS session (before
            // hydration finished) beats the persisted one.
            if (isValidFreeze(entry) && !localGoalFreezes.has(entry.matchId)) {
              localGoalFreezes.set(entry.matchId, entry);
            }
          }
        }
      }
    } catch {
      // Ignore hydration failures; a missing/corrupt blob just means no carried-over freezes.
    }
    return listLocalGoalFreezes();
  })();
  return hydrationPromise;
}

// Pure helper (Stage 3c) — build the durable pending-finish intent PREFERRING the at-crossing
// freeze over live progress. The live `progress` a match-end delivery reads may have drifted
// past the crossing (slot-anchored elapsed keeps ticking) — if that drifted value were pushed,
// the server would freeze it first-write-wins as the official finish. When a freeze exists for
// this exact matchId its values ARE the crossing-time record, so they win outright; without one
// (e.g. legacy runs mid-OTA) the live progress is the only data available — exactly today's
// behavior. Server-side first-write-wins keeps re-sends idempotent either way.
export function buildPendingFinishIntentFromFreeze(
  freeze: LocalGoalFreeze | null | undefined,
  liveProgress: {
    matchId: string;
    elapsedSeconds: number;
    distanceKm: number;
    pace: string;
  },
): PendingFinishIntent {
  if (freeze && freeze.matchId === liveProgress.matchId && isValidFreeze(freeze)) {
    return {
      matchId: liveProgress.matchId,
      finishElapsedSeconds: freeze.elapsedSeconds,
      distanceKm: freeze.distanceKm,
      pace: freeze.pace,
    };
  }
  return {
    matchId: liveProgress.matchId,
    finishElapsedSeconds: liveProgress.elapsedSeconds,
    distanceKm: liveProgress.distanceKm,
    pace: liveProgress.pace,
  };
}

// Test-only: inject a fake storage backend and/or reset module-level state.
export function __setLocalGoalFreezeStorageForTest(storage: LocalGoalFreezeStorage | null) {
  storageOverride = storage;
}

export function __resetLocalGoalFreezesForTest() {
  localGoalFreezes.clear();
  hydrationPromise = null;
  cachedStorage = null;
}
