import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { loadStore, mutateStore, getStoreFilePath, getStoreDiagnostics, resetStore, STORE_DRIVER } from './storage/index.mjs';
import { createFriendsLeagueBridge } from './bridges/friendsLeagueBridge.mjs';
import { createSessionRunsBridge } from './bridges/sessionRunsBridge.mjs';
import { createPostgresDatabase } from './database/postgresDatabase.mjs';
import { createJsonAdminRepository } from './repositories/adminRepository.mjs';
import { createJsonAuthRepository } from './repositories/authRepository.mjs';
import { createJsonFriendsRepository } from './repositories/friendsRepository.mjs';
import { createJsonLeagueRepository } from './repositories/leagueRepository.mjs';
import { createJsonMarketRepository } from './repositories/marketRepository.mjs';
import { createPostgresFriendsRepository } from './repositories/postgresFriendsRepository.mjs';
import { createPostgresLeagueRepository } from './repositories/postgresLeagueRepository.mjs';
import { createJsonRaceRepository } from './repositories/raceRepository.mjs';
import { createJsonRunsRepository, ensureIntegrationImports } from './repositories/runsRepository.mjs';
import {
  ADMIN_TOKEN,
  APP_ENV,
  ENABLE_ADMIN_STATUS,
  ENABLE_RESET_ENDPOINT,
  HOST,
  MAX_BODY_SIZE_BYTES,
  MAX_BODY_SIZE_KB,
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  MAX_REQUESTS_PER_SOCKET,
  PHONE_VERIFICATION_CODE_TTL_MS,
  PHONE_VERIFICATION_EXPOSE_TEST_CODE,
  PHONE_VERIFICATION_MAX_ATTEMPTS,
  PHONE_VERIFICATION_PROVIDER,
  PHONE_VERIFICATION_RESEND_COOLDOWN_MS,
  PHONE_VERIFICATION_VERIFIED_TTL_MS,
  PORT,
  PUBLIC_BASE_URL,
  POSTGRES_APPLICATION_NAME,
  POSTGRES_CONNECTION_TIMEOUT_MS,
  POSTGRES_DATABASE_URL,
  POSTGRES_ENABLE_FRIEND_READS,
  POSTGRES_ENABLE_LEAGUE_READS,
  POSTGRES_ENABLE_RUN_READS,
  POSTGRES_ENABLE_SESSION_READS,
  POSTGRES_IDLE_TIMEOUT_MS,
  POSTGRES_POOL_MAX,
  POSTGRES_SSL,
  REQUEST_TIMEOUT_MS,
  SESSION_TTL_MS,
  SHUTDOWN_TIMEOUT_MS,
  SOLAPI_API_KEY,
  SOLAPI_API_SECRET,
  SOLAPI_SENDER,
  getPublicBackendConfig,
} from './config.mjs';
import { isSessionExpired } from './auth.mjs';
import {
  buildUserRunMetrics,
  getAvailableRewardPoints,
  getRunPointBreakdown,
  getRunPointValue,
  parsePaceToMinutes,
} from './points.mjs';
import { buildRoadAlignedRoutePreview } from './routing.mjs';
import {
  createPhoneVerificationService,
  generatePhoneVerificationCode,
  hashPhoneVerificationCode,
  maskPhoneNumber,
} from './phoneVerification.mjs';
import { createApiRouteHandler } from './routes/index.mjs';
import { createAdminReadService } from './services/adminReadService.mjs';
import { createBackendStatusService } from './services/backendStatusService.mjs';
import { createLeagueReadService } from './services/leagueReadService.mjs';
import {
  ApiError,
  applyCorsHeaders,
  getErrorMessage,
  logBackendError,
  sendError,
  sendJson,
} from './response/httpResponse.mjs';
import { formatTimestamp } from './lib/dateTimeFormatting.mjs';
import {
  buildNoticeEntry,
  buildUserRegionKey,
  isActiveRewardRedemption,
  normalizeOptionalString,
} from './lib/adminNormalizers.mjs';
import {
  findRegionPath,
  findRegionPathForUser,
  normalizeRegionChildren,
} from './lib/regionTreeHelpers.mjs';
import { nextId } from './lib/idHelpers.mjs';
import {
  buildProfile,
  buildProfileWithMetrics,
  ensureUserConnectedSources,
  findUserById,
  getRedeemedPointCost,
  getRunsForUser,
  getUserMetrics,
} from './lib/userStoreHelpers.mjs';
import {
  getActionableRequests,
  getFriendIds,
} from './lib/socialStoreHelpers.mjs';
import {
  acceptRunningMatch,
  acknowledgeRunningMatchRoomCountdown,
  buildDuelMatchResponse,
  buildGroupMatchResponse,
  buildMatchDemandSummaryResponse,
  buildRunningMatchRoomResponse,
  buildRunningMatchStatusResponse,
  buildUpcomingRunningMatchesResponse,
  cancelRunningMatch,
  cleanupStaleRunningMatchRoomState,
  createRunningMatchRoom,
  findRunningMatchRoomForUser,
  findRunningMatchRoomInviteInboxForUser,
  joinRunningMatchRoom,
  leaveRunningMatch,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchProgress,
  updateRunningMatchRoom,
  updateRunningMatchRoomReady,
} from './lib/runningMatchStoreHelpers.mjs';
import { buildNotificationSettings } from './lib/notificationSettings.mjs';
import {
  buildIntegrationSourceActionResult,
  buildIntegrationSources,
  decorateIntegrationSource,
  isExclusiveIntegrationSourceType,
  requireConnectedSource,
  SOURCE_LABEL_BY_TYPE,
} from './lib/integrationSources.mjs';
import {
  buildActiveNotices,
  buildAdminNotices,
  buildRegionCatalog,
  buildUniversityCatalog,
  ensureNoticeStore,
} from './lib/catalogBuilders.mjs';
import {
  buildAdminMarketCatalog,
  buildAdminMarketItem,
  buildAdminRewardRedemption,
  buildAdminRewardRedemptions,
  buildRedemptionCountByItemId,
  buildMarketOverviewWithMetrics,
  ensureMarketCatalogStore,
  getMarketItemRemainingStock,
} from './lib/marketOverview.mjs';
import {
  buildAdminOfflineRaceEvent,
  buildAdminOfflineRaceEvents,
  buildOfflineRaceHub,
  decorateOfflineRaceEvent,
  ensureOfflineRaceStore,
  getOfflineRaceStatus,
} from './services/offlineRaceHub.mjs';
import {
  resolveRegionSelection,
  validateBoolean,
  validateDateOnly,
  validateDistanceKm,
  validateDuelMatchDistanceKm,
  validateMatchMode,
  validateMatchRoomStartMode,
  validateMatchSlotInput,
  validateNewPassword,
  validateNonNegativeInteger,
  validateOptionalUserIdArray,
  validatePace,
  validatePhoneNumber,
  validatePhoneVerificationCode,
  validatePhoneVerificationPurpose,
  validatePositiveInteger,
  validateRequiredString,
  validateRewardRedemptionStatus,
  validateRoutePreviewCoordinates,
  validateRunMatchResult,
  validateTrackedRoute,
  validateUsername,
} from './lib/validators.mjs';
import {
  normalizeAdminMarketItemInput,
  normalizeAdminNoticeInput,
  normalizeAdminOfflineRaceEventInput,
  normalizeImportedRun,
} from './lib/inputNormalizers.mjs';
const STARTED_AT = new Date().toISOString();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

const phoneVerificationService = createPhoneVerificationService({
  provider: PHONE_VERIFICATION_PROVIDER,
  appEnv: APP_ENV,
  exposeTestCode: PHONE_VERIFICATION_EXPOSE_TEST_CODE,
  solapiApiKey: SOLAPI_API_KEY,
  solapiApiSecret: SOLAPI_API_SECRET,
  solapiSender: SOLAPI_SENDER,
});

let authRepository = null;
let adminRepository = null;
let adminReadService = null;
let friendsRepository = null;
let friendsLeagueBridge = null;
let leagueRepository = null;
let marketRepository = null;
let postgresFriendsRepository = null;
let postgresLeagueRepository = null;
let raceRepository = null;
let runsRepository = null;
let postgresDatabase = null;
let sessionRunsBridge = null;

function ensurePhoneVerificationChallenges(store) {
  if (!Array.isArray(store.phoneVerificationChallenges)) {
    store.phoneVerificationChallenges = [];
  }

  return store.phoneVerificationChallenges;
}

function cleanupPhoneVerificationChallenges(store, now = new Date()) {
  const challenges = ensurePhoneVerificationChallenges(store);
  const nowMs = now.getTime();
  const beforeCount = challenges.length;

  store.phoneVerificationChallenges = challenges.filter((challenge) => {
    const expiresAtMs = Date.parse(challenge.expiresAt ?? '');
    const registrationExpiresAtMs = Date.parse(challenge.registrationExpiresAt ?? '');
    const updatedAtMs = Date.parse(challenge.updatedAt ?? challenge.createdAt ?? '');

    if (challenge.status === 'verified') {
      return Number.isFinite(registrationExpiresAtMs) && registrationExpiresAtMs > nowMs;
    }

    if (challenge.status === 'consumed') {
      return Number.isFinite(updatedAtMs) && updatedAtMs + 10 * 60 * 1000 > nowMs;
    }

    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });

  return beforeCount !== store.phoneVerificationChallenges.length;
}

function getAuthRepository() {
  if (!authRepository) {
    authRepository = createJsonAuthRepository({
      loadStore,
      mutateStore,
      sessionTtlMs: SESSION_TTL_MS,
      createToken,
      nextId,
      buildProfile,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return authRepository;
}

function getAdminReadService() {
  if (!adminReadService) {
    adminReadService = createAdminReadService({
      APP_ENV,
      PUBLIC_BASE_URL,
      ensureMarketCatalogStore,
      ensureNoticeStore,
      ensureOfflineRaceStore,
      ensureUserConnectedSources,
      getOfflineRaceStatus,
      getRunsForUser,
      getUserMetrics,
      normalizeOptionalString,
    });
  }

  return adminReadService;
}

function getAdminRepository() {
  if (!adminRepository) {
    const adminRead = getAdminReadService();

    adminRepository = createJsonAdminRepository({
      loadStore,
      mutateStore,
      ensureNoticeStore,
      ensureOfflineRaceStore,
      ensureIntegrationImports,
      findUserById,
      buildAdminOverview: adminRead.buildAdminOverview,
      buildAdminUsers: adminRead.buildAdminUsers,
      buildAdminNotices,
      buildActiveNotices,
      buildNoticeEntry,
      nextId,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return adminRepository;
}

function getPostgresDatabase() {
  if (!(POSTGRES_ENABLE_SESSION_READS || POSTGRES_ENABLE_RUN_READS || POSTGRES_ENABLE_FRIEND_READS || POSTGRES_ENABLE_LEAGUE_READS)) {
    return null;
  }

  if (!POSTGRES_DATABASE_URL) {
    return null;
  }

  if (!postgresDatabase) {
    postgresDatabase = createPostgresDatabase({
      connectionString: POSTGRES_DATABASE_URL,
      ssl: POSTGRES_SSL,
      maxConnections: POSTGRES_POOL_MAX,
      idleTimeoutMs: POSTGRES_IDLE_TIMEOUT_MS,
      connectionTimeoutMs: POSTGRES_CONNECTION_TIMEOUT_MS,
      applicationName: POSTGRES_APPLICATION_NAME,
    });
  }

  return postgresDatabase;
}

function getSessionRunsBridge() {
  if (!sessionRunsBridge) {
    sessionRunsBridge = createSessionRunsBridge({
      database: getPostgresDatabase(),
      sessionReadsEnabled: POSTGRES_ENABLE_SESSION_READS,
      runReadsEnabled: POSTGRES_ENABLE_RUN_READS,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return sessionRunsBridge;
}

function getRunsRepository() {
  if (!runsRepository) {
    runsRepository = createJsonRunsRepository({
      loadStore,
      mutateStore,
      requireUserByToken: (store, token) => findUserByToken(store, token),
      nextId,
      buildRunDetail,
      getUserMetrics,
      decorateIntegrationSource,
      sourceLabels: SOURCE_LABEL_BY_TYPE,
      formatTimestamp,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return runsRepository;
}

function getFriendsRepository() {
  if (!friendsRepository) {
    friendsRepository = createJsonFriendsRepository({
      loadStore,
      mutateStore,
      requireUserByToken: (store, token) => findUserByToken(store, token),
      findUserById,
      getRunsForUser,
      getUserMetrics,
      buildRunDetail,
      nextId,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return friendsRepository;
}

function getLeagueRepository() {
  if (!leagueRepository) {
    leagueRepository = createJsonLeagueRepository({
      loadStore,
      requireUserByToken: (store, token) => findUserByToken(store, token),
      getUserMetrics,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return leagueRepository;
}

function getMarketRepository() {
  if (!marketRepository) {
    marketRepository = createJsonMarketRepository({
      loadStore,
      mutateStore,
      requireUserByToken: (store, token) => findUserByToken(store, token),
      ensureMarketCatalogStore,
      buildMarketOverviewWithMetrics,
      buildAdminMarketCatalog,
      buildAdminMarketItem,
      buildAdminRewardRedemptions,
      buildAdminRewardRedemption,
      getUserMetrics,
      getAvailableRewardPoints,
      getRedeemedPointCost,
      buildRedemptionCountByItemId,
      getMarketItemRemainingStock,
      isActiveRewardRedemption,
      nextId,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return marketRepository;
}

function getRaceRepository() {
  if (!raceRepository) {
    raceRepository = createJsonRaceRepository({
      loadStore,
      mutateStore,
      requireUserByToken: (store, token) => findUserByToken(store, token),
      ensureOfflineRaceStore,
      buildOfflineRaceHub,
      buildAdminOfflineRaceEvents,
      buildAdminOfflineRaceEvent,
      decorateOfflineRaceEvent,
      getOfflineRaceStatus,
      nextId,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return raceRepository;
}

function getPostgresFriendsRepository() {
  if (!postgresFriendsRepository) {
    const database = getPostgresDatabase();

    if (!database) {
      return null;
    }

    postgresFriendsRepository = createPostgresFriendsRepository({
      database,
      nextId,
      buildRunDetail,
      buildUserMetrics: buildUserRunMetrics,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return postgresFriendsRepository;
}

function getPostgresLeagueRepository() {
  if (!POSTGRES_ENABLE_LEAGUE_READS) {
    return null;
  }

  if (!postgresLeagueRepository) {
    const database = getPostgresDatabase();

    if (!database) {
      return null;
    }

    postgresLeagueRepository = createPostgresLeagueRepository({
      database,
      buildUserMetrics: buildUserRunMetrics,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return postgresLeagueRepository;
}

function getFriendsLeagueBridge() {
  if (!friendsLeagueBridge) {
    friendsLeagueBridge = createFriendsLeagueBridge({
      sessionRunsBridge: getSessionRunsBridge(),
      friendsRepository: getFriendsRepository(),
      postgresFriendsRepository: getPostgresFriendsRepository(),
      leagueRepository: getLeagueRepository(),
      postgresLeagueRepository: getPostgresLeagueRepository(),
      friendReadsEnabled: POSTGRES_ENABLE_FRIEND_READS,
      leagueReadsEnabled: POSTGRES_ENABLE_LEAGUE_READS,
    });
  }

  return friendsLeagueBridge;
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

async function loadCurrentUserReadContext(request, {
  includeRuns = false,
  includeMetrics = false,
  fallbackToJsonIfEmpty = true,
} = {}) {
  const store = loadStore();
  const token = getAccessToken(request);
  const bridge = getSessionRunsBridge();
  const { user, source: userSource } = await bridge.findUserByToken({
    store,
    token,
  });
  const context = {
    store,
    token,
    user,
    userSource,
  };

  if (includeRuns) {
    const runResult = await bridge.getRunsForUser({
      store,
      userId: user.id,
      fallbackToJsonIfEmpty,
    });
    context.runs = runResult.runs;
    context.runSource = runResult.source;
  }

  if (includeMetrics) {
    if (includeRuns) {
      context.metrics = context.runSource === 'json'
        ? getUserMetrics(store, user.id)
        : buildUserRunMetrics(context.runs);
      context.metricsSource = context.runSource;
    } else {
      const metricResult = await bridge.getUserMetrics({
        store,
        userId: user.id,
        fallbackToJsonIfEmpty,
      });
      context.metrics = metricResult.metrics;
      context.metricsSource = metricResult.source;
    }
  }

  return context;
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
  return buildHomeSummaryWithMetrics(store, user, metrics);
}

function buildHomeSummaryWithMetrics(store, user, metrics) {
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
  return buildMyActivityWithRunsAndMetrics(
    getRunsForUser(store, user.id),
    getUserMetrics(store, user.id),
  );
}

function buildMyActivityWithRunsAndMetrics(runs, metrics) {
  return {
    runs: runs.map((run) => ({
      id: run.id,
      date: run.date,
      distanceKm: run.distanceKm,
      pace: run.pace,
      source: run.source,
      ...(run.sourceType ? { sourceType: run.sourceType } : {}),
      ...(run.matchResult ? { matchResult: clone(run.matchResult) } : {}),
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
      ...(run.sourceType ? { sourceType: run.sourceType } : {}),
      ...(typeof run.durationSeconds === 'number' ? { durationSeconds: run.durationSeconds } : {}),
      ...(typeof run.cadenceSpm === 'number' ? { cadenceSpm: run.cadenceSpm } : {}),
      ...(typeof run.elevationGainM === 'number' ? { elevationGainM: run.elevationGainM } : {}),
      ...(Array.isArray(run.route) ? { route: run.route } : {}),
      ...(normalizeOptionalString(run.startedAt) ? { startedAt: run.startedAt } : {}),
      ...(normalizeOptionalString(run.endedAt) ? { endedAt: run.endedAt } : {}),
      ...(run.matchResult ? { matchResult: clone(run.matchResult) } : {}),
    },
    weeklyDistanceKm,
    estimatedMinutes: Math.round(run.distanceKm * (paceMinutes ?? 5.5)),
    earnedPoint: getRunPointValue(metrics, run.id),
    pointBreakdown: getRunPointBreakdown(metrics, run.id),
  };
}

function getRunFromList(runs, runId) {
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

async function buildProfileReadPayload(request) {
  const { user, metrics } = await loadCurrentUserReadContext(request, {
    includeMetrics: true,
  });

  return buildProfileWithMetrics(user, metrics);
}

async function buildNotificationSettingsReadPayload(request) {
  const { user } = await loadCurrentUserReadContext(request);
  return buildNotificationSettings(user);
}

async function buildHomeSummaryReadPayload(request) {
  const { store, user, metrics } = await loadCurrentUserReadContext(request, {
    includeMetrics: true,
  });

  return buildHomeSummaryWithMetrics(store, user, metrics);
}

async function buildUpcomingRunningMatchesReadPayload(request) {
  const { store, user } = await loadCurrentUserReadContext(request);
  return buildUpcomingRunningMatchesResponse(store, user);
}

async function buildMyActivityReadPayload(request) {
  const { runs, metrics } = await loadCurrentUserReadContext(request, {
    includeRuns: true,
    includeMetrics: true,
  });

  return buildMyActivityWithRunsAndMetrics(runs, metrics);
}

async function buildIntegrationSourcesReadPayload(request) {
  const { store, user } = await loadCurrentUserReadContext(request);
  return {
    sources: buildIntegrationSources(store, user),
  };
}

async function buildFriendLeaderboardReadPayload(request) {
  const { payload } = await getFriendsLeagueBridge().getFriendLeaderboard({
    store: loadStore(),
    token: getAccessToken(request),
  });

  return payload;
}

async function buildFriendActivityReadPayload(request, friendId) {
  const { payload } = await getFriendsLeagueBridge().getFriendActivity({
    store: loadStore(),
    token: getAccessToken(request),
    friendId,
  });

  return payload;
}

async function buildFriendRunReadPayload(request, friendId, runId) {
  const { payload } = await getFriendsLeagueBridge().getFriendRun({
    store: loadStore(),
    token: getAccessToken(request),
    friendId,
    runId,
  });

  return payload;
}

async function buildMarketOverviewReadPayload(request) {
  const { store, user, metrics } = await loadCurrentUserReadContext(request, {
    includeMetrics: true,
  });

  return getMarketRepository().getOverviewForUser({ store, user, metrics });
}

async function buildOfflineRaceHubReadPayload(request) {
  const { store, user } = await loadCurrentUserReadContext(request);
  return getRaceRepository().getHubForUser({ store, user });
}

async function buildCurrentRunReadPayload(request, runId) {
  const { runs, metrics } = await loadCurrentUserReadContext(request, {
    includeRuns: true,
    includeMetrics: true,
  });
  const run = getRunFromList(runs, runId);

  return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
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

function buildPhoneVerificationPayload(challenge, providerResult = {}) {
  return {
    success: true,
    purpose: challenge.purpose,
    requestId: challenge.id,
    maskedPhone: maskPhoneNumber(challenge.phone),
    expiresAt: challenge.expiresAt,
    resendAvailableAt: challenge.resendAvailableAt,
    provider: providerResult.provider ?? PHONE_VERIFICATION_PROVIDER,
    ...(typeof providerResult.testCode === 'string' ? { testCode: providerResult.testCode } : {}),
  };
}

function buildPhoneVerificationSuccessPayload(challenge) {
  return {
    success: true,
    purpose: challenge.purpose,
    phone: challenge.phone,
    maskedPhone: maskPhoneNumber(challenge.phone),
    verifiedAt: challenge.verifiedAt,
    registrationExpiresAt: challenge.registrationExpiresAt,
    verifiedToken: challenge.verifiedToken,
  };
}

function createPhoneVerificationChallenge({ purpose, phone, now = new Date() }) {
  const requestId = nextId('phone');
  const code = generatePhoneVerificationCode();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PHONE_VERIFICATION_CODE_TTL_MS).toISOString();
  const resendAvailableAt = new Date(now.getTime() + PHONE_VERIFICATION_RESEND_COOLDOWN_MS).toISOString();

  return {
    challenge: {
      id: requestId,
      purpose,
      phone,
      codeHash: hashPhoneVerificationCode(requestId, code),
      attempts: 0,
      maxAttempts: PHONE_VERIFICATION_MAX_ATTEMPTS,
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      resendAvailableAt,
      verifiedAt: '',
      registrationExpiresAt: '',
      verifiedToken: '',
      consumedAt: '',
    },
    code,
  };
}

function requireVerifiedPhoneChallenge({
  phone,
  verifiedToken,
}) {
  const store = loadStore();
  cleanupPhoneVerificationChallenges(store);
  const challenge = ensurePhoneVerificationChallenges(store).find((entry) => (
    entry.purpose === 'signup'
    && entry.status === 'verified'
    && entry.verifiedToken === verifiedToken
    && entry.phone === phone
  ));

  if (!challenge) {
    throw new ApiError(400, '휴대폰 인증을 먼저 완료해주세요.');
  }

  return challenge;
}

const backendStatusService = createBackendStatusService({
  APP_ENV,
  PUBLIC_BASE_URL,
  STARTED_AT,
  STORE_DRIVER,
  ensureMarketCatalogStore,
  ensureNoticeStore,
  ensureOfflineRaceStore,
  getErrorMessage,
  getFriendsLeagueBridge,
  getPublicBackendConfig,
  getSessionRunsBridge,
  getStoreDiagnostics,
  getStoreFilePath,
  loadStore,
});
const leagueReadService = createLeagueReadService({
  getAccessToken,
  getFriendsLeagueBridge,
  loadStore,
});

const routeRequest = createApiRouteHandler({
  ApiError,
  buildHealthStatus: backendStatusService.buildHealthStatus,
  ENABLE_ADMIN_STATUS,
  ENABLE_RESET_ENDPOINT,
  sendJson,
  parseJsonBody,
  loadStore,
  mutateStore,
  resetStore,
  getStoreFilePath,
  requireAdmin,
  requireUser,
  getAccessToken,
  getAdminRepository,
  getAuthRepository,
  getFriendsRepository,
  getMarketRepository,
  getPostgresFriendsRepository,
  getRaceRepository,
  getRunsRepository,
  buildAdminStatus: backendStatusService.buildAdminStatus,
  buildAdminSession: backendStatusService.buildAdminSession,
  buildRegionCatalog,
  buildUniversityCatalog,
  buildProfile,
  buildNotificationSettings,
  buildPhoneVerificationPayload,
  buildPhoneVerificationSuccessPayload,
  buildProfileReadPayload,
  buildNotificationSettingsReadPayload,
  buildUpcomingRunningMatchesReadPayload,
  buildMyActivityReadPayload,
  buildIntegrationSourcesReadPayload,
  buildFriendLeaderboardReadPayload,
  buildFriendActivityReadPayload,
  buildFriendRunReadPayload,
  buildDistrictPersonalReadPayload: leagueReadService.buildDistrictPersonalReadPayload,
  buildRegionLeagueReadPayload: leagueReadService.buildRegionLeagueReadPayload,
  buildTodayRankingReadPayload: leagueReadService.buildTodayRankingReadPayload,
  buildUniversityLeagueReadPayload: leagueReadService.buildUniversityLeagueReadPayload,
  buildMarketOverviewReadPayload,
  buildOfflineRaceHubReadPayload,
  buildCurrentRunReadPayload,
  buildHomeSummaryReadPayload,
  cleanupPhoneVerificationChallenges,
  createPhoneVerificationChallenge,
  createToken,
  ensurePhoneVerificationChallenges,
  hashPhoneVerificationCode,
  phoneVerificationService,
  resolveRegionSelection,
  validateBoolean,
  validateDateOnly,
  validateDuelMatchDistanceKm,
  validateMatchMode,
  validateMatchRoomStartMode,
  validateMatchSlotInput,
  validateNewPassword,
  validateNonNegativeInteger,
  validateOptionalUserIdArray,
  validatePace,
  validatePhoneNumber,
  validatePhoneVerificationCode,
  validatePhoneVerificationPurpose,
  validatePositiveInteger,
  validateUsername,
  validateRequiredString,
  validateDistanceKm,
  validateRewardRedemptionStatus,
  validateRoutePreviewCoordinates,
  validateRunMatchResult,
  validateTrackedRoute,
  buildRoadAlignedRoutePreview,
  normalizeAdminMarketItemInput,
  normalizeAdminNoticeInput,
  normalizeAdminOfflineRaceEventInput,
  normalizeImportedRun,
  normalizeOptionalString,
  normalizeTag,
  PHONE_VERIFICATION_VERIFIED_TTL_MS,
  requireConnectedSource,
  buildDuelMatchResponse,
  buildGroupMatchResponse,
  buildMatchDemandSummaryResponse,
  buildRunningMatchStatusResponse,
  acceptRunningMatch,
  acknowledgeRunningMatchRoomCountdown,
  buildIntegrationSourceActionResult,
  buildRunningMatchRoomResponse,
  cancelRunningMatch,
  cleanupStaleRunningMatchRoomState,
  createRunningMatchRoom,
  ensureIntegrationImports,
  findRunningMatchRoomForUser,
  findRunningMatchRoomInviteInboxForUser,
  isExclusiveIntegrationSourceType,
  joinRunningMatchRoom,
  leaveRunningMatch,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchProgress,
  updateRunningMatchRoom,
  updateRunningMatchRoomReady,
});

const server = createServer(async (request, response) => {
  applyCorsHeaders(request, response);

  try {
    await routeRequest(request, response);
  } catch (error) {
    sendError(response, error);
  }
});

server.requestTimeout = REQUEST_TIMEOUT_MS;
server.headersTimeout = HEADERS_TIMEOUT_MS;
server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
server.maxRequestsPerSocket = MAX_REQUESTS_PER_SOCKET;

server.on('error', (error) => {
  logBackendError('server_error', error);
});

server.on('clientError', (error, socket) => {
  logBackendError('client_error', error);

  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return;
  }

  socket.destroy();
});

server.listen(PORT, HOST, () => {
  console.log(`[runningground-backend] listening on http://${HOST}:${PORT}`);
  console.log(`[runningground-backend] store: ${getStoreFilePath()}`);
  console.log(`[runningground-backend] env: ${getPublicBackendConfig().usingEnvFile ? 'backend/.env loaded' : 'process env only'}`);
});

let isShuttingDown = false;

function shutdownServer(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[runningground-backend] received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error('[runningground-backend] graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  forceExitTimer.unref();

  server.close((error) => {
    (async () => {
      clearTimeout(forceExitTimer);

      if (error) {
        console.error('[runningground-backend] shutdown error');
        console.error(error);
        process.exit(1);
        return;
      }

      if (postgresDatabase) {
        await postgresDatabase.close();
      }

      console.log('[runningground-backend] shutdown complete.');
      process.exit(0);
    })().catch((shutdownError) => {
      console.error('[runningground-backend] shutdown error');
      console.error(shutdownError);
      process.exit(1);
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdownServer(signal));
}

process.on('unhandledRejection', (reason) => {
  logBackendError('unhandled_rejection', reason);
});

process.on('uncaughtException', (error) => {
  logBackendError('uncaught_exception', error);
  shutdownServer('uncaughtException');
});
