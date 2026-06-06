// Sub-second offsets matter for cross-device countdown sync (two phones
// drifting by ~1s caused "한쪽은 카운팅 끝났는데 한쪽은 아직" mismatch).
// 500ms keeps us above typical NTP jitter (~100ms) while still applying
// small-but-meaningful clock differences between devices.
const SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS = 500;
// Once a stable offset is in place, ignore small fluctuations from network
// round-trip jitter so the countdown digit doesn't visibly twitch.
const SERVER_CLOCK_OFFSET_JITTER_TOLERANCE_MS = 750;
const SERVER_CLOCK_OFFSET_SMOOTHING_FACTOR = 0.25;
const SERVER_CLOCK_MAX_RTT_SAMPLE_MS = 3000;

type ServerClockTimingSource = {
  clientRequestStartedAtMs?: unknown;
  clientResponseReceivedAtMs?: unknown;
};

type ServerClockOffsetSample = {
  serverNowMs: number;
  offsetMs: number;
};

export function parseServerNowMs(serverNow?: string) {
  const parsedMs = serverNow ? new Date(serverNow).getTime() : NaN;
  return Number.isFinite(parsedMs) ? parsedMs : null;
}

function readFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function resolveServerClockOffsetSample(
  serverNow?: string,
  timingSource?: unknown,
  nowMs = Date.now(),
): ServerClockOffsetSample | null {
  const serverNowMs = parseServerNowMs(serverNow);
  if (serverNowMs === null) {
    return null;
  }

  const timing = typeof timingSource === 'object' && timingSource !== null
    ? timingSource as ServerClockTimingSource
    : null;
  const requestStartedAtMs = readFiniteNumber(timing?.clientRequestStartedAtMs);

  if (requestStartedAtMs !== null) {
    const responseReceivedAtMs = readFiniteNumber(timing?.clientResponseReceivedAtMs) ?? nowMs;
    const rttMs = responseReceivedAtMs - requestStartedAtMs;

    if (rttMs < 0 || rttMs > SERVER_CLOCK_MAX_RTT_SAMPLE_MS) {
      return null;
    }

    return {
      serverNowMs,
      offsetMs: Math.round(serverNowMs + rttMs / 2 - responseReceivedAtMs),
    };
  }

  return {
    serverNowMs,
    offsetMs: serverNowMs - nowMs,
  };
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

let sharedServerClockOffsetMs = 0;
let latestAcceptedServerNowMs = 0;
const sharedServerClockListeners = new Set<(offsetMs: number) => void>();

export function getSharedServerClockOffsetMs() {
  return sharedServerClockOffsetMs;
}

export function applySharedServerClock(serverNow?: string, timingSource?: unknown) {
  const offsetSample = resolveServerClockOffsetSample(serverNow, timingSource);
  if (offsetSample === null) {
    return sharedServerClockOffsetMs;
  }

  if (offsetSample.serverNowMs < latestAcceptedServerNowMs) {
    return sharedServerClockOffsetMs;
  }

  latestAcceptedServerNowMs = offsetSample.serverNowMs;

  const stableOffsetMs = resolveStableServerClockOffset(sharedServerClockOffsetMs, offsetSample.offsetMs);
  if (stableOffsetMs !== sharedServerClockOffsetMs) {
    sharedServerClockOffsetMs = stableOffsetMs;
    sharedServerClockListeners.forEach((listener) => {
      listener(stableOffsetMs);
    });
  }

  return sharedServerClockOffsetMs;
}

export function subscribeSharedServerClock(listener: (offsetMs: number) => void) {
  sharedServerClockListeners.add(listener);
  return () => {
    sharedServerClockListeners.delete(listener);
  };
}

export function resetSharedServerClockForTest() {
  sharedServerClockOffsetMs = 0;
  latestAcceptedServerNowMs = 0;
  sharedServerClockListeners.clear();
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
