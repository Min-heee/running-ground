import { findRegionPathForUser, normalizeRegionChildren } from './regionTreeHelpers.mjs';
import {
  buildRegionLiveStatsIndex,
  decorateRegionNodeWithLiveStats,
  regionAncestorsFromPath,
} from './regionLiveStats.mjs';
import { getUserMetrics } from './userStoreHelpers.mjs';

export function compareFriendRank(store, left, right) {
  const leftMetrics = getUserMetrics(store, left.id);
  const rightMetrics = getUserMetrics(store, right.id);
  const leftDistanceKm = leftMetrics.currentWeekDistanceKm;
  const rightDistanceKm = rightMetrics.currentWeekDistanceKm;

  if (rightDistanceKm !== leftDistanceKm) {
    return rightDistanceKm - leftDistanceKm;
  }

  const leftPoints = leftMetrics.currentWeekPoints;
  const rightPoints = rightMetrics.currentWeekPoints;

  if (rightPoints !== leftPoints) {
    return rightPoints - leftPoints;
  }

  return left.name.localeCompare(right.name, 'ko');
}

export function getDistrictBattle(store, user) {
  const path = findRegionPathForUser(store.regionTree, user);
  const rawNode = path[path.length - 1] ?? null;
  const parentNode = path[path.length - 2] ?? null;

  if (!rawNode) {
    return {
      averageDistancePerMember: 0,
      totalDistanceKm: 0,
      participationRate: 0,
      districtRank: 1,
      homeDistrictRank: 1,
    };
  }

  // 트리의 시드 통계는 박제 값 — 유저 러닝(이번 주 경쟁 거리)에서 실시간 계산 (지역 보드와 동일 기준).
  const statsIndex = buildRegionLiveStatsIndex(store, getUserMetrics);
  const siblingAncestors = regionAncestorsFromPath(path.slice(0, -1));
  const decoratedSiblings = (parentNode ? parentNode.children ?? [] : [rawNode])
    .map((entry) => decorateRegionNodeWithLiveStats(entry, siblingAncestors, statsIndex));
  const normalizedSiblings = normalizeRegionChildren(decoratedSiblings);
  const currentNode = normalizedSiblings.find((entry) => entry.id === rawNode.id)
    ?? decorateRegionNodeWithLiveStats(rawNode, siblingAncestors, statsIndex);

  return {
    averageDistancePerMember: currentNode.averageDistanceKm,
    totalDistanceKm: currentNode.totalDistanceKm,
    participationRate: currentNode.participationRate,
    districtRank: currentNode.rank ?? 1,
    homeDistrictRank: currentNode.rank ?? 1,
  };
}
