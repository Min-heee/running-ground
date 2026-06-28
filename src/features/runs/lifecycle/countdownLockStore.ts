// Shared, module-level store for the cross-phone start countdown. ONE source of truth for:
//   1. the locked absolute SERVER instant per countdownKey (the slot start, in server-clock
//      ms) — every device that crosses the gate against the same slot derives the SAME
//      absolute instant and, ticking it against the LIVE shared offset, flips every digit on
//      the same tick;
//   2. the frozen slotStartMs per matchId, so a later slotStartAt re-stamp (a status echo /
//      re-queue) for an already-observed match can't rotate the countdownKey and re-flash;
//   3. the finished-key tombstone set, so a countdown that reached zero can NEVER re-show
//      (an overlay unmount+remount, or the model briefly re-offering the just-finished
//      match for a frame, must not flash the digit back on).
//
// Hoisting all three here (rather than scattering a lock Map in useMatchCountdownModel and a
// finished Set in useLocalCountdownSeconds) lets the countdown model AND the overlay leaf
// address the exact same lock/finished state by key, which is what makes the lock survive
// the room→runtime and reservation→running-tab handoff remounts.

export type CountdownLock = {
  // The locked countdown target as an absolute instant on the SERVER clock (slotStartMs).
  // The overlay ticks this against getSyncedNowMs() (Date.now()+live shared offset) every
  // frame, so a late offset convergence corrects both phones continuously — there is no
  // baked-in, never-corrected local instant the way the old nowMs+rawRemaining lock had.
  serverTargetMs: number;
};

const COUNTDOWN_LOCK_MAX_ENTRIES = 8;
const countdownLocks = new Map<string, CountdownLock>();

const FROZEN_SLOT_START_MS_LIMIT = 24;
const frozenSlotStartMsByMatchId = new Map<string, number>();

const FINISHED_COUNTDOWN_KEY_LIMIT = 24;
const finishedCountdownKeys = new Set<string>();

function evictOldest<K, V>(map: Map<K, V>, limit: number) {
  while (map.size > limit) {
    const oldestKey = map.keys().next().value as K | undefined;
    if (oldestKey === undefined) {
      break;
    }
    map.delete(oldestKey);
  }
}

export function readCountdownLock(key: string | null | undefined): CountdownLock | null {
  return typeof key === 'string' && key.length > 0 ? countdownLocks.get(key) ?? null : null;
}

export function writeCountdownLock(key: string, lock: CountdownLock) {
  countdownLocks.delete(key);
  countdownLocks.set(key, lock);
  evictOldest(countdownLocks, COUNTDOWN_LOCK_MAX_ENTRIES);
}

export function clearCountdownLock(key: string | null | undefined) {
  if (typeof key === 'string' && key.length > 0) {
    countdownLocks.delete(key);
  }
}

// The locked absolute server instant for a key (the overlay's LOCAL countdown source), or
// null when no lock has been frozen yet (e.g. while clockReady is still false).
export function readLockedCountdownServerTargetMs(key: string | null | undefined): number | null {
  return readCountdownLock(key)?.serverTargetMs ?? null;
}

// Freeze the first slotStartMs observed for a matchId. Later re-stamps for the same match
// return the originally frozen value, so the countdownKey (`${matchId}:${slotStartAt}`)
// never rotates mid-countdown from a server echo that nudged the slot.
export function freezeSlotStartMsForMatch(matchId: string | null | undefined, slotStartMs: number) {
  if (typeof matchId !== 'string' || matchId.length === 0 || !Number.isFinite(slotStartMs)) {
    return slotStartMs;
  }

  const existing = frozenSlotStartMsByMatchId.get(matchId);
  if (existing !== undefined) {
    return existing;
  }

  frozenSlotStartMsByMatchId.set(matchId, slotStartMs);
  evictOldest(frozenSlotStartMsByMatchId, FROZEN_SLOT_START_MS_LIMIT);
  return slotStartMs;
}

export function readFrozenSlotStartMsForMatch(matchId: string | null | undefined): number | null {
  if (typeof matchId !== 'string' || matchId.length === 0) {
    return null;
  }
  return frozenSlotStartMsByMatchId.get(matchId) ?? null;
}

export function markCountdownKeyFinished(countdownKey: string | null | undefined) {
  if (typeof countdownKey !== 'string' || countdownKey.length === 0) {
    return;
  }

  finishedCountdownKeys.add(countdownKey);
  while (finishedCountdownKeys.size > FINISHED_COUNTDOWN_KEY_LIMIT) {
    const oldest = finishedCountdownKeys.values().next().value as string | undefined;
    if (oldest === undefined) {
      break;
    }
    finishedCountdownKeys.delete(oldest);
  }
}

export function isCountdownKeyFinished(countdownKey: string | null | undefined) {
  return typeof countdownKey === 'string' && finishedCountdownKeys.has(countdownKey);
}

export function resetCountdownLockStoreForTest() {
  countdownLocks.clear();
  frozenSlotStartMsByMatchId.clear();
  finishedCountdownKeys.clear();
}
