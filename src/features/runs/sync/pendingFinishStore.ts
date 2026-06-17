// A pending-finish intent is the durable record that "this runner crossed the goal" and
// the server has NOT yet acknowledged it. The single terminal 'finished' push can be lost
// (flaky network at match end, app backgrounded mid-flight), which freezes the OPPONENT's
// board on this runner forever. C1 makes that delivery durable + idempotent: we persist the
// intent and re-send on every foreground/poll tick until the server ACKs the finish. The
// server freezes the finish first-write-wins, so re-sends are always safe.

const PENDING_FINISH_STORAGE_KEY = 'runningground.pendingFinish.v1';

export type PendingFinishIntent = {
  matchId: string;
  // The MEASURED elapsed at the goal (whole seconds). This is the value the server freezes
  // as the official finish — must never be a 0 placeholder.
  finishElapsedSeconds: number;
  distanceKm: number;
  pace: string;
};

// Minimal persistence surface. We lazy-load expo-secure-store at runtime (so importing this
// module in a plain node test runner does not pull a native module) and fall back to a no-op
// when it is unavailable. The in-memory map below is the live source of truth either way.
type PendingFinishStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let storageOverride: PendingFinishStorage | null = null;
let cachedStorage: PendingFinishStorage | null = null;

function resolveStorage(): PendingFinishStorage {
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

// In-memory mirror so the resend loop can read/iterate synchronously every tick without
// awaiting storage. The persistent backing store only matters for a cold restart.
const pendingFinishes = new Map<string, PendingFinishIntent>();
let hydrated = false;

function persist() {
  const value = JSON.stringify(Array.from(pendingFinishes.values()));
  // Fire-and-forget: the in-memory map drives the live session; the persisted blob only
  // matters for a cold restart, so a transient write failure is acceptable.
  void resolveStorage().setItem(PENDING_FINISH_STORAGE_KEY, value).catch(() => {
    // Ignore persistence failures; the in-memory intent still drives the live resend loop.
  });
}

function isValidIntent(value: unknown): value is PendingFinishIntent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const intent = value as Record<string, unknown>;
  return typeof intent.matchId === 'string'
    && intent.matchId.length > 0
    && typeof intent.finishElapsedSeconds === 'number'
    && Number.isFinite(intent.finishElapsedSeconds)
    && intent.finishElapsedSeconds > 0
    && typeof intent.distanceKm === 'number'
    && Number.isFinite(intent.distanceKm)
    && typeof intent.pace === 'string';
}

// Record (or overwrite) the pending-finish intent for a match. First-write-wins is enforced
// server-side, so re-recording with the same matchId is safe. We never store a 0 elapsed — a
// 0 here would re-push a 00:00 finish, the exact bug C1 guards against.
export function rememberPendingFinish(intent: PendingFinishIntent) {
  if (!isValidIntent(intent)) {
    return;
  }
  pendingFinishes.set(intent.matchId, intent);
  persist();
}

// Clear the intent once the server has ACKed the finish (or the match is otherwise dead).
export function clearPendingFinish(matchId: string) {
  if (pendingFinishes.delete(matchId)) {
    persist();
  }
}

export function getPendingFinish(matchId: string): PendingFinishIntent | null {
  return pendingFinishes.get(matchId) ?? null;
}

export function listPendingFinishes(): PendingFinishIntent[] {
  return Array.from(pendingFinishes.values());
}

export function hasPendingFinish(matchId: string): boolean {
  return pendingFinishes.has(matchId);
}

// Cold-start rehydration: pull any intents that outlived a previous app session so the
// resend loop can finish delivering them. Safe to call repeatedly; only hydrates once.
export async function hydratePendingFinishes(): Promise<PendingFinishIntent[]> {
  if (hydrated) {
    return listPendingFinishes();
  }
  hydrated = true;
  try {
    const raw = await resolveStorage().getItem(PENDING_FINISH_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (isValidIntent(entry)) {
            pendingFinishes.set(entry.matchId, entry);
          }
        }
      }
    }
  } catch {
    // Ignore hydration failures; a missing/corrupt blob just means no carried-over intents.
  }
  return listPendingFinishes();
}

// Test-only: inject a fake storage backend and/or reset module-level state.
export function __setPendingFinishStorageForTest(storage: PendingFinishStorage | null) {
  storageOverride = storage;
}

export function __resetPendingFinishesForTest() {
  pendingFinishes.clear();
  hydrated = false;
  cachedStorage = null;
}
