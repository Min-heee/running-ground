import {
  buildTodayRanking,
  isTodayRankingCategory,
} from '../services/todayRankingBuilder.mjs';

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function buildDistrictRank(store, user, rank, currentUserId, getUserMetrics) {
  const metrics = getUserMetrics(store, user.id);

  return {
    id: user.id,
    rank,
    name: user.name,
    distanceKm: metrics.currentWeekDistanceKm,
    points: metrics.currentWeekPoints,
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

function buildDistrictPersonal(store, user, getUserMetrics) {
  const currentRegionKey = buildUserRegionKey(user);
  const districtUsers = store.users
    .filter((entry) => buildUserRegionKey(entry) === currentRegionKey)
    .sort((left, right) => compareDistrictRank(store, left, right, getUserMetrics))
    .map((entry, index) => buildDistrictRank(store, entry, index + 1, user.id, getUserMetrics));

  const myRank = districtUsers.find((entry) => entry.id === user.id) ?? null;
  const myRankIndex = myRank ? districtUsers.findIndex((entry) => entry.id === user.id) : -1;
  const focusStart = Math.max(0, myRankIndex - 1);
  const focusRanks = myRankIndex >= 0 ? districtUsers.slice(focusStart, focusStart + 4) : districtUsers.slice(0, 4);
  const myMetrics = getUserMetrics(store, user.id);

  return {
    districtName: user.districtName,
    myRank,
    myPoints: myMetrics.currentWeekPoints,
    weeklyDistanceKm: myMetrics.currentWeekDistanceKm,
    focusRanks,
    ranks: districtUsers,
  };
}

function buildRegionLeague(store, nodeId, createError) {
  const rootNode = store.regionTree;
  const path = nodeId ? findRegionPath(rootNode, nodeId) : [rootNode];

  if (!path) {
    throw createError(404, '선택한 지역 정보를 찾을 수 없어.');
  }

  const rawCurrentNode = path[path.length - 1];
  const parentNode = path[path.length - 2] ?? null;
  const normalizedSiblings = parentNode ? normalizeRegionChildren(parentNode.children ?? []) : [rawCurrentNode];
  const currentNode = normalizedSiblings.find((child) => child.id === rawCurrentNode.id) ?? rawCurrentNode;
  const children = normalizeRegionChildren(currentNode.children ?? []);

  return {
    currentNode,
    breadcrumb: path.map(({ id, name, level }) => ({ id, name, level })),
    children,
  };
}

function buildUniversityLeague(store, getUserMetrics) {
  const universityMap = new Map();

  for (const user of store.users) {
    const universityName = normalizeOptionalString(user.universityName);

    if (!universityName) {
      continue;
    }

    const current = universityMap.get(universityName) ?? {
      universityName,
      totalDistanceKm: 0,
      participants: 0,
    };

    current.totalDistanceKm = Number((current.totalDistanceKm + getUserMetrics(store, user.id).currentWeekDistanceKm).toFixed(1));
    current.participants += 1;
    universityMap.set(universityName, current);
  }

  const ranks = [...universityMap.values()]
    .map((entry) => ({
      ...entry,
      averageDistanceKm: Number((entry.totalDistanceKm / Math.max(entry.participants, 1)).toFixed(1)),
    }))
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

      return left.universityName.localeCompare(right.universityName, 'ko');
    })
    .map((entry, index) => ({
      rank: index + 1,
      universityName: entry.universityName,
      totalDistanceKm: Number(entry.totalDistanceKm.toFixed(1)),
      participants: entry.participants,
      averageDistanceKm: entry.averageDistanceKm,
    }));

  return { ranks };
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
    getDistrictPersonal({ token }) {
      const store = loadStore();
      const user = requireUserByToken(store, token);
      return buildDistrictPersonal(store, user, getUserMetrics);
    },

    getRegions({ token, nodeId }) {
      const store = loadStore();
      requireUserByToken(store, token);
      return buildRegionLeague(store, nodeId, createError);
    },

    getUniversities({ token }) {
      const store = loadStore();
      requireUserByToken(store, token);
      return buildUniversityLeague(store, getUserMetrics);
    },

    getTodayRankings({ token, category }) {
      const store = loadStore();
      const user = requireUserByToken(store, token);
      const safeCategory = requireTodayRankingCategory(category, createError);
      const users = store.users ?? [];
      const runsByUserId = buildRunsByUserId(store, users);

      return buildTodayRanking({
        category: safeCategory,
        currentUserId: user.id,
        getMetricsForUser: (userId) => getUserMetrics(store, userId),
        runsByUserId,
        users,
      });
    },
  };
}
