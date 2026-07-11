import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { loadStore, mutateStore, getStoreFilePath, getStoreDiagnostics, getStoredRunRoute, resetStore, STORE_DRIVER } from './storage/index.mjs';
// The json repositories go through the ASYNC store seam (loadStore/mutateStore from
// ./storage/index.mjs) so the WHOLE backend — not just the direct route call sites — runs on
// Postgres when BACKEND_STORE_DRIVER=postgres. Each repo method awaits the injected seam.
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
} from './points.mjs';
import { buildRoadAlignedRoutePreview } from './routing.mjs';
import {
  createPhoneVerificationService,
  hashPhoneVerificationCode,
} from './phoneVerification.mjs';
import { createApiRouteHandler } from './routes/index.mjs';
import { createAdminReadService } from './services/adminReadService.mjs';
import { createBackendStatusService } from './services/backendStatusService.mjs';
import { createLeagueReadService } from './services/leagueReadService.mjs';
import { createReadPayloadBuilders } from './services/readPayloads.mjs';
import { createPhoneVerificationHelpers } from './services/phoneVerificationService.mjs';
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
  isActiveRewardRedemption,
  normalizeOptionalString,
} from './lib/adminNormalizers.mjs';
import { nextId } from './lib/idHelpers.mjs';
import {
  buildProfile,
  ensureUserConnectedSources,
  findUserById,
  getRedeemedPointCost,
  getRunsForUser,
  getUserMetrics,
  invalidateUserMetrics,
} from './lib/userStoreHelpers.mjs';
import {
  acceptRunningMatch,
  acknowledgeRunningMatchRoomCountdown,
  buildDuelMatchResponse,
  buildGroupMatchResponse,
  buildMatchDemandSummaryResponse,
  buildMatchResultByMatchId,
  resolveSavedDuelMatchResult,
  resolveSavedGroupMatchResult,
  buildRunningMatchRoomResponse,
  buildRunningMatchStatusResponse,
  cancelRunningMatch,
  cleanupStaleRunningMatchRoomState,
  createRunningMatchRoom,
  findRunningMatchRoomForUser,
  findRunningMatchRoomInviteInboxForUser,
  forceResetRunningMatchStateForUser,
  joinRunningMatchRoom,
  leaveRunningMatch,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  sweepStuckMatchSessionFallbacks,
  updateRunningMatchProgress,
  updateRunningMatchRoom,
  updateRunningMatchRoomReady,
} from './lib/runningMatchStoreHelpers.mjs';
import { buildNotificationSettings } from './lib/notificationSettings.mjs';
import {
  buildIntegrationSourceActionResult,
  decorateIntegrationSource,
  isExclusiveIntegrationSourceType,
  requireConnectedSource,
  SOURCE_LABEL_BY_TYPE,
} from './lib/integrationSources.mjs';
import {
  buildActiveNotices,
  buildAdminNotices,
  buildRegionCatalog,
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
  validateRunningMatchProgressDistanceKm,
  validateTrackedRoute,
  validateUsername,
} from './lib/validators.mjs';
import {
  normalizeAdminMarketItemInput,
  normalizeAdminNoticeInput,
  normalizeAdminOfflineRaceEventInput,
  normalizeImportedRun,
} from './lib/inputNormalizers.mjs';
import { buildRunDetail } from './lib/runHelpers.mjs';
const STARTED_AT = new Date().toISOString();

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
      // C1/C2: server is authoritative for the match verdict at save. The JSON repo's
      // mutateStore callback already holds the whole-store (incl. matchSessions) so the
      // resolver reads the live session/standings directly to overwrite or pend the result.
      // Duel → duel verdict (win/lose/draw); group → group verdict (final placement). Any
      // other shape falls through both resolvers UNCHANGED.
      resolveMatchResult: (store, user, matchResult) => (
        matchResult?.mode === 'group'
          ? resolveSavedGroupMatchResult(store, user, matchResult)
          : resolveSavedDuelMatchResult(store, user, matchResult)
      ),
      invalidateUserMetrics,
      // #209: run detail responses re-attach GPS routes stored in the run_routes side table
      // (postgres driver); the json driver keeps routes embedded and this resolves to null.
      getStoredRunRoute,
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
      getStoredRunRoute,
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
  const store = await loadStore();
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

const {
  buildPhoneVerificationPayload,
  buildPhoneVerificationSuccessPayload,
  createPhoneVerificationChallenge,
} = createPhoneVerificationHelpers({
  cleanupPhoneVerificationChallenges,
  ensurePhoneVerificationChallenges,
  loadStore,
  phoneVerificationCodeTtlMs: PHONE_VERIFICATION_CODE_TTL_MS,
  phoneVerificationMaxAttempts: PHONE_VERIFICATION_MAX_ATTEMPTS,
  phoneVerificationProvider: PHONE_VERIFICATION_PROVIDER,
  phoneVerificationResendCooldownMs: PHONE_VERIFICATION_RESEND_COOLDOWN_MS,
});

const {
  buildProfileReadPayload,
  buildNotificationSettingsReadPayload,
  buildHomeSummaryReadPayload,
  buildUpcomingRunningMatchesReadPayload,
  buildMyActivityReadPayload,
  buildIntegrationSourcesReadPayload,
  buildFriendLeaderboardReadPayload,
  buildFriendActivityReadPayload,
  buildFriendRunReadPayload,
  buildMarketOverviewReadPayload,
  buildOfflineRaceHubReadPayload,
  buildCurrentRunReadPayload,
} = createReadPayloadBuilders({
  getAccessToken,
  getFriendsLeagueBridge,
  getMarketRepository,
  getRaceRepository,
  loadCurrentUserReadContext,
  loadStore,
  getStoredRunRoute,
});

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
  loadCurrentUserReadContext,
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
  buildRankLeaderboardReadPayload: leagueReadService.buildRankLeaderboardReadPayload,
  buildRegionLeagueReadPayload: leagueReadService.buildRegionLeagueReadPayload,
  buildTodayRankingReadPayload: leagueReadService.buildTodayRankingReadPayload,
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
  validateRunningMatchProgressDistanceKm,
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
  buildMatchResultByMatchId,
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
  forceResetRunningMatchStateForUser,
  isExclusiveIntegrationSourceType,
  joinRunningMatchRoom,
  leaveRunningMatch,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  sweepStuckMatchSessionFallbacks,
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
