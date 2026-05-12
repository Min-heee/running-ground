export type LiveMatchPerfSample = {
  label: string;
  mode: 'duel' | 'group';
  fps: number;
  renders: number;
  progressUpdates: number;
  visibleProgressUpdates: number;
  hiddenProgressUpdates: number;
  layoutUpdates: number;
  targetUpdates: number;
  staticRenders: number;
  windowMs: number;
  participants: number;
  visibleParticipants?: number;
  targetDistanceKm: number;
  capturedAt: number;
};

export type LiveMatchPerfDiagnosisLevel = 'stable' | 'watch' | 'critical';

export type LiveMatchPerfDiagnosis = {
  level: LiveMatchPerfDiagnosisLevel;
  label: string;
};

export type LiveMatchPerfSummary = {
  label: string;
  mode: 'duel' | 'group';
  latestFps: number;
  averageFps: number;
  latestRenders: number;
  averageRenders: number;
  latestProgressUpdates: number;
  latestVisibleProgressUpdates: number;
  latestHiddenProgressUpdates: number;
  latestLayoutUpdates: number;
  latestTargetUpdates: number;
  latestStaticRenders: number;
  diagnosis: LiveMatchPerfDiagnosis;
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

export function diagnoseLiveMatchPerfSample(sample: LiveMatchPerfSample): LiveMatchPerfDiagnosis {
  if (sample.fps < 35 && sample.renders >= 12) {
    return { level: 'critical', label: 'FPS 저하 + 렌더 과다' };
  }

  if (sample.fps < 35) {
    return { level: 'critical', label: 'FPS 저하' };
  }

  if (sample.hiddenProgressUpdates >= 4) {
    return { level: 'watch', label: '숨은 참가자 갱신 영향' };
  }

  if (sample.staticRenders >= 5) {
    return { level: 'watch', label: '변화 없는 재렌더 많음' };
  }

  if (sample.renders >= 12) {
    return { level: 'watch', label: '렌더 과다' };
  }

  if ((sample.visibleParticipants ?? sample.participants) >= 14) {
    return { level: 'watch', label: '표시 인원 부담' };
  }

  return { level: 'stable', label: '안정' };
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
    latestProgressUpdates: latestSample.progressUpdates,
    latestVisibleProgressUpdates: latestSample.visibleProgressUpdates,
    latestHiddenProgressUpdates: latestSample.hiddenProgressUpdates,
    latestLayoutUpdates: latestSample.layoutUpdates,
    latestTargetUpdates: latestSample.targetUpdates,
    latestStaticRenders: latestSample.staticRenders,
    diagnosis: diagnoseLiveMatchPerfSample(latestSample),
    sampleCount: scopedSamples.length,
    participants: latestSample.participants,
    visibleParticipants: latestSample.visibleParticipants,
    targetDistanceKm: latestSample.targetDistanceKm,
    capturedAt: latestSample.capturedAt,
  };
}
