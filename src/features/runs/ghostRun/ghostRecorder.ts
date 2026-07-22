import {
  resampleGhostTrack,
  type GhostRecord,
  type GhostSample,
} from './ghostTrackCodec';

// Module-scoped recorder for the CURRENT solo run's time→distance curve, plus
// the "저장하시겠습니까?" candidate produced when the run ends. UI components
// subscribe to the candidate so the save prompt appears reactively.

// A run must be at least this long to be worth racing against.
const MIN_CANDIDATE_DISTANCE_M = 300;
const MIN_CANDIDATE_DURATION_SEC = 120;
// In-memory sampling cadence; the codec resamples again on save.
const SAMPLE_EVERY_SEC = 5;
// Hard cap so a many-hour run cannot grow the in-memory buffer unboundedly.
const MAX_BUFFERED_SAMPLES = 4000;

let samples: GhostSample[] = [];
let recording = false;
let startedAtIso: string | null = null;

let pendingCandidate: GhostRecord | null = null;
const candidateListeners = new Set<() => void>();

function notifyCandidateListeners(): void {
  for (const listener of candidateListeners) {
    listener();
  }
}

export function beginGhostRecording(startedAt?: string | null): void {
  samples = [];
  recording = true;
  startedAtIso = startedAt ?? null;
}

export function appendGhostSample(elapsedSec: number, distanceM: number): void {
  if (!recording || !Number.isFinite(elapsedSec) || !Number.isFinite(distanceM)) {
    return;
  }

  const last = samples[samples.length - 1];
  if (last && elapsedSec - last.elapsedSec < SAMPLE_EVERY_SEC) {
    return;
  }
  if (samples.length >= MAX_BUFFERED_SAMPLES) {
    return;
  }

  samples.push({ elapsedSec, distanceM });
}

// Finish recording. When the run was long enough, compress it into a
// GhostRecord candidate and surface the save prompt.
export function finishGhostRecording(): void {
  if (!recording) {
    return;
  }

  recording = false;
  const last = samples[samples.length - 1];
  samples = samples.slice();

  if (!last || last.distanceM < MIN_CANDIDATE_DISTANCE_M || last.elapsedSec < MIN_CANDIDATE_DURATION_SEC) {
    return;
  }

  const durationSec = Math.round(last.elapsedSec);
  const distanceM = Math.round(last.distanceM);

  pendingCandidate = {
    v: 1,
    id: `ghost-${durationSec}-${distanceM}-${samples.length}`,
    savedAt: new Date().toISOString(),
    startedAt: startedAtIso,
    durationSec,
    distanceM,
    track: resampleGhostTrack(samples, durationSec),
  };
  notifyCandidateListeners();
}

export function getPendingGhostCandidate(): GhostRecord | null {
  return pendingCandidate;
}

export function clearPendingGhostCandidate(): void {
  if (pendingCandidate === null) {
    return;
  }

  pendingCandidate = null;
  notifyCandidateListeners();
}

export function subscribePendingGhostCandidate(listener: () => void): () => void {
  candidateListeners.add(listener);
  return () => {
    candidateListeners.delete(listener);
  };
}
