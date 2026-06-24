import {
  buildTodayRanking,
  isTodayRankingCategory,
} from '../services/todayRankingBuilder.mjs';
import { buildUserRunMetrics } from '../points.mjs';
import { ensureUserRankState } from '../lib/userStoreHelpers.mjs';
import { LP_PER_TIER, RANK_TIERS } from '../lib/rankSystem.mjs';

// The region drill is capped at three levels (country -> province -> city).
// Any node at the city level (시/군) is treated as a leaf, so its sub-regions
// (구/읍/면) never surface as children and the breadcrumb never goes deeper.
const REGION_LEAF_LEVELS = new Set(['city', 'district']);

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRegionLeafLevel(level) {
  return REGION_LEAF_LEVELS.has(level);
}

function getUserRankScore(user) {
  const rankState = ensureUserRankState(user);
  const tierIndex = Math.max(0, RANK_TIERS.indexOf(rankState.tier));
  return tierIndex * LP_PER_TIER + rankState.lp;
}

function buildRunsByUserId(store, users) {
  const runsByUserId = new Map(users.map((user) => [user.id, []]));

  for (const run of store.runs ?? []) {
    if (runsByUserId.has(run.userId)) {
      runsByUserId.set(run.userId, [...(runsByUserId.get(run.userId) ?? []), run]);
    }
  }

  return runsByUserId;
}

function buildUserRegionKey(user) {
  return [
    normalizeOptionalString(user.provinceName),
    normalizeOptionalString(user.cityName),
    normalizeOptionalString(user.districtName),
  ].filter(Boolean).join(' > ');
}

// Region key that stops at the city level. Everyone in the same 시/군 rolls up
// together regardless of their stored 구/동, so a city leaf node aggregates all
// of its district members.
function buildUserCityRegionKey(user) {
  return [
    normalizeOptionalString(user.provinceName),
    normalizeOptionalString(user.cityName),
  ].filter(Boolean).join(' > ');
}

function buildDistrictRank(store, user, rank, currentUserId, getUserMetrics) {
  const metrics = getUserMetrics(store, user.id);

  return {
    id: user.id,
    rank,
    name: user.name,
    distanceKm: metrics.currentWeekDistanceKm,
    points: metrics.currentWeekPoints,
    rankScore: getUserRankScore(user),
    monthlyDistanceKm: metrics.currentMonthDistanceKm,
    ...(user.id === currentUserId ? { isMe: true } : {}),
  };
}

function compareDistrictRank(store, left, right, getUserMetrics) {
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

function normalizeRegionChildren(children) {
  return [...children]
    .sort((left, right) => {
      if (right.averageDistanceKm !== left.averageDistanceKm) {
        return right.averageDistanceKm - left.averageDistanceKm;
      }

      if (right.totalDistanceKm !== left.totalDistanceKm) {
        return right.totalDistanceKm - left.totalDistanceKm;
      }

      if (right.participants !== left.participants) {
        return right.participants - left.participants;
      }

      return left.name.localeCompare(right.name, 'ko');
    })
    .map((child, index) => ({
      ...child,
      rank: index + 1,
    }));
}

function findRegionPath(node, targetId) {
  if (node.id === targetId) {
    return [node];
  }

  for (const child of node.children ?? []) {
    const childPath = findRegionPath(child, targetId);

    if (childPath) {
      return [node, ...childPath];
    }
  }

  return null;
}

// Resolve which region a district-personal listing should target. When a nodeId
// is provided we drill to that node in the region tree and aggregate everyone in
// the same 시/군 (city-level rollup). Without a nodeId we fall back to the
// requesting user's own region.
function resolveDistrictPersonalRegion(store, user, nodeId) {
  if (nodeId) {
    const path = findRegionPath(store.regionTree, nodeId);
    const targetNode = path?.[path.length - 1] ?? null;

    if (targetNode) {
      const provinceNode = path.find((entry) => entry.level === 'province') ?? null;
      const cityNode = path.find((entry) => entry.level === 'city') ?? null;
      const provinceName = normalizeOptionalString(provinceNode?.name);
      const cityName = normalizeOptionalString(cityNode?.name);

      // A city node (or anything under it) aggregates by 시/군: match province +
      // city and ignore the stored 구/동.
      if (cityName) {
        const regionKey = [provinceName, cityName].filter(Boolean).join(' > ');

        return {
          regionName: cityNode.name,
          matchesUser: (entry) => buildUserCityRegionKey(entry) === regionKey,
        };
      }

      // A province-level node aggregates the whole province.
      if (targetNode.level === 'province') {
        return {
          regionName: targetNode.name,
          matchesUser: (entry) => normalizeOptionalString(entry.provinceName) === provinceName,
        };
      }
    }
  }

  const currentRegionKey = buildUserRegionKey(user);

  return {
    regionName: user.districtName,
    matchesUser: (entry) => buildUserRegionKey(entry) === currentRegionKey,
  };
}

function buildDistrictPersonal(store, user, getUserMetrics, nodeId) {
  const { regionName, matchesUser } = resolveDistrictPersonalRegion(store, user, nodeId);
  const districtUsers = store.users
    .filter((entry) => matchesUser(entry))
    .sort((left, right) => compareDistrictRank(store, left, right, getUserMetrics))
    .map((entry, index) => buildDistrictRank(store, entry, index + 1, user.id, getUserMetrics));

  const myRank = districtUsers.find((entry) => entry.id === user.id) ?? null;
  const myRankIndex = myRank ? districtUsers.findIndex((entry) => entry.id === user.id) : -1;
  const focusStart = Math.max(0, myRankIndex - 1);
  const focusRanks = myRankIndex >= 0 ? districtUsers.slice(focusStart, focusStart + 4) : districtUsers.slice(0, 4);
  const myMetrics = getUserMetrics(store, user.id);

  return {
    districtName: regionName,
    myRank,
    myPoints: myMetrics.currentWeekPoints,
    weeklyDistanceKm: myMetrics.currentWeekDistanceKm,
    focusRanks,
    ranks: districtUsers,
  };
}

// Cap the drill path at the city level. If a deeper node is targeted we trim the
// path back to its city ancestor so the breadcrumb never exceeds three levels.
function capRegionPathDepth(path) {
  const leafIndex = path.findIndex((node) => isRegionLeafLevel(node.level));

  if (leafIndex === -1) {
    return path;
  }

  return path.slice(0, leafIndex + 1);
}

function buildRegionLeague(store, nodeId, createError) {
  const rootNode = store.regionTree;
  const rawPath = nodeId ? findRegionPath(rootNode, nodeId) : [rootNode];

  if (!rawPath) {
    throw createError(404, '선택한 지역 정보를 찾을 수 없어.');
  }

  const path = capRegionPathDepth(rawPath);
  const rawCurrentNode = path[path.length - 1];
  const parentNode = path[path.length - 2] ?? null;
  const normalizedSiblings = parentNode ? normalizeRegionChildren(parentNode.children ?? []) : [rawCurrentNode];
  const currentNode = normalizedSiblings.find((child) => child.id === rawCurrentNode.id) ?? rawCurrentNode;
  // City (시/군) nodes are leaves: never expose their 구/동 children so the drill
  // stops at three levels and the city's whole member ranking is shown instead.
  const children = isRegionLeafLevel(currentNode.level)
    ? []
    : normalizeRegionChildren(currentNode.children ?? []);

  return {
    currentNode,
    breadcrumb: path.map(({ id, name, level }) => ({ id, name, level })),
    children,
  };
}

function requireTodayRankingCategory(category, createError) {
  if (!isTodayRankingCategory(category)) {
    throw createError(400, '오늘의 랭킹 카테고리가 올바르지 않아.');
  }

  return category;
}

export function createJsonLeagueRepository({
  loadStore,
  requireUserByToken,
  getUserMetrics,
  createError,
}) {
  return {
    async getDistrictPersonal({ token, nodeId }) {
      const store = await loadStore();
      const user = requireUserByToken(store, token);
      return buildDistrictPersonal(store, user, getUserMetrics, nodeId);
    },

    async getRegions({ token, nodeId }) {
      const store = await loadStore();
      requireUserByToken(store, token);
      return buildRegionLeague(store, nodeId, createError);
    },

    async getTodayRankings({ token, category }) {
      const store = await loadStore();
      const user = requireUserByToken(store, token);
      const safeCategory = requireTodayRankingCategory(category, createError);
      const users = store.users ?? [];
      const runsByUserId = buildRunsByUserId(store, users);

      return buildTodayRanking({
        category: safeCategory,
        currentUserId: user.id,
        buildUserMetrics: buildUserRunMetrics,
        runsByUserId,
        users,
      });
    },
  };
}
