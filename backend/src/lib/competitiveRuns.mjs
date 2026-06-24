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
// IMPORTANT: this gate is ONLY for competitive aggregations. Personal surfaces
// (home 기록 카드 주/월/년 stats, 내 활동 기록 list, profile lifetime distance)
// MUST keep showing imported runs and therefore MUST NOT use this filter.

const COMPETITIVE_SOURCE_TYPES = new Set(['runningground']);

export function isCompetitiveRun(run) {
  if (!run || typeof run !== 'object') {
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
