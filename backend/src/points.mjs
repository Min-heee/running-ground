import { isCompetitiveRun } from './lib/competitiveRuns.mjs';

function toFixed1(value) {
  return Number(value.toFixed(1));
}

function parseRunDate(value) {
  return new Date(`${value}T00:00:00`);
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekStart(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  return next;
}

function getWeekKey(date) {
  return getDateKey(getWeekStart(date));
}

function differenceInCalendarDays(left, right) {
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
  const rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.round((leftUtc - rightUtc) / (24 * 60 * 60 * 1000));
}

function getConsecutiveRewardPoints(streakDays) {
  if (streakDays < 2) {
    return 0;
  }

  return streakDays * 2 - 3;
}

function getMatchBonusPoints(matchResult) {
  if (!matchResult || typeof matchResult !== 'object') {
    return 0;
  }

  if (matchResult.mode === 'duel') {
    if (matchResult.resultTone === 'win') {
      return 20;
    }

    if (matchResult.resultTone === 'draw') {
      return 15;
    }

    if (matchResult.resultTone === 'lose') {
      return 10;
    }

    return 0;
  }

  if (matchResult.mode === 'group') {
    const participantCount = typeof matchResult.participantCount === 'number' ? matchResult.participantCount : 0;
    const rank = typeof matchResult.rank === 'number' ? matchResult.rank : 0;

    if (participantCount < 2 || rank < 1) {
      return 0;
    }

    if (rank === 1) {
      return 25;
    }

    if (rank === 2) {
      return 20;
    }

    if (rank === 3) {
      return 15;
    }

    return 10;
  }

  return 0;
}

function getMinimumRunDistanceForStreak(distanceLevel) {
  return distanceLevel >= 20 ? 5 : 3;
}

function getSortedRuns(runs) {
  return [...runs].sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return String(left.id).localeCompare(String(right.id));
  });
}

export function buildUserRunMetrics(runs, currentDate = new Date()) {
  const sortedRuns = getSortedRuns(runs);
  const runPointsById = new Map();
  const weekDistanceByKey = new Map();
  // Competitive aggregates only count in-app GPS-tracked + match runs
  // (isCompetitiveRun). Imports (apple_health/health_connect/manual) are
  // display-only and excluded so they can't inflate a user's competitive
  // leaderboard standing. The full weekDistanceByKey above stays unchanged
  // for personal surfaces (home 기록 카드, profile, 내 활동).
  const competitiveWeekDistanceByKey = new Map();
  const weekRunCountByKey = new Map();
  const monthDistanceByKey = new Map();
  const distanceByDate = new Map();
  // POINTS are competitive-only: a health-store import can be hand-typed into
  // the platform health app, and points are redeemable in the market and used
  // as a ranking tie-break — so imported runs mint nothing. Every points
  // lattice below (level ladder, streak, weekly growth) therefore runs on its
  // own competitive-only structures; imported runs simply have no
  // runPointsById entry (getRunPointValue → 0).
  const competitiveWeekRunsByKey = new Map();
  const competitiveDistanceByDate = new Map();
  const competitiveLastRunIdByDate = new Map();

  let cumulativeDistanceKm = 0;
  let competitiveCumulativeDistanceKm = 0;
  let latestRun = null;

  for (const run of sortedRuns) {
    cumulativeDistanceKm = toFixed1(cumulativeDistanceKm + run.distanceKm);

    const runDate = parseRunDate(run.date);
    const weekKey = getWeekKey(runDate);
    const monthKey = getMonthKey(runDate);

    if (isCompetitiveRun(run)) {
      // The level ladder for points climbs on the COMPETITIVE cumulative
      // distance, so an imported run can neither trigger nor shift a level
      // bonus. Match bonuses are safe here: a run carrying matchResult is
      // competitive by definition.
      const beforeLevel = Math.floor(competitiveCumulativeDistanceKm / 10);
      competitiveCumulativeDistanceKm = toFixed1(competitiveCumulativeDistanceKm + run.distanceKm);
      const afterLevel = Math.floor(competitiveCumulativeDistanceKm / 10);
      const levelPoints = Math.max(0, afterLevel - beforeLevel) * 10;
      const matchBonusPoints = getMatchBonusPoints(run.matchResult);

      runPointsById.set(run.id, {
        earnedPoint: levelPoints + matchBonusPoints,
        levelPoints,
        matchBonusPoints,
        streakPoints: 0,
        growthPoints: 0,
        weekKey,
        monthKey,
        dateKey: run.date,
      });

      competitiveWeekDistanceByKey.set(
        weekKey,
        toFixed1((competitiveWeekDistanceByKey.get(weekKey) ?? 0) + run.distanceKm),
      );
      competitiveWeekRunsByKey.set(weekKey, [...(competitiveWeekRunsByKey.get(weekKey) ?? []), run]);
      competitiveDistanceByDate.set(run.date, toFixed1((competitiveDistanceByDate.get(run.date) ?? 0) + run.distanceKm));
      competitiveLastRunIdByDate.set(run.date, run.id);
    }

    weekDistanceByKey.set(weekKey, toFixed1((weekDistanceByKey.get(weekKey) ?? 0) + run.distanceKm));
    monthDistanceByKey.set(monthKey, toFixed1((monthDistanceByKey.get(monthKey) ?? 0) + run.distanceKm));
    weekRunCountByKey.set(weekKey, (weekRunCountByKey.get(weekKey) ?? 0) + 1);
    distanceByDate.set(run.date, toFixed1((distanceByDate.get(run.date) ?? 0) + run.distanceKm));
    latestRun = run;
  }

  const lifetimeDistanceKm = toFixed1(cumulativeDistanceKm);
  const distanceLevel = Math.floor(lifetimeDistanceKm / 10);
  const minimumRunDistanceKm = getMinimumRunDistanceForStreak(distanceLevel);
  const competitiveLifetimeDistanceKm = toFixed1(competitiveCumulativeDistanceKm);
  const competitiveDistanceLevel = Math.floor(competitiveLifetimeDistanceKm / 10);

  // Display streak (home 연속 기록) — all runs, imports included: a personal
  // surface, so it keeps the pre-existing behavior. It awards NO points.
  const qualifiedDateKeys = [...distanceByDate.entries()]
    .filter(([, totalDistanceKm]) => totalDistanceKm >= minimumRunDistanceKm)
    .map(([dateKey]) => dateKey)
    .sort((left, right) => left.localeCompare(right));

  let previousQualifiedDate = null;
  const streakByDate = new Map();

  for (const dateKey of qualifiedDateKeys) {
    const runDate = parseRunDate(dateKey);
    const streakDays = previousQualifiedDate && differenceInCalendarDays(runDate, previousQualifiedDate) === 1
      ? (streakByDate.get(getDateKey(previousQualifiedDate)) ?? 1) + 1
      : 1;

    streakByDate.set(dateKey, streakDays);
    previousQualifiedDate = runDate;
  }

  // Points streak — competitive runs only, on the competitive qualification
  // threshold, so imported runs can neither start, extend, nor qualify a
  // points-earning streak day.
  const competitiveMinimumRunDistanceKm = getMinimumRunDistanceForStreak(competitiveDistanceLevel);
  const competitiveQualifiedDateKeys = [...competitiveDistanceByDate.entries()]
    .filter(([, totalDistanceKm]) => totalDistanceKm >= competitiveMinimumRunDistanceKm)
    .map(([dateKey]) => dateKey)
    .sort((left, right) => left.localeCompare(right));

  let previousCompetitiveQualifiedDate = null;
  const competitiveStreakByDate = new Map();

  for (const dateKey of competitiveQualifiedDateKeys) {
    const runDate = parseRunDate(dateKey);
    const streakDays = previousCompetitiveQualifiedDate && differenceInCalendarDays(runDate, previousCompetitiveQualifiedDate) === 1
      ? (competitiveStreakByDate.get(getDateKey(previousCompetitiveQualifiedDate)) ?? 1) + 1
      : 1;
    const rewardPoints = getConsecutiveRewardPoints(streakDays);
    const runId = competitiveLastRunIdByDate.get(dateKey);

    competitiveStreakByDate.set(dateKey, streakDays);

    if (runId) {
      const currentPoints = runPointsById.get(runId);

      if (currentPoints) {
        currentPoints.streakPoints += rewardPoints;
        currentPoints.earnedPoint += rewardPoints;
      }
    }

    previousCompetitiveQualifiedDate = runDate;
  }

  // Growth points — competitive week-over-week only, so imports can't
  // manufacture a "distance grew this week" bonus.
  const sortedWeekKeys = [...competitiveWeekDistanceByKey.keys()].sort((left, right) => left.localeCompare(right));

  for (const weekKey of sortedWeekKeys) {
    const previousWeekKey = getDateKey(addDays(parseRunDate(weekKey), -7));
    const currentWeekDistanceKm = competitiveWeekDistanceByKey.get(weekKey) ?? 0;
    const previousWeekDistanceKm = competitiveWeekDistanceByKey.get(previousWeekKey) ?? 0;

    if (currentWeekDistanceKm <= previousWeekDistanceKm || currentWeekDistanceKm <= 0) {
      continue;
    }

    const weekRuns = competitiveWeekRunsByKey.get(weekKey) ?? [];
    let progressedDistanceKm = 0;
    let runId = null;

    for (const run of weekRuns) {
      progressedDistanceKm = toFixed1(progressedDistanceKm + run.distanceKm);

      if (progressedDistanceKm > previousWeekDistanceKm) {
        runId = run.id;
        break;
      }
    }

    if (!runId) {
      continue;
    }

    const currentPoints = runPointsById.get(runId);

    if (currentPoints) {
      currentPoints.growthPoints += 10;
      currentPoints.earnedPoint += 10;
    }
  }

  const currentWeekKey = getWeekKey(currentDate);
  const previousWeekKey = getDateKey(addDays(getWeekStart(currentDate), -7));
  const currentMonthKey = getMonthKey(currentDate);
  const todayKey = getDateKey(currentDate);
  const yesterdayKey = getDateKey(addDays(currentDate, -1));
  const latestQualifiedDateKey = qualifiedDateKeys.at(-1) ?? null;
  const currentStreakDays = latestQualifiedDateKey && (latestQualifiedDateKey === todayKey || latestQualifiedDateKey === yesterdayKey)
    ? (streakByDate.get(latestQualifiedDateKey) ?? 0)
    : 0;

  const currentWeekDistanceKm = weekDistanceByKey.get(currentWeekKey) ?? 0;
  const competitiveWeekDistanceKm = competitiveWeekDistanceByKey.get(currentWeekKey) ?? 0;
  const previousWeekDistanceKm = weekDistanceByKey.get(previousWeekKey) ?? 0;
  const currentWeekRunCount = weekRunCountByKey.get(currentWeekKey) ?? 0;
  const currentMonthDistanceKm = monthDistanceByKey.get(currentMonthKey) ?? 0;

  let currentWeekPoints = 0;
  let currentMonthPoints = 0;
  let totalEarnedPoints = 0;

  for (const pointEntry of runPointsById.values()) {
    totalEarnedPoints += pointEntry.earnedPoint;

    if (pointEntry.weekKey === currentWeekKey) {
      currentWeekPoints += pointEntry.earnedPoint;
    }

    if (pointEntry.monthKey === currentMonthKey) {
      currentMonthPoints += pointEntry.earnedPoint;
    }
  }

  return {
    lifetimeDistanceKm,
    distanceLevel,
    minimumRunDistanceKm,
    latestRun,
    currentStreakDays,
    competitiveLifetimeDistanceKm,
    competitiveDistanceLevel,
    currentWeekDistanceKm: toFixed1(currentWeekDistanceKm),
    competitiveWeekDistanceKm: toFixed1(competitiveWeekDistanceKm),
    previousWeekDistanceKm: toFixed1(previousWeekDistanceKm),
    currentWeekRunCount,
    currentWeekPoints,
    currentMonthDistanceKm: toFixed1(currentMonthDistanceKm),
    currentMonthPoints,
    totalEarnedPoints,
    runPointsById,
  };
}

export function getRunPointValue(metrics, runId) {
  return metrics.runPointsById.get(runId)?.earnedPoint ?? 0;
}

export function getRunPointBreakdown(metrics, runId) {
  const pointEntry = metrics.runPointsById.get(runId);

  if (!pointEntry) {
    return {
      levelPoints: 0,
      streakPoints: 0,
      growthPoints: 0,
      matchBonusPoints: 0,
      totalPoints: 0,
    };
  }

  return {
    levelPoints: pointEntry.levelPoints ?? 0,
    streakPoints: pointEntry.streakPoints ?? 0,
    growthPoints: pointEntry.growthPoints ?? 0,
    matchBonusPoints: pointEntry.matchBonusPoints ?? 0,
    totalPoints: pointEntry.earnedPoint ?? 0,
  };
}

export function getAvailableRewardPoints(metrics, redeemedPointCost = 0) {
  return Math.max(0, metrics.totalEarnedPoints - redeemedPointCost);
}

export function parsePaceToMinutes(pace) {
  const matched = String(pace ?? '').trim().match(/^(\d{1,2}):(\d{2})\/km$/i);

  if (!matched) {
    return null;
  }

  return Number(matched[1]) + Number(matched[2]) / 60;
}
