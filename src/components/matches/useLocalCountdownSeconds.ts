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

  // Monotonic floor for this countdown. Resets on mount — each countdown renders a
  // fresh overlay, so a brand-new countdown re-seeds high — while within one countdown
  // the digit can never increase regardless of which source (local tick or prop) drives it.
  const floorRef = useRef<number | null>(null);
  // Once this countdown reaches zero it is terminal for this mount as well, so a late
  // prop within the same mount can't re-show it.
  const endedRef = useRef(false);

  const commit = useCallback((candidate: number | null) => {
    if (endedRef.current) {
      return;
    }

    if (candidate === null) {
      endedRef.current = true;
      markCountdownKeyFinished(countdownKey);
      setDisplayedSeconds(null);
      return;
    }

    const nextFloor = resolveMonotonicCountdownFloor(floorRef.current, candidate);
    floorRef.current = nextFloor;
    setDisplayedSeconds(nextFloor);
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
