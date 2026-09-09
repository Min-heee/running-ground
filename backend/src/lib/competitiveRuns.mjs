// Shared classifier that decides whether a run record may feed competitive
// surfaces (rank LP, 오늘의 랭킹 leaderboards, 전적).
//
// Imported runs (Apple Health / Health Connect / NRC / Strava / Garmin / MyNB
// and manual entries) have no in-app GPS verification, so counting them toward
// competitive rankings is exploitable. Only in-app GPS-tracked runs
// (sourceType === 'runningground') are competitive-eligible. Any run carrying a
// matchResult is also competitive-eligible because match results are only ever
// produced by the in-app live arena (a defensive belt-and-suspenders check).
//
// Anti-cheat V1 stage 2 (lib/runIntegrity.mjs): a run the server classified as
// vehicle-assisted at save time (run.integrity.verdict === 'vehicle') is barred
// from every competitive surface — even when it carries a matchResult. 'suspect'
// verdicts are telemetry-only and remain competitive.
//
// 표시면 제외 (오너 2026-09-09): 차량 판정 러닝은 표시 보드에서도 빠진다 — 차량 속도
// 기록이 integrity.verdict='vehicle'을 받고도 오늘의 랭킹 1위에 올랐다.
// 판정은 points.mjs 집계(주/월/오늘 거리, 스트릭, 최근 러닝), todayRankingBuilder,
// monthlyRankingStars가 전부 isVehicleFlaggedRun 한 곳을 본다. 기록 자체(내 활동 목록,
// 기록 상세)는 남는다 — 사라지는 건 집계·순위뿐이다.
//
// IMPORTANT: isCompetitiveRun is ONLY for competitive aggregations. Personal
// surfaces (home 기록 카드 주/월/년 stats, 내 활동 기록 list, profile lifetime
// distance) MUST keep showing imported runs and therefore MUST NOT use that
// filter — they use isVehicleFlaggedRun alone.

const COMPETITIVE_SOURCE_TYPES = new Set(['runningground']);

// 서버가 차량 판정(runIntegrity 'vehicle')을 박은 기록 — 케이던스 워치독 자진 신고
// (reason 'cadence-watchdog'), 케이던스 감사 백스톱('cadence-audit'), 평균 속도 규칙
// ('speed') 전부 같은 verdict로 모인다. 표시 보드와 경쟁 집계가 공유하는 단일 게이트.
export function isVehicleFlaggedRun(run) {
  return Boolean(run) && typeof run === 'object' && run.integrity?.verdict === 'vehicle';
}

export function isCompetitiveRun(run) {
  if (!run || typeof run !== 'object') {
    return false;
  }

  // Checked FIRST so the matchResult fast-path below cannot resurrect a
  // vehicle-flagged match run (Anti-cheat V1 stage 2).
  if (isVehicleFlaggedRun(run)) {
    return false;
  }

  if (run.matchResult) {
    return true;
  }

  const sourceType = typeof run.sourceType === 'string' ? run.sourceType.trim() : '';
  return COMPETITIVE_SOURCE_TYPES.has(sourceType);
}

export function filterCompetitiveRuns(runs) {
  return (Array.isArray(runs) ? runs : []).filter((run) => isCompetitiveRun(run));
}

// Given a Map<userId, run[]>, return a new Map with each run list narrowed to
// the competitive-eligible runs. Used by the today-ranking aggregation in both
// the JSON-file store and the Postgres store so they stay behaviorally
// identical.
export function buildCompetitiveRunsByUserId(runsByUserId) {
  const competitiveRunsByUserId = new Map();

  for (const [userId, runs] of runsByUserId.entries()) {
    competitiveRunsByUserId.set(userId, filterCompetitiveRuns(runs));
  }

  return competitiveRunsByUserId;
}
