import { useCallback, useEffect, useRef, useState } from 'react';

import { MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS } from '@/lib/matchCountdown';
import { getSharedServerClockOffsetMs } from '@/features/runs/sync/serverClockSync';
import {
  isCountdownKeyFinished,
  markCountdownKeyFinished,
} from '@/features/runs/lifecycle/countdownLockStore';

// Re-export the finished-key tombstone helpers from the shared store so existing importers
// (and the overlay leaf) keep one address for them.
export { isCountdownKeyFinished, markCountdownKeyFinished };

function clampCountdownSeconds(seconds: number, maxSeconds: number) {
  return Math.max(1, Math.min(maxSeconds, seconds));
}

export function resolveLocalCountdownSeconds({
  maxSeconds = MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  nowMs,
  targetMs,
}: {
  maxSeconds?: number;
  // The locked target is an absolute instant on the SERVER clock (slotStartMs). `nowMs`
  // must therefore be the SERVER-synced now (Date.now() + live shared offset), not raw
  // Date.now() — that is what makes a late offset convergence correct BOTH phones every
  // frame instead of the digit being pinned to a baked-in, never-corrected local instant.
  nowMs: number;
  targetMs: number;
}) {
  const remainingMs = targetMs - nowMs;
  if (remainingMs <= 0) {
    return null;
  }

  return clampCountdownSeconds(Math.ceil(remainingMs / 1000), maxSeconds);
}

// A countdown must only ever count DOWN. Given the floor shown so far and the next
// candidate, never allow the digit to climb back up — so a late host-lock release
// that briefly falls back to the laggier global-ticker prop can't flash a higher
// number (e.g. ...2, 1, 2, 1 on Android).
export function resolveMonotonicCountdownFloor(floor: number | null, candidate: number) {
  return floor === null ? candidate : Math.min(floor, candidate);
}

// Per-mount state for one overlay leaf: the monotonic floor + whether this mount's countdown
// has reached its terminal zero, scoped to the countdownKey that state belongs to.
export type LocalCountdownMountState = {
  key: string | null | undefined;
  floor: number | null;
  ended: boolean;
};

export function createLocalCountdownMountState(key: string | null | undefined): LocalCountdownMountState {
  return { key, floor: null, ended: false };
}

// Pure transition for the overlay leaf, scoped to countdownKey. Two desync-fix invariants:
//   1. KEY ROTATION within one persisted mount (room→runtime / reservation→running-tab handoff
//      re-uses the same mount but rotates the key) RESETS ended/floor so the new countdown is
//      born fresh — the old key's terminal state must never leak into a different match.
//   2. TOMBSTONE-ON-FINISH only when this mount actually counted down (floor was a positive
//      value). A mount that reaches candidate=null without ever showing a positive digit never
//      counted down, so it must NOT tombstone the key (which would permanently suppress a
//      countdown that should still appear — e.g. a key that briefly read <=0 on a stale clock).
export function advanceLocalCountdownMountState(
  state: LocalCountdownMountState,
  next: { key: string | null | undefined; candidate: number | null },
): {
  state: LocalCountdownMountState;
  displayedSeconds: number | null;
  // The key to tombstone as finished (only when this mount genuinely counted a positive digit
  // down to zero), or null when nothing should be tombstoned this step.
  tombstoneKey: string | null | undefined;
} {
  // Reset the per-mount terminal/floor state when the key rotates, BEFORE applying the candidate.
  let working: LocalCountdownMountState = state.key !== next.key
    ? { key: next.key, floor: null, ended: false }
    : state;

  if (working.ended) {
    // Terminal for this key+mount: a late prop can't re-show it. Hold null, tombstone nothing.
    return { state: working, displayedSeconds: null, tombstoneKey: null };
  }

  if (next.candidate === null) {
    const countedDown = typeof working.floor === 'number' && working.floor > 0;
    working = { ...working, ended: true };
    return {
      state: working,
      displayedSeconds: null,
      tombstoneKey: countedDown ? next.key : null,
    };
  }

  const nextFloor = resolveMonotonicCountdownFloor(working.floor, next.candidate);
  working = { ...working, floor: nextFloor };
  return { state: working, displayedSeconds: nextFloor, tombstoneKey: null };
}

// The finished-key tombstone now lives in the shared countdownLockStore (re-exported at the
// top of this file). It survives an overlay UNMOUNT+REMOUNT (which a component-local ref
// cannot): at the countdown->active boundary the model briefly drops `roomCountdownEntry` to
// null and the `?? fallback` re-offers the SAME just-finished match for a frame, which would
// otherwise flash the digit back on (…1, gone, 1, gone). Once a key is finished it never
// shows again.

function readSyncedNowMs() {
  // The lock's target is now the ABSOLUTE SERVER instant (slotStartMs), so we must evaluate
  // it against the SERVER-synced now: Date.now() + the LIVE shared offset, read fresh every
  // frame. This is what makes a late offset convergence correct BOTH phones continuously —
  // there's no baked-in local instant frozen at lock time that would stay skewed.
  return Date.now() + getSharedServerClockOffsetMs();
}

export function useLocalCountdownSeconds({
  countdownKey,
  secondsRemaining,
  targetMs,
}: {
  countdownKey?: string | null;
  secondsRemaining: number;
  targetMs?: number | null;
}) {
  const [displayedSeconds, setDisplayedSeconds] = useState<number | null>(secondsRemaining);

  // The whole per-mount countdown state (monotonic floor + terminal flag + the key it belongs
  // to), driven through the pure advanceLocalCountdownMountState reducer. The reducer:
  //   • RESETS floor/ended when the key rotates within one persisted mount (room→runtime /
  //     reservation→running-tab handoff re-uses the mount but rotates the key) — so a fresh
  //     slot is never born already-finished or floored to the old value;
  //   • tombstones the key ONLY when this mount actually counted a positive digit down to 0.
  const mountStateRef = useRef<LocalCountdownMountState>(createLocalCountdownMountState(countdownKey));

  const commit = useCallback((candidate: number | null) => {
    const result = advanceLocalCountdownMountState(mountStateRef.current, {
      key: countdownKey,
      candidate,
    });
    mountStateRef.current = result.state;
    if (result.tombstoneKey !== null) {
      markCountdownKeyFinished(result.tombstoneKey);
    }
    setDisplayedSeconds(result.displayedSeconds);
  }, [countdownKey]);

  // Fallback path: no locked target (non-host / direct / solo, or a host lock released
  // at the very end) → follow the seconds prop, still clamped monotonically down.
  useEffect(() => {
    if (typeof targetMs === 'number' || isCountdownKeyFinished(countdownKey)) {
      return;
    }

    commit(secondsRemaining);
  }, [commit, countdownKey, secondsRemaining, targetMs]);

  // Local path: re-check the locked target every animation frame and re-render only
  // when the whole-second value changes — uniform cadence, leaf-local, never the arena.
  useEffect(() => {
    if (typeof targetMs !== 'number') {
      return undefined;
    }

    if (isCountdownKeyFinished(countdownKey)) {
      setDisplayedSeconds(null);
      return undefined;
    }

    let frameId: ReturnType<typeof requestAnimationFrame> | null = null;
    let cancelled = false;
    let lastSeconds: number | null | undefined;

    const update = () => {
      if (cancelled) {
        return;
      }

      const nextSecondsRemaining = resolveLocalCountdownSeconds({ nowMs: readSyncedNowMs(), targetMs });
      if (nextSecondsRemaining !== lastSeconds) {
        lastSeconds = nextSecondsRemaining;
        commit(nextSecondsRemaining);
      }

      if (nextSecondsRemaining === null) {
        return;
      }

      frameId = requestAnimationFrame(update);
    };

    update();

    return () => {
      cancelled = true;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [commit, countdownKey, targetMs]);

  if (isCountdownKeyFinished(countdownKey)) {
    return null;
  }

  return displayedSeconds;
}
