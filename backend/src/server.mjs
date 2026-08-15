import { createServer } from 'node:http';
import { loadStore, mutateStore, getStoreFilePath, getStoreDiagnostics, getStoredRunRoute, resetStore, STORE_DRIVER } from './storage/index.mjs';
// The json repositories go through the ASYNC store seam (loadStore/mutateStore from
// ./storage/index.mjs) so the WHOLE backend — not just the direct route call sites — runs on
// Postgres when BACKEND_STORE_DRIVER=postgres. Each repo method awaits the injected seam.
import { ensureIntegrationImports } from './repositories/runsRepository.mjs';
import {
  APP_ENV,
  ENABLE_ADMIN_STATUS,
  ENABLE_RESET_ENDPOINT,
  HOST,
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
  REQUEST_TIMEOUT_MS,
  SHUTDOWN_TIMEOUT_MS,
  SOLAPI_API_KEY,
  SOLAPI_API_SECRET,
  SOLAPI_SENDER,
  getPublicBackendConfig,
} from './config.mjs';
import {
  createToken,
  getAccessToken,
  requireAdmin,
  requireUser,
} from './requestAuth.mjs';
import { buildUserRunMetrics } from './lib/points.mjs';
import { buildRoadAlignedRoutePreview } from './routing.mjs';
import {
  createPhoneVerificationService,
  hashPhoneVerificationCode,
} from './phoneVerification.mjs';
import { createApiRouteHandler } from './routes/index.mjs';
import { createBackendStatusService } from './services/backendStatusService.mjs';
import { startStaleMatchStateSweeper } from './services/staleMatchStateSweeper.mjs';
import { startUserNotificationPushPump } from './lib/notificationPushPump.mjs';
import { createLeagueReadService } from './services/leagueReadService.mjs';
import { createReadPayloadBuilders } from './services/readPayloads.mjs';
import {
  closePostgresDatabaseIfOpen,
  getAdminRepository,
  getAuthRepository,
  getFriendsLeagueBridge,
  getFriendsRepository,
  getMarketRepository,
  getPostgresFriendsRepository,
  getRaceRepository,
  getRunsRepository,
  getSessionRunsBridge,
} from './services/repositoryRegistry.mjs';
import { createPhoneVerificationHelpers } from './services/phoneVerificationService.mjs';
import {
  cleanupPhoneVerificationChallenges,
  ensurePhoneVerificationChallenges,
} from './lib/phoneVerificationStoreHelpers.mjs';
import {
  ApiError,
  applyCorsHeaders,
  getErrorMessage,
  logBackendError,
  logBackendInfo,
  sendError,
  sendJson,
} from './response/httpResponse.mjs';
import { parseJsonBody } from './response/httpRequestBody.mjs';
import {
  buildChaseArenaListPayload,
  buildChaseArenaOverviewPayload,
  buildChaseLivePayload,
  joinChaseArenaPresence,
  leaveChaseArenaPresence,
  updateChasePresencePosition,
} from './lib/chase/chasePresence.mjs';
import { findChaseArena } from './lib/chase/chaseArenas.mjs';
import { settleChaseRunUpload } from './lib/chase/chaseSettlement.mjs';
import {
  buildRunmadangMinePayload,
  cancelRunmadangChallenge,
  createRunmadangChallenge,
  declineRunmadangChallenge,
  hasDueRunmadangChallenges,
  hideRunmadangChallenge,
  joinRunmadangChallenge,
  settleDueRunmadangChallenges,
  withdrawRunmadangChallenge,
} from './lib/runmadang/runmadang.mjs';
import {
  normalizeOptionalString,
} from './lib/adminNormalizers.mjs';
import {
  buildProfile,
  getUserMetrics,
} from './lib/userStoreHelpers.mjs';
import {
  acceptRunningMatch,
  acknowledgeRunningMatchRoomCountdown,
  buildDuelMatchResponse,
  buildGroupMatchResponse,
  buildMatchDemandSummaryResponse,
  buildMatchResultByMatchId,
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
  isExclusiveIntegrationSourceType,
  requireConnectedSource,
} from './lib/integrationSources.mjs';
import {
  buildRegionCatalog,
  ensureNoticeStore,
} from './lib/catalogBuilders.mjs';
import { ensureMarketCatalogStore } from './lib/marketOverview.mjs';
import { ensureOfflineRaceStore } from './services/offlineRaceHub.mjs';
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
  normalizeTag,
} from './lib/inputNormalizers.mjs';
const STARTED_AT = new Date().toISOString();

const phoneVerificationService = createPhoneVerificationService({
  provider: PHONE_VERIFICATION_PROVIDER,
  appEnv: APP_ENV,
  exposeTestCode: PHONE_VERIFICATION_EXPOSE_TEST_CODE,
  solapiApiKey: SOLAPI_API_KEY,
  solapiApiSecret: SOLAPI_API_SECRET,
  solapiSender: SOLAPI_SENDER,
});

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
  buildChaseArenaListPayload,
  buildChaseArenaOverviewPayload,
  buildChaseLivePayload,
  joinChaseArenaPresence,
  leaveChaseArenaPresence,
  updateChasePresencePosition,
  findChaseArena,
  settleChaseRunUpload,
  buildRunmadangMinePayload,
  cancelRunmadangChallenge,
  createRunmadangChallenge,
  declineRunmadangChallenge,
  hasDueRunmadangChallenges,
  hideRunmadangChallenge,
  joinRunmadangChallenge,
  settleDueRunmadangChallenges,
  withdrawRunmadangChallenge,
  getStoredRunRoute,
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
  buildUniverseReadPayload: leagueReadService.buildUniverseReadPayload,
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
    // 4xx 거절 진단 로그 (2026-08-06, 회원K 저장 실종 조사): ApiError는 지금까지
    // 아무 로그도 안 남아 "저장이 왜 거절됐는지"를 사후에 알 수 없었다. 401(만료 세션
    // 폴링 소음)만 빼고 경로·상태·메시지를 남긴다 — 본문/토큰은 기록하지 않는다.
    if (error instanceof ApiError && error.statusCode !== 401) {
      logBackendInfo('api_client_error', {
        method: request.method,
        path: String(request.url ?? '').split('?')[0],
        status: error.statusCode,
        message: error.message,
      });
    }
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

// 만료된 대기방/세션/큐는 누가 앱을 열어주기를 기다리지 않고 서버가 스스로 지운다.
// 부팅 직후에는 일부러 쓸지 않는다: 기동 순간에 blob 전체 쓰기를 얹지 않고, 첫 요청과
// 청소가 뒤엉키지 않게 한다. 재배포 직후 남은 유령 방도 최대 한 주기면 사라진다.
startStaleMatchStateSweeper({
  mutateStore,
  onSwept: (swept) => logBackendInfo('stale_match_state_swept', swept),
  onError: (error) => logBackendError('stale_match_state_sweep_failed', error),
});

// 인앱 알림별 원격 푸시 펌프 (오너 2026-08-03) — appendUserNotification이 쌓은 인텐트를
// 트랜잭션 밖에서 3초 주기로 발송한다.
startUserNotificationPushPump({
  loadStore,
  mutateStore,
  onError: (error) => logBackendError('user_notification_push_pump_failed', error),
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

      await closePostgresDatabaseIfOpen();

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
