import type { RunMatchResult, RunMatchSource, RunRoutePoint } from '@/domain';
import {
  buildAveragePaceForFinishedRun,
  buildRunDateFromTimestamp,
  calculateCadenceSpm,
} from '@/features/runs/tracking';
import { isMeasuredPaceLabel } from '@/features/runs/viewModels/matchProgress';
import { downsampleRoute } from '@/features/runs/utils/downsampleRoute';
import type { CreateTrackedRunInput, RunCadenceAudit } from '@/lib/api/types/runs';
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

// FIX-A (2026-07-09) — minimal PENDING matchResult blob synthesized when a save carries a
// matchId but NO resolved/live matchResult (runtime wiped before any result model existed).
// Without it the matchId was silently dropped (matchId persists only INSIDE the matchResult
// blob) and the run saved as plain solo: +0P match bonus, no 대결 card, and invisible to every
// heal path (client reconcile, backend backFillFinisherSavedRuns, B-5 dedupe-as-upgrade — all
// keyed off run.matchResult.matchId). Shape mirrors the client's pending duel blob copy
// (matchResultModel) and satisfies the backend validator (mode/title/summary/badgeLabel
// required); the backend's resolveMatchResult re-resolves any input.matchResult
// server-authoritatively, so this pending blob is upgraded to the official verdict on landing
// or healed later by the reconcile/backfill paths.
export function buildPendingMatchSaveResultBlob({
  matchId,
  mode,
  matchSource,
  myPaceLabel,
  myDurationSeconds,
}: {
  matchId: string;
  mode: 'duel' | 'group';
  matchSource?: RunMatchSource;
  myPaceLabel: string;
  myDurationSeconds: number;
}): RunMatchResult {
  return {
    mode,
    matchId,
    ...(matchSource ? { source: matchSource } : {}),
    title: '대결 결과를 집계하고 있어요',
    summary: '상대가 완주하면 결과가 자동으로 업데이트돼요.',
    badgeLabel: '결과 집계 중',
    myPaceLabel,
    ...(myDurationSeconds > 0 ? { myDurationSeconds } : {}),
  };
}

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

// 실격패 블롭 라벨 (오너 규칙 2026-09-09) — 서버 결과 빌더의 자기 쪽 '실격패'와 같은 문자열.
// runDetailMatchReconcile은 이 배지를 기권과 같은 종결 기록으로 보고 덮어쓰지 않는다.
export const DISQUALIFIED_FORFEIT_BADGE_LABEL = '실격패';

export function buildCurrentUserForfeitMatchResult({
  currentDistanceKm,
  mode,
  source,
  trackedMatchResult,
  disqualified = false,
}: {
  currentDistanceKm: number;
  mode: 'duel' | 'group';
  source?: RunMatchSource;
  trackedMatchResult?: RunMatchResult | null;
  // 케이던스 워치독 실격 기권: 배지 '실격패' + disqualified:true + 부정 러닝 카피. 일반 기권은 그대로.
  disqualified?: boolean;
}): RunMatchResult {
  const base = trackedMatchResult?.mode === mode ? trackedMatchResult : null;

  if (mode === 'duel') {
    if (disqualified) {
      return {
        ...(base ?? {}),
        mode,
        title: '부정 러닝으로 실격패 처리됐어요',
        summary: `달리기 속도로 이동했지만 케이던스가 감지되지 않아 부정 러닝으로 판정됐어요. 내 기록은 ${currentDistanceKm.toFixed(2)}km로 남지만 대결 전적은 실격패이고 매치 포인트는 지급되지 않아요.`,
        badgeLabel: DISQUALIFIED_FORFEIT_BADGE_LABEL,
        resultTone: 'lose',
        disqualified: true,
        ...(source ? { source } : {}),
      };
    }

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

  if (disqualified) {
    return {
      ...(base ?? {}),
      mode,
      title: '부정 러닝으로 그룹 대결에서 실격됐어요',
      summary: `달리기 속도로 이동했지만 케이던스가 감지되지 않아 부정 러닝으로 판정됐어요. ${participantCount}명 중 ${rank}위로 정리되고 매치 포인트는 지급되지 않아요.`,
      badgeLabel: DISQUALIFIED_FORFEIT_BADGE_LABEL,
      rank,
      participantCount,
      disqualified: true,
      ...(source ? { source } : {}),
    };
  }

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
  cadenceAudit,
  displayedSnapshot,
  fallbackMatchMode,
  matchId,
  matchSource,
  totalSteps,
  trackedMatchResult,
}: {
  allowShortDistanceSave?: boolean;
  allowStationaryForfeitSave?: boolean;
  // 케이던스 감사 원장 (buildCadenceAudit) — 일반 저장·기권 저장 모두 같은 입력으로 실린다.
  // 없으면(구 호출자·테스트) 필드를 아예 싣지 않아 서버는 속도 규칙만 본다.
  cadenceAudit?: RunCadenceAudit | null;
  displayedSnapshot: DisplayedTrackingSnapshot;
  // FIX-A — the mode used to synthesize a pending matchResult blob when a matchId exists but
  // no live/pending result does (see buildPendingMatchSaveResultBlob). Absent/null keeps
  // today's behavior (no blob) — a mode-less matchId cannot build a valid blob.
  fallbackMatchMode?: 'duel' | 'group' | null;
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
    throw new Error('저장하려면 실제로 이동한 러닝 경로가 조금 더 필요해요.');
  }

  if (averagePaceLabel === '--:--/km') {
    throw new Error('페이스 계산이 아직 부족해서 저장할 수 없어요. 조금 더 측정한 뒤 다시 시도해주세요.');
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
      // Bound the uploaded polyline so the request body stays under the backend's body-size
      // limit regardless of run length. distanceKm/pace/duration/elevation/cadence above are
      // computed live and sent independently — the backend never derives distance from the
      // route, so decimating it only shrinks the displayed map line, never the recorded stats.
      route: downsampleRoute(savableRoute),
      startedAt,
      endedAt,
      ...(cadenceAudit ? { cadenceAudit } : {}),
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
        : matchId && fallbackMatchMode
          ? {
              // FIX-A — matchId with NO verdict: persist a minimal PENDING blob instead of
              // dropping the match identity (the matchId lives only inside matchResult). The
              // backend resolver/backfill upgrades it to the official verdict.
              matchResult: buildPendingMatchSaveResultBlob({
                matchId,
                mode: fallbackMatchMode,
                matchSource,
                myPaceLabel: runPaceLabel,
                myDurationSeconds: finalElapsedSeconds,
              }),
            }
          : {}),
    },
  };
}
