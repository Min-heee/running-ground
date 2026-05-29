import type { RunMatchResult, RunRoutePoint } from '@/domain';
import {
  buildAveragePace,
  buildRunDateFromTimestamp,
  calculateCadenceSpm,
} from '@/features/runs/tracking';
import type { CreateTrackedRunInput } from '@/lib/api/types/runs';
import type { DisplayedTrackingSnapshot } from './types';

export type RunSaveResultSnapshot = {
  averagePaceLabel: string;
  createRunInput: CreateTrackedRunInput;
  endedAt: string;
  finalElapsedSeconds: number;
  startedAt: string;
};

function buildEndedAt(startedAt: string, elapsedSeconds: number) {
  const startedAtMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedAtMs)) {
    return new Date().toISOString();
  }
  return new Date(startedAtMs + Math.max(0, elapsedSeconds) * 1000).toISOString();
}

function buildStationaryForfeitRoute({
  endedAt,
  route,
  startedAt,
}: {
  endedAt: string;
  route: RunRoutePoint[];
  startedAt: string;
}) {
  if (route.length >= 2) {
    return route;
  }

  if (route.length === 1) {
    const [point] = route;
    return [
      { ...point, timestamp: startedAt },
      { ...point, timestamp: endedAt },
    ];
  }

  return [
    { latitude: 0, longitude: 0, timestamp: startedAt },
    { latitude: 0, longitude: 0, timestamp: endedAt },
  ];
}

export function buildCurrentUserForfeitMatchResult({
  currentDistanceKm,
  mode,
  trackedMatchResult,
}: {
  currentDistanceKm: number;
  mode: 'duel' | 'group';
  trackedMatchResult?: RunMatchResult | null;
}): RunMatchResult {
  const base = trackedMatchResult?.mode === mode ? trackedMatchResult : null;

  if (mode === 'duel') {
    return {
      ...(base ?? {}),
      mode,
      title: '기권으로 대결을 마쳤어요',
      summary: `내 기록은 ${currentDistanceKm.toFixed(2)}km로 저장되고, 대결 전적은 기권 패로 남아요.`,
      badgeLabel: '기권 패',
      resultTone: 'lose',
    };
  }

  const participantCount = base?.participantCount ?? 1;
  const rank = base?.rank ?? participantCount;

  return {
    ...(base ?? {}),
    mode,
    title: '기권으로 그룹 대결을 마쳤어요',
    summary: `${participantCount}명 중 ${rank}위로 정리되고, 지금까지 측정한 기록은 저장돼요.`,
    badgeLabel: '기권',
    rank,
    participantCount,
  };
}

export function buildRunSaveResultSnapshot({
  allowShortDistanceSave = false,
  allowStationaryForfeitSave = false,
  displayedSnapshot,
  totalSteps,
  trackedMatchResult,
}: {
  allowShortDistanceSave?: boolean;
  allowStationaryForfeitSave?: boolean;
  displayedSnapshot: DisplayedTrackingSnapshot;
  totalSteps: number;
  trackedMatchResult?: RunMatchResult | null;
}): RunSaveResultSnapshot {
  const finalElapsedSeconds = allowStationaryForfeitSave
    ? Math.max(1, displayedSnapshot.elapsedSeconds)
    : displayedSnapshot.elapsedSeconds;
  const startedAt = displayedSnapshot.startedAt ?? displayedSnapshot.route[0]?.timestamp ?? new Date().toISOString();
  const endedAt = displayedSnapshot.route.length >= 2
    ? displayedSnapshot.route[displayedSnapshot.route.length - 1].timestamp
    : buildEndedAt(startedAt, finalElapsedSeconds);
  const finalDistanceKm = displayedSnapshot.distanceKm;
  const saveDistanceKm = allowStationaryForfeitSave && finalDistanceKm <= 0 ? 0.001 : finalDistanceKm;
  const finalElevationGainM = displayedSnapshot.elevationGainM;
  const finalCadenceSpm = calculateCadenceSpm(totalSteps, finalElapsedSeconds);
  const averagePaceLabel = allowStationaryForfeitSave && finalDistanceKm <= 0
    ? '00:00/km'
    : buildAveragePace(finalDistanceKm, finalElapsedSeconds);

  const savableRoute = allowStationaryForfeitSave
    ? buildStationaryForfeitRoute({
        endedAt,
        route: displayedSnapshot.route,
        startedAt,
      })
    : displayedSnapshot.route;
  const hasSavableRoute = savableRoute.length >= 2;
  const hasSavableDistance = allowStationaryForfeitSave
    ? finalDistanceKm >= 0
    : allowShortDistanceSave ? finalDistanceKm > 0 : finalDistanceKm >= 0.1;

  if (!hasSavableRoute || !hasSavableDistance) {
    throw new Error('저장하려면 실제로 이동한 러닝 경로가 조금 더 필요해.');
  }

  if (averagePaceLabel === '--:--/km') {
    throw new Error('페이스 계산이 아직 부족해서 저장할 수 없어. 조금 더 측정한 뒤 다시 시도해줘.');
  }

  return {
    averagePaceLabel,
    endedAt,
    finalElapsedSeconds,
    startedAt,
    createRunInput: {
      date: buildRunDateFromTimestamp(startedAt),
      distanceKm: saveDistanceKm,
      pace: averagePaceLabel,
      durationSeconds: finalElapsedSeconds,
      cadenceSpm: finalCadenceSpm,
      elevationGainM: finalElevationGainM,
      route: savableRoute,
      startedAt,
      endedAt,
      ...(trackedMatchResult ? { matchResult: trackedMatchResult } : {}),
    },
  };
}
