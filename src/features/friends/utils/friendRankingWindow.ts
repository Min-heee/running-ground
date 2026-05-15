import type { FriendRank } from '@/domain';

export type FriendRankingWindow = 'today' | 'week' | 'month';

export function getFriendRankingWindowLabel(rankingWindow: FriendRankingWindow) {
  return rankingWindow === 'today' ? '오늘' : rankingWindow === 'month' ? '이번 달' : '이번 주';
}

export function buildFriendRankingWindowRanks(
  ranks: FriendRank[],
  rankingWindow: FriendRankingWindow,
): FriendRank[] {
  const sortedRanks = [...ranks].sort((left, right) => left.rank - right.rank);
  const transformed = sortedRanks.map((runner, index) => {
    if (rankingWindow === 'today') {
      return {
        ...runner,
        distanceKm: Number((runner.distanceKm / 7 + (sortedRanks.length - index) * 0.2).toFixed(1)),
        points: Math.max(1, Math.round(runner.points / 7 + (sortedRanks.length - index))),
      };
    }

    if (rankingWindow === 'month') {
      return {
        ...runner,
        distanceKm: Number((runner.distanceKm * 4.2).toFixed(1)),
        points: Math.round(runner.points * 4.1),
      };
    }

    return runner;
  });

  return transformed
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
