import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { loadStore, mutateStore, getStoreFilePath } from './store.mjs';

const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? '8081');

const DISTRICT_BATTLE = {
  강남구: {
    averageDistancePerMember: 24.7,
    totalDistanceKm: 2480,
    participationRate: 62,
    districtRank: 3,
    homeDistrictRank: 7,
  },
  서초구: {
    averageDistancePerMember: 26.1,
    totalDistanceKm: 2632,
    participationRate: 64,
    districtRank: 2,
    homeDistrictRank: 5,
  },
  송파구: {
    averageDistancePerMember: 28.4,
    totalDistanceKm: 2840,
    participationRate: 68,
    districtRank: 1,
    homeDistrictRank: 4,
  },
  마포구: {
    averageDistancePerMember: 23.9,
    totalDistanceKm: 2389,
    participationRate: 58,
    districtRank: 4,
    homeDistrictRank: 9,
  },
  성동구: {
    averageDistancePerMember: 22.8,
    totalDistanceKm: 2280,
    participationRate: 55,
    districtRank: 5,
    homeDistrictRank: 11,
  },
};

const DEFAULT_MARKET_CATALOG = [
  {
    id: 'reward-theme-midnight',
    title: '미드나잇 프로필 테마',
    category: '프로필 테마',
    description: '프로필 카드와 랭킹 강조색을 조금 더 선명하게 바꿔주는 테마야.',
    costPoints: 40,
    repeatable: false,
  },
  {
    id: 'reward-coupon-coffee',
    title: '러닝 후 커피 쿠폰',
    category: '제휴 쿠폰',
    description: '가볍게 회복할 수 있는 아메리카노 1잔 쿠폰이야.',
    costPoints: 60,
    partnerName: 'Daily Beans',
    repeatable: false,
  },
  {
    id: 'reward-badge-sprinter',
    title: '스프린터 한정 배지',
    category: '배지',
    description: '프로필과 친구 랭킹에서 보여줄 수 있는 시즌 배지야.',
    costPoints: 90,
    repeatable: false,
  },
  {
    id: 'reward-challenge-ticket',
    title: '주말 챌린지 입장권',
    category: '챌린지',
    description: '주말 5km 미션 보상 챌린지에 바로 참가할 수 있어.',
    costPoints: 140,
    repeatable: true,
  },
];

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
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

  for await (const chunk of request) {
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

  const user = store.users.find((entry) => entry.id === session.userId);

  if (!user) {
    throw new ApiError(401, '세션 사용자를 찾을 수 없어.');
  }

  return user;
}

function requireUser(store, request) {
  return findUserByToken(store, getAccessToken(request));
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

function buildProfile(user) {
  return {
    name: user.name,
    districtName: user.districtName,
    publicTag: user.publicTag,
  };
}

function buildNotificationSettings(user) {
  return clone(user.notificationSettings ?? {
    friendAlerts: true,
    districtAlerts: true,
    marketAlerts: false,
  });
}

function buildIntegrationSourceActionResult(user, source) {
  return {
    success: true,
    source: clone(source),
    sources: clone(user.connectedSources),
  };
}

function buildMarketOverview(store, user) {
  if (!Array.isArray(store.marketCatalog)) {
    store.marketCatalog = clone(DEFAULT_MARKET_CATALOG);
  }

  if (!Array.isArray(store.rewardRedemptions)) {
    store.rewardRedemptions = [];
  }

  if (typeof user.rewardPoints !== 'number') {
    user.rewardPoints = Math.max(user.districtPoints ?? 0, 60);
  }

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
      : user.rewardPoints >= item.costPoints
        ? 'claimable'
        : 'locked',
  }));

  return {
    currentPoints: user.rewardPoints,
    totalRedeemedCount: store.rewardRedemptions.filter((entry) => entry.userId === user.id).length,
    items,
  };
}

function buildFriendRank(user, rank) {
  return {
    id: user.id,
    rank,
    name: user.name,
    tag: user.publicTag,
    distanceKm: user.friendDistanceKm,
    points: user.friendPoints,
  };
}

function buildDistrictRank(user, rank, currentUserId) {
  return {
    id: user.id,
    rank,
    name: user.name,
    distanceKm: user.districtDistanceKm,
    points: user.districtPoints,
    ...(user.id === currentUserId ? { isMe: true } : {}),
  };
}

function compareFriendRank(left, right) {
  if (right.friendDistanceKm !== left.friendDistanceKm) {
    return right.friendDistanceKm - left.friendDistanceKm;
  }

  if (right.friendPoints !== left.friendPoints) {
    return right.friendPoints - left.friendPoints;
  }

  return left.name.localeCompare(right.name, 'ko');
}

function compareDistrictRank(left, right) {
  if (right.districtDistanceKm !== left.districtDistanceKm) {
    return right.districtDistanceKm - left.districtDistanceKm;
  }

  if (right.districtPoints !== left.districtPoints) {
    return right.districtPoints - left.districtPoints;
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

function getDistrictBattle(districtName) {
  const found = DISTRICT_BATTLE[districtName];

  if (found) {
    return found;
  }

  return {
    averageDistancePerMember: 21.3,
    totalDistanceKm: 1840,
    participationRate: 51,
    districtRank: 8,
    homeDistrictRank: 12,
  };
}

function buildHomeSummary(store, user) {
  const runs = getRunsForUser(store, user.id);
  const totalDistanceKm = getTotalDistance(runs);
  const latestRun = runs[0];
  const friendUsers = getFriendIds(store, user.id)
    .map((friendId) => findUserById(store, friendId))
    .sort(compareFriendRank);
  const closestFriend = friendUsers[0] ?? null;
  const districtBattle = getDistrictBattle(user.districtName);

  return {
    totalDistanceKm,
    totalRuns: runs.length,
    goalAchievementRate: Math.min(100, Math.round((totalDistanceKm / 50) * 100)),
    streakDays: user.streakDays,
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
    friendGapKm: closestFriend ? Number(Math.abs(closestFriend.friendDistanceKm - user.friendDistanceKm).toFixed(1)) : 0,
    districtName: user.districtName,
    districtRank: districtBattle.homeDistrictRank,
    districtPoints: user.districtPoints,
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

  return {
    runs: runs.map((run) => ({
      id: run.id,
      date: run.date,
      distanceKm: run.distanceKm,
      pace: run.pace,
      source: run.source,
    })),
    monthlyDistanceKm: getTotalDistance(runs),
    monthlyPoints: user.districtPoints,
  };
}

function buildFriendLeaderboard(store, user) {
  const currentAndFriends = [user.id, ...getFriendIds(store, user.id)]
    .map((userId) => findUserById(store, userId))
    .sort(compareFriendRank)
    .map((entry, index) => buildFriendRank(entry, index + 1));

  return {
    ranks: currentAndFriends,
    requests: getActionableRequests(store, user.id),
  };
}

function buildDistrictPersonal(store, user) {
  const districtUsers = store.users
    .filter((entry) => entry.districtName === user.districtName)
    .sort(compareDistrictRank)
    .map((entry, index) => buildDistrictRank(entry, index + 1, user.id));

  const myRank = districtUsers.find((entry) => entry.id === user.id) ?? null;
  const myRankIndex = myRank ? districtUsers.findIndex((entry) => entry.id === user.id) : -1;
  const focusStart = Math.max(0, myRankIndex - 1);
  const focusRanks = myRankIndex >= 0 ? districtUsers.slice(focusStart, focusStart + 4) : districtUsers.slice(0, 4);

  return {
    districtName: user.districtName,
    myRank,
    myPoints: user.districtPoints,
    weeklyDistanceKm: getTotalDistance(getRunsForUser(store, user.id)),
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

  const currentNode = path[path.length - 1];
  const children = [...(currentNode.children ?? [])].sort((left, right) => left.rank - right.rank);

  return {
    currentNode,
    breadcrumb: path.map(({ id, name, level }) => ({ id, name, level })),
    children,
  };
}

function buildFriendActivity(store, currentUserId, friendId) {
  const friend = findUserById(store, friendId);
  const runs = getRunsForUser(store, friend.id);
  const leaderboard = buildFriendLeaderboard(store, findUserById(store, currentUserId));
  const rankedFriend = leaderboard.ranks.find((entry) => entry.id === friend.id) ?? buildFriendRank(friend, 1);

  return {
    friend: rankedFriend,
    runs: runs.map((run) => ({
      id: run.id,
      date: run.date,
      distanceKm: run.distanceKm,
      pace: run.pace,
    })),
    monthlyDistanceKm: getTotalDistance(runs),
    monthlyPoints: friend.friendPoints,
  };
}

function buildRunDetail(run, weeklyDistanceKm, sourceOverride) {
  return {
    run: {
      id: run.id,
      date: run.date,
      distanceKm: run.distanceKm,
      pace: run.pace,
      source: sourceOverride ?? run.source,
    },
    weeklyDistanceKm,
    estimatedMinutes: Math.round(run.distanceKm * 5.5),
    earnedPoint: Math.round(run.distanceKm * 2.4),
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

function requireConnectedSource(user, sourceType) {
  const source = user.connectedSources.find((entry) => entry.sourceType === sourceType);

  if (!source) {
    throw new ApiError(404, '선택한 연동 소스를 찾을 수 없어.');
  }

  return source;
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
  return [
    {
      id: nextId('run'),
      userId,
      date: '2026-04-05',
      distanceKm: 4.1,
      pace: '6:08/km',
      source: 'Manual',
    },
    {
      id: nextId('run'),
      userId,
      date: '2026-04-03',
      distanceKm: 3.2,
      pace: '6:20/km',
      source: 'Manual',
    },
    {
      id: nextId('run'),
      userId,
      date: '2026-04-01',
      distanceKm: 5.0,
      pace: '5:58/km',
      source: 'Manual',
    },
  ];
}

function createSessionForUser(store, userId) {
  const token = createToken();
  store.sessions.push({
    token,
    userId,
    createdAt: new Date().toISOString(),
  });

  return token;
}

async function handleLogin(request, response) {
  const body = await parseJsonBody(request);
  const username = validateRequiredString(body.username, '아이디를 입력해줘.').toLowerCase();
  const password = validateRequiredString(body.password, '비밀번호를 입력해줘.');

  const result = mutateStore((store) => {
    const user = store.users.find((entry) => entry.username === username);

    if (!user || user.password !== password) {
      throw new ApiError(401, '아이디 또는 비밀번호가 맞지 않아.');
    }

    const accessToken = createSessionForUser(store, user.id);

    return {
      accessToken,
      user: buildProfile(user),
    };
  });

  sendJson(response, 200, result);
}

async function handleRegister(request, response) {
  const body = await parseJsonBody(request);
  const username = validateRequiredString(body.username, '아이디를 입력해줘.').toLowerCase();
  const password = validateRequiredString(body.password, '비밀번호를 입력해줘.');
  const name = validateRequiredString(body.name, '이름을 입력해줘.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해줘.').replace(/\D/g, '');
  const districtName = validateRequiredString(body.districtName, '사는 지역을 입력해줘.');
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
      password,
      name,
      phone,
      birthDate,
      districtName,
      publicTag: createPublicTag(store),
      friendDistanceKm: 12.3,
      friendPoints: 20,
      districtDistanceKm: 12.3,
      districtPoints: 20,
      rewardPoints: 100,
      streakDays: 1,
      connectedSources: [
        {
          sourceType: 'manual',
          displayName: 'Manual',
          connected: true,
          connectionStatus: 'connected',
          lastSyncedAt: formatTimestamp(new Date('2026-04-01T10:00:00')),
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

    store.users.push(user);
    store.runs.push(...starterRuns);
    const accessToken = createSessionForUser(store, user.id);

    return {
      accessToken,
      user: buildProfile(user),
    };
  });

  sendJson(response, 201, result);
}

function handleMyProfile(request, response, store, user) {
  if (request.method === 'GET') {
    sendJson(response, 200, buildProfile(user));
    return;
  }

  if (request.method === 'PATCH') {
    sendJson(response, 200, mutateStore((nextStore) => {
      const nextUser = findUserByToken(nextStore, getAccessToken(request));
      const body = clone(request.body);
      const nextName = validateRequiredString(body.name, '이름을 입력해줘.');
      nextUser.name = nextName;
      return buildProfile(nextUser);
    }));
    return;
  }

  throw new ApiError(405, '지원하지 않는 메서드야.');
}

async function handlePatchMyProfile(request, response) {
  const body = await parseJsonBody(request);

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    user.name = validateRequiredString(body.name, '이름을 입력해줘.');
    return buildProfile(user);
  });

  sendJson(response, 200, payload);
}

async function handlePatchMyRegion(request, response) {
  const body = await parseJsonBody(request);

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    user.districtName = validateRequiredString(body.districtName, '지역 이름을 입력해줘.');
    return buildProfile(user);
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
    buildMarketOverview(store, user);
    const item = (store.marketCatalog ?? []).find((entry) => entry.id === itemId);

    if (!item) {
      throw new ApiError(404, '교환할 리워드를 찾지 못했어.');
    }

    const alreadyClaimed = store.rewardRedemptions.some((entry) => entry.userId === user.id && entry.itemId === item.id);

    if (alreadyClaimed && !item.repeatable) {
      throw new ApiError(409, '이미 교환한 리워드야.');
    }

    if (user.rewardPoints < item.costPoints) {
      throw new ApiError(400, '포인트가 부족해서 아직 교환할 수 없어.');
    }

    user.rewardPoints -= item.costPoints;
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

function handleIntegrationSourceConnection(request, response, sourceType, nextConnected) {
  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    const source = requireConnectedSource(user, sourceType);

    source.connected = nextConnected;
    source.connectionStatus = nextConnected ? 'connected' : 'planned';
    source.lastSyncedAt = nextConnected
      ? (source.lastSyncedAt ?? (source.sourceType === 'manual' ? formatTimestamp() : undefined))
      : undefined;

    return buildIntegrationSourceActionResult(user, source);
  });

  sendJson(response, 200, payload);
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

async function routeRequest(request, response) {
  if (!request.url) {
    throw new ApiError(400, '요청 주소를 읽을 수 없어.');
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, {
      status: 'ok',
      storeFile: getStoreFilePath(),
      now: new Date().toISOString(),
    });
    return;
  }

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    await handleLogin(request, response);
    return;
  }

  if (pathname === '/api/auth/register' && request.method === 'POST') {
    await handleRegister(request, response);
    return;
  }

  if (pathname === '/api/me/profile' && request.method === 'GET') {
    const store = loadStore();
    sendJson(response, 200, buildProfile(requireUser(store, request)));
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
    sendJson(response, 200, buildFriendActivity(store, currentUser.id, friendActivityMatch[1]));
    return;
  }

  const friendRunMatch = pathname.match(/^\/api\/friends\/([^/]+)\/runs\/([^/]+)$/);

  if (friendRunMatch && request.method === 'GET') {
    const store = loadStore();
    const currentUser = requireUser(store, request);
    const run = getRunForUser(store, friendRunMatch[1], friendRunMatch[2]);
    sendJson(response, 200, buildRunDetail(run, getTotalDistance(getRunsForUser(store, currentUser.id)), '친구 기록'));
    return;
  }

  if (pathname === '/api/integrations/sources' && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, { sources: clone(user.connectedSources) });
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

  if (pathname === '/api/integrations/sync' && request.method === 'POST') {
    const payload = mutateStore((store) => {
      const user = requireUser(store, request);
      const lastSyncedAt = formatTimestamp();
      let syncedSources = 0;

      user.connectedSources = user.connectedSources.map((source) => {
        if (!source.connected) {
          return source;
        }

        syncedSources += 1;

        return {
          ...source,
          lastSyncedAt,
        };
      });

      return {
        success: true,
        syncedSources,
        syncedRuns: syncedSources * 3,
        lastSyncedAt,
      };
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

  if (pathname === '/api/runs/latest' && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    const run = getRunForUser(store, user.id);
    sendJson(response, 200, buildRunDetail(run, getTotalDistance(getRunsForUser(store, user.id))));
    return;
  }

  const ownRunMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);

  if (ownRunMatch && request.method === 'GET') {
    const store = loadStore();
    const user = requireUser(store, request);
    const run = getRunForUser(store, user.id, ownRunMatch[1]);
    sendJson(response, 200, buildRunDetail(run, getTotalDistance(getRunsForUser(store, user.id))));
    return;
  }

  throw new ApiError(404, '요청한 API를 찾을 수 없어.');
}

const server = createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[runnigapp-backend] listening on http://${HOST}:${PORT}`);
  console.log(`[runnigapp-backend] store: ${getStoreFilePath()}`);
});
