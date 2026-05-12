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
  hint: string;
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
  if (sample.fps < 35 && sample.renders >= 12 && sample.hiddenProgressUpdates >= 4) {
    return {
      level: 'critical',
      label: '숨은 참가자 갱신 과다',
      hint: '화면 밖 참가자 변화가 카드 렌더를 밀어 올려요.',
    };
  }

  if (sample.fps < 35 && sample.renders >= 12 && sample.staticRenders >= 5) {
    return {
      level: 'critical',
      label: '정적 재렌더 과다',
      hint: '표시값 변화 없이 부모 화면이 자주 다시 그려져요.',
    };
  }

  if (sample.fps < 35 && (sample.visibleParticipants ?? sample.participants) >= 14) {
    return {
      level: 'critical',
      label: '표시 인원 부담',
      hint: 'Android에서 한 번에 보이는 참가자를 더 줄여야 해요.',
    };
  }

  if (sample.fps < 35 && sample.renders >= 12) {
    return {
      level: 'critical',
      label: 'FPS 저하 + 렌더 과다',
      hint: 'progress 갱신 주기와 화면 prop 생성을 같이 봐야 해요.',
    };
  }

  if (sample.fps < 35) {
    return {
      level: 'critical',
      label: 'FPS 저하',
      hint: '렌더 횟수보다 도로/리스트 렌더 비용이 클 수 있어요.',
    };
  }

  if (sample.hiddenProgressUpdates >= 4) {
    return {
      level: 'watch',
      label: '숨은 참가자 갱신 영향',
      hint: '경량 모드 밖 참가자 변화가 상위 렌더에 섞여요.',
    };
  }

  if (sample.staticRenders >= 5) {
    return {
      level: 'watch',
      label: '변화 없는 재렌더 많음',
      hint: '부모 상태나 새 배열/객체 생성 흐름을 의심해요.',
    };
  }

  if (sample.renders >= 12) {
    return {
      level: 'watch',
      label: '렌더 과다',
      hint: '대결 progress 수신 주기와 memo 경계를 확인해요.',
    };
  }

  if ((sample.visibleParticipants ?? sample.participants) >= 14) {
    return {
      level: 'watch',
      label: '표시 인원 부담',
      hint: '그룹전 Android 경량 표시 수를 더 줄일 여지가 있어요.',
    };
  }

  return {
    level: 'stable',
    label: '안정',
    hint: '현재 샘플 기준으로 렉 원인이 크게 보이지 않아요.',
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
