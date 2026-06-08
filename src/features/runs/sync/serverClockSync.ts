// Sub-second offsets matter for cross-device countdown sync (two phones
// drifting by ~1s caused "한쪽은 카운팅 끝났는데 한쪽은 아직" mismatch).
// 500ms keeps us above typical NTP jitter (~100ms) while still applying
// small-but-meaningful clock differences between devices.
const SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS = 500;
// Once a stable offset is in place, ignore small fluctuations from network
// round-trip jitter so the countdown digit doesn't visibly twitch.
const SERVER_CLOCK_OFFSET_JITTER_TOLERANCE_MS = 750;
// Never let a late server snapshot move the countdown clock by seconds in a
// single render. Small offsets move toward the target over a few snapshots.
const SERVER_CLOCK_OFFSET_MAX_STEP_MS = 400;
// A large gap is a real multi-second clock difference (cold acquisition or an NTP
// correction), not jitter. Crawling it 400ms at a time takes ~8 snapshots — long
// enough for a countdown to lock a stale, multi-second offset (two phones ending the
// count seconds apart). Close large gaps in one or two snapshots instead.
const SERVER_CLOCK_OFFSET_FAST_CONVERGE_DELTA_MS = 1000;
const SERVER_CLOCK_OFFSET_FAST_MAX_STEP_MS = 2000;
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

    if (rttMs < 0) {
      return null;
    }

    if (rttMs > SERVER_CLOCK_MAX_RTT_SAMPLE_MS) {
      return {
        serverNowMs,
        offsetMs: Math.round(serverNowMs - responseReceivedAtMs),
      };
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

function resolveOffsetStep(offsetDeltaMs: number) {
  // Large gaps converge fast (one or two snapshots); small gaps stay gentle so the
  // measurement clock never visibly twitches once it is already close.
  const maxStepMs = Math.abs(offsetDeltaMs) > SERVER_CLOCK_OFFSET_FAST_CONVERGE_DELTA_MS
    ? SERVER_CLOCK_OFFSET_FAST_MAX_STEP_MS
    : SERVER_CLOCK_OFFSET_MAX_STEP_MS;

  if (offsetDeltaMs > maxStepMs) {
    return maxStepMs;
  }

  if (offsetDeltaMs < -maxStepMs) {
    return -maxStepMs;
  }

  return offsetDeltaMs;
}

export function resolveStableServerClockOffset(
  currentOffsetMs: number,
  nextOffsetMs: number,
  isFirstSample = false,
) {
  const targetOffsetMs = Math.abs(nextOffsetMs) < SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS ? 0 : nextOffsetMs;

  // Cold acquisition: lock straight onto the (RTT-corrected) offset instead of
  // crawling up from zero, so the very first countdown can't freeze a not-yet-converged
  // multi-second offset.
  if (isFirstSample) {
    return Math.round(targetOffsetMs);
  }

  const offsetDeltaMs = targetOffsetMs - currentOffsetMs;

  if (offsetDeltaMs === 0) {
    return currentOffsetMs;
  }

  if (
    currentOffsetMs !== 0
    && targetOffsetMs !== 0
    && Math.abs(offsetDeltaMs) < SERVER_CLOCK_OFFSET_JITTER_TOLERANCE_MS
  ) {
    return currentOffsetMs;
  }

  return Math.round(currentOffsetMs + resolveOffsetStep(offsetDeltaMs));
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

  const isFirstSample = latestAcceptedServerNowMs === 0;
  latestAcceptedServerNowMs = offsetSample.serverNowMs;

  const stableOffsetMs = resolveStableServerClockOffset(
    sharedServerClockOffsetMs,
    offsetSample.offsetMs,
    isFirstSample,
  );
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
