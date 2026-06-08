import { useEffect, useState } from 'react';

import { getSharedServerClockOffsetMs } from '@/features/runs/sync/serverClockSync';
import { MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS } from '@/lib/matchCountdown';

const LOCAL_COUNTDOWN_MIN_TICK_DELAY_MS = 50;
const LOCAL_COUNTDOWN_MAX_TICK_DELAY_MS = 1000;

function clampCountdownSeconds(seconds: number, maxSeconds: number) {
  return Math.max(1, Math.min(maxSeconds, seconds));
}

function clampCountdownDelayMs(delayMs: number) {
  return Math.max(
    LOCAL_COUNTDOWN_MIN_TICK_DELAY_MS,
    Math.min(LOCAL_COUNTDOWN_MAX_TICK_DELAY_MS, delayMs),
  );
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

export function resolveLocalCountdownTickerDelayMs({
  nowMs,
  targetMs,
}: {
  nowMs: number;
  targetMs: number;
}) {
  const remainingMs = targetMs - nowMs;
  if (remainingMs <= 0) {
    return null;
  }

  const visibleSeconds = Math.ceil(remainingMs / 1000);
  const nextBoundaryRemainingMs = Math.max(0, visibleSeconds - 1) * 1000;
  return clampCountdownDelayMs(remainingMs - nextBoundaryRemainingMs);
}

function readSyncedLocalNowMs() {
  return Date.now() + getSharedServerClockOffsetMs();
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

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) {
        return;
      }

      const nowMs = readSyncedLocalNowMs();
      const nextSecondsRemaining = resolveLocalCountdownSeconds({ nowMs, targetMs });
      setLocalSecondsRemaining(nextSecondsRemaining);

      if (nextSecondsRemaining === null) {
        return;
      }

      const delayMs = resolveLocalCountdownTickerDelayMs({ nowMs, targetMs });
      if (delayMs !== null) {
        timeoutId = setTimeout(tick, delayMs);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [targetMs]);

  return typeof targetMs === 'number' ? localSecondsRemaining : secondsRemaining;
}
