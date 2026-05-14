const SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS = 3000;
const SERVER_CLOCK_OFFSET_JITTER_TOLERANCE_MS = 750;
const SERVER_CLOCK_OFFSET_SMOOTHING_FACTOR = 0.25;

export function parseServerNowMs(serverNow?: string) {
  const parsedMs = serverNow ? new Date(serverNow).getTime() : NaN;
  return Number.isFinite(parsedMs) ? parsedMs : null;
}

export function resolveStableServerClockOffset(currentOffsetMs: number, nextOffsetMs: number) {
  if (Math.abs(nextOffsetMs) < SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS) {
    return 0;
  }

  if (currentOffsetMs === 0) {
    return nextOffsetMs;
  }

  const offsetDeltaMs = nextOffsetMs - currentOffsetMs;
  if (Math.abs(offsetDeltaMs) < SERVER_CLOCK_OFFSET_JITTER_TOLERANCE_MS) {
    return currentOffsetMs;
  }

  return Math.round(currentOffsetMs + offsetDeltaMs * SERVER_CLOCK_OFFSET_SMOOTHING_FACTOR);
}

export function shouldAcceptServerSnapshot(latestServerNowMsRef: { current: number }, serverNow?: string) {
  const serverNowMs = parseServerNowMs(serverNow);
  if (serverNowMs === null) {
    return true;
  }

  if (serverNowMs < latestServerNowMsRef.current) {
    return false;
  }

  latestServerNowMsRef.current = serverNowMs;
  return true;
}
