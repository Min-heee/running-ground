export type LiveMatchPerfSample = {
  label: string;
  mode: 'duel' | 'group';
  fps: number;
  renders: number;
  windowMs: number;
  participants: number;
  visibleParticipants?: number;
  targetDistanceKm: number;
  capturedAt: number;
};

export type LiveMatchPerfSummary = {
  label: string;
  mode: 'duel' | 'group';
  latestFps: number;
  averageFps: number;
  latestRenders: number;
  averageRenders: number;
  sampleCount: number;
  participants: number;
  visibleParticipants?: number;
  targetDistanceKm: number;
  capturedAt: number;
};

const MAX_LIVE_MATCH_PERF_SAMPLES = 80;
const listeners = new Set<() => void>();
let samples: LiveMatchPerfSample[] = [];

export function recordLiveMatchPerfSample(sample: LiveMatchPerfSample) {
  samples = [...samples.slice(-(MAX_LIVE_MATCH_PERF_SAMPLES - 1)), sample];
  listeners.forEach((listener) => listener());
}

export function clearLiveMatchPerfSamples() {
  samples = [];
  listeners.forEach((listener) => listener());
}

export function getLiveMatchPerfSamples() {
  return samples;
}

export function subscribeLiveMatchPerfSamples(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function buildLiveMatchPerfSummary(
  inputSamples: LiveMatchPerfSample[],
  label?: string,
): LiveMatchPerfSummary | null {
  const scopedSamples = label
    ? inputSamples.filter((sample) => sample.label === label)
    : inputSamples;
  const latestSample = scopedSamples[scopedSamples.length - 1];

  if (!latestSample) {
    return null;
  }

  const totalFps = scopedSamples.reduce((sum, sample) => sum + sample.fps, 0);
  const totalRenders = scopedSamples.reduce((sum, sample) => sum + sample.renders, 0);

  return {
    label: latestSample.label,
    mode: latestSample.mode,
    latestFps: latestSample.fps,
    averageFps: Math.round(totalFps / scopedSamples.length),
    latestRenders: latestSample.renders,
    averageRenders: Math.round(totalRenders / scopedSamples.length),
    sampleCount: scopedSamples.length,
    participants: latestSample.participants,
    visibleParticipants: latestSample.visibleParticipants,
    targetDistanceKm: latestSample.targetDistanceKm,
    capturedAt: latestSample.capturedAt,
  };
}
