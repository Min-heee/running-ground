import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { loadStore, mutateStore, getStoreFilePath, getStoreDiagnostics, resetStore, STORE_DRIVER } from './storage/index.mjs';
import { createFriendsLeagueBridge } from './bridges/friendsLeagueBridge.mjs';
import { createSessionRunsBridge } from './bridges/sessionRunsBridge.mjs';
import { createPostgresDatabase } from './database/postgresDatabase.mjs';
import { createJsonAdminRepository } from './repositories/adminRepository.mjs';
import { createDefaultNotificationSettings, createJsonAuthRepository } from './repositories/authRepository.mjs';
import { createJsonFriendsRepository } from './repositories/friendsRepository.mjs';
import { createJsonLeagueRepository } from './repositories/leagueRepository.mjs';
import { createJsonMarketRepository } from './repositories/marketRepository.mjs';
import { createPostgresFriendsRepository } from './repositories/postgresFriendsRepository.mjs';
import { createPostgresLeagueRepository } from './repositories/postgresLeagueRepository.mjs';
import { createJsonRaceRepository } from './repositories/raceRepository.mjs';
import { createJsonRunsRepository, ensureIntegrationImports, getPendingImportCount } from './repositories/runsRepository.mjs';
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
import { buildUserRunMetrics, getAvailableRewardPoints, getRunPointBreakdown, getRunPointValue, parsePaceToMinutes } from './points.mjs';
import { addressCatalog } from './addressCatalog.mjs';
import { buildRoadAlignedRoutePreview } from './routing.mjs';
import {
  createPhoneVerificationService,
  generatePhoneVerificationCode,
  hashPhoneVerificationCode,
  isPhoneVerificationPurpose,
  isValidKoreanMobilePhoneNumber,
  maskPhoneNumber,
  normalizePhoneNumber,
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
  normalizeRewardRedemptionStatus,
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
  validateMatchSlotStartAt,
} from './lib/runningMatchStoreHelpers.mjs';
const STARTED_AT = new Date().toISOString();
const SOURCE_LABEL_BY_TYPE = {
  apple_health: 'Apple Health',
  health_connect: 'Health Connect',
  garmin: 'Garmin',
  strava: 'Strava',
  nrc: 'Nike Run Club',
  mynb: 'MyNB',
  runningground: 'RunningGround',
  manual: 'Manual',
};
const EXCLUSIVE_INTEGRATION_SOURCE_TYPES = new Set(['apple_health', 'health_connect', 'garmin', 'strava', 'nrc', 'mynb']);
const DEFAULT_OFFLINE_RACE_GUIDE_STEPS = [
  '오프라인 마라톤 일정이 열리면 여기에서 날짜별로 바로 신청할 수 있어요.',
  '지금은 일정 등록 전이라 신청 가능한 회차가 없어요.',
  '실제 운영 일정이 준비되면 시간대와 거리 선택이 함께 열릴 예정이에요.',
];
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{3,19}$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isExclusiveIntegrationSourceType(sourceType) {
  return EXCLUSIVE_INTEGRATION_SOURCE_TYPES.has(sourceType);
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

function buildNotificationSettings(user) {
  return clone({
    ...createDefaultNotificationSettings(),
    ...(user.notificationSettings ?? {}),
  });
}

function decorateIntegrationSource(store, user, source) {
  const pendingImportCount = getPendingImportCount(store, user.id, source.sourceType);
  return {
    ...clone(source),
    displayName: SOURCE_LABEL_BY_TYPE[source.sourceType] ?? source.displayName ?? source.sourceType,
    ...(pendingImportCount > 0 ? { pendingImportCount } : {}),
  };
}

function buildIntegrationSources(store, user) {
  return ensureUserConnectedSources(user).map((source) => decorateIntegrationSource(store, user, source));
}

function buildRegionCatalog() {
  return {
    regions: clone(addressCatalog),
  };
}

function buildActiveNotices(store) {
  ensureNoticeStore(store);

  return {
    items: [...store.notices]
      .filter((notice) => notice.isActive !== false)
      .sort((left, right) => {
        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }

        return normalizeOptionalString(right.updatedAt).localeCompare(normalizeOptionalString(left.updatedAt));
      })
      .map((notice) => buildNoticeEntry(notice)),
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

function ensureNoticeStore(store) {
  if (!Array.isArray(store.notices)) {
    store.notices = [];
  }

  for (const notice of store.notices) {
    if (typeof notice.priority !== 'number' || !Number.isFinite(notice.priority)) {
      notice.priority = 0;
    }

    if (typeof notice.isActive !== 'boolean') {
      notice.isActive = true;
    }
  }
}

function ensureMarketCatalogStore(store) {
  if (!Array.isArray(store.marketCatalog)) {
    store.marketCatalog = [];
  }

  for (const item of store.marketCatalog) {
    if (typeof item.isActive !== 'boolean') {
      item.isActive = true;
    }

    if (!Object.prototype.hasOwnProperty.call(item, 'inventoryCount')) {
      item.inventoryCount = null;
    }
  }
}

function ensureOfflineRaceStore(store) {
  if (!Array.isArray(store.offlineRaceEvents)) {
    store.offlineRaceEvents = [];
  }

  for (const event of store.offlineRaceEvents) {
    if (!Array.isArray(event.registeredUserTags)) {
      event.registeredUserTags = [];
    }
  }

  if (!Array.isArray(store.offlineRaceGuideSteps)) {
    store.offlineRaceGuideSteps = [...DEFAULT_OFFLINE_RACE_GUIDE_STEPS];
  }
}

function buildRedemptionCountByItemId(store) {
  return (store.rewardRedemptions ?? []).reduce((map, entry) => {
    if (!isActiveRewardRedemption(entry)) {
      return map;
    }

    map.set(entry.itemId, (map.get(entry.itemId) ?? 0) + 1);
    return map;
  }, new Map());
}

function getMarketItemRemainingStock(item, redemptionCount) {
  if (typeof item.inventoryCount !== 'number' || !Number.isFinite(item.inventoryCount)) {
    return null;
  }

  return Math.max(0, item.inventoryCount - redemptionCount);
}

function buildMarketOverview(store, user) {
  ensureMarketCatalogStore(store);

  if (!Array.isArray(store.rewardRedemptions)) {
    store.rewardRedemptions = [];
  }

  return buildMarketOverviewWithMetrics(store, user, getUserMetrics(store, user.id));
}

function buildMarketOverviewWithMetrics(store, user, metrics) {
  const currentPoints = getAvailableRewardPoints(metrics, getRedeemedPointCost(store, user.id));
  const redemptionCountByItemId = buildRedemptionCountByItemId(store);

  const redeemedItemIds = new Set(
    store.rewardRedemptions
      .filter((entry) => entry.userId === user.id && isActiveRewardRedemption(entry))
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
    inventoryCount: typeof item.inventoryCount === 'number' ? item.inventoryCount : null,
    remainingStock: getMarketItemRemainingStock(item, redemptionCountByItemId.get(item.id) ?? 0),
    isActive: item.isActive !== false,
    claimState: item.isActive === false
      ? 'locked'
      : (getMarketItemRemainingStock(item, redemptionCountByItemId.get(item.id) ?? 0) === 0)
        ? 'locked'
        : redeemedItemIds.has(item.id)
      ? 'claimed'
      : currentPoints >= item.costPoints
        ? 'claimable'
        : 'locked',
  }));

  return {
    currentPoints,
    totalRedeemedCount: store.rewardRedemptions.filter((entry) => entry.userId === user.id && isActiveRewardRedemption(entry)).length,
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

function buildAdminMarketItem(store, item) {
  const redemptionCountByItemId = buildRedemptionCountByItemId(store);
  const redemptionCount = redemptionCountByItemId.get(item.id) ?? 0;

  return {
    id: item.id,
    title: item.title,
    category: item.category,
    description: item.description,
    costPoints: item.costPoints,
    ...(item.partnerName ? { partnerName: item.partnerName } : {}),
    repeatable: item.repeatable,
    isActive: item.isActive !== false,
    inventoryCount: typeof item.inventoryCount === 'number' ? item.inventoryCount : null,
    remainingStock: getMarketItemRemainingStock(item, redemptionCount),
    redemptionCount,
  };
}

function buildAdminMarketCatalog(store) {
  ensureMarketCatalogStore(store);
  return {
    items: store.marketCatalog.map((item) => buildAdminMarketItem(store, item)),
  };
}

function buildAdminRewardRedemption(store, redemption) {
  const user = store.users.find((entry) => entry.id === redemption.userId) ?? null;
  const item = (store.marketCatalog ?? []).find((entry) => entry.id === redemption.itemId) ?? null;
  const status = normalizeRewardRedemptionStatus(redemption.status);

  return {
    id: redemption.id,
    userId: redemption.userId,
    userName: user?.name ?? '알 수 없는 사용자',
    userTag: user?.publicTag ?? '',
    itemId: redemption.itemId,
    itemTitle: item?.title ?? '삭제된 상품',
    costPoints: typeof redemption.costPoints === 'number' ? redemption.costPoints : item?.costPoints ?? 0,
    status,
    claimedAt: redemption.claimedAt,
    ...(normalizeOptionalString(redemption.adminNote) ? { adminNote: redemption.adminNote } : {}),
    ...(normalizeOptionalString(redemption.fulfilledAt) ? { fulfilledAt: redemption.fulfilledAt } : {}),
  };
}

function buildAdminRewardRedemptions(store) {
  ensureMarketCatalogStore(store);

  return {
    items: [...(store.rewardRedemptions ?? [])]
      .sort((left, right) => {
        const leftClaimedAt = normalizeOptionalString(left.claimedAt);
        const rightClaimedAt = normalizeOptionalString(right.claimedAt);
        return rightClaimedAt.localeCompare(leftClaimedAt);
      })
      .map((entry) => buildAdminRewardRedemption(store, entry)),
  };
}

function buildAdminNotices(store) {
  ensureNoticeStore(store);

  return {
    items: [...store.notices]
      .sort((left, right) => {
        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }

        return normalizeOptionalString(right.updatedAt).localeCompare(normalizeOptionalString(left.updatedAt));
      })
      .map((notice) => buildNoticeEntry(notice)),
  };
}

function getOfflineRaceStatus(event, now = new Date()) {
  const startsAt = new Date(event.startsAt).getTime();
  const registrationClosesAt = new Date(event.registrationClosesAt).getTime();
  const runWindowMinutes = typeof event.runWindowMinutes === 'number' && Number.isFinite(event.runWindowMinutes)
    ? event.runWindowMinutes
    : 180;
  const finishedAt = startsAt + runWindowMinutes * 60 * 1000;
  const currentTime = now.getTime();

  if (currentTime >= finishedAt) {
    return 'finished';
  }

  if (currentTime >= startsAt) {
    return 'live';
  }

  if (currentTime >= registrationClosesAt) {
    return 'registration_closed';
  }

  if (registrationClosesAt - currentTime <= 3 * 60 * 60 * 1000) {
    return 'registration_closing';
  }

  return 'registration_open';
}

function buildOfflineRaceParticipantPreview(store, event, limit = 3) {
  const uniqueTags = [...new Set(event.registeredUserTags ?? [])];

  return uniqueTags
    .map((tag) => store.users.find((user) => user.publicTag === tag))
    .filter(Boolean)
    .slice(0, limit)
    .map((user) => {
      const latestRun = getRunsForUser(store, user.id)[0] ?? null;

      return {
        id: user.id,
        name: user.name,
        paceGoal: latestRun?.pace ?? '5:30/km',
        regionLabel: user.districtName,
      };
    });
}

function decorateOfflineRaceEvent(store, event, currentUser = null) {
  const participantCount = [...new Set(event.registeredUserTags ?? [])].length;
  const currentUserTag = currentUser?.publicTag;

  return {
    id: event.id,
    title: event.title,
    subtitle: event.subtitle,
    distanceKm: event.distanceKm,
    startsAt: event.startsAt,
    registrationClosesAt: event.registrationClosesAt,
    participationMode: event.participationMode,
    proofMethod: event.proofMethod,
    runWindowMinutes: event.runWindowMinutes,
    hostLabel: event.hostLabel,
    participantCount,
    capacity: event.capacity,
    entryFeePoints: event.entryFeePoints,
    operationNote: event.operationNote,
    registered: typeof currentUserTag === 'string' ? (event.registeredUserTags ?? []).includes(currentUserTag) : false,
    status: getOfflineRaceStatus(event),
    participantPreview: buildOfflineRaceParticipantPreview(store, event),
  };
}

function buildOfflineRacePastEvent(store, event) {
  const participantPreview = buildOfflineRaceParticipantPreview(store, event, 1);
  const participantCount = [...new Set(event.registeredUserTags ?? [])].length;

  return {
    id: event.id,
    title: event.title,
    distanceKm: event.distanceKm,
    finishedAt: event.startsAt,
    modeLabel: event.participationMode,
    winnerName: participantPreview[0]?.name ?? '기록 집계 중',
    finishers: participantCount,
    summary: participantCount > 0
      ? `${participantCount}명이 참여한 ${event.distanceKm}km 회차였어요.`
      : '참가 기록이 아직 없어요.',
  };
}

function buildAdminOfflineRaceEvent(store, event) {
  return {
    id: event.id,
    title: event.title,
    subtitle: event.subtitle,
    distanceKm: event.distanceKm,
    startsAt: event.startsAt,
    registrationClosesAt: event.registrationClosesAt,
    participationMode: event.participationMode,
    proofMethod: event.proofMethod,
    runWindowMinutes: event.runWindowMinutes,
    hostLabel: event.hostLabel,
    participantCount: [...new Set(event.registeredUserTags ?? [])].length,
    capacity: event.capacity,
    entryFeePoints: event.entryFeePoints,
    operationNote: event.operationNote,
    status: getOfflineRaceStatus(event),
  };
}

function buildAdminOfflineRaceEvents(store) {
  ensureOfflineRaceStore(store);
  return {
    events: [...store.offlineRaceEvents]
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
      .map((event) => buildAdminOfflineRaceEvent(store, event)),
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

function validateRequiredString(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, message);
  }

  return value.trim();
}

function validateUsername(value) {
  const username = validateRequiredString(value, '아이디를 입력해주세요.').toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    throw new ApiError(400, '아이디는 4~20자의 영문 소문자, 숫자, -, _만 사용할 수 있어요.');
  }

  return username;
}

function validateNewPassword(value) {
  const password = validateRequiredString(value, '비밀번호를 입력해주세요.');

  if (password.length < 8) {
    throw new ApiError(400, '비밀번호는 8자 이상으로 입력해주세요.');
  }

  if (/\s/.test(password)) {
    throw new ApiError(400, '비밀번호에는 공백을 넣을 수 없어요.');
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ApiError(400, '비밀번호에는 영문과 숫자를 모두 포함해주세요.');
  }

  return password;
}

function validatePhoneVerificationPurpose(value) {
  const purpose = validateRequiredString(value, '휴대폰 인증 목적을 확인할 수 없어요.');

  if (!isPhoneVerificationPurpose(purpose)) {
    throw new ApiError(400, '지원하지 않는 휴대폰 인증 목적이에요.');
  }

  return purpose;
}

function validatePhoneNumber(value) {
  const normalizedPhone = normalizePhoneNumber(validateRequiredString(value, '휴대폰 번호를 입력해주세요.'));

  if (!isValidKoreanMobilePhoneNumber(normalizedPhone)) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  return normalizedPhone;
}

function validatePhoneVerificationCode(value) {
  const code = validateRequiredString(value, '인증번호를 입력해주세요.').replace(/\D/g, '');

  if (!/^\d{6}$/.test(code)) {
    throw new ApiError(400, '인증번호 6자리를 입력해주세요.');
  }

  return code;
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

function validateDuelMatchDistanceKm(value) {
  const distanceKm = validateDistanceKm(value, '매칭할 거리를 입력해줘.');

  if (distanceKm < 2 || distanceKm > 42.2) {
    throw new ApiError(400, '매칭 거리는 2km 이상 42.2km 이하로 선택해줘.');
  }

  return distanceKm;
}

function validateMatchSlotInput(value) {
  return validateMatchSlotStartAt(
    validateRequiredString(value, '매칭 시간대를 선택해줘.'),
  );
}

function validateMatchMode(value) {
  const mode = validateRequiredString(value, '매칭 모드를 선택해줘.');

  if (mode !== 'duel' && mode !== 'group') {
    throw new ApiError(400, '매칭 모드 값이 올바르지 않아.');
  }

  return mode;
}

function validateMatchRoomStartMode(value) {
  const startMode = validateRequiredString(value, '방 시작 방식을 선택해줘.');

  if (startMode !== 'scheduled' && startMode !== 'host') {
    throw new ApiError(400, '방 시작 방식 값이 올바르지 않아.');
  }

  return startMode;
}

function validateOptionalUserIdArray(value, message) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ApiError(400, message);
  }

  return value.map((userId) => validateRequiredString(userId, message));
}

function validatePace(value, message) {
  const pace = validateRequiredString(value, message);

  if (parsePaceToMinutes(pace) === null) {
    throw new ApiError(400, '페이스는 00:00/km 형식으로 입력해줘.');
  }

  return pace;
}

function validatePositiveInteger(value, message) {
  const numberValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new ApiError(400, message);
  }

  return numberValue;
}

function validateNonNegativeInteger(value, message) {
  const numberValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new ApiError(400, message);
  }

  return numberValue;
}

function validateOptionalMetricNumber(value, {
  message,
  minimum = 0,
  maximum = Number.POSITIVE_INFINITY,
  digits = 1,
} = {}) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }

  const numberValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numberValue) || numberValue < minimum || numberValue > maximum) {
    throw new ApiError(400, message);
  }

  return Number(numberValue.toFixed(digits));
}

function validateTrackedRoute(rawRoute) {
  if (!Array.isArray(rawRoute) || rawRoute.length < 2) {
    throw new ApiError(400, '러닝 경로는 최소 2개 이상의 위치 좌표가 필요해.');
  }

  if (rawRoute.length > 5000) {
    throw new ApiError(400, '러닝 경로 좌표가 너무 많아. 5000개 이하로 줄여줘.');
  }

  return rawRoute.map((point, index) => {
    if (!point || typeof point !== 'object') {
      throw new ApiError(400, `러닝 경로 ${index + 1}번째 좌표가 올바르지 않아.`);
    }

    const latitude = typeof point.latitude === 'number' ? point.latitude : Number(point.latitude);
    const longitude = typeof point.longitude === 'number' ? point.longitude : Number(point.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new ApiError(400, `러닝 경로 ${index + 1}번째 위도가 올바르지 않아.`);
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ApiError(400, `러닝 경로 ${index + 1}번째 경도가 올바르지 않아.`);
    }

    const timestamp = validateRequiredString(point.timestamp, `러닝 경로 ${index + 1}번째 시각이 비어 있어.`);
    const parsedTimestamp = new Date(timestamp);

    if (Number.isNaN(parsedTimestamp.getTime())) {
      throw new ApiError(400, `러닝 경로 ${index + 1}번째 시각 형식이 올바르지 않아.`);
    }

    const altitude = validateOptionalMetricNumber(point.altitude, {
      message: `러닝 경로 ${index + 1}번째 고도 값이 올바르지 않아.`,
      minimum: -1000,
      maximum: 10000,
      digits: 1,
    });

    return {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      ...(typeof altitude === 'number' ? { altitude } : {}),
      timestamp: parsedTimestamp.toISOString(),
    };
  });
}

function validateRunMatchResult(rawMatchResult) {
  if (rawMatchResult === null || typeof rawMatchResult === 'undefined') {
    return undefined;
  }

  if (!rawMatchResult || typeof rawMatchResult !== 'object') {
    throw new ApiError(400, '매치 결과 형식이 올바르지 않아.');
  }

  const mode = validateMatchMode(rawMatchResult.mode);
  const title = validateRequiredString(rawMatchResult.title, '매치 결과 제목이 비어 있어.');
  const summary = validateRequiredString(rawMatchResult.summary, '매치 결과 요약이 비어 있어.');
  const badgeLabel = validateRequiredString(rawMatchResult.badgeLabel, '매치 결과 배지가 비어 있어.');
  const opponentName = normalizeOptionalString(rawMatchResult.opponentName);
  const resultTone = normalizeOptionalString(rawMatchResult.resultTone);
  const rank = typeof rawMatchResult.rank !== 'undefined' && rawMatchResult.rank !== null
    ? validatePositiveInteger(rawMatchResult.rank, '매치 순위 값이 올바르지 않아.')
    : undefined;
  const participantCount = typeof rawMatchResult.participantCount !== 'undefined' && rawMatchResult.participantCount !== null
    ? validatePositiveInteger(rawMatchResult.participantCount, '매치 참가 인원 값이 올바르지 않아.')
    : undefined;
  const gapKm = validateOptionalMetricNumber(rawMatchResult.gapKm, {
    message: '매치 거리 차이 값이 올바르지 않아.',
    minimum: 0,
    maximum: 200,
    digits: 2,
  });
  const comparedDistanceKm = validateOptionalMetricNumber(rawMatchResult.comparedDistanceKm, {
    message: '비교 거리 값이 올바르지 않아.',
    minimum: 0,
    maximum: 200,
    digits: 2,
  });

  if (resultTone && !['win', 'lose', 'draw'].includes(resultTone)) {
    throw new ApiError(400, '매치 결과 상태 값이 올바르지 않아.');
  }

  return {
    mode,
    title,
    summary,
    badgeLabel,
    ...(opponentName ? { opponentName } : {}),
    ...(resultTone ? { resultTone } : {}),
    ...(typeof rank === 'number' ? { rank } : {}),
    ...(typeof participantCount === 'number' ? { participantCount } : {}),
    ...(typeof gapKm === 'number' ? { gapKm } : {}),
    ...(typeof comparedDistanceKm === 'number' ? { comparedDistanceKm } : {}),
  };
}

function validateRoutePreviewCoordinates(rawCoordinates) {
  if (!Array.isArray(rawCoordinates) || rawCoordinates.length < 2) {
    throw new ApiError(400, '추천 경로 좌표는 최소 2개 이상 필요해.');
  }

  if (rawCoordinates.length > 40) {
    throw new ApiError(400, '추천 경로 좌표가 너무 많아. 조금 줄여서 다시 시도해줘.');
  }

  return rawCoordinates.map((coordinate, index) => {
    if (!coordinate || typeof coordinate !== 'object') {
      throw new ApiError(400, `추천 경로 ${index + 1}번째 좌표가 올바르지 않아.`);
    }

    const latitude = typeof coordinate.latitude === 'number' ? coordinate.latitude : Number(coordinate.latitude);
    const longitude = typeof coordinate.longitude === 'number' ? coordinate.longitude : Number(coordinate.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new ApiError(400, `추천 경로 ${index + 1}번째 위도가 올바르지 않아.`);
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ApiError(400, `추천 경로 ${index + 1}번째 경도가 올바르지 않아.`);
    }

    return {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
    };
  });
}

function validateOptionalInventoryCount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return validateNonNegativeInteger(value, '재고 수량은 0 이상의 정수로 입력해줘.');
}

function validateDateTime(value, message) {
  const text = validateRequiredString(value, message);
  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, '일시는 올바른 날짜/시간 형식으로 입력해줘.');
  }

  return date.toISOString();
}

function validateOptionalDateTime(value, message) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }

  return validateDateTime(value, message);
}

function normalizeAdminMarketItemInput(body) {
  return {
    title: validateRequiredString(body.title, '상품 이름을 입력해줘.'),
    category: validateRequiredString(body.category, '카테고리를 입력해줘.'),
    description: validateRequiredString(body.description, '상품 설명을 입력해줘.'),
    costPoints: validatePositiveInteger(body.costPoints, '필요 포인트는 1 이상으로 입력해줘.'),
    partnerName: normalizeOptionalString(body.partnerName) || undefined,
    repeatable: validateBoolean(body.repeatable, '반복 교환 여부가 올바르지 않아.'),
    isActive: validateBoolean(body.isActive, '활성 상태가 올바르지 않아.'),
    inventoryCount: validateOptionalInventoryCount(body.inventoryCount),
  };
}

function normalizeAdminOfflineRaceEventInput(body) {
  const startsAt = validateDateTime(body.startsAt, '출발 일시를 입력해줘.');
  const registrationClosesAt = validateDateTime(body.registrationClosesAt, '접수 마감 일시를 입력해줘.');

  if (new Date(registrationClosesAt).getTime() >= new Date(startsAt).getTime()) {
    throw new ApiError(400, '접수 마감은 출발 시간보다 이전이어야 해.');
  }

  return {
    title: validateRequiredString(body.title, '레이스 이름을 입력해줘.'),
    subtitle: validateRequiredString(body.subtitle, '레이스 한 줄 설명을 입력해줘.'),
    distanceKm: validateDistanceKm(body.distanceKm, '레이스 거리를 입력해줘.'),
    startsAt,
    registrationClosesAt,
    participationMode: validateRequiredString(body.participationMode, '운영 방식을 입력해줘.'),
    proofMethod: validateRequiredString(body.proofMethod, '기록 인증 방식을 입력해줘.'),
    runWindowMinutes: validatePositiveInteger(body.runWindowMinutes, '진행 시간은 1분 이상으로 입력해줘.'),
    hostLabel: validateRequiredString(body.hostLabel, '운영 주체를 입력해줘.'),
    capacity: validatePositiveInteger(body.capacity, '정원은 1명 이상으로 입력해줘.'),
    entryFeePoints: validateNonNegativeInteger(body.entryFeePoints, '참가 포인트는 0 이상으로 입력해줘.'),
    operationNote: validateRequiredString(body.operationNote, '운영 안내를 입력해줘.'),
  };
}

function validateRewardRedemptionStatus(value) {
  const status = validateRequiredString(value, '교환 상태를 선택해줘.');

  if (!['requested', 'fulfilled', 'cancelled'].includes(status)) {
    throw new ApiError(400, '교환 상태 값이 올바르지 않아.');
  }

  return status;
}

function normalizeAdminNoticeInput(body) {
  return {
    title: validateRequiredString(body.title, '공지 제목을 입력해줘.'),
    message: validateRequiredString(body.message, '공지 내용을 입력해줘.'),
    priority: validateNonNegativeInteger(body.priority, '공지 우선순위는 0 이상의 정수로 입력해줘.'),
    isActive: validateBoolean(body.isActive, '공지 활성 상태가 올바르지 않아.'),
  };
}

function normalizeImportedRun(sourceType, rawRun) {
  const sourceLabel = normalizeOptionalString(rawRun.sourceLabel);
  const startedAt = validateOptionalDateTime(rawRun.startedAt, '연동 기록 시작 시각 형식이 올바르지 않아.');
  const endedAt = validateOptionalDateTime(rawRun.endedAt, '연동 기록 종료 시각 형식이 올바르지 않아.');
  const durationSeconds = rawRun.durationSeconds === null || typeof rawRun.durationSeconds === 'undefined' || rawRun.durationSeconds === ''
    ? undefined
    : validatePositiveInteger(rawRun.durationSeconds, '연동 기록 시간은 1초 이상이어야 해.');

  if (startedAt && endedAt && new Date(endedAt).getTime() <= new Date(startedAt).getTime()) {
    throw new ApiError(400, '연동 기록 종료 시각은 시작 시각보다 뒤여야 해.');
  }

  return {
    sourceType,
    externalId: normalizeOptionalString(rawRun.externalId),
    ...(sourceLabel
      ? {
          sourceLabel:
            sourceLabel === 'Nike Run Club'
              ? 'NRC'
              : sourceLabel === 'New Balance' || sourceLabel === 'My NB'
                ? 'MyNB'
                : sourceLabel,
        }
      : {}),
    date: validateDateOnly(rawRun.date, '연동 기록 날짜를 입력해줘.'),
    distanceKm: validateDistanceKm(rawRun.distanceKm, '연동 기록 거리를 입력해줘.'),
    pace: validatePace(rawRun.pace, '연동 기록 페이스를 입력해줘.'),
    ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(endedAt ? { endedAt } : {}),
  };
}

function requireConnectedSource(user, sourceType) {
  const source = ensureUserConnectedSources(user).find((entry) => entry.sourceType === sourceType);

  if (!source) {
    throw new ApiError(404, '선택한 연동 소스를 찾을 수 없어.');
  }

  return source;
}

function buildOfflineRaceHub(store, user) {
  ensureOfflineRaceStore(store);
  const sortedEvents = [...store.offlineRaceEvents]
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  const upcomingEvents = sortedEvents
    .filter((event) => getOfflineRaceStatus(event) !== 'finished')
    .map((event) => decorateOfflineRaceEvent(store, event, user));
  const featuredEvent = upcomingEvents.find((event) => event.registered) ?? upcomingEvents[0] ?? null;

  return {
    featuredEvent,
    upcomingEvents: upcomingEvents.filter((event) => event.id !== featuredEvent?.id),
    pastEvents: sortedEvents
      .filter((event) => getOfflineRaceStatus(event) === 'finished')
      .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime())
      .slice(0, 8)
      .map((event) => buildOfflineRacePastEvent(store, event)),
    guideSteps: [...(store.offlineRaceGuideSteps ?? DEFAULT_OFFLINE_RACE_GUIDE_STEPS)],
  };
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
