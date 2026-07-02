import { VANISHED_MATCH_TOMBSTONE_TTL_MS } from '../config.mjs';

// In-memory tombstones for match sessions that were pruned/removed from the store.
// A stranded device that keeps polling a vanished matchId gets a terminal 410
// ({ code: 'match_gone' }) instead of an ambiguous 404 it retries forever. The map
// is process-local by design: a restart loses it and lookups fall back to 404,
// which is an accepted trade-off (the TTL bounds how long the 410 window matters).
const MAX_TOMBSTONE_ENTRIES = 10_000;

// matchId → expiresAt (epoch ms). Map iteration order is insertion order, so the
// first key is always the oldest entry when we need to evict at the size cap.
const tombstones = new Map();

function pruneExpiredTombstones(nowMs) {
  for (const [matchId, expiresAt] of tombstones) {
    if (expiresAt <= nowMs) {
      tombstones.delete(matchId);
    }
  }
}

export function recordVanishedMatch(matchId, now = new Date()) {
  if (typeof matchId !== 'string' || !matchId) {
    return;
  }

  const nowMs = now.getTime();
  pruneExpiredTombstones(nowMs);

  // Re-recording refreshes the TTL; delete first so the entry moves to the back of
  // the insertion order and the oldest-entry eviction below stays correct.
  tombstones.delete(matchId);

  if (tombstones.size >= MAX_TOMBSTONE_ENTRIES) {
    const oldestMatchId = tombstones.keys().next().value;
    tombstones.delete(oldestMatchId);
  }

  tombstones.set(matchId, nowMs + VANISHED_MATCH_TOMBSTONE_TTL_MS);
}

export function isMatchTombstoned(matchId, now = new Date()) {
  if (typeof matchId !== 'string' || !matchId) {
    return false;
  }

  const expiresAt = tombstones.get(matchId);

  if (expiresAt === undefined) {
    return false;
  }

  if (expiresAt <= now.getTime()) {
    tombstones.delete(matchId);
    return false;
  }

  return true;
}

// Test hook — the map is module-global, so tests reset it between cases.
export function clearVanishedMatchTombstones() {
  tombstones.clear();
}

// Test/observability hook.
export function countVanishedMatchTombstones() {
  return tombstones.size;
}
