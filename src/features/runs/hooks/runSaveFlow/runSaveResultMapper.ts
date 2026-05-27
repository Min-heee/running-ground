import type { RunMatchResult } from '@/domain';
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

export function buildRunSaveResultSnapshot({
  allowShortDistanceSave = false,
  displayedSnapshot,
  totalSteps,
  trackedMatchResult,
}: {
  allowShortDistanceSave?: boolean;
  displayedSnapshot: DisplayedTrackingSnapshot;
  totalSteps: number;
  trackedMatchResult?: RunMatchResult | null;
}): RunSaveResultSnapshot {
  const finalElapsedSeconds = displayedSnapshot.elapsedSeconds;
  const startedAt = displayedSnapshot.startedAt ?? new Date().toISOString();
  const endedAt = displayedSnapshot.route.length
    ? displayedSnapshot.route[displayedSnapshot.route.length - 1].timestamp
    : new Date().toISOString();
  const finalDistanceKm = displayedSnapshot.distanceKm;
  const finalElevationGainM = displayedSnapshot.elevationGainM;
  const finalCadenceSpm = calculateCadenceSpm(totalSteps, finalElapsedSeconds);
  const averagePaceLabel = buildAveragePace(finalDistanceKm, finalElapsedSeconds);

  const hasSavableRoute = displayedSnapshot.route.length >= 2;
  const hasSavableDistance = allowShortDistanceSave ? finalDistanceKm > 0 : finalDistanceKm >= 0.1;

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
      distanceKm: finalDistanceKm,
      pace: averagePaceLabel,
      durationSeconds: finalElapsedSeconds,
      cadenceSpm: finalCadenceSpm,
      elevationGainM: finalElevationGainM,
      route: displayedSnapshot.route,
      startedAt,
      endedAt,
      ...(trackedMatchResult ? { matchResult: trackedMatchResult } : {}),
    },
  };
}
