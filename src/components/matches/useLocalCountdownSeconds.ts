import { useCallback, useEffect, useRef, useState } from 'react';

import { MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS } from '@/lib/matchCountdown';

function clampCountdownSeconds(seconds: number, maxSeconds: number) {
  return Math.max(1, Math.min(maxSeconds, seconds));
}

export function resolveLocalCountdownSeconds({
  maxSeconds = MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  nowMs,
  targetMs,
}: {
  maxSeconds?: number;
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

function readLocalNowMs() {
  // The lock's localTargetMs is built from the model's `nowMs` (a Date.now()-based
  // local clock, NOT syncedNowMs), so the server-clock offset is already baked into
  // the target. Evaluate against local Date.now() to stay in the same frame.
  return Date.now();
}

export function useLocalCountdownSeconds({
  secondsRemaining,
  targetMs,
}: {
  secondsRemaining: number;
  targetMs?: number | null;
}) {
  const [displayedSeconds, setDisplayedSeconds] = useState<number | null>(secondsRemaining);

  // Monotonic floor for this countdown. Resets on mount — each countdown renders a
  // fresh overlay, so a brand-new countdown re-seeds high — while within one countdown
  // the digit can never increase regardless of which source (local tick or prop) drives it.
  const floorRef = useRef<number | null>(null);

  const commit = useCallback((candidate: number | null) => {
    if (candidate === null) {
      setDisplayedSeconds(null);
      return;
    }

    const nextFloor = resolveMonotonicCountdownFloor(floorRef.current, candidate);
    floorRef.current = nextFloor;
    setDisplayedSeconds(nextFloor);
  }, []);

  // Fallback path: no locked target (non-host / direct / solo, or a host lock released
  // at the very end) → follow the seconds prop, still clamped monotonically down.
  useEffect(() => {
    if (typeof targetMs === 'number') {
      return;
    }

    commit(secondsRemaining);
  }, [commit, secondsRemaining, targetMs]);

  // Local path: re-check the locked target every animation frame and re-render only
  // when the whole-second value changes — uniform cadence, leaf-local, never the arena.
  useEffect(() => {
    if (typeof targetMs !== 'number') {
      return undefined;
    }

    let frameId: ReturnType<typeof requestAnimationFrame> | null = null;
    let cancelled = false;
    let lastSeconds: number | null | undefined;

    const update = () => {
      if (cancelled) {
        return;
      }

      const nextSecondsRemaining = resolveLocalCountdownSeconds({ nowMs: readLocalNowMs(), targetMs });
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
  }, [commit, targetMs]);

  return displayedSeconds;
}
