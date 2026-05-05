import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { loadStore, mutateStore, getStoreFilePath, getStoreDiagnostics, resetStore, STORE_DRIVER } from './storage/index.mjs';
import { createFriendsLeagueBridge } from './bridges/friendsLeagueBridge.mjs';
import { createSessionRunsBridge } from './bridges/sessionRunsBridge.mjs';
import { createPostgresDatabase } from './database/postgresDatabase.mjs';
import { createJsonAdminRepository } from './repositories/adminRepository.mjs';
import { createDefaultConnectedSources, createDefaultNotificationSettings, createJsonAuthRepository } from './repositories/authRepository.mjs';
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
const GROUP_MIN_PARTICIPANTS = 5;
const MATCH_BOOKING_WINDOW_DAYS = 7;
const MATCH_BOOKING_CUTOFF_MS = 30 * 60 * 1000;
const MATCH_CANCELLATION_CUTOFF_MS = 60 * 60 * 1000;
const MATCH_SESSION_ACTIVE_TTL_MS = 4 * 60 * 60 * 1000;
const MATCH_PARTICIPANT_RUNNING_STALE_MS = 90 * 1000;
const MATCH_PARTICIPANT_BACKGROUND_STALE_MS = 20 * 60 * 1000;
const MATCH_TEST_COUNTDOWN_SECONDS = 30;
const MATCH_TEST_MAX_WAIT_MS = 30 * 60 * 1000;
const MATCH_TEST_GROUP_MIN_PARTICIPANTS = 2;
const MATCH_ROOM_HOST_START_DELAY_SECONDS = 30;
const MATCH_ROOM_GROUP_MIN_PARTICIPANTS = 2;
const MATCH_ROOM_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
const MATCH_ROOM_INVITE_LINK_BASE = 'runningground://running';

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

function buildMatchSlotDateLabel(slotStartAt) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '날짜 미정';
  }

  return slotStart.toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
}

function buildTestMatchStartAt(now = new Date()) {
  return new Date(now.getTime() + MATCH_TEST_COUNTDOWN_SECONDS * 1000).toISOString();
}

function buildTestMatchQueueExpiresAt(now = new Date()) {
  return new Date(now.getTime() + MATCH_TEST_MAX_WAIT_MS).toISOString();
}

function getMatchQueueEntryExpiresAt(entry) {
  if (entry?.testMode) {
    return entry.expiresAt || new Date(new Date(entry.requestedAt).getTime() + MATCH_TEST_MAX_WAIT_MS).toISOString();
  }

  return getMatchBookingClosesAt(entry?.slotStartAt);
}

function isTestMatchSession(session) {
  return session?.isTestMatch === true || session?.participants?.some((participant) => participant.profileSnapshot);
}

function buildMatchCancellationDeadline(slotStartAt, { isTestMatch = false } = {}) {
  return new Date(
    isTestMatch
      ? slotStartAt
      : new Date(slotStartAt).getTime() - MATCH_CANCELLATION_CUTOFF_MS,
  );
}

function getMatchBookingClosesAt(slotStartAt) {
  const slotStartAtMs = new Date(slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return null;
  }

  return new Date(slotStartAtMs - MATCH_BOOKING_CUTOFF_MS).toISOString();
}

function isMatchSlotClosed(slotStartAt, now = new Date()) {
  const closesAt = getMatchBookingClosesAt(slotStartAt);

  if (!closesAt) {
    return true;
  }

  return new Date(closesAt).getTime() <= now.getTime();
}

function validateMatchSlotStartAt(slotStartAt, now = new Date()) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    throw new ApiError(400, '매칭 시작 시간이 올바르지 않아.');
  }

  if (slotStart.getMinutes() !== 0 || slotStart.getSeconds() !== 0 || slotStart.getMilliseconds() !== 0) {
    throw new ApiError(400, '매칭 시간은 1시간 단위로만 선택할 수 있어.');
  }

  const maxSelectableAt = new Date(now.getTime() + MATCH_BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  if (slotStart.getTime() > maxSelectableAt.getTime()) {
    throw new ApiError(400, '매칭은 오늘부터 1주일 안의 시간대까지만 예약할 수 있어.');
  }

  if (isMatchSlotClosed(slotStartAt, now)) {
    throw new ApiError(400, '이 시간대는 출발 30분 전이 지나서 더 이상 선택할 수 없어.');
  }

  return slotStart.toISOString();
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

function cloneMatchRunnerProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    tag: profile.tag,
    districtName: profile.districtName,
    averagePaceMinutes: profile.averagePaceMinutes,
    averagePace: profile.averagePace,
    distanceLevel: profile.distanceLevel,
    levelLabel: profile.levelLabel,
    weeklyDistanceKm: profile.weeklyDistanceKm,
    lifetimeDistanceKm: profile.lifetimeDistanceKm,
    latestDistanceKm: profile.latestDistanceKm,
  };
}

function resolveSessionParticipantProfile(store, participant) {
  if (participant.profileSnapshot) {
    return participant.profileSnapshot;
  }

  return buildMatchRunnerProfile(store, findUserById(store, participant.userId));
}

function createSyntheticRunnerProfile(currentRunner, {
  id,
  name,
  paceOffsetSeconds = 0,
  paceSecondsOverride = null,
  weeklyDistanceDeltaKm = 0,
  lifetimeDistanceDeltaKm = 0,
  districtName = '테스트 트랙',
  tag = '#TEST',
}) {
  const resolvedPaceMinutes = paceSecondsOverride === null
    ? currentRunner.averagePaceMinutes + paceOffsetSeconds / 60
    : paceSecondsOverride / 60;
  const averagePaceMinutes = Math.max(3.4, Number(resolvedPaceMinutes.toFixed(2)));
  const lifetimeDistanceKm = Math.max(12, Number((currentRunner.lifetimeDistanceKm + lifetimeDistanceDeltaKm).toFixed(1)));
  const weeklyDistanceKm = Math.max(4, Number((currentRunner.weeklyDistanceKm + weeklyDistanceDeltaKm).toFixed(1)));
  const distanceLevel = Math.max(1, Math.round(lifetimeDistanceKm / 25));

  return {
    id,
    name,
    tag,
    districtName,
    averagePaceMinutes,
    averagePace: formatPaceMinutesLabel(averagePaceMinutes),
    distanceLevel,
    levelLabel: buildLevelLabel(distanceLevel),
    weeklyDistanceKm,
    lifetimeDistanceKm,
    latestDistanceKm: Number(currentRunner.latestDistanceKm.toFixed(1)),
  };
}

function buildTestDuelMatchResponse(store, currentUser, { distanceKm }) {
  const now = new Date();
  const previewSlotStartAt = buildTestMatchStartAt(now);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;

  upsertMatchQueueEntry(store, 'duel', currentUser.id, distanceKm, previewSlotStartAt, {
    testMode: true,
    expiresAt: buildTestMatchQueueExpiresAt(now),
  });
  const duelTestPaceSeconds = 380 + Math.floor(Math.random() * 10);
  const syntheticOpponent = createSyntheticRunnerProfile(currentRunner, {
    id: nextId('duel-test-bot'),
    name: '테스트 상대',
    paceSecondsOverride: duelTestPaceSeconds,
    weeklyDistanceDeltaKm: 1.2,
    lifetimeDistanceDeltaKm: 18,
    districtName: '테스트 트랙',
    tag: '#TEST',
  });

  const countdownStartAt = buildTestMatchStartAt(now);
  removeUsersFromMatchQueue(store, 'duel', [currentUser.id]);
  const createdSession = createMatchSession(store, 'duel', distanceKm, countdownStartAt, [
    { id: currentUser.id, seedRank: 1 },
    { id: syntheticOpponent.id, seedRank: 2, profileSnapshot: syntheticOpponent },
  ], {
    isTestMatch: true,
  });

  const opponentParticipant = createdSession.participants.find((participant) => participant.userId === syntheticOpponent.id);
  const opponentRunner = opponentParticipant
    ? resolveSessionParticipantProfile(store, opponentParticipant)
    : syntheticOpponent;
  return {
    success: true,
    matched: true,
    isTestMatch: true,
    requestId: nextId('duel-test-request'),
    distanceKm,
    slotStartAt: countdownStartAt,
    slotLabel: formatDuelSlotLabel(countdownStartAt),
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: `테스트 상대 ${opponentRunner.name}님이 잡혔어요. 30초 뒤 바로 시작해요.`,
    estimatedWaitMinutes: 0,
    opponent: {
      id: opponentRunner.id,
      name: opponentRunner.name,
      tag: opponentRunner.tag,
      districtName: opponentRunner.districtName,
      averagePace: opponentRunner.averagePace,
      levelLabel: opponentRunner.levelLabel,
      weeklyDistanceKm: opponentRunner.weeklyDistanceKm,
      lifetimeDistanceKm: opponentRunner.lifetimeDistanceKm,
      compatibilitySummary: `${opponentRunner.averagePace} 페이스 · ${opponentRunner.levelLabel} · 테스트 상대`,
    },
  };
}

function buildTestGroupMatchResponse(store, currentUser, { distanceKm }) {
  const now = new Date();
  const countdownStartAt = buildTestMatchStartAt(now);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const maxGroupSize = 30;
  const targetTestOpponentCount = 25;

  upsertMatchQueueEntry(store, 'group', currentUser.id, distanceKm, countdownStartAt, {
    testMode: true,
    expiresAt: buildTestMatchQueueExpiresAt(now),
  });
  const sessionParticipants = [{ id: currentUser.id, seedRank: 1 }];

  while (sessionParticipants.length - 1 < targetTestOpponentCount) {
    const randomPaceSeconds = 380 + Math.floor(Math.random() * 10);
    const syntheticRunner = createSyntheticRunnerProfile(currentRunner, {
      id: nextId('group-test-bot'),
      name: `테스트 러너 ${sessionParticipants.length}`,
      paceSecondsOverride: randomPaceSeconds,
      weeklyDistanceDeltaKm: 0.8 + sessionParticipants.length,
      lifetimeDistanceDeltaKm: 10 + sessionParticipants.length * 6,
      districtName: '테스트 트랙',
      tag: '#TEST',
    });
    sessionParticipants.push({
      id: syntheticRunner.id,
      seedRank: sessionParticipants.length + 1,
      profileSnapshot: syntheticRunner,
    });
  }

  removeUsersFromMatchQueue(store, 'group', [currentUser.id]);
  const createdSession = createMatchSession(store, 'group', distanceKm, countdownStartAt, sessionParticipants, {
    isTestMatch: true,
  });
  const responseParticipants = createdSession
    ? buildSessionGroupParticipants(store, createdSession, now)
    : [];
  const mySeedRank = responseParticipants.find((participant) => participant.id === currentUser.id)?.seedRank ?? 1;

  return {
    success: true,
    matched: true,
    isTestMatch: true,
    requestId: nextId('group-test-request'),
    distanceKm,
    slotStartAt: countdownStartAt,
    slotLabel: formatDuelSlotLabel(countdownStartAt),
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: `테스트 그룹이 ${responseParticipants.length}명 모였어요. 30초 뒤 바로 시작해요.`,
    estimatedWaitMinutes: 0,
    maxGroupSize,
    participantsCount: responseParticipants.length,
    mySeedRank,
    participants: responseParticipants,
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
      const expiresAtMs = new Date(getMatchQueueEntryExpiresAt(entry)).getTime();

      if (!Number.isFinite(requestedAtMs) || !Number.isFinite(slotStartAtMs) || !Number.isFinite(expiresAtMs)) {
        return false;
      }

      if (requestedAtMs > nowMs) {
        return false;
      }

      if (entry.testMode) {
        return expiresAtMs > nowMs;
      }

      return slotStartAtMs - MATCH_BOOKING_CUTOFF_MS > nowMs;
    });
  }

  return queues;
}

function upsertMatchQueueEntry(store, mode, userId, distanceKm, slotStartAt, options = {}) {
  const queues = pruneMatchQueues(store);
  const normalizedDistanceKm = normalizeMatchQueueDistance(distanceKm);
  queues[mode] = queues[mode].filter((entry) => entry.userId !== userId);
  const queueEntry = {
    id: nextId(`${mode}-queue`),
    userId,
    distanceKm: normalizedDistanceKm,
    slotStartAt,
    requestedAt: new Date().toISOString(),
    testMode: options.testMode === true,
    ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
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
  const startedAtMs = session.startedAt ? new Date(session.startedAt).getTime() : Number.NaN;
  const slotStartAtMs = new Date(session.slotStartAt).getTime();
  const hasLiveProgress = session.participants.some((participant) => {
    const liveStatus = resolveParticipantLiveStatus(participant, now);
    return ['running', 'background', 'paused', 'finished', 'disconnected', 'forfeited'].includes(liveStatus);
  });

  if (Number.isFinite(startedAtMs)) {
    return startedAtMs + MATCH_SESSION_ACTIVE_TTL_MS > nowMs ? 'active' : 'expired';
  }

  if (isTestMatchSession(session) && Number.isFinite(slotStartAtMs) && slotStartAtMs <= nowMs) {
    session.startedAt = new Date(slotStartAtMs).toISOString();
    return 'active';
  }

  if (hasLiveProgress) {
    session.startedAt = new Date(Math.min(nowMs, slotStartAtMs)).toISOString();
    return 'active';
  }

  if (!Number.isFinite(slotStartAtMs) || slotStartAtMs + MATCH_SESSION_ACTIVE_TTL_MS <= nowMs) {
    return 'expired';
  }

  return 'matched';
}

function pruneMatchSessions(store, now = new Date()) {
  const sessions = ensureMatchSessions(store);
  const activeUserIds = new Set(store.users.map((user) => user.id));

  store.matchSessions = sessions.filter((session) => {
    if (!session || !Array.isArray(session.participants) || !session.participants.length) {
      return false;
    }

    if (session.participants.some((participant) => !participant.profileSnapshot && !activeUserIds.has(participant.userId))) {
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

function createMatchSession(store, mode, distanceKm, slotStartAt, participants, options = {}) {
  clearUsersFromMatchSessions(store, mode, participants.map((participant) => participant.id));
  const session = {
    id: nextId(`${mode}-match`),
    mode,
    isTestMatch: options.isTestMatch === true,
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt,
    createdAt: new Date().toISOString(),
    matchedAt: new Date().toISOString(),
    participants: participants.map((participant, index) => ({
      userId: participant.id,
      seedRank: participant.seedRank ?? index + 1,
      ...(participant.profileSnapshot ? { profileSnapshot: participant.profileSnapshot } : {}),
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

function ensureMatchRooms(store) {
  if (!Array.isArray(store.matchRooms)) {
    store.matchRooms = [];
  }

  return store.matchRooms;
}

function createMatchRoomInviteToken(store) {
  const rooms = ensureMatchRooms(store);
  const existingTokens = new Set(rooms.map((room) => String(room.inviteToken ?? '').toUpperCase()).filter(Boolean));

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const token = Math.random().toString(36).slice(2, 8).toUpperCase();

    if (!existingTokens.has(token)) {
      return token;
    }
  }

  return nextId('room-invite').replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
}

function normalizeMatchRoomMaxParticipants(mode, value) {
  if (mode === 'duel') {
    return 2;
  }

  const parsedValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 10;
  }

  return Math.max(2, Math.min(30, Math.round(parsedValue)));
}

function getMatchRoomMinParticipants(mode) {
  return mode === 'duel' ? 2 : MATCH_ROOM_GROUP_MIN_PARTICIPANTS;
}

function isMatchRoomVisibleToUser(room, userId) {
  return room.hostUserId === userId
    || room.participants.some((participant) => participant.userId === userId)
    || room.invitedFriendIds.includes(userId);
}

function buildMatchRoomInviteLink(inviteToken) {
  return `${MATCH_ROOM_INVITE_LINK_BASE}?roomInviteToken=${inviteToken}`;
}

function pruneMatchRooms(store, now = new Date()) {
  const rooms = ensureMatchRooms(store);
  const activeUserIds = new Set(store.users.map((user) => user.id));
  const nowMs = now.getTime();

  store.matchRooms = rooms.filter((room) => {
    if (!room || typeof room !== 'object') {
      return false;
    }

    if (!room.hostUserId || !activeUserIds.has(room.hostUserId)) {
      return false;
    }

    if (!Array.isArray(room.participants) || room.participants.length === 0) {
      return false;
    }

    room.participants = room.participants.filter((participant) => activeUserIds.has(participant.userId));
    room.invitedFriendIds = Array.isArray(room.invitedFriendIds)
      ? room.invitedFriendIds.filter((userId) => activeUserIds.has(userId) && userId !== room.hostUserId)
      : [];

    if (!room.participants.some((participant) => participant.userId === room.hostUserId)) {
      return false;
    }

    if (room.linkedMatchId) {
      const linkedSession = findMatchSessionById(store, room.linkedMatchId);

      if (!linkedSession) {
        return false;
      }

      const linkedState = hydrateMatchSessionState(linkedSession, now);
      return linkedState === 'matched' || linkedState === 'active';
    }

    if (room.startMode === 'scheduled') {
      const slotStartAtMs = new Date(room.slotStartAt).getTime();
      return Number.isFinite(slotStartAtMs) && slotStartAtMs + MATCH_SESSION_ACTIVE_TTL_MS > nowMs;
    }

    const createdAtMs = new Date(room.createdAt).getTime();
    return Number.isFinite(createdAtMs) && createdAtMs + MATCH_ROOM_IDLE_TTL_MS > nowMs;
  });

  return store.matchRooms;
}

function getMatchRoomLinkedSession(room, store) {
  if (!room?.linkedMatchId) {
    return null;
  }

  return findMatchSessionById(store, room.linkedMatchId);
}

function getRunningMatchRoomState(room, store, now = new Date()) {
  const linkedSession = getMatchRoomLinkedSession(room, store);

  if (!linkedSession) {
    return 'waiting';
  }

  const linkedState = hydrateMatchSessionState(linkedSession, now);

  if (linkedState === 'active') {
    return 'active';
  }

  if (linkedState === 'matched') {
    const remainingSeconds = Math.max(0, Math.ceil((new Date(linkedSession.slotStartAt).getTime() - now.getTime()) / 1000));
    return remainingSeconds <= MATCH_ROOM_HOST_START_DELAY_SECONDS ? 'countdown' : 'waiting';
  }

  return 'waiting';
}

function syncScheduledMatchRoom(room, store, now = new Date()) {
  if (!room || room.startMode !== 'scheduled' || room.linkedMatchId) {
    return room;
  }

  if (room.participants.length < room.minParticipants) {
    return room;
  }

  const slotStartAtMs = new Date(room.slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return room;
  }

  if (now.getTime() < slotStartAtMs - MATCH_ROOM_HOST_START_DELAY_SECONDS * 1000) {
    return room;
  }

  const session = createMatchSession(
    store,
    room.mode,
    room.distanceKm,
    room.slotStartAt,
    room.participants.map((participant, index) => ({
      id: participant.userId,
      seedRank: index + 1,
    })),
  );

  room.linkedMatchId = session.id;
  return room;
}

function syncMatchRooms(store, now = new Date()) {
  const rooms = pruneMatchRooms(store, now);
  return rooms.map((room) => syncScheduledMatchRoom(room, store, now));
}

function findRunningMatchRoomById(store, roomId, now = new Date()) {
  return syncMatchRooms(store, now).find((room) => room.id === roomId) ?? null;
}

function findRunningMatchRoomByInviteToken(store, inviteToken, now = new Date()) {
  const normalizedToken = String(inviteToken ?? '').trim().toUpperCase();

  if (!normalizedToken) {
    return null;
  }

  return syncMatchRooms(store, now).find((room) => String(room.inviteToken).toUpperCase() === normalizedToken) ?? null;
}

function findRunningMatchRoomForUser(store, userId, now = new Date()) {
  const rooms = syncMatchRooms(store, now)
    .filter((room) => isMatchRoomVisibleToUser(room, userId))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return rooms[0] ?? null;
}

function buildRunningMatchRoomParticipantPayload(store, participant) {
  const user = findUserById(store, participant.userId);
  const runner = buildMatchRunnerProfile(store, user);

  return {
    userId: runner.id,
    name: runner.name,
    tag: runner.tag,
    districtName: runner.districtName,
    averagePace: runner.averagePace,
    levelLabel: runner.levelLabel,
    isHost: Boolean(participant.isHost),
    isReady: Boolean(participant.isReady),
    invited: Boolean(participant.invited),
    joinedAt: participant.joinedAt,
  };
}

function areAllRunningMatchRoomGuestsReady(room) {
  if (!room) {
    return false;
  }

  const guests = room.participants.filter((participant) => !participant.isHost);
  if (!guests.length) {
    return false;
  }

  return guests.every((participant) => participant.isReady);
}

function buildRunningMatchRoomResponse(store, currentUser, room, now = new Date()) {
  if (!room) {
    return {
      success: true,
      room: null,
    };
  }

  const hostUser = findUserById(store, room.hostUserId);
  const linkedSession = getMatchRoomLinkedSession(room, store);
  const linkedMatchState = linkedSession ? hydrateMatchSessionState(linkedSession, now) : null;
  const roomState = getRunningMatchRoomState(room, store, now);
  const hasJoined = room.participants.some((participant) => participant.userId === currentUser.id);

  return {
    success: true,
    room: {
      roomId: room.id,
      inviteToken: room.inviteToken,
      inviteLink: buildMatchRoomInviteLink(room.inviteToken),
      mode: room.mode,
      state: roomState,
      startMode: room.startMode,
      distanceKm: room.distanceKm,
      slotStartAt: room.slotStartAt,
      slotLabel: room.startMode === 'host' && !linkedSession
        ? '방장 시작'
        : formatDuelSlotLabel(room.slotStartAt),
      maxParticipants: room.maxParticipants,
      minParticipants: room.minParticipants,
      canStart: room.startMode === 'host'
        && room.hostUserId === currentUser.id
        && !linkedSession
        && room.participants.length >= room.minParticipants
        && areAllRunningMatchRoomGuestsReady(room),
      isHost: room.hostUserId === currentUser.id,
      hostUserId: room.hostUserId,
      hostName: hostUser.name,
      participants: room.participants
        .map((participant) => buildRunningMatchRoomParticipantPayload(store, participant))
        .sort((left, right) => {
          if (left.isHost !== right.isHost) {
            return left.isHost ? -1 : 1;
          }

          return new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime();
        }),
      invitedFriendIds: room.invitedFriendIds,
      ...(linkedSession ? {
        linkedMatchId: linkedSession.id,
        linkedMatchStatus: linkedMatchState === 'active' ? 'active' : 'matched',
        linkedMatchSlotStartAt: linkedSession.slotStartAt,
      } : {}),
      joined: hasJoined,
    },
  };
}

function buildMatchRoomLockMessage(room, store, currentUserId) {
  const modeLabel = room.mode === 'duel' ? '1대1 방' : '그룹 방';
  const roomState = getRunningMatchRoomState(room, store);

  if (roomState === 'active') {
    return `이미 진행 중인 ${modeLabel}이 있어요. 현재 대결을 먼저 끝내야 새 매칭을 신청할 수 있어요.`;
  }

  if (room.startMode === 'host' && !room.linkedMatchId) {
    return `이미 참여 중인 ${modeLabel}이 있어요. 그 방을 먼저 나와야 다른 매칭을 신청할 수 있어요.`;
  }

  return `이미 예약된 ${modeLabel}이 있어요. 기존 방을 먼저 정리해야 다른 매칭을 신청할 수 있어요.`;
}

function createRunningMatchRoom(store, currentUser, {
  mode,
  distanceKm,
  startMode,
  slotStartAt,
  maxParticipants,
  invitedFriendIds = [],
}) {
  assertUserCanRequestAnotherMatch(store, currentUser);

  const normalizedInvitedFriendIds = [...new Set(invitedFriendIds
    .filter((userId) => typeof userId === 'string')
    .map((userId) => userId.trim())
    .filter((userId) => userId && userId !== currentUser.id))];

  for (const friendId of normalizedInvitedFriendIds) {
    if (!areFriends(store, currentUser.id, friendId)) {
      throw new ApiError(400, '친구 목록에 있는 러너만 방에 초대할 수 있어.');
    }
  }

  const normalizedStartMode = startMode === 'host' ? 'host' : 'scheduled';
  const normalizedSlotStartAt = normalizedStartMode === 'host'
    ? new Date().toISOString()
    : validateMatchSlotInput(slotStartAt);
  const room = {
    id: nextId(`${mode}-room`),
    inviteToken: createMatchRoomInviteToken(store),
    hostUserId: currentUser.id,
    mode,
    startMode: normalizedStartMode,
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt: normalizedSlotStartAt,
    maxParticipants: normalizeMatchRoomMaxParticipants(mode, maxParticipants),
    minParticipants: getMatchRoomMinParticipants(mode),
    invitedFriendIds: normalizedInvitedFriendIds,
    participants: [{
      userId: currentUser.id,
      isHost: true,
      isReady: false,
      invited: false,
      joinedAt: new Date().toISOString(),
    }],
    createdAt: new Date().toISOString(),
    linkedMatchId: null,
  };

  ensureMatchRooms(store).push(room);
  syncMatchRooms(store);
  return buildRunningMatchRoomResponse(store, currentUser, room);
}

function joinRunningMatchRoom(store, currentUser, { inviteToken }) {
  const room = findRunningMatchRoomByInviteToken(store, inviteToken);

  if (!room) {
    throw new ApiError(404, '참여할 방을 찾지 못했어.');
  }

  const existingSession = findAnyReservedMatchSessionForUser(store, currentUser.id);
  if (existingSession) {
    throw new ApiError(
      400,
      buildSingleMatchLockMessage(existingSession.session.mode, existingSession.session.slotStartAt, existingSession.state),
    );
  }

  const existingQueue = findAnyQueuedMatchEntryForUser(store, currentUser.id);
  if (existingQueue) {
    throw new ApiError(
      400,
      buildSingleMatchLockMessage(existingQueue.mode, existingQueue.entry.slotStartAt, 'waiting'),
    );
  }

  const existingRoom = findRunningMatchRoomForUser(store, currentUser.id);
  if (existingRoom && existingRoom.id !== room.id) {
    throw new ApiError(400, buildMatchRoomLockMessage(existingRoom, store, currentUser.id));
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 시작 준비에 들어간 방이라 지금은 참여할 수 없어.');
  }

  if (room.participants.some((participant) => participant.userId === currentUser.id)) {
    return buildRunningMatchRoomResponse(store, currentUser, room);
  }

  if (room.participants.length >= room.maxParticipants) {
    throw new ApiError(400, '이 방은 이미 정원이 다 찼어.');
  }

  room.participants.push({
    userId: currentUser.id,
    isHost: false,
    isReady: false,
    invited: room.invitedFriendIds.includes(currentUser.id),
    joinedAt: new Date().toISOString(),
  });

  syncMatchRooms(store);
  return buildRunningMatchRoomResponse(store, currentUser, room);
}

function startRunningMatchRoom(store, currentUser, { roomId }) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '시작할 방을 찾지 못했어.');
  }

  if (room.hostUserId !== currentUser.id) {
    throw new ApiError(403, '방장만 시작할 수 있어.');
  }

  if (room.startMode !== 'host') {
    throw new ApiError(400, '예약 시작 방은 시간에 맞춰 자동으로 시작돼.');
  }

  if (room.linkedMatchId) {
    return buildRunningMatchRoomResponse(store, currentUser, room);
  }

  if (room.participants.length < room.minParticipants) {
    throw new ApiError(400, `최소 ${room.minParticipants}명은 모여야 시작할 수 있어.`);
  }

  if (!areAllRunningMatchRoomGuestsReady(room)) {
    throw new ApiError(400, '모든 참가자가 준비 완료해야 시작할 수 있어.');
  }

  const slotStartAt = new Date(Date.now() + MATCH_ROOM_HOST_START_DELAY_SECONDS * 1000).toISOString();
  room.slotStartAt = slotStartAt;
  const session = createMatchSession(
    store,
    room.mode,
    room.distanceKm,
    slotStartAt,
    room.participants.map((participant, index) => ({
      id: participant.userId,
      seedRank: index + 1,
    })),
  );
  room.linkedMatchId = session.id;

  return buildRunningMatchRoomResponse(store, currentUser, room);
}

function updateRunningMatchRoomReady(store, currentUser, {
  roomId,
  ready,
}) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '준비 상태를 바꿀 방을 찾지 못했어.');
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 시작 준비에 들어간 방은 준비 상태를 바꿀 수 없어.');
  }

  const participant = room.participants.find((entry) => entry.userId === currentUser.id);

  if (!participant) {
    throw new ApiError(404, '이 방 참가자 목록에서 사용자를 찾지 못했어.');
  }

  if (participant.isHost) {
    throw new ApiError(400, '방장은 준비 버튼 대신 시작 버튼을 사용해줘.');
  }

  participant.isReady = Boolean(ready);
  syncMatchRooms(store);
  return buildRunningMatchRoomResponse(store, currentUser, room);
}

function updateRunningMatchRoom(store, currentUser, {
  roomId,
  distanceKm,
  startMode,
  slotStartAt,
  maxParticipants,
  invitedFriendIds = [],
}) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '설정할 방을 찾지 못했어.');
  }

  if (room.hostUserId !== currentUser.id) {
    throw new ApiError(403, '방장만 방 설정을 바꿀 수 있어.');
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 시작 준비에 들어간 방은 설정을 바꿀 수 없어.');
  }

  const normalizedInvitedFriendIds = [...new Set(invitedFriendIds
    .filter((userId) => typeof userId === 'string')
    .map((userId) => userId.trim())
    .filter((userId) => userId && userId !== currentUser.id))];

  for (const friendId of normalizedInvitedFriendIds) {
    if (!areFriends(store, currentUser.id, friendId)) {
      throw new ApiError(400, '친구 목록에 있는 러너만 방에 초대할 수 있어.');
    }
  }

  room.distanceKm = normalizeMatchQueueDistance(distanceKm);
  room.startMode = startMode === 'host' ? 'host' : 'scheduled';
  room.slotStartAt = room.startMode === 'host'
    ? new Date().toISOString()
    : validateMatchSlotInput(slotStartAt);
  room.maxParticipants = normalizeMatchRoomMaxParticipants(room.mode, maxParticipants);
  room.invitedFriendIds = normalizedInvitedFriendIds;
  syncMatchRooms(store);

  return buildRunningMatchRoomResponse(store, currentUser, room);
}

function leaveRunningMatchRoom(store, currentUser, { roomId }) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    return { success: true, room: null };
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 대결 세션이 만들어진 방은 대결 화면에서 정리해줘.');
  }

  const participantIndex = room.participants.findIndex((participant) => participant.userId === currentUser.id);
  const wasInvitedOnly = room.invitedFriendIds.includes(currentUser.id) && participantIndex === -1;

  if (participantIndex === -1 && !wasInvitedOnly) {
    return buildRunningMatchRoomResponse(store, currentUser, room);
  }

  room.invitedFriendIds = room.invitedFriendIds.filter((userId) => userId !== currentUser.id);

  if (participantIndex !== -1) {
    const wasHost = room.participants[participantIndex].isHost;
    room.participants.splice(participantIndex, 1);

    if (!room.participants.length) {
      store.matchRooms = ensureMatchRooms(store).filter((entry) => entry.id !== room.id);
      return { success: true, room: null };
    }

    if (wasHost) {
      room.hostUserId = room.participants[0].userId;
      room.participants = room.participants.map((participant, index) => ({
        ...participant,
        isHost: index === 0,
      }));
    }
  }

  return buildRunningMatchRoomResponse(store, currentUser, room);
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

function buildSyntheticParticipantLiveSnapshot(session, participant, now = new Date()) {
  if (!participant?.profileSnapshot || hydrateMatchSessionState(session, now) !== 'active') {
    return null;
  }

  const storedStatus = typeof participant.liveStatus === 'string' && participant.liveStatus
    ? participant.liveStatus
    : 'ready';

  if (['forfeited', 'finished'].includes(storedStatus)) {
    return null;
  }

  const startedAtMs = new Date(session.startedAt ?? session.slotStartAt).getTime();
  const paceMinutes = parsePaceToMinutes(participant.profileSnapshot.averagePace);

  if (!Number.isFinite(startedAtMs) || paceMinutes === null) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedAtMs) / 1000));
  const estimatedDistanceKm = Math.min(
    session.distanceKm,
    Number((elapsedSeconds / Math.max(1, paceMinutes * 60)).toFixed(2)),
  );
  const syntheticStatus = estimatedDistanceKm >= session.distanceKm ? 'finished' : 'running';

  return {
    liveDistanceKm: estimatedDistanceKm,
    liveElapsedSeconds: elapsedSeconds,
    livePace: participant.profileSnapshot.averagePace,
    liveUpdatedAt: now.toISOString(),
    liveStatus: syntheticStatus,
    ...(syntheticStatus === 'finished' ? { finishedAt: now.toISOString() } : {}),
  };
}

function buildParticipantLiveSnapshot(session, participant, now = new Date()) {
  const syntheticSnapshot = buildSyntheticParticipantLiveSnapshot(session, participant, now);
  const liveStatus = syntheticSnapshot?.liveStatus ?? resolveParticipantLiveStatus(participant, now);

  return {
    ...(typeof syntheticSnapshot?.liveDistanceKm === 'number'
      ? { liveDistanceKm: syntheticSnapshot.liveDistanceKm }
      : typeof participant.liveDistanceKm === 'number'
        ? { liveDistanceKm: Number(participant.liveDistanceKm.toFixed(2)) }
        : {}),
    ...(typeof syntheticSnapshot?.liveElapsedSeconds === 'number'
      ? { liveElapsedSeconds: syntheticSnapshot.liveElapsedSeconds }
      : typeof participant.liveElapsedSeconds === 'number'
        ? { liveElapsedSeconds: participant.liveElapsedSeconds }
        : {}),
    ...(typeof syntheticSnapshot?.livePace === 'string' && syntheticSnapshot.livePace.trim()
      ? { livePace: syntheticSnapshot.livePace.trim() }
      : typeof participant.livePace === 'string' && participant.livePace.trim()
        ? { livePace: participant.livePace.trim() }
        : {}),
    ...(typeof syntheticSnapshot?.liveUpdatedAt === 'string' && syntheticSnapshot.liveUpdatedAt
      ? { liveUpdatedAt: syntheticSnapshot.liveUpdatedAt }
      : typeof participant.liveUpdatedAt === 'string' && participant.liveUpdatedAt
        ? { liveUpdatedAt: participant.liveUpdatedAt }
        : {}),
    liveStatus,
    ...(typeof syntheticSnapshot?.finishedAt === 'string' && syntheticSnapshot.finishedAt
      ? { finishedAt: syntheticSnapshot.finishedAt }
      : typeof participant.finishedAt === 'string' && participant.finishedAt
        ? { finishedAt: participant.finishedAt }
        : {}),
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

function findMatchSessionForUser(store, mode, userId, { distanceKm, slotStartAt, testMode = false } = {}) {
  const normalizedDistanceKm = distanceKm === undefined ? null : normalizeMatchQueueDistance(distanceKm);
  const sessions = pruneMatchSessions(store);

  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index];
    if (session.mode !== mode) {
      continue;
    }

    if (isTestMatchSession(session) !== testMode) {
      continue;
    }

    if (!session.participants.some((participant) => (
      participant.userId === userId && resolveParticipantLiveStatus(participant) !== 'forfeited'
    ))) {
      continue;
    }

    if (normalizedDistanceKm !== null && Math.abs(session.distanceKm - normalizedDistanceKm) >= 0.15) {
      continue;
    }

    if (!testMode && slotStartAt && session.slotStartAt !== slotStartAt) {
      continue;
    }

    return session;
  }

  return null;
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

  if (!['matched', 'active'].includes(state)) {
    throw new ApiError(400, '매칭이 잡힌 뒤에만 혼자 계속 달릴 수 있어.');
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
      const runner = resolveSessionParticipantProfile(store, participant);
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
        ...buildParticipantLiveSnapshot(session, participant, now),
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

  const opponentRunner = resolveSessionParticipantProfile(store, opponentEntry);
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
    ...buildParticipantLiveSnapshot(session, opponentEntry, now),
  };
}

function getMatchQueueEntries(store, mode, distanceKm, slotStartAt, { testMode = false } = {}) {
  const normalizedDistanceKm = normalizeMatchQueueDistance(distanceKm);
  const queues = pruneMatchQueues(store);

  return queues[mode].filter((entry) => (
    Boolean(entry.testMode) === testMode
    && Math.abs(entry.distanceKm - normalizedDistanceKm) < 0.15
    && (testMode || entry.slotStartAt === slotStartAt)
  ));
}

function findAnyQueuedMatchEntryForUser(store, userId) {
  const queues = pruneMatchQueues(store);

  for (const mode of ['duel', 'group']) {
    const entry = queues[mode].find((item) => item.userId === userId);

    if (entry) {
      return { mode, entry };
    }
  }

  return null;
}

function findAnyReservedMatchSessionForUser(store, userId, now = new Date()) {
  const sessions = pruneMatchSessions(store, now);

  for (const session of sessions) {
    const participant = session.participants.find((item) => (
      item.userId === userId && resolveParticipantLiveStatus(item, now) !== 'forfeited'
    ));

    if (!participant) {
      continue;
    }

    const state = hydrateMatchSessionState(session, now);

    if (['matched', 'active'].includes(state)) {
      return { session, state };
    }
  }

  return null;
}

function buildSingleMatchLockMessage(mode, slotStartAt, state = 'waiting') {
  const modeLabel = mode === 'duel' ? '1대1 대결' : '그룹 대결';
  const slotSummary = `${buildMatchSlotDateLabel(slotStartAt)} ${formatDuelSlotLabel(slotStartAt)}`;

  if (state === 'active') {
    return `이미 진행 중인 ${modeLabel}이 있어요. ${slotSummary} 매치를 먼저 끝내야 새 매칭을 신청할 수 있어요.`;
  }

  if (state === 'matched') {
    return `이미 예약된 ${modeLabel}이 있어요. ${slotSummary} 매치를 먼저 취소하거나 끝내야 다른 매칭을 신청할 수 있어요.`;
  }

  return `이미 신청한 ${modeLabel}이 있어요. ${slotSummary} 매치를 먼저 취소하거나 끝내야 다른 매칭을 신청할 수 있어요.`;
}

function assertUserCanRequestAnotherMatch(store, currentUser) {
  const now = new Date();
  const existingSession = findAnyReservedMatchSessionForUser(store, currentUser.id, now);

  if (existingSession) {
    throw new ApiError(
      400,
      buildSingleMatchLockMessage(existingSession.session.mode, existingSession.session.slotStartAt, existingSession.state),
    );
  }

  const existingQueue = findAnyQueuedMatchEntryForUser(store, currentUser.id);

  if (existingQueue) {
    throw new ApiError(
      400,
      buildSingleMatchLockMessage(existingQueue.mode, existingQueue.entry.slotStartAt, 'waiting'),
    );
  }

  const existingRoom = findRunningMatchRoomForUser(store, currentUser.id, now);

  if (existingRoom) {
    throw new ApiError(400, buildMatchRoomLockMessage(existingRoom, store, currentUser.id));
  }
}

function clearUserTestMatchArtifacts(store, userId) {
  const queues = ensureMatchQueues(store);
  queues.duel = queues.duel.filter((entry) => !(entry.userId === userId && entry.testMode));
  queues.group = queues.group.filter((entry) => !(entry.userId === userId && entry.testMode));

  const sessions = ensureMatchSessions(store);
  store.matchSessions = sessions.filter((session) => {
    if (!isTestMatchSession(session)) {
      return true;
    }

    return !session.participants.some((participant) => participant.userId === userId);
  });
}

function buildQueuedMatchRunnerEntries(store, mode, currentRunner, { distanceKm, slotStartAt, includeCurrentUser = false, testMode = false }) {
  const queueEntries = getMatchQueueEntries(store, mode, distanceKm, slotStartAt, { testMode })
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

function buildRunningMatchStatusResponse(store, currentUser, { mode, distanceKm, slotStartAt, testMode = false }) {
  const now = new Date();
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const session = findMatchSessionForUser(store, mode, currentUser.id, {
    distanceKm,
    slotStartAt,
    testMode,
  });
  const capacity = mode === 'duel' ? 2 : 30;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  if (session) {
    const state = hydrateMatchSessionState(session, now);
    const isTestMatch = isTestMatchSession(session);
    const readyToStart = new Date(session.slotStartAt).getTime() <= now.getTime();
    const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, {
      isTestMatch,
    }).toISOString();
    const canCancelReservation = now.getTime() < new Date(cancelableUntilAt).getTime();
    const countdownRemainingSeconds = state === 'matched' && !readyToStart
      ? Math.max(0, Math.ceil((new Date(session.slotStartAt).getTime() - now.getTime()) / 1000))
      : undefined;
    const sessionSlotLabel = formatDuelSlotLabel(session.slotStartAt);

    if (mode === 'duel') {
      const opponent = buildSessionDuelOpponent(store, session, currentUser.id, now);
      return {
        success: true,
        mode,
        state,
        ...(isTestMatch ? { isTestMatch: true } : {}),
        matchId: session.id,
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: sessionSlotLabel,
        paceBandLabel,
        levelBandLabel,
        criteriaSummary: isTestMatch
          ? state === 'matched'
            ? `${opponent?.name ?? '상대'}님과 테스트 매치가 잡혔어요. 30초 카운트다운이 끝나면 바로 시작돼요.`
            : '테스트 대결이 시작됐어요. 상대와 거리 차이를 바로 확인할 수 있어요.'
          : state === 'matched'
            ? readyToStart
              ? `매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel} 대결을 이제 시작할 수 있어요.`
              : `매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel}에 ${opponent?.name ?? '상대'}님과 1대1로 시작해요.`
            : '이제 실제 러닝 기록이 실시간으로 반영되고 있어요.',
        estimatedWaitMinutes: 0,
        participantCount: session.participants.length,
        acceptedCount: 0,
        capacity,
        userAccepted: true,
        readyToStart,
        canCancel: state === 'matched' ? canCancelReservation : false,
        cancelableUntilAt,
        ...(countdownRemainingSeconds !== undefined ? {
          countdownRemainingSeconds,
          countdownEndsAt: session.slotStartAt,
        } : {}),
        ...(opponent ? { opponent } : {}),
      };
    }

    const participants = buildSessionGroupParticipants(store, session, now);
    const mySeedRank = participants.find((participant) => participant.id === currentUser.id)?.seedRank ?? 1;

      return {
        success: true,
        mode,
        state,
        ...(isTestMatch ? { isTestMatch: true } : {}),
        matchId: session.id,
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: sessionSlotLabel,
        paceBandLabel,
        levelBandLabel,
        criteriaSummary: isTestMatch
          ? state === 'matched'
            ? `테스트 그룹 ${participants.length}명이 모였어요. 30초 카운트다운이 끝나면 바로 시작돼요.`
            : '테스트 그룹 대결이 시작됐어요. 트랙에서 순위를 바로 확인할 수 있어요.'
          : state === 'matched'
            ? readyToStart
              ? `그룹 매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel} 대결을 이제 시작할 수 있어요.`
              : `그룹 매칭이 잡혔어요. ${buildMatchSlotDateLabel(session.slotStartAt)} ${sessionSlotLabel}에 ${participants.length}명 대결이 열려요.`
            : '이제 그룹 러닝 기록이 실시간으로 반영되고 있어요.',
        estimatedWaitMinutes: 0,
        participantCount: session.participants.length,
        acceptedCount: 0,
        capacity,
        userAccepted: true,
        readyToStart,
        canCancel: state === 'matched' ? canCancelReservation : false,
        cancelableUntilAt,
        ...(countdownRemainingSeconds !== undefined ? {
          countdownRemainingSeconds,
          countdownEndsAt: session.slotStartAt,
        } : {}),
        participants,
        mySeedRank,
      };
  }

  const queuedEntries = buildQueuedMatchRunnerEntries(store, mode, currentRunner, {
    distanceKm,
    slotStartAt,
    includeCurrentUser: true,
    testMode,
  });
  const queuedParticipants = queuedEntries.map((entry) => entry.runner);
  const competitiveThreshold = mode === 'duel' ? DUEL_MIN_COMPATIBILITY_SCORE : GROUP_MIN_COMPATIBILITY_SCORE;
  const competitiveParticipantsCount = testMode
    ? queuedEntries.length
    : queuedEntries.filter((entry) => (
      entry.runner.id === currentRunner.id || entry.score >= competitiveThreshold
    )).length;
  const currentQueueEntry = queuedEntries.find((entry) => entry.runner.id === currentRunner.id)?.queueEntry ?? null;
  const averagePaceMinutes = queuedParticipants.length
    ? queuedParticipants.reduce((sum, runner) => sum + runner.averagePaceMinutes, 0) / queuedParticipants.length
    : null;
  const averagePace = averagePaceMinutes === null ? '신청 없음' : formatPaceMinutesLabel(averagePaceMinutes);
  const participants = mode === 'group' ? buildQueuedParticipants(queuedEntries) : undefined;
  const mySeedRank = participants?.find((participant) => participant.id === currentUser.id)?.seedRank ?? 1;
  const queueExpiresAt = currentQueueEntry
    ? getMatchQueueEntryExpiresAt(currentQueueEntry)
    : null;

  if (currentQueueEntry?.testMode) {
    return {
      success: true,
      mode,
      state: 'waiting',
      isTestMatch: true,
      distanceKm: normalizeMatchQueueDistance(distanceKm),
      slotStartAt: currentQueueEntry.slotStartAt,
      slotLabel: formatDuelSlotLabel(currentQueueEntry.slotStartAt),
      paceBandLabel: averagePaceMinutes === null ? paceBandLabel : buildPaceBandLabel(averagePaceMinutes),
      levelBandLabel,
      criteriaSummary: mode === 'duel'
        ? `테스트 상대를 찾는 중이에요. 다른 러너가 들어오면 수준 상관없이 바로 30초 카운트다운이 시작되고, 최대 30분 동안 계속 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `테스트 그룹을 찾는 중이에요. ${MATCH_TEST_GROUP_MIN_PARTICIPANTS}명만 모이면 수준 상관없이 바로 30초 카운트다운이 시작되고, 최대 30분 동안 계속 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: queueExpiresAt
        ? Math.max(1, Math.ceil((new Date(queueExpiresAt).getTime() - now.getTime()) / (60 * 1000)))
        : 30,
      participantCount: queuedEntries.length,
      competitiveParticipantsCount,
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

  return {
    success: true,
    mode,
    state: currentQueueEntry ? 'waiting' : 'idle',
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt,
    slotLabel: formatDuelSlotLabel(slotStartAt),
    paceBandLabel: averagePaceMinutes === null ? paceBandLabel : buildPaceBandLabel(averagePaceMinutes),
    levelBandLabel,
    criteriaSummary: mode === 'duel'
      ? queuedEntries.length
        ? `현재 같은 조건 대기 러너는 ${queuedEntries.length}/${capacity}명이에요. 출발 30분 전까지 잘 맞는 상대를 계속 찾고 있어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 조건으로 대기 중인 러너가 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
      : queuedEntries.length
        ? `현재 실제 대기열은 ${queuedEntries.length}/${capacity}명이고, 비슷한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요.${competitiveParticipantsCount < GROUP_MIN_PARTICIPANTS ? ` 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.` : ''} 출발 30분 전까지 자동으로 계속 맞춰봐요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 조건으로 대기 중인 그룹이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
    estimatedWaitMinutes: Math.max(1, Math.ceil((new Date(slotStartAt).getTime() - MATCH_BOOKING_CUTOFF_MS - now.getTime()) / (60 * 1000))),
    participantCount: queuedEntries.length,
    competitiveParticipantsCount,
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

function buildDuelMatchResponse(store, currentUser, { distanceKm, slotStartAt, testMode = false }) {
  if (testMode) {
    clearUserTestMatchArtifacts(store, currentUser.id);
    assertUserCanRequestAnotherMatch(store, currentUser);
    return buildTestDuelMatchResponse(store, currentUser, { distanceKm, slotStartAt });
  }

  assertUserCanRequestAnotherMatch(store, currentUser);

  const normalizedSlotStartAt = validateMatchSlotStartAt(slotStartAt);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const slotLabel = formatDuelSlotLabel(normalizedSlotStartAt);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  upsertMatchQueueEntry(store, 'duel', currentUser.id, distanceKm, normalizedSlotStartAt);
  const queuedEntries = buildQueuedMatchRunnerEntries(store, 'duel', currentRunner, {
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
  }).sort((left, right) => right.score - left.score);

  if (!queuedEntries.length) {
    return {
      success: true,
      matched: false,
      requestId: nextId('duel-request'),
      distanceKm,
      slotStartAt: normalizedSlotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `나와 비슷한 페이스를 가진 상대를 계속 찾고 있어요. 출발 30분 전까지만 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
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
      slotStartAt: normalizedSlotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `신청자는 있지만 아직 바로 붙일 만큼 페이스와 레벨이 잘 맞지 않아요. 출발 30분 전까지 계속 찾아볼게요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
    };
  }

  removeUsersFromMatchQueue(store, 'duel', [currentUser.id, bestCandidate.runner.id]);
  createMatchSession(store, 'duel', distanceKm, normalizedSlotStartAt, [
    { id: currentUser.id, seedRank: 1 },
    { id: bestCandidate.runner.id, seedRank: 2 },
  ]);

  const opponent = bestCandidate.runner;
  return {
    success: true,
    matched: true,
    requestId: nextId('duel-request'),
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    slotLabel,
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: `${buildMatchSlotDateLabel(normalizedSlotStartAt)} ${slotLabel}에 비슷한 페이스 상대와 매칭이 잡혔어요.`,
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

function buildGroupMatchResponse(store, currentUser, { distanceKm, slotStartAt, testMode = false }) {
  if (testMode) {
    clearUserTestMatchArtifacts(store, currentUser.id);
    assertUserCanRequestAnotherMatch(store, currentUser);
    return buildTestGroupMatchResponse(store, currentUser, { distanceKm, slotStartAt });
  }

  assertUserCanRequestAnotherMatch(store, currentUser);

  const maxGroupSize = 30;
  const normalizedSlotStartAt = validateMatchSlotStartAt(slotStartAt);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const slotLabel = formatDuelSlotLabel(normalizedSlotStartAt);
  const paceBandLabel = buildPaceBandLabel(currentRunner.averagePaceMinutes);
  const levelBandLabel = `${buildLevelLabel(currentRunner.distanceLevel)} 전후`;
  const distanceRecommendationHint = buildDistanceRecommendationHint(distanceKm);

  upsertMatchQueueEntry(store, 'group', currentUser.id, distanceKm, normalizedSlotStartAt);
  const queuedEntries = buildQueuedMatchRunnerEntries(store, 'group', currentRunner, {
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
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
      slotStartAt: normalizedSlotStartAt,
      slotLabel,
      paceBandLabel,
      levelBandLabel,
      criteriaSummary: `나와 비슷한 페이스 러너를 계속 모으는 중이에요. 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 하고, 출발 30분 전까지만 매칭돼요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
      maxGroupSize,
      participantsCount: participants.length,
      mySeedRank,
      participants,
    };
  }

  removeUsersFromMatchQueue(store, 'group', participants.map((participant) => participant.id));
  createMatchSession(store, 'group', distanceKm, normalizedSlotStartAt, participants);

  return {
    success: true,
    matched: true,
    requestId: nextId('group-request'),
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
    slotLabel,
    paceBandLabel,
    levelBandLabel,
    criteriaSummary: `${buildMatchSlotDateLabel(normalizedSlotStartAt)} ${slotLabel}에 ${participants.length}명 그룹 대결이 잡혔어요.`,
    estimatedWaitMinutes: 0,
    maxGroupSize,
    participantsCount: participants.length,
    mySeedRank,
    participants,
  };
}

function buildMatchDemandSummaryResponse(store, currentUser, { mode, distanceKm, slotStartAt }) {
  const normalizedSlotStartAt = validateMatchSlotStartAt(slotStartAt);
  const currentRunner = buildMatchRunnerProfile(store, currentUser);
  const capacity = mode === 'duel' ? 2 : 30;
  const competitiveThreshold = mode === 'duel' ? DUEL_MIN_COMPATIBILITY_SCORE : GROUP_MIN_COMPATIBILITY_SCORE;
  const queuedEntries = buildQueuedMatchRunnerEntries(store, mode, currentRunner, {
    distanceKm,
    slotStartAt: normalizedSlotStartAt,
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
    slotStartAt: normalizedSlotStartAt,
    slotLabel: formatDuelSlotLabel(normalizedSlotStartAt),
    averagePace,
    participantsCount,
    competitiveParticipantsCount,
    capacity,
    fillRatioLabel: `${participantsCount}/${capacity}`,
    paceBandLabel: averagePaceMinutes === null ? '대기 없음' : buildPaceBandLabel(averagePaceMinutes),
    summaryText: mode === 'duel'
      ? participantsCount
        ? `현재 실제 신청은 ${participantsCount}/${capacity}명이고, 바로 붙일 만한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요. 출발 30분 전까지 자동으로 계속 맞춰봐요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 시간대 신청이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
      : participantsCount
        ? `현재 실제 신청은 ${participantsCount}/${capacity}명이고, 비슷한 러너는 ${competitiveParticipantsCount}/${capacity}명이에요.${competitiveParticipantsCount < GROUP_MIN_PARTICIPANTS ? ` 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.` : ''} 출발 30분 전까지 자동으로 계속 맞춰봐요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
        : `아직 이 시간대 신청이 없어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
  };
}

function buildUpcomingRunningMatchesResponse(store, currentUser) {
  const now = new Date();
  const sessions = pruneMatchSessions(store)
    .filter((session) => session.participants.some((participant) => (
      participant.userId === currentUser.id
      && resolveParticipantLiveStatus(participant, now) !== 'forfeited'
    )))
    .map((session) => {
      const state = hydrateMatchSessionState(session, now);

      if (!['matched', 'active'].includes(state)) {
        return null;
      }

      if (session.mode === 'duel') {
      const opponent = buildSessionDuelOpponent(store, session, currentUser.id, now);
      const isTestMatch = isTestMatchSession(session);
      const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, { isTestMatch }).toISOString();
      return {
        matchId: session.id,
        mode: 'duel',
        ...(isTestMatch ? { isTestMatch: true } : {}),
        distanceKm: session.distanceKm,
          slotStartAt: session.slotStartAt,
          slotLabel: formatDuelSlotLabel(session.slotStartAt),
          status: state,
          participantCount: 2,
          counterpartLabel: opponent?.name ?? '상대 미정',
          summary: `${buildMatchSlotDateLabel(session.slotStartAt)} ${formatDuelSlotLabel(session.slotStartAt)} · ${session.distanceKm.toFixed(1)}km`,
          canCancel: state === 'matched' && now.getTime() < new Date(cancelableUntilAt).getTime(),
          cancelableUntilAt,
        };
      }

      const participants = buildSessionGroupParticipants(store, session, now);
      const isTestMatch = isTestMatchSession(session);
      const cancelableUntilAt = buildMatchCancellationDeadline(session.slotStartAt, { isTestMatch }).toISOString();
      return {
        matchId: session.id,
        mode: 'group',
        ...(isTestMatch ? { isTestMatch: true } : {}),
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: formatDuelSlotLabel(session.slotStartAt),
        status: state,
        participantCount: participants.length,
        counterpartLabel: `${participants.length}명 그룹`,
        summary: `${buildMatchSlotDateLabel(session.slotStartAt)} ${formatDuelSlotLabel(session.slotStartAt)} · ${session.distanceKm.toFixed(1)}km`,
        canCancel: state === 'matched' && now.getTime() < new Date(cancelableUntilAt).getTime(),
        cancelableUntilAt,
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(left.slotStartAt).getTime() - new Date(right.slotStartAt).getTime());

  return {
    items: sessions,
  };
}

function acceptRunningMatch(store, currentUser, matchId) {
  const session = findMatchSessionById(store, matchId);

  if (!session || !session.participants.some((participant) => participant.userId === currentUser.id)) {
    throw new ApiError(404, '수락할 매치를 찾지 못했어.');
  }

  return buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    testMode: isTestMatchSession(session),
  });
}

function cancelRunningMatch(store, currentUser, { mode, distanceKm, slotStartAt, matchId, testMode = false }) {
  const normalizedDistanceKm = normalizeMatchQueueDistance(distanceKm);
  const queueEntries = getMatchQueueEntries(store, mode, normalizedDistanceKm, slotStartAt, { testMode });
  const session = matchId
    ? findMatchSessionById(store, matchId)
    : findMatchSessionForUser(store, mode, currentUser.id, { distanceKm: normalizedDistanceKm, slotStartAt, testMode });

  removeUsersFromMatchQueue(store, mode, [currentUser.id]);

  if (session && session.participants.some((participant) => participant.userId === currentUser.id)) {
    const state = hydrateMatchSessionState(session);

    if (state === 'active') {
      throw new ApiError(400, '이미 출발한 매치는 취소할 수 없어.');
    }

    if (state === 'matched') {
      const cancellationDeadline = buildMatchCancellationDeadline(session.slotStartAt, {
        isTestMatch: isTestMatchSession(session),
      });

      if (Date.now() >= cancellationDeadline.getTime()) {
        throw new ApiError(400, isTestMatchSession(session)
          ? '테스트 카운트다운이 시작된 뒤에는 취소할 수 없어.'
          : '출발 1시간 전부터는 예약을 취소할 수 없어.');
      }
    }

    const requeuedParticipants = session.participants
      .filter((participant) => participant.userId !== currentUser.id)
      .filter((participant) => !participant.profileSnapshot)
      .map((participant) => findUserById(store, participant.userId));

    store.matchSessions = ensureMatchSessions(store).filter((entry) => entry.id !== session.id);

    for (const participant of requeuedParticipants) {
      const nextTestSlotStartAt = buildTestMatchStartAt();
      upsertMatchQueueEntry(store, mode, participant.id, session.distanceKm, isTestMatchSession(session) ? nextTestSlotStartAt : session.slotStartAt, isTestMatchSession(session)
        ? {
            testMode: true,
            expiresAt: buildTestMatchQueueExpiresAt(),
          }
        : {});
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

  if (sessionState === 'matched' && !buildRunningMatchStatusResponse(store, currentUser, {
    mode: session.mode,
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    testMode: isTestMatchSession(session),
  }).readyToStart) {
    throw new ApiError(400, '예약된 시작 시간이 아직 되지 않았어.');
  }

  if (!['matched', 'active'].includes(sessionState)) {
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
  if (!session.startedAt) {
    session.startedAt = currentParticipant.liveUpdatedAt;
  }

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
  return clone({
    ...createDefaultNotificationSettings(),
    ...(user.notificationSettings ?? {}),
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

async function handleLogin(request, response) {
  const body = await parseJsonBody(request);
  const username = validateRequiredString(body.username, '아이디를 입력해주세요.').toLowerCase();
  const password = validateRequiredString(body.password, '비밀번호를 입력해주세요.');
  const result = await getAuthRepository().login({ username, password });

  sendJson(response, 200, result);
}

async function handleFindUsername(request, response) {
  const body = await parseJsonBody(request);
  const realName = validateRequiredString(body.realName, '이름을 입력해주세요.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해주세요.').replace(/\D/g, '');
  const birthDate = validateRequiredString(body.birthDate, '생년월일을 입력해주세요.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  const result = await getAuthRepository().findUsername({
    realName,
    phone,
    birthDate,
  });

  sendJson(response, 200, result);
}

async function handleResetPassword(request, response) {
  const body = await parseJsonBody(request);
  const username = validateUsername(body.username);
  const realName = validateRequiredString(body.realName, '이름을 입력해주세요.');
  const phone = validateRequiredString(body.phone, '휴대폰 번호를 입력해주세요.').replace(/\D/g, '');
  const birthDate = validateRequiredString(body.birthDate, '생년월일을 입력해주세요.');
  const newPassword = validateNewPassword(body.newPassword);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

  const result = await getAuthRepository().resetPassword({
    username,
    realName,
    phone,
    birthDate,
    newPassword,
  });

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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
  }

  if (phone.length < 10) {
    throw new ApiError(400, '휴대폰 번호를 정확히 입력해주세요.');
  }

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
      matchReminders: validateBoolean(body.matchReminders, '매치 알림 설정값이 올바르지 않아.'),
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
  const testMode = body.testMode === true;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildDuelMatchResponse(store, currentUser, {
      distanceKm,
      slotStartAt,
      testMode,
    });
  });

  sendJson(response, 200, payload);
}

async function handleRequestGroupMatch(request, response) {
  const body = await parseJsonBody(request);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const testMode = body.testMode === true;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildGroupMatchResponse(store, currentUser, {
      distanceKm,
      slotStartAt,
      testMode,
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
    slotStartAt: validateMatchSlotInput(body.slotStartAt),
  });

  sendJson(response, 200, payload);
}

async function handleFetchRunningMatchStatus(request, response) {
  const body = await parseJsonBody(request);
  const mode = validateMatchMode(body.mode);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const testMode = body.testMode === true;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildRunningMatchStatusResponse(store, currentUser, {
      mode,
      distanceKm,
      slotStartAt,
      testMode,
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
  const testMode = body.testMode === true;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const matchId = typeof body.matchId === 'string' && body.matchId.trim() ? body.matchId.trim() : '';
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return cancelRunningMatch(store, currentUser, {
      mode,
      distanceKm,
      slotStartAt,
      testMode,
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

function handleFetchMyRunningMatchRoom(request, response) {
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    const room = findRunningMatchRoomForUser(store, currentUser.id);
    return buildRunningMatchRoomResponse(store, currentUser, room);
  });

  sendJson(response, 200, payload);
}

async function handleCreateRunningMatchRoom(request, response) {
  const body = await parseJsonBody(request);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return createRunningMatchRoom(store, currentUser, {
      mode: validateMatchMode(body.mode),
      distanceKm: validateDuelMatchDistanceKm(body.distanceKm),
      startMode: validateMatchRoomStartMode(body.startMode),
      slotStartAt: body.slotStartAt,
      maxParticipants: body.maxParticipants,
      invitedFriendIds: validateOptionalUserIdArray(body.invitedFriendIds, '초대할 친구 목록이 올바르지 않아.'),
    });
  });

  sendJson(response, 201, payload);
}

async function handleJoinRunningMatchRoom(request, response) {
  const body = await parseJsonBody(request);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return joinRunningMatchRoom(store, currentUser, {
      inviteToken: validateRequiredString(body.inviteToken, '방 초대 코드를 입력해줘.'),
    });
  });

  sendJson(response, 200, payload);
}

async function handleStartRunningMatchRoom(request, response) {
  const body = await parseJsonBody(request);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return startRunningMatchRoom(store, currentUser, {
      roomId: validateRequiredString(body.roomId, '시작할 방 아이디가 필요해.'),
    });
  });

  sendJson(response, 200, payload);
}

async function handleUpdateRunningMatchRoom(request, response) {
  const body = await parseJsonBody(request);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return updateRunningMatchRoom(store, currentUser, {
      roomId: validateRequiredString(body.roomId, '설정할 방 아이디가 필요해.'),
      distanceKm: validateDuelMatchDistanceKm(body.distanceKm),
      startMode: validateMatchRoomStartMode(body.startMode),
      slotStartAt: body.slotStartAt,
      maxParticipants: body.maxParticipants,
      invitedFriendIds: validateOptionalUserIdArray(body.invitedFriendIds, '초대할 친구 목록이 올바르지 않아.'),
    });
  });

  sendJson(response, 200, payload);
}

async function handleUpdateRunningMatchRoomReady(request, response) {
  const body = await parseJsonBody(request);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return updateRunningMatchRoomReady(store, currentUser, {
      roomId: validateRequiredString(body.roomId, '준비 상태를 바꿀 방 아이디가 필요해.'),
      ready: body.ready === true,
    });
  });

  sendJson(response, 200, payload);
}

async function handleLeaveRunningMatchRoom(request, response) {
  const body = await parseJsonBody(request);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return leaveRunningMatchRoom(store, currentUser, {
      roomId: validateRequiredString(body.roomId, '나갈 방 아이디가 필요해.'),
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

  if (pathname === '/api/auth/find-username' && request.method === 'POST') {
    await handleFindUsername(request, response);
    return;
  }

  if (pathname === '/api/auth/reset-password' && request.method === 'POST') {
    await handleResetPassword(request, response);
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

  if (pathname === '/api/running/matches/upcoming' && request.method === 'GET') {
    sendJson(response, 200, await buildUpcomingRunningMatchesReadPayload(request));
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

  if (pathname === '/api/running/rooms/my' && request.method === 'GET') {
    handleFetchMyRunningMatchRoom(request, response);
    return;
  }

  if (pathname === '/api/running/rooms' && request.method === 'POST') {
    await handleCreateRunningMatchRoom(request, response);
    return;
  }

  if (pathname === '/api/running/rooms/join' && request.method === 'POST') {
    await handleJoinRunningMatchRoom(request, response);
    return;
  }

  if (pathname === '/api/running/rooms/update' && request.method === 'POST') {
    await handleUpdateRunningMatchRoom(request, response);
    return;
  }

  if (pathname === '/api/running/rooms/ready' && request.method === 'POST') {
    await handleUpdateRunningMatchRoomReady(request, response);
    return;
  }

  if (pathname === '/api/running/rooms/start' && request.method === 'POST') {
    await handleStartRunningMatchRoom(request, response);
    return;
  }

  if (pathname === '/api/running/rooms/leave' && request.method === 'POST') {
    await handleLeaveRunningMatchRoom(request, response);
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
