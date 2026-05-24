import { useRef } from 'react';

type StableCountdownTracker = {
  key: string;
  baselineRemainingSeconds: number;
  baselineNowMs: number;
};

const LOWER_CORRECTION_THRESHOLD_SECONDS = 3;
// A late-mounted runtime can lock onto a lower first raw value before the
// shared server clock arrives; re-baseline when the server value is clearly ahead.
const UPPER_CORRECTION_THRESHOLD_SECONDS = 1;

export function resolveStableCountdownRemainingSeconds(
  tracker: { current: StableCountdownTracker | null },
  key: string | null,
  rawRemainingSeconds: number | null,
  nowMs: number,
) {
  if (!key) {
    tracker.current = null;
    return rawRemainingSeconds;
  }

  const current = tracker.current;

  if (!current || current.key !== key) {
    if (typeof rawRemainingSeconds !== 'number') {
      tracker.current = null;
      return rawRemainingSeconds;
    }
    tracker.current = {
      key,
      baselineRemainingSeconds: rawRemainingSeconds,
      baselineNowMs: nowMs,
    };
    return rawRemainingSeconds;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - current.baselineNowMs) / 1000));
  const modeledRemainingSeconds = Math.max(0, current.baselineRemainingSeconds - elapsedSeconds);

  if (typeof rawRemainingSeconds !== 'number') {
    return modeledRemainingSeconds > 0 ? modeledRemainingSeconds : null;
  }

  if (rawRemainingSeconds < modeledRemainingSeconds - LOWER_CORRECTION_THRESHOLD_SECONDS) {
    tracker.current = {
      key,
      baselineRemainingSeconds: rawRemainingSeconds,
      baselineNowMs: nowMs,
    };
    return rawRemainingSeconds;
  }

  if (rawRemainingSeconds > modeledRemainingSeconds + UPPER_CORRECTION_THRESHOLD_SECONDS) {
    tracker.current = {
      key,
      baselineRemainingSeconds: rawRemainingSeconds,
      baselineNowMs: nowMs,
    };
    return rawRemainingSeconds;
  }

  return modeledRemainingSeconds;
}

export function useStableCountdownSeconds({
  key,
  rawRemainingSeconds,
  nowMs,
}: {
  key: string | null;
  rawRemainingSeconds: number | null;
  nowMs: number;
}) {
  const trackerRef = useRef<StableCountdownTracker | null>(null);

  return resolveStableCountdownRemainingSeconds(
    trackerRef,
    key,
    rawRemainingSeconds,
    nowMs,
  );
}
