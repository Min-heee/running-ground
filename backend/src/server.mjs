import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { loadStore, mutateStore, getStoreFilePath, resetStore } from './store.mjs';
import {
  ADMIN_TOKEN,
  APP_ENV,
  CORS_ALLOW_ANY_ORIGIN,
  CORS_ORIGINS,
  ENABLE_ADMIN_STATUS,
  ENABLE_RESET_ENDPOINT,
  HOST,
  MAX_BODY_SIZE_BYTES,
  MAX_BODY_SIZE_KB,
  PORT,
  PUBLIC_BASE_URL,
  SESSION_TTL_MS,
  getPublicBackendConfig,
} from './config.mjs';
import { buildSessionExpiry, isSessionExpired, setUserPassword, verifyPassword } from './auth.mjs';
import { buildUserRunMetrics, getAvailableRewardPoints, getRunPointValue, parsePaceToMinutes } from './points.mjs';
import { addressCatalog } from './addressCatalog.mjs';
const STARTED_AT = new Date().toISOString();
const metricsCacheByStore = new WeakMap();
const SOURCE_LABEL_BY_TYPE = {
  apple_health: 'Apple Health',
  health_connect: 'Health Connect',
  garmin: 'Garmin',
  strava: 'Strava',
  nrc: 'NRC',
  manual: 'Manual',
};

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveCorsOrigin(request) {
  const requestOrigin = typeof request.headers.origin === 'string' ? request.headers.origin.trim() : '';

  if (CORS_ALLOW_ANY_ORIGIN) {
    return '*';
  }

  if (!requestOrigin) {
    return '';
  }

  return CORS_ORIGINS.includes(requestOrigin) ? requestOrigin : '';
}

function buildCorsHeaders(request) {
  const resolvedOrigin = resolveCorsOrigin(request);
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (resolvedOrigin) {
    headers['Access-Control-Allow-Origin'] = resolvedOrigin;
  }

  return headers;
}

function applyCorsHeaders(request, response) {
  const headers = buildCorsHeaders(request);

  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value);
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  if (error instanceof ApiError) {
    sendJson(response, error.statusCode, { message: error.message });
    return;
  }

  console.error(error);
  sendJson(response, 500, { message: '서버에서 요청 처리 중 문제가 생겼어.' });
}

async function parseJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > MAX_BODY_SIZE_BYTES) {
      throw new ApiError(413, `요청 본문이 너무 커. 최대 ${MAX_BODY_SIZE_KB}KB 까지만 보낼 수 있어.`);
    }

    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, '요청 본문이 올바른 JSON 형식이 아니야.');
  }
}

function normalizeTag(tag) {
  return String(tag ?? '').trim().toUpperCase();
}

function createToken() {
  return randomBytes(24).toString('hex');
}

function nextId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function formatTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getAccessToken(request) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiError(401, '로그인이 필요해.');
  }

  return authorization.slice('Bearer '.length).trim();
}

function findUserByToken(store, token) {
  const session = store.sessions.find((entry) => entry.token === token);

  if (!session) {
    throw new ApiError(401, '세션이 만료됐어. 다시 로그인해줘.');
  }

  if (isSessionExpired(session)) {
    throw new ApiError(401, '세션이 만료됐어. 다시 로그인해줘.');
  }

  const user = store.users.find((entry) => entry.id === session.userId);

  if (!user) {
    throw new ApiError(401, '세션 사용자를 찾을 수 없어.');
  }

  return user;
}

function requireUser(store, request) {
  return findUserByToken(store, getAccessToken(request));
}

function requireAdmin(request) {
  if (!ADMIN_TOKEN) {
    throw new ApiError(404, '관리자 기능이 아직 설정되지 않았어.');
  }

  const providedToken = String(request.headers['x-admin-token'] ?? '').trim();

  if (!providedToken || providedToken !== ADMIN_TOKEN) {
    throw new ApiError(401, '관리자 토큰이 올바르지 않아.');
  }
}

function findUserById(store, userId) {
  const user = store.users.find((entry) => entry.id === userId);

  if (!user) {
    throw new ApiError(404, '사용자를 찾을 수 없어.');
  }

  return user;
}

function getRunsForUser(store, userId) {
  return store.runs
    .filter((entry) => entry.userId === userId)
    .sort((left, right) => right.date.localeCompare(left.date));
}

function getTotalDistance(runs) {
  return Number(runs.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1));
}

function getUserMetrics(store, userId) {
  let metricsByUserId = metricsCacheByStore.get(store);

  if (!metricsByUserId) {
    metricsByUserId = new Map();
    metricsCacheByStore.set(store, metricsByUserId);
  }

  if (!metricsByUserId.has(userId)) {
    metricsByUserId.set(userId, buildUserRunMetrics(getRunsForUser(store, userId)));
  }

  return metricsByUserId.get(userId);
}

function getRedeemedPointCost(store, userId) {
  const catalogByItemId = new Map((store.marketCatalog ?? []).map((item) => [item.id, item.costPoints]));

  return (store.rewardRedemptions ?? [])
    .filter((entry) => entry.userId === userId)
    .reduce((sum, entry) => sum + (catalogByItemId.get(entry.itemId) ?? 0), 0);
}

function buildProfile(store, user) {
  const metrics = getUserMetrics(store, user.id);

  return {
    name: user.name,
    ...(typeof user.provinceName === 'string' && user.provinceName ? { provinceName: user.provinceName } : {}),
    ...(typeof user.cityName === 'string' && user.cityName ? { cityName: user.cityName } : {}),
    districtName: user.districtName,
    ...(typeof user.universityName === 'string' && user.universityName ? { universityName: user.universityName } : {}),
    ...(typeof user.addressDetail === 'string' && user.addressDetail ? { addressDetail: user.addressDetail } : {}),
    publicTag: user.publicTag,
    lifetimeDistanceKm: metrics.lifetimeDistanceKm,
  };
}

function buildNotificationSettings(user) {
  return clone(user.notificationSettings ?? {
    friendAlerts: true,
    districtAlerts: true,
    marketAlerts: false,
  });
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function ensureIntegrationImports(store) {
  if (!Array.isArray(store.integrationImports)) {
    store.integrationImports = [];
  }

  return store.integrationImports;
}

function isSyncableSourceType(sourceType) {
  return sourceType !== 'manual';
}

function getSourceDisplayName(user, sourceType) {
  return user.connectedSources.find((entry) => entry.sourceType === sourceType)?.displayName ?? SOURCE_LABEL_BY_TYPE[sourceType] ?? sourceType;
}

function inferSourceTypeFromLabel(label) {
  const normalizedLabel = normalizeOptionalString(label).toLowerCase();

  return Object.entries(SOURCE_LABEL_BY_TYPE).find(([, displayName]) => displayName.toLowerCase() === normalizedLabel)?.[0] ?? null;
}

function getRunSourceType(run) {
  return normalizeOptionalString(run.sourceType) || inferSourceTypeFromLabel(run.source);
}

function buildRunExternalKey(input) {
  const sourceType = normalizeOptionalString(input.sourceType);
  const externalId = normalizeOptionalString(input.externalId);

  if (!sourceType || !externalId) {
    return null;
  }

  return `${sourceType}::${externalId}`;
}

function buildRunFingerprint(input) {
  const sourceType = normalizeOptionalString(input.sourceType);
  return [
    sourceType || 'unknown',
    validateRequiredString(input.date, '날짜를 입력해줘.'),
    Number(validateDistanceKm(input.distanceKm, '거리를 입력해줘.').toFixed(1)).toFixed(1),
    validatePace(input.pace, '페이스를 입력해줘.'),
  ].join('::');
}

function getPendingImportCount(store, userId, sourceType) {
  return ensureIntegrationImports(store)
    .filter((entry) => entry.userId === userId && entry.sourceType === sourceType)
    .length;
}

function decorateIntegrationSource(store, user, source) {
  const pendingImportCount = getPendingImportCount(store, user.id, source.sourceType);
  return {
    ...clone(source),
    ...(pendingImportCount > 0 ? { pendingImportCount } : {}),
  };
}

function buildIntegrationSources(store, user) {
  return user.connectedSources.map((source) => decorateIntegrationSource(store, user, source));
}

function buildUserRegionKey(user) {
  return [
    normalizeOptionalString(user.provinceName),
    normalizeOptionalString(user.cityName),
    normalizeOptionalString(user.districtName),
  ].filter(Boolean).join(' > ');
}

function buildRegionCatalog() {
  return {
    regions: clone(addressCatalog),
  };
}

function buildUniversityCatalog(store) {
  const universities = [...new Set(
    store.users
      .map((user) => normalizeOptionalString(user.universityName))
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, 'ko'));

  return { universities };
}

function buildIntegrationSourceActionResult(store, user, source) {
  return {
    success: true,
    source: decorateIntegrationSource(store, user, source),
    sources: buildIntegrationSources(store, user),
  };
}

function buildMarketOverview(store, user) {
  if (!Array.isArray(store.marketCatalog)) {
    store.marketCatalog = [];
  }

  if (!Array.isArray(store.rewardRedemptions)) {
    store.rewardRedemptions = [];
  }

  const metrics = getUserMetrics(store, user.id);
  const currentPoints = getAvailableRewardPoints(metrics, getRedeemedPointCost(store, user.id));

  const redeemedItemIds = new Set(
    store.rewardRedemptions
      .filter((entry) => entry.userId === user.id)
      .map((entry) => entry.itemId),
  );

  const items = store.marketCatalog.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    description: item.description,
    costPoints: item.costPoints,
    ...(item.partnerName ? { partnerName: item.partnerName } : {}),
    repeatable: item.repeatable,
    claimState: redeemedItemIds.has(item.id)
      ? 'claimed'
      : currentPoints >= item.costPoints
        ? 'claimable'
        : 'locked',
  }));

  return {
    currentPoints,
    totalRedeemedCount: store.rewardRedemptions.filter((entry) => entry.userId === user.id).length,
    items,
  };
}

function buildFriendRank(store, user, rank) {
  const metrics = getUserMetrics(store, user.id);

  return {
    id: user.id,
    rank,
    name: user.name,
    tag: user.publicTag,
    distanceKm: metrics.currentWeekDistanceKm,
    points: metrics.currentWeekPoints,
  };
}

function buildDistrictRank(store, user, rank, currentUserId) {
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

function compareFriendRank(store, left, right) {
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

function compareDistrictRank(store, left, right) {
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

function getFriendIds(store, userId) {
  return store.friendships.flatMap((friendship) => {
    if (friendship.userIds[0] === userId) {
      return [friendship.userIds[1]];
    }

    if (friendship.userIds[1] === userId) {
      return [friendship.userIds[0]];
    }

    return [];
  });
}

function areFriends(store, leftUserId, rightUserId) {
  return store.friendships.some((entry) => (
    entry.userIds.includes(leftUserId) && entry.userIds.includes(rightUserId)
  ));
}

function requireFriendAccess(store, currentUserId, friendId) {
  if (currentUserId === friendId || areFriends(store, currentUserId, friendId)) {
    return;
  }

  throw new ApiError(403, '친구로 연결된 사용자 기록만 볼 수 있어.');
}

function getActionableRequests(store, currentUserId) {
  return store.friendRequests
    .filter((request) => request.status === 'pending')
    .filter((request) => request.requesterId === currentUserId || request.receiverId === currentUserId)
    .map((request) => {
      const otherUserId = request.requesterId === currentUserId ? request.receiverId : request.requesterId;
      const otherUser = findUserById(store, otherUserId);

      return {
        id: request.id,
        name: otherUser.name,
        tag: otherUser.publicTag,
        status: request.requesterId === currentUserId ? 'pending' : 'received',
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'ko'));
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

function findRegionPathForUser(node, user) {
  const provinceName = typeof user.provinceName === 'string' ? user.provinceName.trim() : '';
  const cityName = typeof user.cityName === 'string' ? user.cityName.trim() : '';
  const districtName = typeof user.districtName === 'string' ? user.districtName.trim() : '';

  if (!provinceName) {
    return [node];
  }

  const provinceNode = (node.children ?? []).find((entry) => entry.name === provinceName);

  if (!provinceNode) {
    return [node];
  }

  const path = [node, provinceNode];
  let currentNode = provinceNode;

  if (cityName) {
    const cityNode = (currentNode.children ?? []).find((entry) => entry.name === cityName);

    if (cityNode) {
      path.push(cityNode);
      currentNode = cityNode;
    }
  }

  if (districtName && currentNode.children?.length) {
    const districtNode = currentNode.children.find((entry) => entry.name === districtName);

    if (districtNode) {
      path.push(districtNode);
    }
  }

  return path;
}

function getDistrictBattle(store, user) {
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

  const normalizedSiblings = parentNode ? normalizeRegionChildren(parentNode.children ?? []) : [rawNode];
  const currentNode = normalizedSiblings.find((entry) => entry.id === rawNode.id) ?? rawNode;

  return {
    averageDistancePerMember: currentNode.averageDistanceKm,
    totalDistanceKm: currentNode.totalDistanceKm,
    participationRate: currentNode.participationRate,
    districtRank: currentNode.rank ?? 1,
    homeDistrictRank: currentNode.rank ?? 1,
  };
}

function buildHomeSummary(store, user) {
  const metrics = getUserMetrics(store, user.id);
  const latestRun = metrics.latestRun;
  const friendUsers = getFriendIds(store, user.id)
    .map((friendId) => findUserById(store, friendId))
    .sort((left, right) => compareFriendRank(store, left, right));
  const closestFriend = friendUsers[0] ?? null;
  const districtBattle = getDistrictBattle(store, user);
  const closestFriendMetrics = closestFriend ? getUserMetrics(store, closestFriend.id) : null;

  return {
    totalDistanceKm: metrics.currentWeekDistanceKm,
    totalRuns: metrics.currentWeekRunCount,
    goalAchievementRate: Math.min(100, Math.round((metrics.currentWeekDistanceKm / 50) * 100)),
    previousWeekDistanceKm: metrics.previousWeekDistanceKm,
    streakDays: metrics.currentStreakDays,
    latestRun: latestRun
      ? {
        distanceKm: latestRun.distanceKm,
        source: latestRun.source,
      }
      : {
        distanceKm: 0,
        source: 'Manual',
      },
    friendName: closestFriend?.name ?? '친구를 추가해봐',
    friendGapKm: closestFriendMetrics ? Number(Math.abs(closestFriendMetrics.currentWeekDistanceKm - metrics.currentWeekDistanceKm).toFixed(1)) : 0,
    districtName: user.districtName,
    districtRank: districtBattle.homeDistrictRank,
    districtPoints: metrics.currentWeekPoints,
    districtBattle: {
      myDistrict: user.districtName,
      averageDistancePerMember: districtBattle.averageDistancePerMember,
      totalDistanceKm: districtBattle.totalDistanceKm,
      participationRate: districtBattle.participationRate,
      districtRank: districtBattle.districtRank,
    },
  };
}

function buildMyActivity(store, user) {
  const runs = getRunsForUser(store, user.id);
  const metrics = getUserMetrics(store, user.id);

  return {
    runs: runs.map((run) => ({
      id: run.id,
      date: run.date,
      distanceKm: run.distanceKm,
      pace: run.pace,
      source: run.source,
    })),
    monthlyDistanceKm: metrics.currentMonthDistanceKm,
    monthlyPoints: metrics.currentMonthPoints,
  };
}

function buildFriendLeaderboard(store, user) {
  const relatedUserIds = [...new Set([user.id, ...getFriendIds(store, user.id)])];

  const currentAndFriends = relatedUserIds
    .map((userId) => findUserById(store, userId))
    .sort((left, right) => compareFriendRank(store, left, right))
    .map((entry, index) => buildFriendRank(store, entry, index + 1));

  return {
    ranks: currentAndFriends,
    requests: getActionableRequests(store, user.id),
  };
}

function buildDistrictPersonal(store, user) {
  const currentRegionKey = buildUserRegionKey(user);
  const districtUsers = store.users
    .filter((entry) => buildUserRegionKey(entry) === currentRegionKey)
    .sort((left, right) => compareDistrictRank(store, left, right))
    .map((entry, index) => buildDistrictRank(store, entry, index + 1, user.id));

  const myRank = districtUsers.find((entry) => entry.id === user.id) ?? null;
  const myRankIndex = myRank ? districtUsers.findIndex((entry) => entry.id === user.id) : -1;
  const focusStart = Math.max(0, myRankIndex - 1);
  const focusRanks = myRankIndex >= 0 ? districtUsers.slice(focusStart, focusStart + 4) : districtUsers.slice(0, 4);

  return {
    districtName: user.districtName,
    myRank,
    myPoints: getUserMetrics(store, user.id).currentWeekPoints,
    weeklyDistanceKm: getUserMetrics(store, user.id).currentWeekDistanceKm,
    focusRanks,
    ranks: districtUsers,
  };
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

function buildRegionLeague(store, nodeId) {
  const rootNode = store.regionTree;
  const path = nodeId ? findRegionPath(rootNode, nodeId) : [rootNode];

  if (!path) {
    throw new ApiError(404, '선택한 지역 정보를 찾을 수 없어.');
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

function buildUniversityLeague(store) {
  const universityMap = new Map();

  for (const user of store.users) {
    const universityName = typeof user.universityName === 'string' ? user.universityName.trim() : '';

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

function buildAdminStatus(store) {
  return {
    status: 'ok',
    startedAt: STARTED_AT,
    uptimeSeconds: Math.round(process.uptime()),
    storeFile: getStoreFilePath(),
    config: getPublicBackendConfig(),
    counts: {
      users: store.users.length,
      runs: store.runs.length,
      integrationImports: (store.integrationImports ?? []).length,
      friendships: store.friendships.length,
      friendRequests: store.friendRequests.length,
      sessions: store.sessions.length,
      rewardRedemptions: (store.rewardRedemptions ?? []).length,
    },
  };
}

function buildFriendActivity(store, currentUserId, friendId) {
  const friend = findUserById(store, friendId);
  const runs = getRunsForUser(store, friend.id);
  const friendMetrics = getUserMetrics(store, friend.id);
  const leaderboard = buildFriendLeaderboard(store, findUserById(store, currentUserId));
  const rankedFriend = leaderboard.ranks.find((entry) => entry.id === friend.id) ?? buildFriendRank(store, friend, 1);

  return {
    friend: rankedFriend,
    runs: runs.map((run) => ({
      id: run.id,
      date: run.date,
      distanceKm: run.distanceKm,
      pace: run.pace,
    })),
    monthlyDistanceKm: friendMetrics.currentMonthDistanceKm,
    monthlyPoints: friendMetrics.currentMonthPoints,
  };
}

function buildRunDetail(run, weeklyDistanceKm, sourceOverride, metrics) {
  const paceMinutes = parsePaceToMinutes(run.pace);

  return {
    run: {
      id: run.id,
      date: run.date,
      distanceKm: run.distanceKm,
      pace: run.pace,
      source: sourceOverride ?? run.source,
    },
    weeklyDistanceKm,
    estimatedMinutes: Math.round(run.distanceKm * (paceMinutes ?? 5.5)),
    earnedPoint: getRunPointValue(metrics, run.id),
  };
}

function getRunForUser(store, userId, runId) {
  const runs = getRunsForUser(store, userId);

  if (!runs.length) {
    throw new ApiError(404, '러닝 기록이 없어.');
  }

  if (!runId) {
    return runs[0];
  }

  const run = runs.find((entry) => entry.id === runId);

  if (!run) {
    throw new ApiError(404, '러닝 기록을 찾을 수 없어.');
  }

  return run;
}

function validateRequiredString(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, message);
  }

  return value.trim();
}

function validateBoolean(value, message) {
  if (typeof value !== 'boolean') {
    throw new ApiError(400, message);
  }

  return value;
}

function resolveRegionSelection(rawProvinceName, rawCityName, rawDistrictName) {
  const provinceName = validateRequiredString(rawProvinceName, '시/도를 선택해줘.');
  const cityName = normalizeOptionalString(rawCityName);
  const districtName = validateRequiredString(rawDistrictName, '최종 지역을 선택해줘.');
  const province = addressCatalog.find((entry) => entry.name === provinceName);

  if (!province) {
    throw new ApiError(400, '시/도 선택이 올바르지 않아.');
  }

  const secondaryOptions = province.children ?? [];
  const directDistrict = secondaryOptions.find((entry) => entry.type === 'district' && entry.name === districtName);

  if (directDistrict) {
    if (cityName) {
      throw new ApiError(400, '이 지역은 시/군 선택이 필요하지 않아.');
    }

    return {
      provinceName,
      cityName: '',
      districtName: directDistrict.name,
    };
  }

  const city = secondaryOptions.find((entry) => entry.type === 'city' && entry.name === cityName);

  if (!city) {
    throw new ApiError(400, '시/군 선택이 올바르지 않아.');
  }

  const districtOptions = city.children ?? [];

  if (districtOptions.length === 0) {
    if (districtName !== city.name) {
      throw new ApiError(400, '최종 지역 선택이 올바르지 않아.');
    }

    return {
      provinceName,
      cityName: city.name,
      districtName: city.name,
    };
  }

  const district = districtOptions.find((entry) => entry.name === districtName);

  if (!district) {
    throw new ApiError(400, '최종 지역 선택이 올바르지 않아.');
  }

  return {
    provinceName,
    cityName: city.name,
    districtName: district.name,
  };
}

function validateDateOnly(value, message) {
  const date = validateRequiredString(value, message);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, '날짜는 YYYY-MM-DD 형식으로 입력해줘.');
  }

  const today = new Date().toISOString().slice(0, 10);

  if (date > today) {
    throw new ApiError(400, '미래 날짜의 기록은 아직 추가할 수 없어.');
  }

  return date;
}

function validateDistanceKm(value, message) {
  const distanceKm = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new ApiError(400, message);
  }

  if (distanceKm > 200) {
    throw new ApiError(400, '거리는 200km 이하로 입력해줘.');
  }

  return Number(distanceKm.toFixed(1));
}

function validatePace(value, message) {
  const pace = validateRequiredString(value, message);

  if (parsePaceToMinutes(pace) === null) {
    throw new ApiError(400, '페이스는 00:00/km 형식으로 입력해줘.');
  }

  return pace;
}

function normalizeImportedRun(sourceType, rawRun) {
  return {
    sourceType,
    externalId: normalizeOptionalString(rawRun.externalId),
    date: validateDateOnly(rawRun.date, '연동 기록 날짜를 입력해줘.'),
    distanceKm: validateDistanceKm(rawRun.distanceKm, '연동 기록 거리를 입력해줘.'),
    pace: validatePace(rawRun.pace, '연동 기록 페이스를 입력해줘.'),
  };
}

function requireConnectedSource(user, sourceType) {
  const source = user.connectedSources.find((entry) => entry.sourceType === sourceType);

  if (!source) {
    throw new ApiError(404, '선택한 연동 소스를 찾을 수 없어.');
  }

  return source;
}

function requireSyncableConnectedSource(user, sourceType) {
  const source = requireConnectedSource(user, sourceType);

  if (!isSyncableSourceType(sourceType)) {
    throw new ApiError(400, '수동 입력 소스는 외부 import 방식 대신 앱 안에서 직접 기록을 추가해줘.');
  }

  if (!source.connected) {
    throw new ApiError(409, '이 소스는 아직 연결되지 않았어. 먼저 연결한 뒤 기록을 가져와줘.');
  }

  return source;
}

function importPendingRunsForUser(store, user) {
  const queue = ensureIntegrationImports(store);
  const connectedSources = user.connectedSources.filter((source) => source.connected && isSyncableSourceType(source.sourceType));
  const connectedSourceTypes = new Set(connectedSources.map((source) => source.sourceType));
  const sourceDisplayNameByType = new Map(connectedSources.map((source) => [source.sourceType, source.displayName]));
  const currentQueue = [...queue];
  const pendingImports = currentQueue.filter((entry) => entry.userId === user.id && connectedSourceTypes.has(entry.sourceType));
  const existingExternalKeys = new Set();
  const existingFingerprints = new Set();
  const processedImportIds = new Set();
  const importedRunIds = [];
  const lastSyncedAt = formatTimestamp();
  let scannedRuns = 0;
  let importedRuns = 0;
  let duplicateRuns = 0;

  for (const run of store.runs.filter((entry) => entry.userId === user.id)) {
    const sourceType = getRunSourceType(run);
    const externalKey = buildRunExternalKey({
      sourceType,
      externalId: run.externalId,
    });

    if (externalKey) {
      existingExternalKeys.add(externalKey);
    }

    if (sourceType) {
      existingFingerprints.add(buildRunFingerprint({
        sourceType,
        date: run.date,
        distanceKm: run.distanceKm,
        pace: run.pace,
      }));
    }
  }

  pendingImports.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    return String(left.receivedAt).localeCompare(String(right.receivedAt));
  });

  for (const entry of pendingImports) {
    scannedRuns += 1;
    processedImportIds.add(entry.id);

    const externalKey = buildRunExternalKey(entry);
    const fingerprint = buildRunFingerprint(entry);

    if ((externalKey && existingExternalKeys.has(externalKey)) || existingFingerprints.has(fingerprint)) {
      duplicateRuns += 1;
      continue;
    }

    const run = {
      id: nextId('run'),
      userId: user.id,
      date: entry.date,
      distanceKm: entry.distanceKm,
      pace: entry.pace,
      source: sourceDisplayNameByType.get(entry.sourceType) ?? SOURCE_LABEL_BY_TYPE[entry.sourceType] ?? entry.sourceType,
      sourceType: entry.sourceType,
      ...(entry.externalId ? { externalId: entry.externalId } : {}),
      createdAt: new Date().toISOString(),
      importedAt: lastSyncedAt,
    };

    store.runs.push(run);
    importedRuns += 1;
    importedRunIds.push(run.id);

    if (externalKey) {
      existingExternalKeys.add(externalKey);
    }

    existingFingerprints.add(fingerprint);
  }

  store.integrationImports = currentQueue.filter((entry) => !processedImportIds.has(entry.id));
  user.connectedSources = user.connectedSources.map((source) => (
    source.connected && connectedSourceTypes.has(source.sourceType)
      ? {
        ...source,
        lastSyncedAt,
      }
      : source
  ));

  return {
    success: true,
    syncedSources: connectedSources.length,
    scannedRuns,
    importedRuns,
    duplicateRuns,
    syncedRuns: importedRuns,
    importedRunIds,
    lastSyncedAt,
  };
}

function createPublicTag(store) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let nextTag = '#TEMP1';

  do {
    let suffix = '';

    for (let index = 0; index < 5; index += 1) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    nextTag = `#${suffix}`;
  } while (store.users.some((entry) => entry.publicTag === nextTag));

  return nextTag;
}

function createStarterRuns(userId) {
  return [];
}

function buildUsernameAvailability(store, rawUsername) {
  const username = validateRequiredString(rawUsername, '아이디를 입력해줘.').toLowerCase();
  const available = !store.users.some((entry) => entry.username === username);

  return {
    username,
    available,
    message: available ? '사용할 수 있는 아이디예요.' : '이미 사용 중인 아이디예요.',
  };
}

function createSessionForUser(store, userId) {
  const createdAt = new Date();
  const token = createToken();
  store.sessions.push({
    token,
    userId,
    createdAt: createdAt.toISOString(),
    expiresAt: buildSessionExpiry(SESSION_TTL_MS, createdAt),
  });

  return token;
}

async function handleLogin(request, response) {
  const body = await parseJsonBody(request);
  const username = validateRequiredString(body.username, '아이디를 입력해줘.').toLowerCase();
  const password = validateRequiredString(body.password, '비밀번호를 입력해줘.');

  const result = mutateStore((store) => {
    const user = store.users.find((entry) => entry.username === username);

    if (!user || !verifyPassword(password, user.passwordHash ?? user.password)) {
      throw new ApiError(401, '아이디 또는 비밀번호가 맞지 않아.');
    }

    const accessToken = createSessionForUser(store, user.id);

    return {
      accessToken,
      user: buildProfile(store, user),
    };
  });

  sendJson(response, 200, result);
}

async function handleLogout(request, response) {
  const payload = mutateStore((store) => {
    const token = getAccessToken(request);
    const existingSessionIndex = store.sessions.findIndex((entry) => entry.token === token);

    if (existingSessionIndex >= 0) {
      store.sessions.splice(existingSessionIndex, 1);
    }

    return {
      success: true,
    };
  });

  sendJson(response, 200, payload);
}

async function handleRegister(request, response) {
  const body = await parseJsonBody(request);
  const username = validateRequiredString(body.username, '아이디를 입력해줘.').toLowerCase();
  const password = validateRequiredString(body.password, '비밀번호를 입력해줘.');
  const name = typeof body.nickname === 'string' && body.nickname.trim()
    ? body.nickname.trim()
    : validateRequiredString(body.name, '닉네임을 입력해줘.');
  const realName = typeof body.realName === 'string' && body.realName.trim()
    ? body.realName.trim()
    : validateRequiredString(body.name, '이름을 입력해줘.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해줘.').replace(/\D/g, '');
  const region = resolveRegionSelection(body.provinceName, body.cityName, body.districtName);
  const universityName = typeof body.universityName === 'string' ? body.universityName.trim() : '';
  const addressDetail = validateRequiredString(body.addressDetail, '상세 주소를 입력해줘.');
  const birthDate = validateRequiredString(body.birthDate, '생년월일을 입력해줘.');

  if (password.length < 6) {
    throw new ApiError(400, '비밀번호는 6자 이상으로 입력해줘.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해줘.');
  }

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해줘.');
  }

  const result = mutateStore((store) => {
    if (store.users.some((entry) => entry.username === username)) {
      throw new ApiError(409, '이미 사용 중인 아이디야.');
    }

    const userId = nextId('user');
    const starterRuns = createStarterRuns(userId);
    const user = {
      id: userId,
      username,
      name,
      realName,
      phone,
      birthDate,
      provinceName: region.provinceName,
      cityName: region.cityName,
      districtName: region.districtName,
      ...(universityName ? { universityName } : {}),
      addressDetail,
      publicTag: createPublicTag(store),
      friendDistanceKm: 0,
      friendPoints: 0,
      districtDistanceKm: 0,
      districtPoints: 0,
      rewardPoints: 0,
      streakDays: 0,
      connectedSources: [
        {
          sourceType: 'manual',
          displayName: 'Manual',
          connected: false,
          connectionStatus: 'planned',
          recommendedPlatform: 'all',
        },
        {
          sourceType: 'apple_health',
          displayName: 'Apple Health',
          connected: false,
          connectionStatus: 'planned',
          recommendedPlatform: 'ios',
        },
        {
          sourceType: 'health_connect',
          displayName: 'Health Connect',
          connected: false,
          connectionStatus: 'planned',
          recommendedPlatform: 'android',
        },
        {
          sourceType: 'garmin',
          displayName: 'Garmin',
          connected: false,
          connectionStatus: 'planned',
          recommendedPlatform: 'all',
        },
        {
          sourceType: 'strava',
          displayName: 'Strava',
          connected: false,
          connectionStatus: 'planned',
          recommendedPlatform: 'all',
        },
        {
          sourceType: 'nrc',
          displayName: 'NRC',
          connected: false,
          connectionStatus: 'planned',
          recommendedPlatform: 'all',
        },
      ],
      notificationSettings: {
        friendAlerts: true,
        districtAlerts: true,
        marketAlerts: false,
      },
      createdAt: new Date().toISOString(),
    };

    setUserPassword(user, password, user.createdAt);

    store.users.push(user);
    store.runs.push(...starterRuns);
    const accessToken = createSessionForUser(store, user.id);

    return {
      accessToken,
      user: buildProfile(store, user),
    };
  });

  sendJson(response, 201, result);
}

function handleMyProfile(request, response, store, user) {
  if (request.method === 'GET') {
    sendJson(response, 200, buildProfile(store, user));
    return;
  }

  if (request.method === 'PATCH') {
    sendJson(response, 200, mutateStore((nextStore) => {
      const nextUser = findUserByToken(nextStore, getAccessToken(request));
      const body = clone(request.body);
      const nextName = validateRequiredString(body.name, '닉네임을 입력해줘.');
      nextUser.name = nextName;
      return buildProfile(nextStore, nextUser);
    }));
    return;
  }

  throw new ApiError(405, '지원하지 않는 메서드야.');
}

async function handlePatchMyProfile(request, response) {
  const body = await parseJsonBody(request);

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    user.name = validateRequiredString(body.name, '닉네임을 입력해줘.');
    user.universityName = typeof body.universityName === 'string' && body.universityName.trim()
      ? body.universityName.trim()
      : undefined;
    return buildProfile(store, user);
  });

  sendJson(response, 200, payload);
}

async function handlePatchMyRegion(request, response) {
  const body = await parseJsonBody(request);

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    const region = resolveRegionSelection(body.provinceName, body.cityName, body.districtName);
    user.provinceName = region.provinceName;
    user.cityName = region.cityName;
    user.districtName = region.districtName;
    return buildProfile(store, user);
  });

  sendJson(response, 200, payload);
}

async function handlePatchMyNotifications(request, response) {
  const body = await parseJsonBody(request);

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    user.notificationSettings = {
      friendAlerts: validateBoolean(body.friendAlerts, '친구 알림 설정값이 올바르지 않아.'),
      districtAlerts: validateBoolean(body.districtAlerts, '지역 알림 설정값이 올바르지 않아.'),
      marketAlerts: validateBoolean(body.marketAlerts, '마켓 알림 설정값이 올바르지 않아.'),
    };

    return buildNotificationSettings(user);
  });

  sendJson(response, 200, payload);
}

function handleClaimMarketItem(request, response, itemId) {
  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    const item = (store.marketCatalog ?? []).find((entry) => entry.id === itemId);

    if (!item) {
      throw new ApiError(404, '교환할 리워드를 찾지 못했어.');
    }

    const alreadyClaimed = store.rewardRedemptions.some((entry) => entry.userId === user.id && entry.itemId === item.id);

    if (alreadyClaimed && !item.repeatable) {
      throw new ApiError(409, '이미 교환한 리워드야.');
    }

    if (getAvailableRewardPoints(getUserMetrics(store, user.id), getRedeemedPointCost(store, user.id)) < item.costPoints) {
      throw new ApiError(400, '포인트가 부족해서 아직 교환할 수 없어.');
    }

    store.rewardRedemptions.push({
      id: nextId('redemption'),
      userId: user.id,
      itemId: item.id,
      claimedAt: new Date().toISOString(),
    });

    return {
      success: true,
      claimedItemId: item.id,
      overview: buildMarketOverview(store, user),
    };
  });

  sendJson(response, 200, payload);
}

async function handleCreateManualRun(request, response) {
  const body = await parseJsonBody(request);

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    const run = {
      id: nextId('run'),
      userId: user.id,
      date: validateDateOnly(body.date, '러닝 날짜를 입력해줘.'),
      distanceKm: validateDistanceKm(body.distanceKm, '러닝 거리를 입력해줘.'),
      pace: validatePace(body.pace, '페이스를 입력해줘.'),
      source: 'Manual',
      sourceType: 'manual',
      createdAt: new Date().toISOString(),
    };

    store.runs.push(run);

    const manualSource = user.connectedSources.find((entry) => entry.sourceType === 'manual');

    if (manualSource) {
      manualSource.connected = true;
      manualSource.connectionStatus = 'connected';
      manualSource.lastSyncedAt = formatTimestamp();
    }

    const metrics = getUserMetrics(store, user.id);
    return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
  });

  sendJson(response, 201, payload);
}

function handleIntegrationSourceConnection(request, response, sourceType, nextConnected) {
  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    const source = requireConnectedSource(user, sourceType);

    source.connected = nextConnected;
    source.connectionStatus = nextConnected ? 'connected' : 'planned';
    source.lastSyncedAt = nextConnected ? source.lastSyncedAt : undefined;

    return buildIntegrationSourceActionResult(store, user, source);
  });

  sendJson(response, 200, payload);
}

async function handleQueueIntegrationImports(request, response, sourceType) {
  const body = await parseJsonBody(request);

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    const source = requireSyncableConnectedSource(user, sourceType);
    const rawRuns = Array.isArray(body.runs) ? body.runs : null;

    if (!rawRuns || rawRuns.length === 0) {
      throw new ApiError(400, '가져올 연동 기록 배열이 비어 있어.');
    }

    if (rawRuns.length > 500) {
      throw new ApiError(400, '한 번에 가져오는 기록은 500개 이하로 제한해줘.');
    }

    const queue = ensureIntegrationImports(store);
    const normalizedRuns = rawRuns.map((run) => normalizeImportedRun(sourceType, run));
    const receivedAt = new Date().toISOString();

    normalizedRuns.forEach((run) => {
      queue.push({
        id: nextId('import'),
        userId: user.id,
        ...run,
        receivedAt,
      });
    });

    return {
      success: true,
      source: decorateIntegrationSource(store, user, source),
      queuedRuns: normalizedRuns.length,
      pendingRuns: getPendingImportCount(store, user.id, sourceType),
    };
  });

  sendJson(response, 202, payload);
}

function handleFriendRequestCreate(request, response, body) {
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    const tag = normalizeTag(validateRequiredString(body.tag, '친구 태그를 입력해줘.'));
    const targetUser = store.users.find((entry) => entry.publicTag === tag);

    if (!targetUser) {
      throw new ApiError(404, '해당 태그의 사용자를 찾지 못했어.');
    }

    if (targetUser.id === currentUser.id) {
      throw new ApiError(400, '내 태그로는 친구 요청을 보낼 수 없어.');
    }

    if (areFriends(store, currentUser.id, targetUser.id)) {
      throw new ApiError(409, '이미 친구로 연결되어 있어.');
    }

    const existingRequest = store.friendRequests.find((entry) => (
      entry.status === 'pending'
      && (
        (entry.requesterId === currentUser.id && entry.receiverId === targetUser.id)
        || (entry.requesterId === targetUser.id && entry.receiverId === currentUser.id)
      )
    ));

    if (existingRequest) {
      throw new ApiError(409, '이미 대기 중인 친구 요청이 있어.');
    }

    const requestId = nextId('request');
    store.friendRequests.push({
      id: requestId,
      requesterId: currentUser.id,
      receiverId: targetUser.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      requestId,
      status: 'pending',
    };
  });

  sendJson(response, 201, payload);
}

function handleFriendRequestAction(request, response, requestId, action) {
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    const friendRequest = store.friendRequests.find((entry) => entry.id === requestId);

    if (!friendRequest || friendRequest.status !== 'pending') {
      throw new ApiError(404, '처리할 친구 요청을 찾을 수 없어.');
    }

    if (action === 'accept' || action === 'reject') {
      if (friendRequest.receiverId !== currentUser.id) {
        throw new ApiError(403, '받은 친구 요청만 처리할 수 있어.');
      }
    }

    if (action === 'cancel' && friendRequest.requesterId !== currentUser.id) {
      throw new ApiError(403, '내가 보낸 요청만 취소할 수 있어.');
    }

    if (action === 'accept') {
      friendRequest.status = 'accepted';

      if (!areFriends(store, friendRequest.requesterId, friendRequest.receiverId)) {
        store.friendships.push({
          id: nextId('friendship'),
          userIds: [friendRequest.requesterId, friendRequest.receiverId],
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (action === 'reject') {
      friendRequest.status = 'rejected';
    }

    if (action === 'cancel') {
      friendRequest.status = 'cancelled';
    }

    return {
      success: true,
      requestId: friendRequest.id,
      status: action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'cancelled',
    };
  });

  sendJson(response, 200, payload);
}

function buildOfflineRaceHub() {
  return {
    featuredEvent: null,
    upcomingEvents: [],
    pastEvents: [],
    guideSteps: [
      '오프라인 마라톤 일정이 열리면 여기에서 날짜별로 바로 신청할 수 있어요.',
      '지금은 일정 등록 전이라 신청 가능한 회차가 없어요.',
      '실제 운영 일정이 준비되면 시간대와 거리 선택이 함께 열릴 예정이에요.',
    ],
  };
}

async function routeRequest(request, response) {
  if (!request.url) {
    throw new ApiError(400, '요청 주소를 읽을 수 없어.');
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, {
      status: 'ok',
      ready: true,
      environment: APP_ENV,
      startedAt: STARTED_AT,
      uptimeSeconds: Math.round(process.uptime()),
      storeFile: getStoreFilePath(),
      publicBaseUrl: PUBLIC_BASE_URL || undefined,
      config: getPublicBackendConfig(),
      now: new Date().toISOString(),
    });
    return;
  }

  if (pathname === '/api/admin/status' && request.method === 'GET') {
    if (!ENABLE_ADMIN_STATUS) {
      throw new ApiError(404, '관리자 상태 확인 기능이 비활성화되어 있어.');
    }

    requireAdmin(request);
    const store = loadStore();
    sendJson(response, 200, buildAdminStatus(store));
    return;
  }

  if (pathname === '/api/admin/reset' && request.method === 'POST') {
    if (!ENABLE_RESET_ENDPOINT) {
      throw new ApiError(404, '관리자 리셋 기능이 비활성화되어 있어.');
    }

    requireAdmin(request);
    const nextStore = resetStore();
    const payload = {
      success: true,
      storeFile: getStoreFilePath(),
      now: new Date().toISOString(),
      counts: buildAdminStatus(nextStore).counts,
    };

    sendJson(response, 200, payload);
    return;
  }

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    await handleLogin(request, response);
    return;
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    await handleLogout(request, response);
    return;
  }

  if (pathname === '/api/auth/check-username' && request.method === 'GET') {
    const store = loadStore();
    sendJson(response, 200, buildUsernameAvailability(store, url.searchParams.get('username') ?? ''));
    return;
  }

  if (pathname === '/api/catalog/regions' && request.method === 'GET') {
    sendJson(response, 200, buildRegionCatalog());
    return;
  }

  if (pathname === '/api/catalog/universities' && request.method === 'GET') {
    const store = loadStore();
    sendJson(response, 200, buildUniversityCatalog(store));
    return;
  }

  if (pathname === '/api/auth/register' && request.method === 'POST') {
    await handleRegister(request, response);
    return;
  }

  if (pathname === '/api/me/profile' && request.method === 'GET') {
    const store = loadStore();
    sendJson(response, 200, buildProfile(store, requireUser(store, request)));
    return;
  }

  if (pathname === '/api/me/profile' && request.method === 'PATCH') {
    await handlePatchMyProfile(request, response);
    return;
  }

  if (pathname === '/api/me/notifications' && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, buildNotificationSettings(user));
    return;
  }

  if (pathname === '/api/me/notifications' && request.method === 'PATCH') {
    await handlePatchMyNotifications(request, response);
    return;
  }

  if (pathname === '/api/me/region' && request.method === 'PATCH') {
    await handlePatchMyRegion(request, response);
    return;
  }

  if (pathname === '/api/me/activity' && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, buildMyActivity(store, user));
    return;
  }

  if (pathname === '/api/home/summary' && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, buildHomeSummary(store, user));
    return;
  }

  if (pathname === '/api/market/overview' && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, buildMarketOverview(store, user));
    return;
  }

  if (pathname === '/api/offline-races/hub' && request.method === 'GET') {
    const store = loadStore();
    requireUser(store, request);
    sendJson(response, 200, buildOfflineRaceHub());
    return;
  }

  const offlineRaceActionMatch = pathname.match(/^\/api\/offline-races\/([^/]+)\/(join|cancel)$/);

  if (offlineRaceActionMatch && request.method === 'POST') {
    const store = loadStore();
    requireUser(store, request);
    throw new ApiError(404, '신청 가능한 레이스가 아직 없어.');
  }

  const marketClaimMatch = pathname.match(/^\/api\/market\/items\/([^/]+)\/claim$/);

  if (marketClaimMatch && request.method === 'POST') {
    handleClaimMarketItem(request, response, marketClaimMatch[1]);
    return;
  }

  if (pathname === '/api/friends/leaderboard' && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, buildFriendLeaderboard(store, user));
    return;
  }

  if (pathname === '/api/friends/requests' && request.method === 'POST') {
    const body = await parseJsonBody(request);
    handleFriendRequestCreate(request, response, body);
    return;
  }

  const friendRequestActionMatch = pathname.match(/^\/api\/friends\/requests\/([^/]+)\/(accept|reject|cancel)$/);

  if (friendRequestActionMatch && request.method === 'POST') {
    handleFriendRequestAction(request, response, friendRequestActionMatch[1], friendRequestActionMatch[2]);
    return;
  }

  const friendActivityMatch = pathname.match(/^\/api\/friends\/([^/]+)\/activity$/);

  if (friendActivityMatch && request.method === 'GET') {
    const store = loadStore();
    const currentUser = requireUser(store, request);
    requireFriendAccess(store, currentUser.id, friendActivityMatch[1]);
    sendJson(response, 200, buildFriendActivity(store, currentUser.id, friendActivityMatch[1]));
    return;
  }

  const friendRunMatch = pathname.match(/^\/api\/friends\/([^/]+)\/runs\/([^/]+)$/);

  if (friendRunMatch && request.method === 'GET') {
    const store = loadStore();
    const currentUser = requireUser(store, request);
    requireFriendAccess(store, currentUser.id, friendRunMatch[1]);
    const run = getRunForUser(store, friendRunMatch[1], friendRunMatch[2]);
    const metrics = getUserMetrics(store, friendRunMatch[1]);
    sendJson(response, 200, buildRunDetail(run, metrics.currentWeekDistanceKm, '친구 기록', metrics));
    return;
  }

  if (pathname === '/api/integrations/sources' && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, { sources: buildIntegrationSources(store, user) });
    return;
  }

  const integrationSourceActionMatch = pathname.match(/^\/api\/integrations\/sources\/([^/]+)\/(connect|disconnect)$/);

  if (integrationSourceActionMatch && request.method === 'POST') {
    handleIntegrationSourceConnection(
      request,
      response,
      integrationSourceActionMatch[1],
      integrationSourceActionMatch[2] === 'connect',
    );
    return;
  }

  const integrationSourceImportMatch = pathname.match(/^\/api\/integrations\/sources\/([^/]+)\/import$/);

  if (integrationSourceImportMatch && request.method === 'POST') {
    await handleQueueIntegrationImports(request, response, integrationSourceImportMatch[1]);
    return;
  }

  if (pathname === '/api/integrations/sync' && request.method === 'POST') {
    const payload = mutateStore((store) => {
      const user = requireUser(store, request);
      return importPendingRunsForUser(store, user);
    });

    sendJson(response, 200, payload);
    return;
  }

  if (pathname === '/api/league/district-personal' && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, buildDistrictPersonal(store, user));
    return;
  }

  if (pathname === '/api/league/regions' && request.method === 'GET') {
    const store = loadStore();
    requireUser(store, request);
    sendJson(response, 200, buildRegionLeague(store, url.searchParams.get('nodeId') ?? undefined));
    return;
  }

  if (pathname === '/api/league/universities' && request.method === 'GET') {
    const store = loadStore();
    requireUser(store, request);
    sendJson(response, 200, buildUniversityLeague(store));
    return;
  }

  if (pathname === '/api/runs/latest' && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    const run = getRunForUser(store, user.id);
    const metrics = getUserMetrics(store, user.id);
    sendJson(response, 200, buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics));
    return;
  }

  if (pathname === '/api/runs/manual' && request.method === 'POST') {
    await handleCreateManualRun(request, response);
    return;
  }

  const ownRunMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);

  if (ownRunMatch && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    const run = getRunForUser(store, user.id, ownRunMatch[1]);
    const metrics = getUserMetrics(store, user.id);
    sendJson(response, 200, buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics));
    return;
  }

  throw new ApiError(404, '요청한 API를 찾을 수 없어.');
}

const server = createServer(async (request, response) => {
  applyCorsHeaders(request, response);

  try {
    await routeRequest(request, response);
  } catch (error) {
    sendError(response, error);
  }
});

server.on('error', (error) => {
  console.error('[runnigapp-backend] server error');
  console.error(error);
});

server.listen(PORT, HOST, () => {
  console.log(`[runnigapp-backend] listening on http://${HOST}:${PORT}`);
  console.log(`[runnigapp-backend] store: ${getStoreFilePath()}`);
  console.log(`[runnigapp-backend] env: ${getPublicBackendConfig().usingEnvFile ? 'backend/.env loaded' : 'process env only'}`);
});

let isShuttingDown = false;

function shutdownServer(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[runnigapp-backend] received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error('[runnigapp-backend] graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10000);

  forceExitTimer.unref();

  server.close((error) => {
    clearTimeout(forceExitTimer);

    if (error) {
      console.error('[runnigapp-backend] shutdown error');
      console.error(error);
      process.exit(1);
      return;
    }

    console.log('[runnigapp-backend] shutdown complete.');
    process.exit(0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdownServer(signal));
}
