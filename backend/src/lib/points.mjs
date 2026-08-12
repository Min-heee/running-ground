import { isCompetitiveRun } from './competitiveRuns.mjs';
import { formatKstDateKey } from './kstDate.mjs';

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

export function getMatchBonusPoints(run) {
  const matchResult = run?.matchResult;

  if (!matchResult || typeof matchResult !== 'object') {
    return 0;
  }

  // 파티런 조기 종료 파밍 차단 (오너 2026-08-06): 목표 거리를 채우지 못한 파티런은
  // 대결 보너스 0 — 친구끼리 기권↔대결종료 반복으로 +20P를 무한 수확하던 구멍.
  // 목표를 모르는 옛 기록은 기존대로 지급(소급 몰수 없음). 매칭(official)은 모르는
  // 상대와 주작이 불가능하므로 기권승·조기 종료여도 정상 지급한다.
  if (matchResult.source === 'party') {
    const goalKm = matchResult.matchGoalDistanceKm;

    if (Number.isFinite(goalKm) && goalKm > 0 && (Number(run?.distanceKm) || 0) + 0.05 < goalKm) {
      return 0;
    }
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
  // POINTS 정책 (오너 2026-07-30 개정): 거리 레벨 사다리는 임포트 러닝 거리도
  // 포함해 오른다 — 타앱과 병행 측정하는 유저의 게이지가 반토막 나는 혼란이 커서.
  // 나머지 격자(매치 보너스, 스트릭, 주간 성장, chase)는 여전히 경쟁 러닝 전용:
  // 손으로 입력 가능한 헬스 임포트가 대결·연속성 보너스를 파밍하는 건 계속 차단.
  // 차량 판정(integrity.verdict === 'vehicle') 러닝은 어떤 사다리에도 안 오른다.
  const competitiveWeekRunsByKey = new Map();
  const competitiveMonthDistanceByKey = new Map();
  const competitiveDistanceByDate = new Map();
  const competitiveLastRunIdByDate = new Map();

  let cumulativeDistanceKm = 0;
  let competitiveCumulativeDistanceKm = 0;
  // 레벨 사다리 전용 누적 — 임포트 포함, 차량 판정만 제외.
  let ladderDistanceKm = 0;
  let latestRun = null;

  for (const run of sortedRuns) {
    cumulativeDistanceKm = toFixed1(cumulativeDistanceKm + run.distanceKm);

    const runDate = parseRunDate(run.date);
    const weekKey = getWeekKey(runDate);
    const monthKey = getMonthKey(runDate);

    // 거리 레벨 사다리 (오너 2026-07-30): 임포트 러닝도 오른다. 차량 판정만 제외.
    let levelPoints = 0;

    if (run.integrity?.verdict !== 'vehicle') {
      const beforeLevel = Math.floor(ladderDistanceKm / 10);
      ladderDistanceKm = toFixed1(ladderDistanceKm + run.distanceKm);
      const afterLevel = Math.floor(ladderDistanceKm / 10);
      levelPoints = Math.max(0, afterLevel - beforeLevel) * 10;
    }

    if (isCompetitiveRun(run)) {
      competitiveCumulativeDistanceKm = toFixed1(competitiveCumulativeDistanceKm + run.distanceKm);
      const matchBonusPoints = getMatchBonusPoints(run);
      // 경찰과 도둑런 보너스 — 정산(chaseSettlement)이 run.chase.bonusPoints에 박제한 값.
      // 경쟁 러닝 가지 안에 있으므로 차량 판정/임포트 러닝은 자동으로 0.
      const chasePoints = Number.isFinite(run.chase?.bonusPoints)
        ? Math.max(0, Math.round(run.chase.bonusPoints))
        : 0;
      // 레이스 이벤트 완주 보너스(815런) — 저장 길목의 raceEventCompletion 스탬프가 박제한 값.
      // chase와 같은 파생 회계: 지급 함수 없음, 재계산이 언제나 스탬프에서 합산.
      const raceEventPoints = Number.isFinite(run.raceEvent?.bonusPoints)
        ? Math.max(0, Math.round(run.raceEvent.bonusPoints))
        : 0;

      runPointsById.set(run.id, {
        earnedPoint: levelPoints + matchBonusPoints + chasePoints + raceEventPoints,
        levelPoints,
        matchBonusPoints,
        chasePoints,
        raceEventPoints,
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
      competitiveMonthDistanceByKey.set(
        monthKey,
        toFixed1((competitiveMonthDistanceByKey.get(monthKey) ?? 0) + run.distanceKm),
      );
      competitiveDistanceByDate.set(run.date, toFixed1((competitiveDistanceByDate.get(run.date) ?? 0) + run.distanceKm));
      competitiveLastRunIdByDate.set(run.date, run.id);
    } else if (levelPoints > 0) {
      // 임포트 러닝이 레벨 문턱을 넘긴 경우 — 레벨 보너스만 발행 (매치/스트릭/성장/chase 없음).
      runPointsById.set(run.id, {
        earnedPoint: levelPoints,
        levelPoints,
        matchBonusPoints: 0,
        chasePoints: 0,
        streakPoints: 0,
        growthPoints: 0,
        weekKey,
        monthKey,
        dateKey: run.date,
      });
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

  // "Now" anchors resolve on the KST calendar: run.date strings are written in
  // Korea time on-device, but the droplet clock is UTC — server-local anchoring
  // put today/week/month one day behind between 00:00 and 09:00 KST.
  const todayKey = formatKstDateKey(currentDate);
  const kstToday = parseRunDate(todayKey);
  const currentWeekKey = getWeekKey(kstToday);
  const previousWeekKey = getDateKey(addDays(getWeekStart(kstToday), -7));
  const currentMonthKey = todayKey.slice(0, 7);
  const yesterdayKey = getDateKey(addDays(kstToday, -1));
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
  let todayPoints = 0;
  let totalEarnedPoints = 0;

  for (const pointEntry of runPointsById.values()) {
    totalEarnedPoints += pointEntry.earnedPoint;

    if (pointEntry.weekKey === currentWeekKey) {
      currentWeekPoints += pointEntry.earnedPoint;
    }

    if (pointEntry.monthKey === currentMonthKey) {
      currentMonthPoints += pointEntry.earnedPoint;
    }

    if (pointEntry.dateKey === todayKey) {
      todayPoints += pointEntry.earnedPoint;
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
    // 리더보드 표시용 오늘 거리 — 전체 러닝(가져온 기록 포함). 경쟁 전용 값은 아래에.
    todayDistanceKm: toFixed1(distanceByDate.get(todayKey) ?? 0),
    // 경쟁 전용 창별 집계 — 현재 프로덕션 표시면은 쓰지 않는다(전부 전체 거리 기준).
    // 포인트 파생과 향후 경쟁 판정용으로 계속 계산해 둔다.
    competitiveTodayDistanceKm: toFixed1(competitiveDistanceByDate.get(todayKey) ?? 0),
    competitiveMonthDistanceKm: toFixed1(competitiveMonthDistanceByKey.get(currentMonthKey) ?? 0),
    todayPoints,
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
      chasePoints: 0,
      raceEventPoints: 0,
      totalPoints: 0,
    };
  }

  return {
    levelPoints: pointEntry.levelPoints ?? 0,
    streakPoints: pointEntry.streakPoints ?? 0,
    growthPoints: pointEntry.growthPoints ?? 0,
    matchBonusPoints: pointEntry.matchBonusPoints ?? 0,
    chasePoints: pointEntry.chasePoints ?? 0,
    raceEventPoints: pointEntry.raceEventPoints ?? 0,
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
