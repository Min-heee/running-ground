import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { loadStore, mutateStore, getStoreFilePath, getStoreDiagnostics, resetStore, STORE_DRIVER } from './storage/index.mjs';
import { createFriendsLeagueBridge } from './bridges/friendsLeagueBridge.mjs';
import { createSessionRunsBridge } from './bridges/sessionRunsBridge.mjs';
import { createPostgresDatabase } from './database/postgresDatabase.mjs';
import { createJsonAdminRepository } from './repositories/adminRepository.mjs';
import { createDefaultConnectedSources, createJsonAuthRepository } from './repositories/authRepository.mjs';
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
  CORS_ALLOW_ANY_ORIGIN,
  CORS_ORIGINS,
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
const STARTED_AT = new Date().toISOString();
const metricsCacheByStore = new WeakMap();
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
const RECOMMENDED_MATCH_DISTANCES = [3, 5, 7, 10, 15, 21.1, 42.2];
const DUEL_MIN_COMPATIBILITY_SCORE = 72;
const GROUP_MIN_COMPATIBILITY_SCORE = 68;
const GROUP_MIN_PARTICIPANTS = 4;
const MATCH_QUEUE_ENTRY_TTL_MS = 2 * 60 * 60 * 1000;
const MATCH_SESSION_READY_TTL_MS = 20 * 60 * 1000;
const MATCH_SESSION_COUNTDOWN_SECONDS = 10;
const MATCH_SESSION_ACTIVE_TTL_MS = 4 * 60 * 60 * 1000;
const MATCH_PARTICIPANT_RUNNING_STALE_MS = 90 * 1000;
const MATCH_PARTICIPANT_BACKGROUND_STALE_MS = 20 * 60 * 1000;

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isExclusiveIntegrationSourceType(sourceType) {
  return EXCLUSIVE_INTEGRATION_SOURCE_TYPES.has(sourceType);
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function logBackendError(label, error, extra = {}) {
  console.error(JSON.stringify({
    level: 'error',
    service: 'runningground-backend',
    label,
    message: getErrorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...extra,
  }));
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
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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
  if (response.writableEnded || response.destroyed) {
    return;
  }

  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  if (response.writableEnded || response.destroyed) {
    return;
  }

  if (error instanceof ApiError) {
    sendJson(response, error.statusCode, { message: error.message });
    return;
  }

  logBackendError('request_failed', error);
  sendJson(response, 500, { message: '서버에서 요청 처리 중 문제가 생겼어요.' });
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

function getAdminRepository() {
  if (!adminRepository) {
    adminRepository = createJsonAdminRepository({
      loadStore,
      mutateStore,
      ensureNoticeStore,
      ensureOfflineRaceStore,
      ensureIntegrationImports,
      findUserById,
      buildAdminOverview,
      buildAdminUsers,
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
    .filter((entry) => entry.userId === userId && isActiveRewardRedemption(entry))
    .reduce((sum, entry) => {
      const storedCostPoints = typeof entry.costPoints === 'number' ? entry.costPoints : null;
      return sum + (storedCostPoints ?? catalogByItemId.get(entry.itemId) ?? 0);
    }, 0);
}

function buildProfile(store, user) {
  ensureUserConnectedSources(user);
  return buildProfileWithMetrics(user, getUserMetrics(store, user.id));
}

function buildProfileWithMetrics(user, metrics) {
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

function formatDuelSlotLabel(slotStartAt) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '시간대 미정';
  }

  const startHours = String(slotStart.getHours()).padStart(2, '0');
  const startMinutes = String(slotStart.getMinutes()).padStart(2, '0');
  return `${startHours}:${startMinutes}`;
}

function formatPaceMinutesLabel(paceMinutes) {
  const totalSeconds = Math.max(0, Math.round(paceMinutes * 60));
  const minutesPart = Math.floor(totalSeconds / 60);
  const secondsPart = String(totalSeconds % 60).padStart(2, '0');
  return `${minutesPart}:${secondsPart}/km`;
}

function buildPaceBandLabel(paceMinutes) {
  return `${formatPaceMinutesLabel(Math.max(0, paceMinutes - 0.25))} ~ ${formatPaceMinutesLabel(paceMinutes + 0.25)}`;
}

function buildLevelLabel(distanceLevel) {
  return `Lv.${distanceLevel}`;
}

function buildMatchRunnerProfile(store, user) {
  const metrics = getUserMetrics(store, user.id);
  const recentRuns = getRunsForUser(store, user.id).slice(0, 3);
  const parsedPaces = recentRuns
    .map((run) => parsePaceToMinutes(run.pace))
    .filter((pace) => pace !== null);
  const averagePaceMinutes = parsedPaces.length
    ? parsedPaces.reduce((sum, pace) => sum + pace, 0) / parsedPaces.length
    : 5.5;
  const latestDistanceKm = recentRuns[0]?.distanceKm ?? metrics.currentWeekDistanceKm ?? 0;

  return {
    id: user.id,
    name: user.name,
    tag: user.publicTag,
    districtName: user.districtName,
    averagePaceMinutes,
    averagePace: formatPaceMinutesLabel(averagePaceMinutes),
    distanceLevel: metrics.distanceLevel,
    levelLabel: buildLevelLabel(metrics.distanceLevel),
    weeklyDistanceKm: metrics.currentWeekDistanceKm,
    lifetimeDistanceKm: metrics.lifetimeDistanceKm,
    latestDistanceKm,
  };
}

function calculateMatchCompatibilityScore(currentRunner, candidate, distanceKm, mode) {
  const paceGapSeconds = Math.abs(candidate.averagePaceMinutes - currentRunner.averagePaceMinutes) * 60;
  const levelGap = Math.abs(candidate.distanceLevel - currentRunner.distanceLevel);
  const distanceGap = Math.abs(candidate.latestDistanceKm - distanceKm);
  const weeklyGap = Math.abs(candidate.weeklyDistanceKm - currentRunner.weeklyDistanceKm);
  const penalty = paceGapSeconds * (mode === 'duel' ? 0.22 : 0.16)
    + levelGap * (mode === 'duel' ? 8 : 6.5)
    + distanceGap * (mode === 'duel' ? 2.8 : 2.2)
    + weeklyGap * (mode === 'duel' ? 0.8 : 0.55);

  return Math.max(0, Math.min(100, Number((100 - penalty).toFixed(1))));
}

function isRecommendedMatchDistance(distanceKm) {
  return RECOMMENDED_MATCH_DISTANCES.some((recommendedDistanceKm) => Math.abs(recommendedDistanceKm - distanceKm) < 0.15);
}

function findNearestRecommendedDistance(distanceKm) {
  return RECOMMENDED_MATCH_DISTANCES.reduce((closestDistanceKm, candidateDistanceKm) => (
    Math.abs(candidateDistanceKm - distanceKm) < Math.abs(closestDistanceKm - distanceKm)
      ? candidateDistanceKm
      : closestDistanceKm
  ));
}

function buildDistanceRecommendationHint(distanceKm) {
  if (isRecommendedMatchDistance(distanceKm)) {
    return '';
  }

  return `추천 거리 ${findNearestRecommendedDistance(distanceKm)}km로 바꾸면 더 빨리 비슷한 러너가 모일 수 있어요.`;
}

function normalizeMatchQueueDistance(distanceKm) {
  return Number(distanceKm.toFixed(1));
}

function ensureMatchQueues(store) {
  if (!store.matchQueues || typeof store.matchQueues !== 'object') {
    store.matchQueues = {
      duel: [],
      group: [],
    };
  }

  if (!Array.isArray(store.matchQueues.duel)) {
    store.matchQueues.duel = [];
  }

  if (!Array.isArray(store.matchQueues.group)) {
    store.matchQueues.group = [];
  }

  return store.matchQueues;
}

function pruneMatchQueues(store, now = new Date()) {
  const queues = ensureMatchQueues(store);
  const nowMs = now.getTime();
  const activeUserIds = new Set(store.users.map((user) => user.id));

  for (const mode of ['duel', 'group']) {
    queues[mode] = queues[mode].filter((entry) => {
      if (!entry || !activeUserIds.has(entry.userId)) {
        return false;
      }

      const requestedAtMs = new Date(entry.requestedAt).getTime();
      const slotStartAtMs = new Date(entry.slotStartAt).getTime();

      if (!Number.isFinite(requestedAtMs) || !Number.isFinite(slotStartAtMs)) {
        return false;
      }

      if (requestedAtMs + MATCH_QUEUE_ENTRY_TTL_MS <= nowMs) {
        return false;
      }

      return slotStartAtMs + 30 * 60 * 1000 > nowMs;
    });
  }

  return queues;
}

function upsertMatchQueueEntry(store, mode, userId, distanceKm, slotStartAt) {
  const queues = pruneMatchQueues(store);
  const normalizedDistanceKm = normalizeMatchQueueDistance(distanceKm);
  queues[mode] = queues[mode].filter((entry) => entry.userId !== userId);
  const queueEntry = {
    id: nextId(`${mode}-queue`),
    userId,
    distanceKm: normalizedDistanceKm,
    slotStartAt,
    requestedAt: new Date().toISOString(),
  };
  queues[mode].push(queueEntry);
  return queueEntry;
}

function removeUsersFromMatchQueue(store, mode, userIds) {
  if (!userIds.length) {
    return;
  }

  const queues = ensureMatchQueues(store);
  const blockedUserIds = new Set(userIds);
  queues[mode] = queues[mode].filter((entry) => !blockedUserIds.has(entry.userId));
}

function ensureMatchSessions(store) {
  if (!Array.isArray(store.matchSessions)) {
    store.matchSessions = [];
  }

  return store.matchSessions;
}

function hydrateMatchSessionState(session, now = new Date()) {
  const nowMs = now.getTime();
  const createdAtMs = new Date(session.createdAt).getTime();
  const countdownEndsAtMs = session.countdownEndsAt ? new Date(session.countdownEndsAt).getTime() : Number.NaN;
  const startedAtMs = session.startedAt ? new Date(session.startedAt).getTime() : Number.NaN;

  if (Number.isFinite(startedAtMs)) {
    return startedAtMs + MATCH_SESSION_ACTIVE_TTL_MS > nowMs ? 'active' : 'expired';
  }

  if (Number.isFinite(countdownEndsAtMs)) {
    if (countdownEndsAtMs <= nowMs) {
      session.startedAt = new Date(countdownEndsAtMs).toISOString();
      return 'active';
    }

    return 'countdown';
  }

  if (!Number.isFinite(createdAtMs) || createdAtMs + MATCH_SESSION_READY_TTL_MS <= nowMs) {
    return 'expired';
  }

  return 'ready';
}

function pruneMatchSessions(store, now = new Date()) {
  const sessions = ensureMatchSessions(store);
  const activeUserIds = new Set(store.users.map((user) => user.id));

  store.matchSessions = sessions.filter((session) => {
    if (!session || !Array.isArray(session.participants) || !session.participants.length) {
      return false;
    }

    if (session.participants.some((participant) => !activeUserIds.has(participant.userId))) {
      return false;
    }

    if (session.participants.every((participant) => resolveParticipantLiveStatus(participant, now) === 'forfeited')) {
      return false;
    }

    return hydrateMatchSessionState(session, now) !== 'expired';
  });

  return store.matchSessions;
}

function clearUsersFromMatchSessions(store, mode, userIds) {
  const blockedUserIds = new Set(userIds);
  const sessions = pruneMatchSessions(store);
  store.matchSessions = sessions.filter((session) => (
    session.mode !== mode || !session.participants.some((participant) => (
      blockedUserIds.has(participant.userId) && resolveParticipantLiveStatus(participant) !== 'forfeited'
    ))
  ));
}

function createMatchSession(store, mode, distanceKm, slotStartAt, participants) {
  clearUsersFromMatchSessions(store, mode, participants.map((participant) => participant.id));
  const session = {
    id: nextId(`${mode}-match`),
    mode,
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt,
    createdAt: new Date().toISOString(),
    participants: participants.map((participant, index) => ({
      userId: participant.id,
      seedRank: participant.seedRank ?? index + 1,
      acceptedAt: null,
      liveStatus: 'ready',
      liveDistanceKm: 0,
      liveElapsedSeconds: 0,
      livePace: '--:--/km',
      liveUpdatedAt: null,
      finishedAt: null,
    })),
  };
  ensureMatchSessions(store).push(session);
  return session;
}

function resolveParticipantLiveStatus(participant, now = new Date()) {
  if (typeof participant.finishedAt === 'string' && participant.finishedAt) {
    return 'finished';
  }

  const storedStatus = typeof participant.liveStatus === 'string' && participant.liveStatus
    ? participant.liveStatus
    : 'ready';

  if (!participant.liveUpdatedAt || ['ready', 'finished', 'forfeited'].includes(storedStatus)) {
    return storedStatus;
  }

  const liveUpdatedAtMs = new Date(participant.liveUpdatedAt).getTime();
  if (!Number.isFinite(liveUpdatedAtMs)) {
    return storedStatus;
  }

  const ageMs = now.getTime() - liveUpdatedAtMs;
  if (storedStatus === 'running' && ageMs > MATCH_PARTICIPANT_RUNNING_STALE_MS) {
    return 'disconnected';
  }

  if (['background', 'paused'].includes(storedStatus) && ageMs > MATCH_PARTICIPANT_BACKGROUND_STALE_MS) {
    return 'disconnected';
  }

  return storedStatus;
}

function buildParticipantLiveSnapshot(participant, now = new Date()) {
  return {
    ...(typeof participant.liveDistanceKm === 'number' ? { liveDistanceKm: Number(participant.liveDistanceKm.toFixed(2)) } : {}),
    ...(typeof participant.liveElapsedSeconds === 'number' ? { liveElapsedSeconds: participant.liveElapsedSeconds } : {}),
    ...(typeof participant.livePace === 'string' && participant.livePace.trim() ? { livePace: participant.livePace.trim() } : {}),
    ...(typeof participant.liveUpdatedAt === 'string' && participant.liveUpdatedAt ? { liveUpdatedAt: participant.liveUpdatedAt } : {}),
    liveStatus: resolveParticipantLiveStatus(participant, now),
    ...(typeof participant.finishedAt === 'string' && participant.finishedAt ? { finishedAt: participant.finishedAt } : {}),
  };
}

function buildExpirySnapshot(expiresAt, now = new Date()) {
  const expiresAtMs = new Date(expiresAt).getTime();

  if (!Number.isFinite(expiresAtMs)) {
    return {};
  }

  return {
    expiresAt,
    expiresInSeconds: Math.max(0, Math.ceil((expiresAtMs - now.getTime()) / 1000)),
  };
}

function findMatchSessionForUser(store, mode, userId, { distanceKm, slotStartAt } = {}) {
  const normalizedDistanceKm = distanceKm === undefined ? null : normalizeMatchQueueDistance(distanceKm);
  const sessions = pruneMatchSessions(store);

  return sessions.find((session) => {
    if (session.mode !== mode) {
      return false;
    }

    if (!session.participants.some((participant) => (
      participant.userId === userId && resolveParticipantLiveStatus(participant) !== 'forfeited'
    ))) {
      return false;
    }

    if (normalizedDistanceKm !== null && Math.abs(session.distanceKm - normalizedDistanceKm) >= 0.15) {
      return false;
    }

    if (slotStartAt && session.slotStartAt !== slotStartAt) {
      return false;
    }

    return true;
  }) ?? null;
}

function leaveRunningMatch(store, currentUser, { matchId }) {
  const session = findMatchSessionById(store, matchId);

  if (!session) {
    return { success: true };
  }

  const currentParticipant = session.participants.find((participant) => participant.userId === currentUser.id);

  if (!currentParticipant) {
    return { success: true };
  }

  const state = hydrateMatchSessionState(session);

  if (!['countdown', 'active'].includes(state)) {
    throw new ApiError(400, '이미 출발한 매치에서만 혼자 계속 달릴 수 있어.');
  }

  const forfeitedAt = new Date().toISOString();
  currentParticipant.liveStatus = 'forfeited';
  currentParticipant.liveUpdatedAt = forfeitedAt;
  currentParticipant.forfeitedAt = forfeitedAt;

  return { success: true };
}

function findMatchSessionById(store, matchId) {
  if (!matchId) {
    return null;
  }

  return pruneMatchSessions(store).find((session) => session.id === matchId) ?? null;
}

function buildSessionGroupParticipants(store, session, now = new Date()) {
  return session.participants
    .map((participant) => {
      const runner = buildMatchRunnerProfile(store, findUserById(store, participant.userId));
      return {
        id: runner.id,
        name: runner.name,
        tag: runner.tag,
        districtName: runner.districtName,
        averagePace: runner.averagePace,
        levelLabel: runner.levelLabel,
        weeklyDistanceKm: runner.weeklyDistanceKm,
        lifetimeDistanceKm: runner.lifetimeDistanceKm,
        seedRank: participant.seedRank,
        seedSummary: `${participant.seedRank}번 시드 · 이번 주 ${runner.weeklyDistanceKm.toFixed(1)}km`,
        accepted: Boolean(participant.acceptedAt),
        ...buildParticipantLiveSnapshot(participant, now),
      };
    })
    .sort((left, right) => left.seedRank - right.seedRank);
}

function buildSessionDuelOpponent(store, session, currentUserId, now = new Date()) {
  const currentUser = findUserById(store, currentUserId);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const opponentEntry = session.participants.find((participant) => participant.userId !== currentUserId);

  if (!opponentEntry) {
    return null;
  }

  const opponentUser = findUserById(store, opponentEntry.userId);
  const opponentRunner = buildMatchRunnerProfile(store, opponentUser);
  const compatibilityScore = calculateMatchCompatibilityScore(currentRunner, opponentRunner, session.distanceKm, 'duel');

  return {
    id: opponentRunner.id,
    name: opponentRunner.name,
    tag: opponentRunner.tag,
    districtName: opponentRunner.districtName,
    averagePace: opponentRunner.averagePace,
    levelLabel: opponentRunner.levelLabel,
    weeklyDistanceKm: opponentRunner.weeklyDistanceKm,
    lifetimeDistanceKm: opponentRunner.lifetimeDistanceKm,
    compatibilitySummary: `${opponentRunner.averagePace} 페이스 · ${opponentRunner.levelLabel} · 이번 주 ${opponentRunner.weeklyDistanceKm.toFixed(1)}km · 적합도 ${compatibilityScore.toFixed(0)}점`,
    accepted: Boolean(opponentEntry.acceptedAt),
    ...buildParticipantLiveSnapshot(opponentEntry, now),
  };
}

function getMatchQueueEntries(store, mode, distanceKm, slotStartAt) {
  const normalizedDistanceKm = normalizeMatchQueueDistance(distanceKm);
  const queues = pruneMatchQueues(store);

  return queues[mode].filter((entry) => (
    entry.slotStartAt === slotStartAt && Math.abs(entry.distanceKm - normalizedDistanceKm) < 0.15
  ));
}

function buildQueuedMatchRunnerEntries(store, mode, currentRunner, { distanceKm, slotStartAt, includeCurrentUser = false }) {
  const queueEntries = getMatchQueueEntries(store, mode, distanceKm, slotStartAt)
    .filter((entry) => includeCurrentUser || entry.userId !== currentRunner.id);

  return queueEntries.map((queueEntry) => {
    const user = findUserById(store, queueEntry.userId);
    const runner = buildMatchRunnerProfile(store, user);
    const score = runner.id === currentRunner.id
      ? 100
      : calculateMatchCompatibilityScore(currentRunner, runner, distanceKm, mode);

    return {
      queueEntry,
      runner,
      score,
    };
  });
}

function buildQueuedParticipants(entries) {
  return entries
    .map((entry) => entry.runner)
    .sort((left, right) => {
      const leftSeed = left.averagePaceMinutes * 60 * 0.7 - left.weeklyDistanceKm * 1.8 - left.lifetimeDistanceKm * 0.03;
      const rightSeed = right.averagePaceMinutes * 60 * 0.7 - right.weeklyDistanceKm * 1.8 - right.lifetimeDistanceKm * 0.03;
      return leftSeed - rightSeed;
    })
    .map((participant, index) => ({
      id: participant.id,
      name: participant.name,
      tag: participant.tag,
      districtName: participant.districtName,
      averagePace: participant.averagePace,
      levelLabel: participant.levelLabel,
      weeklyDistanceKm: participant.weeklyDistanceKm,
      lifetimeDistanceKm: participant.lifetimeDistanceKm,
      seedRank: index + 1,
      seedSummary: `${index + 1}번 시드 · 이번 주 ${participant.weeklyDistanceKm.toFixed(1)}km`,
    }));
}

function buildRunningMatchStatusResponse(store, currentUser, { mode, distanceKm, slotStartAt }) {
  const now = new Date();
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const slotLabel = formatDuelSlotLabel(slotStartAt);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const session = findMatchSessionForUser(store, mode, currentUser.id, {
    distanceKm,
    slotStartAt,
  });
  const capacity = mode === 'duel' ? 2 : 30;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  if (session) {
    const state = hydrateMatchSessionState(session, now);
    const acceptedCount = session.participants.filter((participant) => participant.acceptedAt).length;
    const currentParticipant = session.participants.find((participant) => participant.userId === currentUser.id) ?? null;
    const countdownRemainingSeconds = session.countdownEndsAt
      ? Math.max(0, Math.ceil((new Date(session.countdownEndsAt).getTime() - now.getTime()) / 1000))
      : undefined;
    const readyExpiresAt = session.createdAt
      ? new Date(new Date(session.createdAt).getTime() + MATCH_SESSION_READY_TTL_MS).toISOString()
      : null;
    const expirySnapshot = state === 'ready' && readyExpiresAt
      ? buildExpirySnapshot(readyExpiresAt, now)
      : state === 'countdown' && session.countdownEndsAt
        ? buildExpirySnapshot(session.countdownEndsAt, now)
        : {};

    if (mode === 'duel') {
      const opponent = buildSessionDuelOpponent(store, session, currentUser.id, now);
      return {
        success: true,
        mode,
        state,
        matchId: session.id,
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel,
        paceBandLabel,
        levelBandLabel,
        criteriaSummary: state === 'ready'
          ? '상대가 잡혔어요. 두 사람이 모두 수락하면 10초 카운트다운 뒤 시작해요.'
          : state === 'countdown'
            ? `두 사람이 모두 수락했어요. ${countdownRemainingSeconds ?? MATCH_SESSION_COUNTDOWN_SECONDS}초 뒤 출발해요.`
            : '이제 바로 출발할 수 있어요.',
        estimatedWaitMinutes: 0,
        participantCount: session.participants.length,
        acceptedCount,
        capacity,
        userAccepted: Boolean(currentParticipant?.acceptedAt),
        readyToStart: state === 'active',
        ...(session.countdownEndsAt ? { countdownEndsAt: session.countdownEndsAt } : {}),
        ...(typeof countdownRemainingSeconds === 'number' ? { countdownRemainingSeconds } : {}),
        ...expirySnapshot,
        ...(opponent ? { opponent } : {}),
      };
    }

    const participants = buildSessionGroupParticipants(store, session, now);
    const mySeedRank = participants.find((participant) => participant.id === currentUser.id)?.seedRank ?? 1;

    return {
      success: true,
      mode,
      state,
      matchId: session.id,
      distanceKm: session.distanceKm,
      slotStartAt: session.slotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: state === 'ready'
        ? '그룹이 잡혔어요. 모두 수락하면 10초 카운트다운 뒤 같이 출발해요.'
        : state === 'countdown'
          ? `모두 수락했어요. ${countdownRemainingSeconds ?? MATCH_SESSION_COUNTDOWN_SECONDS}초 뒤 그룹전이 시작돼요.`
          : '이제 바로 그룹 러닝을 시작할 수 있어요.',
      estimatedWaitMinutes: 0,
      participantCount: session.participants.length,
      acceptedCount,
      capacity,
      userAccepted: Boolean(currentParticipant?.acceptedAt),
      readyToStart: state === 'active',
      ...(session.countdownEndsAt ? { countdownEndsAt: session.countdownEndsAt } : {}),
      ...(typeof countdownRemainingSeconds === 'number' ? { countdownRemainingSeconds } : {}),
      ...expirySnapshot,
      participants,
      mySeedRank,
    };
  }

  const queuedEntries = buildQueuedMatchRunnerEntries(store, mode, currentRunner, {
    distanceKm,
    slotStartAt,
    includeCurrentUser: true,
  });
  const queuedParticipants = queuedEntries.map((entry) => entry.runner);
  const competitiveThreshold = mode === 'duel' ? DUEL_MIN_COMPATIBILITY_SCORE : GROUP_MIN_COMPATIBILITY_SCORE;
  const competitiveParticipantsCount = queuedEntries.filter((entry) => (
    entry.runner.id === currentRunner.id || entry.score >= competitiveThreshold
  )).length;
  const currentQueueEntry = queuedEntries.find((entry) => entry.runner.id === currentRunner.id)?.queueEntry ?? null;
  const averagePaceMinutes = queuedParticipants.length
    ? queuedParticipants.reduce((sum, runner) => sum + runner.averagePaceMinutes, 0) / queuedParticipants.length
    : null;
  const averagePace = averagePaceMinutes === null ? '신청 없음' : formatPaceMinutesLabel(averagePaceMinutes);
  const participants = mode === 'group' ? buildQueuedParticipants(queuedEntries) : undefined;
  const mySeedRank = participants?.find((participant) => participant.id === currentUser.id)?.seedRank ?? 1;
  const queueExpiresAt = currentQueueEntry?.requestedAt
    ? new Date(new Date(currentQueueEntry.requestedAt).getTime() + MATCH_QUEUE_ENTRY_TTL_MS).toISOString()
    : null;

  return {
    success: true,
    mode,
    state: queuedEntries.length ? 'waiting' : 'idle',
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt,
    slotLabel,
    paceBandLabel: averagePaceMinutes === null ? paceBandLabel : buildPaceBandLabel(averagePaceMinutes),
    levelBandLabel,
    criteriaSummary: mode === 'duel'
      ? queuedEntries.length
        ? `현재 같은 조건 대기 러너는 ${queuedEntries.length}/${capacity}명이에요. 잘 맞는 상대가 잡히면 바로 수락 단계로 넘어가요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 조건으로 대기 중인 러너가 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
      : queuedEntries.length
        ? `현재 실제 대기열은 ${queuedEntries.length}/${capacity}명이고, 비슷한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요.${competitiveParticipantsCount < GROUP_MIN_PARTICIPANTS ? ` 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.` : ''}${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 조건으로 대기 중인 그룹이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
    estimatedWaitMinutes: mode === 'duel' ? 12 : 10,
    participantCount: queuedEntries.length,
    acceptedCount: 0,
    capacity,
    userAccepted: false,
    readyToStart: false,
    ...(queueExpiresAt ? buildExpirySnapshot(queueExpiresAt, now) : {}),
    ...(mode === 'duel' ? {
      opponent: undefined,
    } : {
      participants,
      mySeedRank,
    }),
    averagePace,
  };
}

function buildDuelMatchResponse(store, currentUser, { distanceKm, slotStartAt }) {
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const slotLabel = formatDuelSlotLabel(slotStartAt);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  upsertMatchQueueEntry(store, 'duel', currentUser.id, distanceKm, slotStartAt);
  const queuedEntries = buildQueuedMatchRunnerEntries(store, 'duel', currentRunner, {
    distanceKm,
    slotStartAt,
  }).sort((left, right) => right.score - left.score);

  if (!queuedEntries.length) {
    return {
      success: true,
      matched: false,
      requestId: nextId('duel-request'),
      distanceKm,
      slotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `같은 시간대 대기 러너가 아직 없어 먼저 대기열에 들어갔어요. 현재 신청 1/2명.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 15,
    };
  }

  const bestCandidate = queuedEntries[0];

  if (!bestCandidate || bestCandidate.score < DUEL_MIN_COMPATIBILITY_SCORE) {
    return {
      success: true,
      matched: false,
      requestId: nextId('duel-request'),
      distanceKm,
      slotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `현재 같은 조건 신청은 ${queuedEntries.length + 1}/2명이지만 아직 페이스나 레벨이 잘 맞지 않아요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
    };
  }

  removeUsersFromMatchQueue(store, 'duel', [currentUser.id, bestCandidate.runner.id]);
  createMatchSession(store, 'duel', distanceKm, slotStartAt, [
    { id: currentUser.id, seedRank: 1 },
    { id: bestCandidate.runner.id, seedRank: 2 },
  ]);

  const opponent = bestCandidate.runner;
  return {
    success: true,
    matched: true,
    requestId: nextId('duel-request'),
    distanceKm,
    slotStartAt,
    slotLabel,
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: '실제 신청 대기열에서 비슷한 페이스와 누적 거리 레벨 러너를 바로 붙였어요.',
    estimatedWaitMinutes: 0,
    opponent: {
      id: opponent.id,
      name: opponent.name,
      tag: opponent.tag,
      districtName: opponent.districtName,
      averagePace: opponent.averagePace,
      levelLabel: opponent.levelLabel,
      weeklyDistanceKm: opponent.weeklyDistanceKm,
      lifetimeDistanceKm: opponent.lifetimeDistanceKm,
      compatibilitySummary: `${opponent.averagePace} 페이스 · ${opponent.levelLabel} · 이번 주 ${opponent.weeklyDistanceKm.toFixed(1)}km · 적합도 ${bestCandidate.score.toFixed(0)}점`,
    },
  };
}

function buildGroupMatchResponse(store, currentUser, { distanceKm, slotStartAt }) {
  const maxGroupSize = 30;
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const slotLabel = formatDuelSlotLabel(slotStartAt);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  upsertMatchQueueEntry(store, 'group', currentUser.id, distanceKm, slotStartAt);
  const queuedEntries = buildQueuedMatchRunnerEntries(store, 'group', currentRunner, {
    distanceKm,
    slotStartAt,
    includeCurrentUser: true,
  }).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return new Date(left.queueEntry.requestedAt).getTime() - new Date(right.queueEntry.requestedAt).getTime();
  });

  const compatibleEntries = queuedEntries
    .filter((entry) => entry.runner.id === currentRunner.id || entry.score >= GROUP_MIN_COMPATIBILITY_SCORE)
    .slice(0, maxGroupSize);
  const participants = buildQueuedParticipants(compatibleEntries);
  const mySeedRank = participants.find((participant) => participant.id === currentRunner.id)?.seedRank ?? 1;

  if (participants.length < GROUP_MIN_PARTICIPANTS) {
    return {
      success: true,
      matched: false,
      requestId: nextId('group-request'),
      distanceKm,
      slotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `현재 같은 조건으로 신청한 비슷한 러너는 ${participants.length}/${maxGroupSize}명이라 아직 그룹을 열지 않았어요. 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
      maxGroupSize,
      participantsCount: participants.length,
      mySeedRank,
      participants,
    };
  }

  removeUsersFromMatchQueue(store, 'group', participants.map((participant) => participant.id));
  createMatchSession(store, 'group', distanceKm, slotStartAt, participants);

  return {
    success: true,
    matched: true,
    requestId: nextId('group-request'),
    distanceKm,
    slotStartAt,
    slotLabel,
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: '실제 신청 대기열에서 비슷한 러너를 모아 그룹 대결을 만들었어요.',
    estimatedWaitMinutes: 0,
    maxGroupSize,
    participantsCount: participants.length,
    mySeedRank,
    participants,
  };
}

function buildMatchDemandSummaryResponse(store, currentUser, { mode, distanceKm, slotStartAt }) {
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const capacity = mode === 'duel' ? 2 : 30;
  const competitiveThreshold = mode === 'duel' ? DUEL_MIN_COMPATIBILITY_SCORE : GROUP_MIN_COMPATIBILITY_SCORE;
  const queuedEntries = buildQueuedMatchRunnerEntries(store, mode, currentRunner, {
    distanceKm,
    slotStartAt,
    includeCurrentUser: true,
  });
  const queuedParticipants = queuedEntries.map((entry) => entry.runner);
  const competitiveParticipantsCount = queuedEntries
    .filter((entry) => entry.runner.id === currentRunner.id || entry.score >= competitiveThreshold)
    .length;
  const participantsCount = queuedEntries.length;
  const averagePaceMinutes = queuedParticipants.length
    ? queuedParticipants.reduce((sum, runner) => sum + runner.averagePaceMinutes, 0) / queuedParticipants.length
    : null;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);
  const averagePace = averagePaceMinutes === null ? '신청 없음' : formatPaceMinutesLabel(averagePaceMinutes);

  return {
    success: true,
    mode,
    distanceKm,
    slotStartAt,
    slotLabel: formatDuelSlotLabel(slotStartAt),
    averagePace,
    participantsCount,
    competitiveParticipantsCount,
    capacity,
    fillRatioLabel: `${participantsCount}/${capacity}`,
    paceBandLabel: averagePaceMinutes === null ? '대기 없음' : buildPaceBandLabel(averagePaceMinutes),
    summaryText: mode === 'duel'
      ? participantsCount
        ? `현재 실제 신청은 ${participantsCount}/${capacity}명이고, 바로 붙일 만한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 시간대 신청이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
      : participantsCount
        ? `현재 실제 신청은 ${participantsCount}/${capacity}명이고, 비슷한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요.${competitiveParticipantsCount < GROUP_MIN_PARTICIPANTS ? ` 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.` : ''}${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 시간대 신청이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
  };
}

function acceptRunningMatch(store, currentUser, matchId) {
  const session = findMatchSessionById(store, matchId);

  if (!session || !session.participants.some((participant) => participant.userId === currentUser.id)) {
    throw new ApiError(404, '수락할 매치를 찾지 못했어.');
  }

  const state = hydrateMatchSessionState(session);

  if (state === 'active') {
    return buildRunningMatchStatusResponse(store, currentUser, {
      mode: session.mode,
      distanceKm: session.distanceKm,
      slotStartAt: session.slotStartAt,
    });
  }

  const currentParticipant = session.participants.find((participant) => participant.userId === currentUser.id);

  if (currentParticipant && !currentParticipant.acceptedAt) {
    currentParticipant.acceptedAt = new Date().toISOString();
  }

  if (
    session.participants.every((participant) => participant.acceptedAt)
    && !session.countdownEndsAt
    && !session.startedAt
  ) {
    session.countdownEndsAt = new Date(Date.now() + MATCH_SESSION_COUNTDOWN_SECONDS * 1000).toISOString();
  }

  return buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
  });
}

function cancelRunningMatch(store, currentUser, { mode, distanceKm, slotStartAt, matchId }) {
  const normalizedDistanceKm = normalizeMatchQueueDistance(distanceKm);
  const queueEntries = getMatchQueueEntries(store, mode, normalizedDistanceKm, slotStartAt);
  const session = matchId
    ? findMatchSessionById(store, matchId)
    : findMatchSessionForUser(store, mode, currentUser.id, { distanceKm: normalizedDistanceKm, slotStartAt });

  removeUsersFromMatchQueue(store, mode, [currentUser.id]);

  if (session && session.participants.some((participant) => participant.userId === currentUser.id)) {
    const state = hydrateMatchSessionState(session);

    if (state === 'active') {
      throw new ApiError(400, '이미 출발한 매치는 취소할 수 없어.');
    }

    const requeuedParticipants = session.participants
      .filter((participant) => participant.userId !== currentUser.id)
      .map((participant) => findUserById(store, participant.userId));

    store.matchSessions = ensureMatchSessions(store).filter((entry) => entry.id !== session.id);

    for (const participant of requeuedParticipants) {
      upsertMatchQueueEntry(store, mode, participant.id, session.distanceKm, session.slotStartAt);
    }

    return { success: true };
  }

  if (!queueEntries.some((entry) => entry.userId === currentUser.id)) {
    return { success: true };
  }

  return { success: true };
}

function updateRunningMatchProgress(store, currentUser, { matchId, distanceKm, elapsedSeconds, currentPace, status }) {
  const session = findMatchSessionById(store, matchId);

  if (!session || !session.participants.some((participant) => participant.userId === currentUser.id)) {
    throw new ApiError(404, '진행 상태를 반영할 매치를 찾지 못했어.');
  }

  const sessionState = hydrateMatchSessionState(session);

  if (!['countdown', 'active'].includes(sessionState)) {
    throw new ApiError(400, '아직 시작 전인 매치에는 진행 상태를 반영할 수 없어.');
  }

  const currentParticipant = session.participants.find((participant) => participant.userId === currentUser.id);

  if (resolveParticipantLiveStatus(currentParticipant) === 'forfeited') {
    return buildRunningMatchStatusResponse(store, currentUser, {
      mode: session.mode,
      distanceKm: session.distanceKm,
      slotStartAt: session.slotStartAt,
    });
  }

  currentParticipant.liveDistanceKm = Number(distanceKm.toFixed(2));
  currentParticipant.liveElapsedSeconds = elapsedSeconds;
  currentParticipant.livePace = currentPace;
  currentParticipant.liveUpdatedAt = new Date().toISOString();
  currentParticipant.liveStatus = status === 'finished' ? 'finished' : status;

  if (status === 'finished') {
    currentParticipant.finishedAt = currentParticipant.liveUpdatedAt;
  }

  if (status === 'running') {
    currentParticipant.finishedAt = null;
  }

  if (status === 'background' || status === 'paused') {
    currentParticipant.finishedAt = null;
  }

  return buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
  });
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

function ensureUserConnectedSources(user) {
  const defaultSources = createDefaultConnectedSources();
  const currentSources = Array.isArray(user.connectedSources) ? user.connectedSources : [];
  const currentSourceByType = new Map(
    currentSources
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.sourceType === 'string')
      .map((entry) => [entry.sourceType, entry]),
  );
  const knownSourceTypes = new Set(defaultSources.map((source) => source.sourceType));
  const mergedDefaultSources = defaultSources.map((defaultSource) => {
    const existingSource = currentSourceByType.get(defaultSource.sourceType);

    if (!existingSource) {
      return clone(defaultSource);
    }

    return {
      ...clone(defaultSource),
      ...clone(existingSource),
      sourceType: defaultSource.sourceType,
      displayName: existingSource.displayName ?? defaultSource.displayName,
      recommendedPlatform: existingSource.recommendedPlatform ?? defaultSource.recommendedPlatform,
    };
  });
  const extraSources = currentSources
    .filter((source) => !knownSourceTypes.has(source?.sourceType))
    .map((source) => clone(source));

  user.connectedSources = [...mergedDefaultSources, ...extraSources];
  return user.connectedSources;
}

function normalizeRewardRedemptionStatus(value) {
  const normalizedValue = normalizeOptionalString(value);
  return normalizedValue === 'fulfilled' || normalizedValue === 'cancelled' ? normalizedValue : 'requested';
}

function isActiveRewardRedemption(entry) {
  return normalizeRewardRedemptionStatus(entry?.status) !== 'cancelled';
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

function buildNoticeEntry(notice) {
  return {
    id: notice.id,
    title: notice.title,
    message: notice.message,
    priority: notice.priority,
    isActive: notice.isActive !== false,
    createdAt: notice.createdAt,
    updatedAt: notice.updatedAt,
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

function buildStoreCounts(store) {
  return {
    users: store.users.length,
    runs: store.runs.length,
    integrationImports: (store.integrationImports ?? []).length,
    friendships: store.friendships.length,
    friendRequests: store.friendRequests.length,
    sessions: store.sessions.length,
    rewardRedemptions: (store.rewardRedemptions ?? []).length,
    notices: (store.notices ?? []).length,
    marketItems: (store.marketCatalog ?? []).length,
    offlineRaceEvents: (store.offlineRaceEvents ?? []).length,
  };
}

function buildHealthStatus() {
  const readBridges = {
    sessionRuns: getSessionRunsBridge().getConfig(),
    friendsLeague: getFriendsLeagueBridge().getConfig(),
  };
  const basePayload = {
    environment: APP_ENV,
    startedAt: STARTED_AT,
    uptimeSeconds: Math.round(process.uptime()),
    storeDriver: STORE_DRIVER,
    storeFile: getStoreFilePath(),
    publicBaseUrl: PUBLIC_BASE_URL || undefined,
    config: getPublicBackendConfig(),
    readBridges,
    now: new Date().toISOString(),
  };

  try {
    const store = loadStore();

    return {
      statusCode: 200,
      payload: {
        status: 'ok',
        ready: true,
        ...basePayload,
        store: {
          ...getStoreDiagnostics(),
          counts: buildStoreCounts(store),
        },
      },
    };
  } catch (error) {
    return {
      statusCode: 503,
      payload: {
        status: 'error',
        ready: false,
        ...basePayload,
        message: getErrorMessage(error),
        store: getStoreDiagnostics(),
      },
    };
  }
}

function buildAdminStatus(store) {
  ensureNoticeStore(store);
  ensureMarketCatalogStore(store);
  ensureOfflineRaceStore(store);
  return {
    status: 'ok',
    startedAt: STARTED_AT,
    uptimeSeconds: Math.round(process.uptime()),
    storeDriver: STORE_DRIVER,
    storeFile: getStoreFilePath(),
    config: getPublicBackendConfig(),
    readBridges: {
      sessionRuns: getSessionRunsBridge().getConfig(),
      friendsLeague: getFriendsLeagueBridge().getConfig(),
    },
    store: getStoreDiagnostics(),
    counts: buildStoreCounts(store),
  };
}

function buildAdminSession() {
  return {
    success: true,
    environment: APP_ENV,
    publicBaseUrl: PUBLIC_BASE_URL || undefined,
  };
}

function buildAdminOverview(store) {
  ensureNoticeStore(store);
  ensureMarketCatalogStore(store);
  ensureOfflineRaceStore(store);
  const now = new Date();
  const activeOfflineRaceEvents = store.offlineRaceEvents.filter((event) => getOfflineRaceStatus(event, now) !== 'finished');

  return {
    environment: APP_ENV,
    publicBaseUrl: PUBLIC_BASE_URL || undefined,
    counts: {
      users: store.users.length,
      runs: store.runs.length,
      marketItems: store.marketCatalog.length,
      activeMarketItems: store.marketCatalog.filter((item) => item.isActive !== false).length,
      offlineRaceEvents: store.offlineRaceEvents.length,
      activeOfflineRaceEvents: activeOfflineRaceEvents.length,
      notices: store.notices.length,
      activeNotices: store.notices.filter((notice) => notice.isActive !== false).length,
      rewardRedemptions: (store.rewardRedemptions ?? []).length,
      sessions: store.sessions.length,
    },
  };
}

function buildAdminUserSummary(store, user) {
  const metrics = getUserMetrics(store, user.id);
  const runs = getRunsForUser(store, user.id);

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    ...(normalizeOptionalString(user.realName) ? { realName: user.realName } : {}),
    ...(normalizeOptionalString(user.phone) ? { phone: user.phone } : {}),
    ...(normalizeOptionalString(user.birthDate) ? { birthDate: user.birthDate } : {}),
    publicTag: user.publicTag,
    ...(normalizeOptionalString(user.provinceName) ? { provinceName: user.provinceName } : {}),
    ...(normalizeOptionalString(user.cityName) ? { cityName: user.cityName } : {}),
    districtName: user.districtName,
    ...(normalizeOptionalString(user.universityName) ? { universityName: user.universityName } : {}),
    ...(normalizeOptionalString(user.createdAt) ? { createdAt: user.createdAt } : {}),
    lifetimeDistanceKm: metrics.lifetimeDistanceKm,
    currentWeekDistanceKm: metrics.currentWeekDistanceKm,
    currentWeekPoints: metrics.currentWeekPoints,
    totalRuns: runs.length,
    connectedSourceCount: ensureUserConnectedSources(user).filter((source) => source.connected).length,
  };
}

function buildAdminUsers(store) {
  return {
    users: [...store.users]
      .sort((left, right) => {
        const leftCreatedAt = normalizeOptionalString(left.createdAt);
        const rightCreatedAt = normalizeOptionalString(right.createdAt);

        if (leftCreatedAt !== rightCreatedAt) {
          return rightCreatedAt.localeCompare(leftCreatedAt);
        }

        return left.name.localeCompare(right.name, 'ko');
      })
      .map((user) => buildAdminUserSummary(store, user)),
  };
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

async function buildDistrictPersonalReadPayload(request) {
  const { payload } = await getFriendsLeagueBridge().getDistrictPersonal({
    store: loadStore(),
    token: getAccessToken(request),
  });

  return payload;
}

async function buildRegionLeagueReadPayload(request, nodeId) {
  const { payload } = await getFriendsLeagueBridge().getRegions({
    store: loadStore(),
    token: getAccessToken(request),
    nodeId,
  });

  return payload;
}

async function buildUniversityLeagueReadPayload(request) {
  const { payload } = await getFriendsLeagueBridge().getUniversities({
    store: loadStore(),
    token: getAccessToken(request),
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

function validateHalfHourSlotStartAt(value) {
  const slotStartAt = validateRequiredString(value, '매칭 시간대를 선택해줘.');
  const slotDate = new Date(slotStartAt);

  if (Number.isNaN(slotDate.getTime())) {
    throw new ApiError(400, '매칭 시간대 형식이 올바르지 않아.');
  }

  const minutes = slotDate.getMinutes();

  if (minutes !== 0 && minutes !== 30) {
    throw new ApiError(400, '매칭 시간대는 30분 단위로 선택해줘.');
  }

  return slotDate.toISOString();
}

function validateMatchMode(value) {
  const mode = validateRequiredString(value, '매칭 모드를 선택해줘.');

  if (mode !== 'duel' && mode !== 'group') {
    throw new ApiError(400, '매칭 모드 값이 올바르지 않아.');
  }

  return mode;
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

async function handleLogin(request, response) {
  const body = await parseJsonBody(request);
  const username = validateRequiredString(body.username, '아이디를 입력해주세요.').toLowerCase();
  const password = validateRequiredString(body.password, '비밀번호를 입력해주세요.');
  const result = await getAuthRepository().login({ username, password });

  sendJson(response, 200, result);
}

async function handleRequestPhoneVerificationCode(request, response) {
  const body = await parseJsonBody(request);
  const purpose = validatePhoneVerificationPurpose(body.purpose);
  const phone = validatePhoneNumber(body.phone);
  const now = new Date();

  let createdChallenge = null;
  let rawCode = '';

  mutateStore((store) => {
    cleanupPhoneVerificationChallenges(store, now);
    const challenges = ensurePhoneVerificationChallenges(store);
    const activeChallenge = challenges.find((entry) => (
      entry.purpose === purpose
      && entry.phone === phone
      && entry.status === 'pending'
      && Date.parse(entry.expiresAt) > now.getTime()
    ));

    if (activeChallenge) {
      const resendAvailableAtMs = Date.parse(activeChallenge.resendAvailableAt);

      if (Number.isFinite(resendAvailableAtMs) && resendAvailableAtMs > now.getTime()) {
        const remainingSeconds = Math.max(1, Math.ceil((resendAvailableAtMs - now.getTime()) / 1000));
        throw new ApiError(429, `인증번호를 너무 자주 요청하고 있어요. ${remainingSeconds}초 뒤에 다시 시도해주세요.`);
      }
    }

    const { challenge, code } = createPhoneVerificationChallenge({
      purpose,
      phone,
      now,
    });

    for (const existingChallenge of challenges) {
      if (existingChallenge.phone === phone && existingChallenge.purpose === purpose && existingChallenge.status === 'pending') {
        existingChallenge.status = 'superseded';
        existingChallenge.updatedAt = now.toISOString();
      }
    }

    challenges.push(challenge);
    createdChallenge = challenge;
    rawCode = code;
  });

  try {
    const providerResult = await phoneVerificationService.sendCode({
      phone,
      code: rawCode,
      purpose,
    });
    sendJson(response, 200, buildPhoneVerificationPayload(createdChallenge, providerResult));
  } catch (error) {
    mutateStore((store) => {
      cleanupPhoneVerificationChallenges(store);
      store.phoneVerificationChallenges = ensurePhoneVerificationChallenges(store)
        .filter((entry) => entry.id !== createdChallenge?.id);
    });
    throw new ApiError(502, error instanceof Error ? error.message : '인증번호 발송에 실패했어요.');
  }
}

async function handleVerifyPhoneVerificationCode(request, response) {
  const body = await parseJsonBody(request);
  const requestId = validateRequiredString(body.requestId, '인증 요청을 먼저 시작해주세요.');
  const purpose = validatePhoneVerificationPurpose(body.purpose);
  const code = validatePhoneVerificationCode(body.code);
  const now = new Date();
  let verifiedChallenge = null;

  mutateStore((store) => {
    cleanupPhoneVerificationChallenges(store, now);
    const challenge = ensurePhoneVerificationChallenges(store).find((entry) => entry.id === requestId && entry.purpose === purpose);

    if (!challenge) {
      throw new ApiError(404, '인증 요청을 찾을 수 없어요. 다시 인증번호를 요청해주세요.');
    }

    if (challenge.status === 'verified' && challenge.verifiedToken && challenge.registrationExpiresAt) {
      verifiedChallenge = challenge;
      return;
    }

    if (challenge.status !== 'pending') {
      throw new ApiError(400, '이미 만료되었거나 사용할 수 없는 인증 요청이에요. 다시 시도해주세요.');
    }

    const expiresAtMs = Date.parse(challenge.expiresAt);

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
      challenge.status = 'expired';
      challenge.updatedAt = now.toISOString();
      throw new ApiError(400, '인증번호가 만료됐어요. 다시 요청해주세요.');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      challenge.status = 'locked';
      challenge.updatedAt = now.toISOString();
      throw new ApiError(429, '인증 시도 횟수를 초과했어요. 새 인증번호를 다시 요청해주세요.');
    }

    if (challenge.codeHash !== hashPhoneVerificationCode(challenge.id, code)) {
      challenge.attempts += 1;
      challenge.updatedAt = now.toISOString();

      if (challenge.attempts >= challenge.maxAttempts) {
        challenge.status = 'locked';
        throw new ApiError(429, '인증 시도 횟수를 초과했어요. 새 인증번호를 다시 요청해주세요.');
      }

      throw new ApiError(400, '인증번호가 맞지 않아요.');
    }

    challenge.status = 'verified';
    challenge.verifiedAt = now.toISOString();
    challenge.registrationExpiresAt = new Date(now.getTime() + PHONE_VERIFICATION_VERIFIED_TTL_MS).toISOString();
    challenge.verifiedToken = createToken();
    challenge.updatedAt = now.toISOString();
    verifiedChallenge = challenge;
  });

  sendJson(response, 200, buildPhoneVerificationSuccessPayload(verifiedChallenge));
}

async function handleLogout(request, response) {
  const payload = await getAuthRepository().logout({
    token: getAccessToken(request),
  });

  sendJson(response, 200, payload);
}

async function handleDeleteMyAccount(request, response) {
  const payload = await getAuthRepository().deleteAccount({
    token: getAccessToken(request),
  });

  sendJson(response, 200, payload);
}

async function handleRegister(request, response) {
  const body = await parseJsonBody(request);
  const username = validateUsername(body.username);
  const password = validateNewPassword(body.password);
  const name = typeof body.nickname === 'string' && body.nickname.trim()
    ? body.nickname.trim()
    : validateRequiredString(body.name, '닉네임을 입력해주세요.');
  const realName = typeof body.realName === 'string' && body.realName.trim()
    ? body.realName.trim()
    : validateRequiredString(body.name, '이름을 입력해주세요.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해주세요.').replace(/\D/g, '');
  const region = resolveRegionSelection(body.provinceName, body.cityName, body.districtName);
  const universityName = typeof body.universityName === 'string' ? body.universityName.trim() : '';
  const addressDetail = validateRequiredString(body.addressDetail, '상세 주소를 입력해주세요.');
  const birthDate = validateRequiredString(body.birthDate, '생년월일을 입력해주세요.');
  const phoneVerificationToken = validateRequiredString(body.phoneVerificationToken, '휴대폰 인증을 먼저 완료해주세요.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  requireVerifiedPhoneChallenge({
    phone,
    verifiedToken: phoneVerificationToken,
  });

  const result = await getAuthRepository().register({
    username,
    password,
    name,
    realName,
    phone,
    birthDate,
    region,
    universityName,
    addressDetail,
  });

  mutateStore((store) => {
    cleanupPhoneVerificationChallenges(store);
    const challenge = ensurePhoneVerificationChallenges(store).find((entry) => (
      entry.phone === phone
      && entry.verifiedToken === phoneVerificationToken
      && entry.purpose === 'signup'
    ));

    if (challenge) {
      challenge.status = 'consumed';
      challenge.consumedAt = new Date().toISOString();
      challenge.updatedAt = challenge.consumedAt;
    }
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
  const payload = getMarketRepository().claimItem({
    token: getAccessToken(request),
    itemId,
  });

  sendJson(response, 200, payload);
}

async function handleCreateAdminMarketItem(request, response) {
  const body = await parseJsonBody(request);
  const payload = getMarketRepository().createAdminItem({
    input: normalizeAdminMarketItemInput(body),
  });

  sendJson(response, 201, payload);
}

async function handleUpdateAdminMarketItem(request, response, itemId) {
  const body = await parseJsonBody(request);
  const payload = getMarketRepository().updateAdminItem({
    itemId,
    input: normalizeAdminMarketItemInput(body),
  });

  sendJson(response, 200, payload);
}

function handleDeleteAdminMarketItem(response, itemId) {
  const payload = getMarketRepository().deleteAdminItem({
    itemId,
  });

  sendJson(response, 200, payload);
}

async function handleUpdateAdminRewardRedemption(request, response, redemptionId) {
  const body = await parseJsonBody(request);
  const payload = getMarketRepository().updateAdminRewardRedemption({
    redemptionId,
    status: validateRewardRedemptionStatus(body.status),
    adminNote: normalizeOptionalString(body.adminNote),
  });

  sendJson(response, 200, payload);
}

async function handleCreateAdminNotice(request, response) {
  const body = await parseJsonBody(request);
  const payload = getAdminRepository().createNotice({
    input: normalizeAdminNoticeInput(body),
  });

  sendJson(response, 201, payload);
}

async function handleUpdateAdminNotice(request, response, noticeId) {
  const body = await parseJsonBody(request);
  const payload = getAdminRepository().updateNotice({
    noticeId,
    input: normalizeAdminNoticeInput(body),
  });

  sendJson(response, 200, payload);
}

function handleDeleteAdminNotice(response, noticeId) {
  const payload = getAdminRepository().deleteNotice({
    noticeId,
  });

  sendJson(response, 200, payload);
}

function handleDeleteAdminUser(response, userId) {
  const payload = getAdminRepository().deleteUser({
    userId,
  });

  sendJson(response, 200, payload);
}

async function handleCreateAdminOfflineRaceEvent(request, response) {
  const body = await parseJsonBody(request);
  const payload = getRaceRepository().createAdminEvent({
    input: normalizeAdminOfflineRaceEventInput(body),
  });

  sendJson(response, 201, payload);
}

async function handleUpdateAdminOfflineRaceEvent(request, response, eventId) {
  const body = await parseJsonBody(request);
  const payload = getRaceRepository().updateAdminEvent({
    eventId,
    input: normalizeAdminOfflineRaceEventInput(body),
  });

  sendJson(response, 200, payload);
}

function handleDeleteAdminOfflineRaceEvent(response, eventId) {
  const payload = getRaceRepository().deleteAdminEvent({
    eventId,
  });

  sendJson(response, 200, payload);
}

function handleOfflineRaceEntryAction(request, response, eventId, action) {
  const payload = getRaceRepository().applyEntryAction({
    token: getAccessToken(request),
    eventId,
    action,
  });

  sendJson(response, 200, payload);
}

async function handleCreateManualRun(request, response) {
  const body = await parseJsonBody(request);
  const payload = await getRunsRepository().createManualRun({
    token: getAccessToken(request),
    input: {
      date: validateDateOnly(body.date, '러닝 날짜를 입력해줘.'),
      distanceKm: validateDistanceKm(body.distanceKm, '러닝 거리를 입력해줘.'),
      pace: validatePace(body.pace, '페이스를 입력해줘.'),
    },
  });

  sendJson(response, 201, payload);
}

async function handleCreateTrackedRun(request, response) {
  const body = await parseJsonBody(request);
  const startedAt = validateRequiredString(body.startedAt, '러닝 시작 시각이 비어 있어.');
  const endedAt = validateRequiredString(body.endedAt, '러닝 종료 시각이 비어 있어.');
  const startedAtMs = new Date(startedAt).getTime();
  const endedAtMs = new Date(endedAt).getTime();

  if (Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs)) {
    throw new ApiError(400, '러닝 시작/종료 시각 형식이 올바르지 않아.');
  }

  if (startedAtMs > endedAtMs) {
    throw new ApiError(400, '러닝 종료 시각은 시작 시각보다 빠를 수 없어.');
  }

  const payload = await getRunsRepository().createTrackedRun({
    token: getAccessToken(request),
    input: {
      date: validateDateOnly(body.date, '러닝 날짜를 입력해줘.'),
      distanceKm: validateDistanceKm(body.distanceKm, '러닝 거리를 입력해줘.'),
      pace: validatePace(body.pace, '페이스를 입력해줘.'),
      durationSeconds: validatePositiveInteger(body.durationSeconds, '러닝 시간은 1초 이상이어야 해.'),
      ...(typeof body.cadenceSpm !== 'undefined' && body.cadenceSpm !== null
        ? { cadenceSpm: validateNonNegativeInteger(body.cadenceSpm, '케이던스 값이 올바르지 않아.') }
        : {}),
      ...(typeof body.elevationGainM !== 'undefined' && body.elevationGainM !== null
        ? { elevationGainM: validateNonNegativeInteger(body.elevationGainM, '고도 상승 값이 올바르지 않아.') }
        : {}),
      route: validateTrackedRoute(body.route),
      startedAt,
      endedAt,
      ...(typeof body.matchResult !== 'undefined' && body.matchResult !== null
        ? { matchResult: validateRunMatchResult(body.matchResult) }
        : {}),
    },
  });

  sendJson(response, 201, payload);
}

async function handlePatchMyLiveSharing(request, response) {
  const body = await parseJsonBody(request);
  const token = getAccessToken(request);
  const enabled = validateBoolean(body.enabled, '위치 공유 설정값이 올바르지 않아.');
  const status = ['idle', 'paused', 'running'].includes(body.status)
    ? body.status
    : 'idle';
  const locationLabel = normalizeOptionalString(body.locationLabel);
  const postgresRepository = getPostgresFriendsRepository();
  const repository = postgresRepository ?? getFriendsRepository();
  const payload = await repository.updateLiveSharing({
    token,
    enabled,
    status,
    locationLabel,
  });

  sendJson(response, 200, payload);
}

async function handleRequestDuelMatch(request, response) {
  const body = await parseJsonBody(request);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const slotStartAt = validateHalfHourSlotStartAt(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildDuelMatchResponse(store, currentUser, {
      distanceKm,
      slotStartAt,
    });
  });

  sendJson(response, 200, payload);
}

async function handleRequestGroupMatch(request, response) {
  const body = await parseJsonBody(request);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const slotStartAt = validateHalfHourSlotStartAt(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildGroupMatchResponse(store, currentUser, {
      distanceKm,
      slotStartAt,
    });
  });

  sendJson(response, 200, payload);
}

async function handleFetchMatchDemandSummary(request, response) {
  const body = await parseJsonBody(request);
  const store = loadStore();
  const currentUser = requireUser(store, request);
  const payload = buildMatchDemandSummaryResponse(store, currentUser, {
    mode: validateMatchMode(body.mode),
    distanceKm: validateDuelMatchDistanceKm(body.distanceKm),
    slotStartAt: validateHalfHourSlotStartAt(body.slotStartAt),
  });

  sendJson(response, 200, payload);
}

async function handleFetchRunningMatchStatus(request, response) {
  const body = await parseJsonBody(request);
  const mode = validateMatchMode(body.mode);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const slotStartAt = validateHalfHourSlotStartAt(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildRunningMatchStatusResponse(store, currentUser, {
      mode,
      distanceKm,
      slotStartAt,
    });
  });

  sendJson(response, 200, payload);
}

async function handleAcceptRunningMatch(request, response) {
  const body = await parseJsonBody(request);
  const matchId = validateRequiredString(body.matchId, '수락할 매치 아이디가 필요해.');
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return acceptRunningMatch(store, currentUser, matchId);
  });

  sendJson(response, 200, payload);
}

async function handleCancelRunningMatch(request, response) {
  const body = await parseJsonBody(request);
  const mode = validateMatchMode(body.mode);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const slotStartAt = validateHalfHourSlotStartAt(body.slotStartAt);
  const matchId = typeof body.matchId === 'string' && body.matchId.trim() ? body.matchId.trim() : '';
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return cancelRunningMatch(store, currentUser, {
      mode,
      distanceKm,
      slotStartAt,
      ...(matchId ? { matchId } : {}),
    });
  });

  sendJson(response, 200, payload);
}

async function handleLeaveRunningMatch(request, response) {
  const body = await parseJsonBody(request);
  const matchId = validateRequiredString(body.matchId, '이탈할 매치 아이디가 필요해.');
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return leaveRunningMatch(store, currentUser, { matchId });
  });

  sendJson(response, 200, payload);
}

async function handleUpdateRunningMatchProgress(request, response) {
  const body = await parseJsonBody(request);
  const matchId = validateRequiredString(body.matchId, '진행 상태를 반영할 매치 아이디가 필요해.');
  const distanceKm = validateDistanceKm(body.distanceKm, '러닝 거리를 입력해줘.');
  const elapsedSeconds = validateNonNegativeInteger(body.elapsedSeconds, '러닝 시간은 0초 이상이어야 해.');
  const currentPace = validatePace(body.currentPace, '현재 페이스가 올바르지 않아.');
  const status = ['running', 'background', 'paused', 'finished'].includes(body.status)
    ? body.status
    : 'running';
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return updateRunningMatchProgress(store, currentUser, {
      matchId,
      distanceKm,
      elapsedSeconds,
      currentPace,
      status,
    });
  });

  sendJson(response, 200, payload);
}

function handleIntegrationSourceConnection(request, response, sourceType, nextConnected) {
  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    const source = requireConnectedSource(user, sourceType);
    const sourceTypesToClear = new Set();

    if (nextConnected) {
      user.connectedSources = user.connectedSources.map((entry) => {
        if (entry.sourceType === sourceType) {
          return {
            ...entry,
            connected: true,
            connectionStatus: 'connected',
          };
        }

        if (isExclusiveIntegrationSourceType(sourceType) && isExclusiveIntegrationSourceType(entry.sourceType) && entry.connected) {
          sourceTypesToClear.add(entry.sourceType);
          return {
            ...entry,
            connected: false,
            connectionStatus: 'planned',
            lastSyncedAt: undefined,
          };
        }

        return entry;
      });
    } else {
      sourceTypesToClear.add(sourceType);
      user.connectedSources = user.connectedSources.map((entry) => (
        entry.sourceType === sourceType
          ? {
            ...entry,
            connected: false,
            connectionStatus: 'planned',
            lastSyncedAt: undefined,
          }
          : entry
      ));
    }

    if (sourceTypesToClear.size > 0) {
      store.integrationImports = ensureIntegrationImports(store).filter((entry) => (
        entry.userId !== user.id || !sourceTypesToClear.has(entry.sourceType)
      ));
    }

    const updatedSource = requireConnectedSource(user, sourceType);

    return buildIntegrationSourceActionResult(store, user, updatedSource);
  });

  sendJson(response, 200, payload);
}

async function handleQueueIntegrationImports(request, response, sourceType) {
  const body = await parseJsonBody(request);
  const rawRuns = Array.isArray(body.runs) ? body.runs : null;

  if (!rawRuns || rawRuns.length === 0) {
    throw new ApiError(400, '가져올 연동 기록 배열이 비어 있어.');
  }

  if (rawRuns.length > 500) {
    throw new ApiError(400, '한 번에 가져오는 기록은 500개 이하로 제한해줘.');
  }

  const payload = await getRunsRepository().queueIntegrationImports({
    token: getAccessToken(request),
    sourceType,
    normalizedRuns: rawRuns.map((run) => normalizeImportedRun(sourceType, run)),
  });

  sendJson(response, 202, payload);
}

function handleFriendRequestCreate(request, response, body) {
  const payload = getFriendsRepository().createRequest({
    token: getAccessToken(request),
    tag: normalizeTag(validateRequiredString(body.tag, '친구 태그를 입력해줘.')),
  });

  sendJson(response, 201, payload);
}

function handleFriendRequestAction(request, response, requestId, action) {
  const payload = getFriendsRepository().respondToRequest({
    token: getAccessToken(request),
    requestId,
    action,
  });

  sendJson(response, 200, payload);
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
    const healthStatus = buildHealthStatus();
    sendJson(response, healthStatus.statusCode, healthStatus.payload);
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

  if (pathname === '/api/admin/session' && request.method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, buildAdminSession());
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

  if (pathname === '/api/admin/overview' && request.method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getAdminRepository().getOverview());
    return;
  }

  if (pathname === '/api/admin/users' && request.method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getAdminRepository().getUsers());
    return;
  }

  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);

  if (adminUserMatch && request.method === 'DELETE') {
    requireAdmin(request);
    handleDeleteAdminUser(response, adminUserMatch[1]);
    return;
  }

  if (pathname === '/api/admin/market/items' && request.method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getMarketRepository().getAdminCatalog());
    return;
  }

  if (pathname === '/api/admin/notices' && request.method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getAdminRepository().getNotices());
    return;
  }

  if (pathname === '/api/admin/reward-redemptions' && request.method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getMarketRepository().getAdminRewardRedemptions());
    return;
  }

  if (pathname === '/api/admin/market/items' && request.method === 'POST') {
    requireAdmin(request);
    await handleCreateAdminMarketItem(request, response);
    return;
  }

  if (pathname === '/api/admin/notices' && request.method === 'POST') {
    requireAdmin(request);
    await handleCreateAdminNotice(request, response);
    return;
  }

  const adminMarketItemMatch = pathname.match(/^\/api\/admin\/market\/items\/([^/]+)$/);

  if (adminMarketItemMatch && request.method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminMarketItem(request, response, adminMarketItemMatch[1]);
    return;
  }

  if (adminMarketItemMatch && request.method === 'DELETE') {
    requireAdmin(request);
    handleDeleteAdminMarketItem(response, adminMarketItemMatch[1]);
    return;
  }

  const adminNoticeMatch = pathname.match(/^\/api\/admin\/notices\/([^/]+)$/);

  if (adminNoticeMatch && request.method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminNotice(request, response, adminNoticeMatch[1]);
    return;
  }

  if (adminNoticeMatch && request.method === 'DELETE') {
    requireAdmin(request);
    handleDeleteAdminNotice(response, adminNoticeMatch[1]);
    return;
  }

  const adminRewardRedemptionMatch = pathname.match(/^\/api\/admin\/reward-redemptions\/([^/]+)$/);

  if (adminRewardRedemptionMatch && request.method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminRewardRedemption(request, response, adminRewardRedemptionMatch[1]);
    return;
  }

  if (pathname === '/api/admin/offline-races/events' && request.method === 'GET') {
    requireAdmin(request);
    sendJson(response, 200, getRaceRepository().getAdminEvents());
    return;
  }

  if (pathname === '/api/admin/offline-races/events' && request.method === 'POST') {
    requireAdmin(request);
    await handleCreateAdminOfflineRaceEvent(request, response);
    return;
  }

  const adminOfflineRaceEventMatch = pathname.match(/^\/api\/admin\/offline-races\/events\/([^/]+)$/);

  if (adminOfflineRaceEventMatch && request.method === 'PATCH') {
    requireAdmin(request);
    await handleUpdateAdminOfflineRaceEvent(request, response, adminOfflineRaceEventMatch[1]);
    return;
  }

  if (adminOfflineRaceEventMatch && request.method === 'DELETE') {
    requireAdmin(request);
    handleDeleteAdminOfflineRaceEvent(response, adminOfflineRaceEventMatch[1]);
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
    const username = validateUsername(url.searchParams.get('username') ?? '');
    sendJson(response, 200, await getAuthRepository().checkUsername(username));
    return;
  }

  if (pathname === '/api/auth/phone/request-code' && request.method === 'POST') {
    await handleRequestPhoneVerificationCode(request, response);
    return;
  }

  if (pathname === '/api/auth/phone/verify-code' && request.method === 'POST') {
    await handleVerifyPhoneVerificationCode(request, response);
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

  if (pathname === '/api/notices/active' && request.method === 'GET') {
    sendJson(response, 200, getAdminRepository().getActiveNotices());
    return;
  }

  if (pathname === '/api/auth/register' && request.method === 'POST') {
    await handleRegister(request, response);
    return;
  }

  if (pathname === '/api/me/profile' && request.method === 'GET') {
    sendJson(response, 200, await buildProfileReadPayload(request));
    return;
  }

  if (pathname === '/api/me/account' && request.method === 'DELETE') {
    await handleDeleteMyAccount(request, response);
    return;
  }

  if (pathname === '/api/me/profile' && request.method === 'PATCH') {
    await handlePatchMyProfile(request, response);
    return;
  }

  if (pathname === '/api/me/notifications' && request.method === 'GET') {
    sendJson(response, 200, await buildNotificationSettingsReadPayload(request));
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

  if (pathname === '/api/me/live-sharing' && request.method === 'PATCH') {
    await handlePatchMyLiveSharing(request, response);
    return;
  }

  if (pathname === '/api/running/matches/duel' && request.method === 'POST') {
    await handleRequestDuelMatch(request, response);
    return;
  }

  if (pathname === '/api/running/matches/group' && request.method === 'POST') {
    await handleRequestGroupMatch(request, response);
    return;
  }

  if (pathname === '/api/running/matches/summary' && request.method === 'POST') {
    await handleFetchMatchDemandSummary(request, response);
    return;
  }

  if (pathname === '/api/running/matches/status' && request.method === 'POST') {
    await handleFetchRunningMatchStatus(request, response);
    return;
  }

  if (pathname === '/api/running/matches/accept' && request.method === 'POST') {
    await handleAcceptRunningMatch(request, response);
    return;
  }

  if (pathname === '/api/running/matches/cancel' && request.method === 'POST') {
    await handleCancelRunningMatch(request, response);
    return;
  }

  if (pathname === '/api/running/matches/leave' && request.method === 'POST') {
    await handleLeaveRunningMatch(request, response);
    return;
  }

  if (pathname === '/api/running/matches/progress' && request.method === 'POST') {
    await handleUpdateRunningMatchProgress(request, response);
    return;
  }

  if (pathname === '/api/me/activity' && request.method === 'GET') {
    sendJson(response, 200, await buildMyActivityReadPayload(request));
    return;
  }

  if (pathname === '/api/running/route-preview' && request.method === 'POST') {
    const store = loadStore();
    requireUser(store, request);
    const body = await parseJsonBody(request);
    const keyword = validateRequiredString(body.keyword, '원하는 모양을 입력해줘.');
    const displayTitle = validateRequiredString(body.displayTitle, '추천 경로 제목이 비어 있어.');
    const description = validateRequiredString(body.description, '추천 경로 설명이 비어 있어.');
    const startLabel = validateRequiredString(body.startLabel, '출발지 정보가 비어 있어.');
    const desiredDistanceKm = validateDistanceKm(body.desiredDistanceKm, '희망 거리를 입력해줘.');
    const roughCoordinates = validateRoutePreviewCoordinates(body.roughCoordinates);

    sendJson(response, 200, await buildRoadAlignedRoutePreview({
      keyword,
      desiredDistanceKm,
      displayTitle,
      description,
      startLabel,
      roughCoordinates,
    }));
    return;
  }

  if (pathname === '/api/home/summary' && request.method === 'GET') {
    sendJson(response, 200, await buildHomeSummaryReadPayload(request));
    return;
  }

  if (pathname === '/api/market/overview' && request.method === 'GET') {
    sendJson(response, 200, await buildMarketOverviewReadPayload(request));
    return;
  }

  if (pathname === '/api/offline-races/hub' && request.method === 'GET') {
    sendJson(response, 200, await buildOfflineRaceHubReadPayload(request));
    return;
  }

  const offlineRaceActionMatch = pathname.match(/^\/api\/offline-races\/([^/]+)\/(join|cancel)$/);

  if (offlineRaceActionMatch && request.method === 'POST') {
    handleOfflineRaceEntryAction(request, response, offlineRaceActionMatch[1], offlineRaceActionMatch[2]);
    return;
  }

  const marketClaimMatch = pathname.match(/^\/api\/market\/items\/([^/]+)\/claim$/);

  if (marketClaimMatch && request.method === 'POST') {
    handleClaimMarketItem(request, response, marketClaimMatch[1]);
    return;
  }

  if (pathname === '/api/friends/leaderboard' && request.method === 'GET') {
    sendJson(response, 200, await buildFriendLeaderboardReadPayload(request));
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
    sendJson(response, 200, await buildFriendActivityReadPayload(request, friendActivityMatch[1]));
    return;
  }

  const friendRunMatch = pathname.match(/^\/api\/friends\/([^/]+)\/runs\/([^/]+)$/);

  if (friendRunMatch && request.method === 'GET') {
    sendJson(response, 200, await buildFriendRunReadPayload(request, friendRunMatch[1], friendRunMatch[2]));
    return;
  }

  if (pathname === '/api/integrations/sources' && request.method === 'GET') {
    sendJson(response, 200, await buildIntegrationSourcesReadPayload(request));
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
    const payload = await getRunsRepository().syncIntegrationImports({
      token: getAccessToken(request),
    });

    sendJson(response, 200, payload);
    return;
  }

  if (pathname === '/api/league/district-personal' && request.method === 'GET') {
    sendJson(response, 200, await buildDistrictPersonalReadPayload(request));
    return;
  }

  if (pathname === '/api/league/regions' && request.method === 'GET') {
    sendJson(response, 200, await buildRegionLeagueReadPayload(request, url.searchParams.get('nodeId') ?? undefined));
    return;
  }

  if (pathname === '/api/league/universities' && request.method === 'GET') {
    sendJson(response, 200, await buildUniversityLeagueReadPayload(request));
    return;
  }

  if (pathname === '/api/runs/latest' && request.method === 'GET') {
    sendJson(response, 200, await buildCurrentRunReadPayload(request));
    return;
  }

  if (pathname === '/api/runs/manual' && request.method === 'POST') {
    await handleCreateManualRun(request, response);
    return;
  }

  if (pathname === '/api/runs/tracked' && request.method === 'POST') {
    await handleCreateTrackedRun(request, response);
    return;
  }

  const ownRunMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);

  if (ownRunMatch && request.method === 'GET') {
    sendJson(response, 200, await buildCurrentRunReadPayload(request, ownRunMatch[1]));
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
