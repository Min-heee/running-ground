import { buildCompetitiveRunsByUserId } from '../lib/competitiveRuns.mjs';

const TODAY_RANKING_LIMIT = 50;
const VALID_TODAY_RANKING_CATEGORIES = new Set(['pace', 'distance', 'streak']);

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toFixed1(value) {
  return Number(value.toFixed(1));
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

function buildStreakEntries({ users, currentUserId, getCompetitiveMetricsForUser }) {
  const entries = [];

  for (const user of users) {
    const streakDays = Number(getCompetitiveMetricsForUser(user.id)?.currentStreakDays ?? 0);

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
  const todayKey = getDateKey(safeRankedAt);

  // Imported runs (Apple Health / Health Connect / NRC / Strava / Garmin / MyNB
  // and manual entries) are display-only and must never feed competitive
  // leaderboards. Narrow every user's runs to the competitive-eligible set
  // before aggregating any category, and recompute streaks from that same set
  // so an imported run can't extend a competitive streak.
  const competitiveRunsByUserId = buildCompetitiveRunsByUserId(runsByUserId);
  const competitiveMetricsByUserId = new Map();
  const getCompetitiveMetricsForUser = (userId) => {
    if (!competitiveMetricsByUserId.has(userId)) {
      competitiveMetricsByUserId.set(
        userId,
        buildUserMetrics(competitiveRunsByUserId.get(userId) ?? []),
      );
    }

    return competitiveMetricsByUserId.get(userId);
  };

  const rankedEntries = category === 'pace'
    ? buildPaceEntries({ users, runsByUserId: competitiveRunsByUserId, todayKey, currentUserId })
    : category === 'distance'
      ? buildDistanceEntries({ users, runsByUserId: competitiveRunsByUserId, todayKey, currentUserId })
      : buildStreakEntries({ users, currentUserId, getCompetitiveMetricsForUser });

  return {
    category,
    rankedAt: safeRankedAt.toISOString(),
    entries: limitEntriesWithCurrentUser(rankedEntries, currentUserId),
    totalCount: rankedEntries.length,
  };
}
