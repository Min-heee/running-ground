// Sub-second offsets matter for cross-device countdown sync (two phones
// drifting by ~1s caused "한쪽은 카운팅 끝났는데 한쪽은 아직" mismatch).
// 100ms stays at/above typical RTT-corrected residual jitter yet still APPLIES a
// real ~150-450ms device bias instead of zeroing it: the dominant ~1s gap came
// from two phones with opposite sub-500ms biases BOTH being suppressed to 0 and
// running up to ~900ms apart. Lowering this (not the bounded step) shrinks the
// dead zone where a genuine offset is discarded so the cross-device gap lands
// well under 0.5s.
const SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS = 100;
// Once a stable offset is in place, ignore fluctuations from network round-trip
// jitter so the countdown digit doesn't visibly twitch. Kept ABOVE the 400ms
// bounded step so the hold branch can never deadlock a single legitimate step,
// but lowered to 150 so the crawl freezes much closer to the true offset and a
// genuine sub-device-bias gap is no longer frozen in by a wide hold band.
const SERVER_CLOCK_OFFSET_JITTER_TOLERANCE_MS = 150;
// Never let a late server snapshot move the countdown clock by seconds in a
// single render. Large offsets move toward the target over a few snapshots.
// DELIBERATELY UNCHANGED: raising this (the reverted c3b6402 fast-converge) is
// what let the clock jump multiple seconds in one render and regressed.
const SERVER_CLOCK_OFFSET_MAX_STEP_MS = 400;
const SERVER_CLOCK_MAX_RTT_SAMPLE_MS = 3000;
// Lowest-RTT sample selection (NTP-style clock filter). Each offset sample carries
// up to ±RTT/2 of uncertainty from one-way latency asymmetry, so among recent
// RTT-measured samples we trust the one with the SMALLEST round trip rather than
// chasing whichever (possibly high-latency) sample arrived last. This tightens the
// cross-device countdown agreement without changing the slow-crawl dynamics below.
const SERVER_CLOCK_SAMPLE_BUFFER_SIZE = 8;
// Only keep samples measured within this window of server time so a stale low-RTT
// reading can't pin the offset to an outdated value.
const SERVER_CLOCK_SAMPLE_FRESHNESS_MS = 12000;
// clockReady gate. The countdown lock must NOT freeze a target until the shared offset
// is trustworthy. We require at least this many fresh, RTT-timed samples whose best
// (lowest-RTT) candidates agree within the tolerance below — so a single unlucky reading
// can't declare the clock "ready" and let the lock freeze a skewed instant. A device far
// off NTP cold-starts at offset 0; the FIRST trusted sample SNAPS the offset to the true
// value (bypassing the 400ms crawl), and clockReady then trips once a few samples concur.
const SERVER_CLOCK_READY_MIN_SAMPLES = 2;
const SERVER_CLOCK_READY_AGREEMENT_TOLERANCE_MS = 250;

type ServerClockTimingSource = {
  clientRequestStartedAtMs?: unknown;
  clientResponseReceivedAtMs?: unknown;
};

type ServerClockOffsetSample = {
  serverNowMs: number;
  offsetMs: number;
  // Measured round-trip time when API timing metadata is present and within the
  // normal range; null for untimed or abnormally slow samples (those still produce a
  // provisional offset but are not trusted as best-sample candidates).
  rttMs: number | null;
};

type BufferedServerClockSample = {
  serverNowMs: number;
  offsetMs: number;
  rttMs: number;
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
        rttMs: null,
      };
    }

    return {
      serverNowMs,
      offsetMs: Math.round(serverNowMs + rttMs / 2 - responseReceivedAtMs),
      rttMs,
    };
  }

  return {
    serverNowMs,
    offsetMs: serverNowMs - nowMs,
    rttMs: null,
  };
}

// Among recent RTT-measured samples, prefer the one with the smallest round trip
// (tightest uncertainty); break ties toward the most recent reading. Returns null
// when there is no fresh timed sample to trust.
export function selectBestServerClockOffsetMs(
  samples: readonly BufferedServerClockSample[],
  referenceServerNowMs: number,
): number | null {
  let best: BufferedServerClockSample | null = null;

  for (const sample of samples) {
    if (referenceServerNowMs - sample.serverNowMs > SERVER_CLOCK_SAMPLE_FRESHNESS_MS) {
      continue;
    }

    if (
      best === null
      || sample.rttMs < best.rttMs
      || (sample.rttMs === best.rttMs && sample.serverNowMs > best.serverNowMs)
    ) {
      best = sample;
    }
  }

  return best === null ? null : best.offsetMs;
}

function clampOffsetStep(offsetDeltaMs: number) {
  if (offsetDeltaMs > SERVER_CLOCK_OFFSET_MAX_STEP_MS) {
    return SERVER_CLOCK_OFFSET_MAX_STEP_MS;
  }

  if (offsetDeltaMs < -SERVER_CLOCK_OFFSET_MAX_STEP_MS) {
    return -SERVER_CLOCK_OFFSET_MAX_STEP_MS;
  }

  return offsetDeltaMs;
}

export function resolveStableServerClockOffset(
  currentOffsetMs: number,
  nextOffsetMs: number,
  // Cold start: until the FIRST trusted sample is accepted, the offset SNAPS straight to
  // the best-sample value instead of crawling toward it 400ms/snapshot. A phone several
  // seconds off NTP would otherwise need ~15 polls to converge — far longer than the
  // countdown window — and the lock would freeze a multi-second-wrong instant. The 400ms
  // clamp (clampOffsetStep) + the 100/150ms apply/jitter bands still govern every
  // SUBSEQUENT in-countdown adjustment, so a late server snapshot can never jump the
  // displayed digit by seconds in one render.
  hasAcceptedSample = true,
) {
  const targetOffsetMs = Math.abs(nextOffsetMs) < SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS ? 0 : nextOffsetMs;
  const offsetDeltaMs = targetOffsetMs - currentOffsetMs;

  if (offsetDeltaMs === 0) {
    return currentOffsetMs;
  }

  if (!hasAcceptedSample) {
    return Math.round(targetOffsetMs);
  }

  if (
    currentOffsetMs !== 0
    && targetOffsetMs !== 0
    && Math.abs(offsetDeltaMs) < SERVER_CLOCK_OFFSET_JITTER_TOLERANCE_MS
  ) {
    return currentOffsetMs;
  }

  return Math.round(currentOffsetMs + clampOffsetStep(offsetDeltaMs));
}

let sharedServerClockOffsetMs = 0;
let latestAcceptedServerNowMs = 0;
let recentTimedSamples: BufferedServerClockSample[] = [];
// Cold-start gate: false until the first trusted, RTT-corrected sample has been folded in.
// Drives the cold-start SNAP (resolveStableServerClockOffset) so the offset jumps straight
// to the true value on the first reading rather than crawling toward it.
let hasAcceptedServerClockSample = false;
// How many fresh, RTT-timed samples whose best candidates agree we've folded in. The
// countdown lock waits for clockReady before freezing, so a single reading can't pin a
// skewed instant.
let agreeingServerClockSampleCount = 0;
const sharedServerClockListeners = new Set<(offsetMs: number) => void>();

export function getSharedServerClockOffsetMs() {
  return sharedServerClockOffsetMs;
}

// True once the shared offset is trustworthy: at least SERVER_CLOCK_READY_MIN_SAMPLES fresh
// RTT-timed samples whose best (lowest-RTT) candidates have agreed within the tolerance. The
// countdown lock MUST NOT freeze its target until this trips — before it, the displayed
// digit follows the live offset every frame (so it stays correct as the clock converges) but
// no absolute instant is committed.
export function hasSyncedServerClock() {
  return agreeingServerClockSampleCount >= SERVER_CLOCK_READY_MIN_SAMPLES;
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

  // Feed the slow crawl the lowest-RTT recent offset rather than this sample's raw
  // offset, so an unlucky high-latency reading can't drag the countdown clock off the
  // value our best (lowest-uncertainty) measurement agrees on. Untimed / abnormal-RTT
  // samples keep their original provisional behavior when no trusted sample exists.
  if (offsetSample.rttMs !== null) {
    recentTimedSamples = [
      ...recentTimedSamples.filter(
        (sample) => offsetSample.serverNowMs - sample.serverNowMs <= SERVER_CLOCK_SAMPLE_FRESHNESS_MS,
      ),
      { serverNowMs: offsetSample.serverNowMs, offsetMs: offsetSample.offsetMs, rttMs: offsetSample.rttMs },
    ].slice(-SERVER_CLOCK_SAMPLE_BUFFER_SIZE);
  }

  const bestOffsetMs = selectBestServerClockOffsetMs(recentTimedSamples, offsetSample.serverNowMs);
  const targetOffsetMs = bestOffsetMs ?? offsetSample.offsetMs;
  // Only a trusted, RTT-timed best sample (not an untimed / abnormal-RTT provisional one)
  // may SNAP the cold-start offset or count toward clockReady. An untimed sample keeps the
  // bounded crawl and never declares the clock ready.
  const isTrustedSample = offsetSample.rttMs !== null && bestOffsetMs !== null;

  // clockReady accounting. The first trusted sample seeds the agreement run; later trusted
  // samples that AGREE with the committed offset (within the tolerance) advance it; a
  // disagreeing one (the offset is still moving) restarts it — so we never declare "ready"
  // mid-convergence.
  if (isTrustedSample) {
    if (
      hasAcceptedServerClockSample
      && Math.abs(targetOffsetMs - sharedServerClockOffsetMs) <= SERVER_CLOCK_READY_AGREEMENT_TOLERANCE_MS
    ) {
      agreeingServerClockSampleCount += 1;
    } else {
      agreeingServerClockSampleCount = 1;
    }
  }

  // Cold-start SNAP only on the first TRUSTED sample: pass hasAcceptedSample=false solely
  // when this trusted sample is the first one we've folded in. An untimed cold sample still
  // crawls (existing bounded-step behavior preserved).
  const allowColdStartSnap = isTrustedSample && !hasAcceptedServerClockSample;
  const stableOffsetMs = resolveStableServerClockOffset(
    sharedServerClockOffsetMs,
    targetOffsetMs,
    !allowColdStartSnap,
  );
  if (isTrustedSample) {
    hasAcceptedServerClockSample = true;
  }
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
  recentTimedSamples = [];
  hasAcceptedServerClockSample = false;
  agreeingServerClockSampleCount = 0;
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
