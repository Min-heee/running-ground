// Sub-second offsets matter for cross-device countdown sync (two phones
// drifting by ~1s caused "한쪽은 카운팅 끝났는데 한쪽은 아직" mismatch).
// 500ms keeps us above typical NTP jitter (~100ms) while still applying
// small-but-meaningful clock differences between devices.
const SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS = 500;
// Once a stable offset is in place, ignore small fluctuations from network
// round-trip jitter so the countdown digit doesn't visibly twitch.
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
