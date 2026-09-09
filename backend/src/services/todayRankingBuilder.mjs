import { isVehicleFlaggedRun } from '../lib/competitiveRuns.mjs';
import { roundDistanceKm } from '../lib/distancePrecision.mjs';
import { formatKstDateKey } from '../lib/kstDate.mjs';

const TODAY_RANKING_LIMIT = 50;
const VALID_TODAY_RANKING_CATEGORIES = new Set(['pace', 'distance', 'streak']);

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// distancePrecision 단일 근원 — '오늘' 보드가 8.15를 8.2로 반올림하던 자리.
function toFixed1(value) {
  return roundDistanceKm(value);
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isTodayRankingCategory(category) {
  return VALID_TODAY_RANKING_CATEGORIES.has(category);
}

export function parsePaceToSeconds(pace) {
  const matched = String(pace ?? '').trim().match(/^(\d{1,2}):(\d{2})\/km$/i);

  if (!matched) {
    return null;
  }

  return Number(matched[1]) * 60 + Number(matched[2]);
}

function formatPaceSeconds(seconds) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}/km`;
}

function formatDistanceValue(distanceKm) {
  return `${toFixed1(distanceKm)}km`;
}

function buildBaseEntry(user, currentUserId) {
  return {
    userId: user.id,
    name: normalizeOptionalString(user.name) || '러너',
    tag: normalizeOptionalString(user.publicTag) || '#----',
    isCurrentUser: user.id === currentUserId,
  };
}

function rankEntries(entries, compare) {
  return [...entries]
    .sort(compare)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

function limitEntriesWithCurrentUser(rankedEntries, currentUserId) {
  const limited = rankedEntries.slice(0, TODAY_RANKING_LIMIT);
  const currentUserEntry = rankedEntries.find((entry) => entry.userId === currentUserId);

  if (
    currentUserEntry
    && !limited.some((entry) => entry.userId === currentUserId)
  ) {
    return [...limited, currentUserEntry];
  }

  return limited;
}

function buildPaceEntries({ users, runsByUserId, todayKey, currentUserId }) {
  const entries = [];

  for (const user of users) {
    const todayRuns = (runsByUserId.get(user.id) ?? [])
      .filter((run) => run.date === todayKey);
    const bestPaceSeconds = todayRuns
      .map((run) => parsePaceToSeconds(run.pace))
      .filter((seconds) => seconds !== null)
      .sort((left, right) => left - right)[0] ?? null;

    if (bestPaceSeconds === null) {
      continue;
    }

    entries.push({
      ...buildBaseEntry(user, currentUserId),
      value: formatPaceSeconds(bestPaceSeconds),
      valueNumber: bestPaceSeconds,
    });
  }

  return rankEntries(entries, (left, right) => {
    if (left.valueNumber !== right.valueNumber) {
      return left.valueNumber - right.valueNumber;
    }

    return left.name.localeCompare(right.name, 'ko');
  });
}

function buildDistanceEntries({ users, runsByUserId, todayKey, currentUserId }) {
  const entries = [];

  for (const user of users) {
    const totalDistanceKm = toFixed1((runsByUserId.get(user.id) ?? [])
      .filter((run) => run.date === todayKey)
      .reduce((sum, run) => sum + Number(run.distanceKm || 0), 0));

    if (totalDistanceKm <= 0) {
      continue;
    }

    entries.push({
      ...buildBaseEntry(user, currentUserId),
      value: formatDistanceValue(totalDistanceKm),
      valueNumber: totalDistanceKm,
    });
  }

  return rankEntries(entries, (left, right) => {
    if (right.valueNumber !== left.valueNumber) {
      return right.valueNumber - left.valueNumber;
    }

    return left.name.localeCompare(right.name, 'ko');
  });
}

function buildStreakEntries({ users, currentUserId, getMetricsForUser }) {
  const entries = [];

  for (const user of users) {
    // 홈 '연속 기록' 카드와 같은 표시용 스트릭(전체 러닝 기준).
    const streakDays = Number(getMetricsForUser(user.id)?.currentStreakDays ?? 0);

    if (!Number.isFinite(streakDays) || streakDays <= 0) {
      continue;
    }

    entries.push({
      ...buildBaseEntry(user, currentUserId),
      value: `${streakDays}일`,
      valueNumber: streakDays,
    });
  }

  return rankEntries(entries, (left, right) => {
    if (right.valueNumber !== left.valueNumber) {
      return right.valueNumber - left.valueNumber;
    }

    return left.name.localeCompare(right.name, 'ko');
  });
}

export function buildTodayRanking({
  category,
  currentUserId,
  buildUserMetrics,
  rankedAt = new Date(),
  runsByUserId,
  users,
}) {
  if (!isTodayRankingCategory(category)) {
    throw new Error(`Unsupported today ranking category: ${category}`);
  }

  if (typeof buildUserMetrics !== 'function') {
    throw new Error('buildTodayRanking requires a buildUserMetrics function.');
  }

  const rankedAtDate = rankedAt instanceof Date ? rankedAt : new Date(rankedAt);
  const safeRankedAt = Number.isNaN(rankedAtDate.getTime()) ? new Date() : rankedAtDate;
  // run.date strings are KST calendar days — anchor "today" on the same
  // calendar, not the server's local (UTC) date, or the board serves
  // yesterday's runs between 00:00 and 09:00 KST.
  const todayKey = formatKstDateKey(safeRankedAt);

  // 표시 기준 (오너 2026-07-31): 보여주고 줄 세우는 값은 전체 러닝 — 타앱에서 가져온
  // 기록도 포함한다. 친구 보드·지역 보드·홈 기록 카드와 같은 숫자여야 한다 (예전엔 이
  // 보드만 경쟁 러닝으로 집계해 같은 날 거리가 3km/14km로 갈렸다).
  // 포인트/LP/매치메이킹은 여전히 경쟁 러닝 전용 — 이 보드는 순수 표시면이다.
  //
  // 단 하나의 예외 (오너 2026-09-09): 서버가 차량 판정한 기록(integrity 'vehicle')은
  // 빠진다 — 차량 속도 기록이 판정을 받고도 이 보드 1위였다. 임포트는 그대로
  // 포함이고, 걸러내는 건 오직 차량 판정뿐이다. points.mjs가 같은 게이트를 쓰므로
  // 스트릭 열(getMetricsForUser)도 자동으로 일치한다.
  const boardRunsByUserId = new Map();

  for (const [userId, runs] of runsByUserId.entries()) {
    boardRunsByUserId.set(userId, (runs ?? []).filter((run) => !isVehicleFlaggedRun(run)));
  }

  const metricsByUserId = new Map();
  const getMetricsForUser = (userId) => {
    if (!metricsByUserId.has(userId)) {
      metricsByUserId.set(
        userId,
        // Pass the ranking's reference time so the streak (and week windows) are
        // computed against rankedAt, not whenever this runs — deterministic + correct.
        buildUserMetrics(boardRunsByUserId.get(userId) ?? [], safeRankedAt),
      );
    }

    return metricsByUserId.get(userId);
  };

  const rankedEntries = category === 'pace'
    ? buildPaceEntries({ users, runsByUserId: boardRunsByUserId, todayKey, currentUserId })
    : category === 'distance'
      ? buildDistanceEntries({ users, runsByUserId: boardRunsByUserId, todayKey, currentUserId })
      : buildStreakEntries({ users, currentUserId, getMetricsForUser });

  return {
    category,
    rankedAt: safeRankedAt.toISOString(),
    entries: limitEntriesWithCurrentUser(rankedEntries, currentUserId),
    totalCount: rankedEntries.length,
  };
}
