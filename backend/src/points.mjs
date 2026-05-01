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
      return 12;
    }

    if (matchResult.resultTone === 'draw') {
      return 6;
    }

    if (matchResult.resultTone === 'lose') {
      return 3;
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
      return 15;
    }

    if (rank <= 3) {
      return 10;
    }

    if (rank <= 10) {
      return 6;
    }

    return 4;
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
  const weekRunCountByKey = new Map();
  const weekRunsByKey = new Map();
  const monthDistanceByKey = new Map();
  const lastRunIdByDate = new Map();
  const distanceByDate = new Map();

  let cumulativeDistanceKm = 0;
  let latestRun = null;

  for (const run of sortedRuns) {
    const beforeLevel = Math.floor(cumulativeDistanceKm / 10);
    cumulativeDistanceKm = toFixed1(cumulativeDistanceKm + run.distanceKm);
    const afterLevel = Math.floor(cumulativeDistanceKm / 10);
    const levelPoints = Math.max(0, afterLevel - beforeLevel) * 10;
    const matchBonusPoints = getMatchBonusPoints(run.matchResult);

    const runDate = parseRunDate(run.date);
    const weekKey = getWeekKey(runDate);
    const monthKey = getMonthKey(runDate);

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

    weekDistanceByKey.set(weekKey, toFixed1((weekDistanceByKey.get(weekKey) ?? 0) + run.distanceKm));
    monthDistanceByKey.set(monthKey, toFixed1((monthDistanceByKey.get(monthKey) ?? 0) + run.distanceKm));
    weekRunCountByKey.set(weekKey, (weekRunCountByKey.get(weekKey) ?? 0) + 1);
    weekRunsByKey.set(weekKey, [...(weekRunsByKey.get(weekKey) ?? []), run]);
    distanceByDate.set(run.date, toFixed1((distanceByDate.get(run.date) ?? 0) + run.distanceKm));
    lastRunIdByDate.set(run.date, run.id);
    latestRun = run;
  }

  const lifetimeDistanceKm = toFixed1(cumulativeDistanceKm);
  const distanceLevel = Math.floor(lifetimeDistanceKm / 10);
  const minimumRunDistanceKm = getMinimumRunDistanceForStreak(distanceLevel);

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
    const rewardPoints = getConsecutiveRewardPoints(streakDays);
    const runId = lastRunIdByDate.get(dateKey);

    streakByDate.set(dateKey, streakDays);

    if (runId) {
      const currentPoints = runPointsById.get(runId);

      if (currentPoints) {
        currentPoints.streakPoints += rewardPoints;
        currentPoints.earnedPoint += rewardPoints;
      }
    }

    previousQualifiedDate = runDate;
  }

  const sortedWeekKeys = [...weekDistanceByKey.keys()].sort((left, right) => left.localeCompare(right));

  for (const weekKey of sortedWeekKeys) {
    const previousWeekKey = getDateKey(addDays(parseRunDate(weekKey), -7));
    const currentWeekDistanceKm = weekDistanceByKey.get(weekKey) ?? 0;
    const previousWeekDistanceKm = weekDistanceByKey.get(previousWeekKey) ?? 0;

    if (currentWeekDistanceKm <= previousWeekDistanceKm || currentWeekDistanceKm <= 0) {
      continue;
    }

    const weekRuns = weekRunsByKey.get(weekKey) ?? [];
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
    currentWeekDistanceKm: toFixed1(currentWeekDistanceKm),
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
