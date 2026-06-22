import type { RunMatchResult, RunMatchSource, RunRoutePoint } from '@/domain';
import {
  buildAveragePaceForFinishedRun,
  buildRunDateFromTimestamp,
  calculateCadenceSpm,
} from '@/features/runs/tracking';
import { isMeasuredPaceLabel } from '@/features/runs/viewModels/matchProgress';
import type { CreateTrackedRunInput } from '@/lib/api/types/runs';
import type { DisplayedTrackingSnapshot } from './types';

// C4: the duel result card 나 column pace and the run-detail bottom metric pace must come
// from a SINGLE source so they cannot diverge (the 6:17-vs-6:14 inconsistency). When a duel
// matchResult carries a measured myPaceLabel (the server-frozen pace when the verdict is
// resolved), reuse it as the run's own bottom pace. Forfeits keep the local '00:00/km' path.
function resolveRunPaceLabel(
  averagePaceLabel: string,
  trackedMatchResult: RunMatchResult | null | undefined,
): string {
  if (averagePaceLabel === '00:00/km') {
    // Stationary-forfeit save: leave the forfeit pace untouched.
    return averagePaceLabel;
  }
  const matchPaceLabel = trackedMatchResult?.mode === 'duel' ? trackedMatchResult.myPaceLabel : undefined;
  return isMeasuredPaceLabel(matchPaceLabel) ? matchPaceLabel! : averagePaceLabel;
}

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
  source,
  trackedMatchResult,
}: {
  currentDistanceKm: number;
  mode: 'duel' | 'group';
  source?: RunMatchSource;
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
      ...(source ? { source } : {}),
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
    ...(source ? { source } : {}),
  };
}

export function buildRunSaveResultSnapshot({
  allowShortDistanceSave = false,
  allowStationaryForfeitSave = false,
  displayedSnapshot,
  matchId,
  matchSource,
  totalSteps,
  trackedMatchResult,
}: {
  allowShortDistanceSave?: boolean;
  allowStationaryForfeitSave?: boolean;
  displayedSnapshot: DisplayedTrackingSnapshot;
  matchId?: string | null;
  matchSource?: RunMatchSource;
  totalSteps: number;
  trackedMatchResult?: RunMatchResult | null;
}): RunSaveResultSnapshot {
  // Whole seconds only: the run's durationSeconds is validated as a positive integer
  // server-side, so a raw float elapsed would 400 the save. Round once here so every
  // downstream consumer (durationSeconds, the matchResult my/opponent durations,
  // endedAt, pace/cadence) sees the same integer.
  const finalElapsedSeconds = allowStationaryForfeitSave
    ? Math.max(1, Math.round(displayedSnapshot.elapsedSeconds))
    : Math.round(displayedSnapshot.elapsedSeconds);
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
    : buildAveragePaceForFinishedRun(finalDistanceKm, finalElapsedSeconds);

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

  // C4: single pace source — the run's bottom metric pace reuses the duel matchResult's
  // measured myPaceLabel (server-frozen when resolved) so the 나 column and the bottom metric
  // never disagree.
  const runPaceLabel = resolveRunPaceLabel(averagePaceLabel, trackedMatchResult);

  return {
    averagePaceLabel,
    endedAt,
    finalElapsedSeconds,
    startedAt,
    createRunInput: {
      date: buildRunDateFromTimestamp(startedAt),
      distanceKm: saveDistanceKm,
      pace: runPaceLabel,
      durationSeconds: finalElapsedSeconds,
      cadenceSpm: finalCadenceSpm,
      elevationGainM: finalElevationGainM,
      route: savableRoute,
      startedAt,
      endedAt,
      ...(trackedMatchResult
        ? {
            matchResult: {
              ...trackedMatchResult,
              // C4: keep the matchResult 나 pace identical to the run's bottom pace.
              myPaceLabel: trackedMatchResult.myPaceLabel ?? runPaceLabel,
              // C1 no-0 guard: never persist a 0 duration when a real measured elapsed
              // exists. A tracked result whose myDurationSeconds collapsed to 0 (snapshot
              // with no startedAt / warmup branch) would otherwise freeze 00:00 into the
              // saved 대결 카드. Fall back to the run's own finalElapsedSeconds so the saved
              // record carries the real time instead of 00:00.
              myDurationSeconds: trackedMatchResult.myDurationSeconds
                ? trackedMatchResult.myDurationSeconds
                : finalElapsedSeconds,
              ...(matchSource ? { source: matchSource } : {}),
              // Persist the originating matchId so a SAVED run can re-fetch its full
              // per-participant result — this is what makes '결과 보기' appear in 내 러닝
              // 기록, not only right after the match (which threads matchId via nav params).
              ...(matchId ? { matchId } : {}),
            },
          }
        : {}),
    },
  };
}
