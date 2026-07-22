// 나와의 대결 (ghost run) track codec — PURE.
//
// A ghost is the time→distance curve of a past solo run. Storage is
// expo-secure-store (the only persistent store in the app), whose safe value
// size is ~2KB — so the curve is COMPRESSED: resampled onto a fixed time step
// (10s, widened for long runs so the point count stays bounded) and stored as
// integer meter DELTAS. A 1-hour run fits in ~1.4KB; race-time reads
// interpolate linearly between steps.

export type GhostSample = {
  elapsedSec: number;
  distanceM: number;
};

export type GhostTrack = {
  // Seconds between consecutive points (first point is at stepSec, not 0).
  stepSec: number;
  // Integer meter deltas per step; cumulative sum rebuilds the curve.
  deltasM: number[];
};

export type GhostRecord = {
  v: 1;
  id: string;
  savedAt: string;
  startedAt: string | null;
  durationSec: number;
  distanceM: number;
  track: GhostTrack;
};

// ≤360 points keeps the serialized record comfortably under the SecureStore
// budget while giving 10s resolution up to a 1-hour run.
const MAX_TRACK_POINTS = 360;
const BASE_STEP_SEC = 10;

export function resampleGhostTrack(samples: GhostSample[], durationSec: number): GhostTrack {
  const cleaned = samples
    .filter((sample) => Number.isFinite(sample.elapsedSec) && Number.isFinite(sample.distanceM))
    .sort((left, right) => left.elapsedSec - right.elapsedSec);

  const safeDuration = Math.max(1, Math.round(durationSec));
  // Widen the step in 5s increments until the run fits in MAX_TRACK_POINTS.
  const stepSec = Math.max(
    BASE_STEP_SEC,
    Math.ceil(safeDuration / MAX_TRACK_POINTS / 5) * 5,
  );

  const pointCount = Math.max(1, Math.ceil(safeDuration / stepSec));
  const deltasM: number[] = [];
  let previousDistanceM = 0;

  for (let index = 1; index <= pointCount; index += 1) {
    const targetSec = Math.min(index * stepSec, safeDuration);
    const distanceM = Math.round(interpolateSamples(cleaned, targetSec));
    deltasM.push(Math.max(0, distanceM - previousDistanceM));
    previousDistanceM = Math.max(previousDistanceM, distanceM);
  }

  return { stepSec, deltasM };
}

function interpolateSamples(sorted: GhostSample[], targetSec: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  if (targetSec <= sorted[0].elapsedSec) {
    // Before the first sample: scale linearly from the origin.
    return sorted[0].elapsedSec > 0
      ? (sorted[0].distanceM * targetSec) / sorted[0].elapsedSec
      : sorted[0].distanceM;
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];

    if (targetSec <= current.elapsedSec) {
      const span = current.elapsedSec - previous.elapsedSec;
      if (span <= 0) {
        return current.distanceM;
      }
      const ratio = (targetSec - previous.elapsedSec) / span;
      return previous.distanceM + (current.distanceM - previous.distanceM) * ratio;
    }
  }

  return sorted[sorted.length - 1].distanceM;
}

// Ghost distance at a live elapsed time, linearly interpolated between steps
// and clamped to the ghost's final distance once its duration is exceeded.
export function interpolateGhostDistanceM(record: GhostRecord, elapsedSec: number): number {
  if (elapsedSec <= 0) {
    return 0;
  }

  const { stepSec, deltasM } = record.track;
  let cumulative = 0;
  let previousCumulative = 0;
  const stepIndex = Math.floor(elapsedSec / stepSec);

  for (let index = 0; index < deltasM.length && index <= stepIndex; index += 1) {
    previousCumulative = cumulative;
    cumulative += deltasM[index];
  }

  if (stepIndex >= deltasM.length) {
    return record.distanceM;
  }

  const withinStepSec = elapsedSec - stepIndex * stepSec;
  return previousCumulative + (cumulative - previousCumulative) * (withinStepSec / stepSec);
}

export function serializeGhostRecord(record: GhostRecord): string {
  return JSON.stringify(record);
}

export function deserializeGhostRecord(raw: string | null | undefined): GhostRecord | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as GhostRecord;

    if (
      parsed?.v !== 1
      || typeof parsed.id !== 'string'
      || !Number.isFinite(parsed.durationSec)
      || !Number.isFinite(parsed.distanceM)
      || !Number.isFinite(parsed.track?.stepSec)
      || !Array.isArray(parsed.track?.deltasM)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
