// Module-level tombstone for match IDs whose run has already finished/forfeited and been
// saved (or otherwise terminated) on this device.
//
// Why this exists: the reservation-room / room-start handoff writes `forceMatchArena=1` +
// `focusMatchId` onto the persistent `/(tabs)/running` tab route, and nothing clears those
// params after the match ends. So when the user returns to the running tab AFTER the match
// is done, the route still says "force the live arena". The in-component
// `shouldSuppressDoneMatchAutoOpen` guard cannot catch this case because it is derived from
// the live duel/group statuses, and the post-run runtime reset clears those statuses to
// null — flipping the guard back off and letting the stale route re-open the live measuring
// shell instead of the clean ready/idle setup view.
//
// This tombstone is set by the post-run runtime reset (resetMatchRuntimeAfterTrackingCleared)
// and is consulted by the route-forced-arena gate. It is keyed to the specific ended matchId,
// so it ONLY suppresses the stale route force for a genuinely-done match and never blocks a
// new match, the reservation handoff pre-mount, or an in-progress race.
//
// C-7 — persisted + 24h: the original 10-minute in-memory Map left two ghost re-entry holes:
// (1) returning to the running tab >10min after the finish re-forced the dead arena, and
// (2) an app kill wiped the Map entirely, so relaunching into the stale route params re-opened
// the dead arena immediately. The Map is now write-through persisted (same lazy-storage idiom
// as localGoalFreezeStore — expo-secure-store at runtime, no-op under the node test runner)
// and hydrated on module init, with the TTL widened to 24h (the stale route params never
// outlive a day of normal use, and a matchId is never reused).

const TERMINATED_ROUTE_FOCUS_TTL_MS = 24 * 60 * 60 * 1000;

const TERMINATED_ROUTE_FOCUS_STORAGE_KEY = 'runningground.terminatedRouteFocusMatch.v1';

type TerminatedRouteFocusStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let storageOverride: TerminatedRouteFocusStorage | null = null;
let cachedStorage: TerminatedRouteFocusStorage | null = null;

function resolveStorage(): TerminatedRouteFocusStorage {
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

// In-memory mirror stays the synchronous source of truth (the route gate reads it inline
// during render); the persisted blob only matters across an app kill/relaunch.
const terminatedRouteFocusMatchIds = new Map<string, number>();
let hydrationPromise: Promise<void> | null = null;

function persist() {
  const value = JSON.stringify(Array.from(terminatedRouteFocusMatchIds.entries()));
  // Fire-and-forget: a transient write failure only weakens the relaunch case, never the
  // live session (the in-memory Map still gates).
  void resolveStorage().setItem(TERMINATED_ROUTE_FOCUS_STORAGE_KEY, value).catch(() => {
    // Ignore persistence failures.
  });
}

function cleanupExpired(nowMs: number) {
  terminatedRouteFocusMatchIds.forEach((expiresAtMs, matchId) => {
    if (expiresAtMs <= nowMs) {
      terminatedRouteFocusMatchIds.delete(matchId);
    }
  });
}

// Cold-start rehydration: pull tombstones that outlived the previous app session so relaunch
// into stale forceMatchArena route params still lands on the ready screen. Safe to call
// repeatedly; hydrates once. In-session marks win over persisted entries.
export function hydrateTerminatedRouteFocusMatches(nowMs = Date.now()): Promise<void> {
  hydrationPromise ??= (async () => {
    try {
      const raw = await resolveStorage().getItem(TERMINATED_ROUTE_FOCUS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }
      for (const entry of parsed) {
        if (!Array.isArray(entry)) {
          continue;
        }
        const [matchId, expiresAtMs] = entry as [unknown, unknown];
        if (
          typeof matchId === 'string'
          && matchId.length > 0
          && typeof expiresAtMs === 'number'
          && Number.isFinite(expiresAtMs)
          && expiresAtMs > nowMs
          && !terminatedRouteFocusMatchIds.has(matchId)
        ) {
          terminatedRouteFocusMatchIds.set(matchId, expiresAtMs);
        }
      }
    } catch {
      // Ignore hydration failures; a missing/corrupt blob just means no carried-over tombstones.
    }
  })();
  return hydrationPromise;
}

// Kick hydration at module init so the tombstones are (best-effort) in memory before the
// first route-gate consult after a relaunch.
void hydrateTerminatedRouteFocusMatches();

export function markRouteFocusMatchTerminated(matchId: string | null | undefined, nowMs = Date.now()) {
  if (!matchId) {
    return;
  }

  cleanupExpired(nowMs);
  terminatedRouteFocusMatchIds.set(matchId, nowMs + TERMINATED_ROUTE_FOCUS_TTL_MS);
  persist();
}

export function isRouteFocusMatchTerminated(matchId: string | null | undefined, nowMs = Date.now()): boolean {
  if (!matchId) {
    return false;
  }

  const expiresAtMs = terminatedRouteFocusMatchIds.get(matchId);
  if (expiresAtMs === undefined) {
    return false;
  }

  if (expiresAtMs <= nowMs) {
    terminatedRouteFocusMatchIds.delete(matchId);
    persist();
    return false;
  }

  return true;
}

export function clearRouteFocusMatchTerminated(matchId?: string | null) {
  if (!matchId) {
    terminatedRouteFocusMatchIds.clear();
    persist();
    return;
  }

  terminatedRouteFocusMatchIds.delete(matchId);
  persist();
}

// Test-only: inject a fake storage backend (null restores the real one).
export function __setTerminatedRouteFocusStorageForTest(storage: TerminatedRouteFocusStorage | null) {
  storageOverride = storage;
}

export function resetTerminatedRouteFocusMatchesForTest() {
  terminatedRouteFocusMatchIds.clear();
  hydrationPromise = null;
  cachedStorage = null;
}
