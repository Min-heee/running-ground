import type { FriendRank } from '@/domain';

export type FriendRankingWindow = 'today' | 'week' | 'month';

export function getFriendRankingWindowLabel(rankingWindow: FriendRankingWindow) {
  return rankingWindow === 'today' ? '오늘' : rankingWindow === 'month' ? '이번 달' : '이번 주';
}

// Per-window values come straight from the server's KST-anchored competitive
// aggregates (todayDistanceKm/todayPoints/monthDistanceKm/monthPoints on each
// rank entry). This used to FABRICATE today/month numbers from the week values
// (week÷7 + position bonus, week×4.2) — launch bug: the board showed 0.2km/1P
// for a user with zero runs.
//
// Fallbacks are for one transition window only (an OTA'd client talking to a
// backend that predates the fields): today shows 0 rather than an invented
// number; month falls back to the week value, its only honest lower bound.
function resolveWindowValues(runner: FriendRank, rankingWindow: FriendRankingWindow) {
  if (rankingWindow === 'today') {
    return {
      distanceKm: runner.todayDistanceKm ?? 0,
      points: runner.todayPoints ?? 0,
    };
  }

  if (rankingWindow === 'month') {
    return {
      distanceKm: runner.monthDistanceKm ?? runner.distanceKm,
      points: runner.monthPoints ?? runner.points,
    };
  }

  return {
    distanceKm: runner.distanceKm,
    points: runner.points,
  };
}

export function buildFriendRankingWindowRanks(
  ranks: FriendRank[],
  rankingWindow: FriendRankingWindow,
): FriendRank[] {
  return ranks
    .map((runner) => ({
      ...runner,
      ...resolveWindowValues(runner, rankingWindow),
    }))
    .sort((left, right) => {
      if (right.distanceKm !== left.distanceKm) {
        return right.distanceKm - left.distanceKm;
      }

      if (right.points !== left.points) {
        return right.points - left.points;
      }

      return left.name.localeCompare(right.name, 'ko');
    })
    .map((runner, index) => ({
      ...runner,
      rank: index + 1,
    }));
}
