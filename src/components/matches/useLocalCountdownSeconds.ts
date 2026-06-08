import { useEffect, useState } from 'react';

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
  const [localSecondsRemaining, setLocalSecondsRemaining] = useState<number | null>(secondsRemaining);

  useEffect(() => {
    if (typeof targetMs === 'number') {
      return;
    }

    setLocalSecondsRemaining(secondsRemaining);
  }, [secondsRemaining, targetMs]);

  useEffect(() => {
    if (typeof targetMs !== 'number') {
      return undefined;
    }

    let frameId: ReturnType<typeof requestAnimationFrame> | null = null;
    let cancelled = false;
    // Re-check every animation frame and re-render ONLY when the whole-second value
    // changes, so the digit flips within ~one frame of each true second boundary —
    // uniform cadence regardless of setTimeout jitter — while React still re-renders
    // only ~once per second (and only the overlay, never the arena).
    let lastSeconds: number | null | undefined;

    const update = () => {
      if (cancelled) {
        return;
      }

      const nextSecondsRemaining = resolveLocalCountdownSeconds({ nowMs: readLocalNowMs(), targetMs });
      if (nextSecondsRemaining !== lastSeconds) {
        lastSeconds = nextSecondsRemaining;
        setLocalSecondsRemaining(nextSecondsRemaining);
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
  }, [targetMs]);

  return typeof targetMs === 'number' ? localSecondsRemaining : secondsRemaining;
}
