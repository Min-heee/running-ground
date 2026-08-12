import { loadStore, mutateStore, getStoredRunRoute } from '../storage/index.mjs';
import { createFriendsLeagueBridge } from '../bridges/friendsLeagueBridge.mjs';
import { createSessionRunsBridge } from '../bridges/sessionRunsBridge.mjs';
import { createPostgresDatabase } from '../database/postgresDatabase.mjs';
import { createJsonAdminRepository } from '../repositories/adminRepository.mjs';
import { createJsonAuthRepository } from '../repositories/authRepository.mjs';
import { createJsonFriendsRepository } from '../repositories/friendsRepository.mjs';
import { createJsonLeagueRepository } from '../repositories/leagueRepository.mjs';
import { createJsonMarketRepository } from '../repositories/marketRepository.mjs';
import { createPostgresFriendsRepository } from '../repositories/postgresFriendsRepository.mjs';
import { createPostgresLeagueRepository } from '../repositories/postgresLeagueRepository.mjs';
import { createJsonRaceRepository } from '../repositories/raceRepository.mjs';
import { createJsonRunsRepository, ensureIntegrationImports } from '../repositories/runsRepository.mjs';
import {
  APP_ENV,
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
  SESSION_TTL_MS,
} from '../config.mjs';
import { createToken, findUserByToken } from '../requestAuth.mjs';
import {
  buildUserRunMetrics,
  getAvailableRewardPoints,
} from '../lib/points.mjs';
import { ApiError } from '../response/httpResponse.mjs';
import { createAdminReadService } from './adminReadService.mjs';
import { formatTimestamp } from '../lib/dateTimeFormatting.mjs';
import {
  buildNoticeEntry,
  isActiveRewardRedemption,
  normalizeOptionalString,
} from '../lib/adminNormalizers.mjs';
import { nextId } from '../lib/idHelpers.mjs';
import {
  buildProfile,
  ensureUserConnectedSources,
  findUserById,
  getRedeemedPointCost,
  getRunsForUser,
  getUserMetrics,
  invalidateUserMetrics,
} from '../lib/userStoreHelpers.mjs';
import {
  backFillMatchCounterpartSavedRuns,
  resolveSavedDuelMatchResult,
  resolveSavedGroupMatchResult,
} from '../lib/runningMatchStoreHelpers.mjs';
import {
  decorateIntegrationSource,
  SOURCE_LABEL_BY_TYPE,
} from '../lib/integrationSources.mjs';
import {
  buildActiveNotices,
  buildAdminNotices,
  ensureNoticeStore,
} from '../lib/catalogBuilders.mjs';
import {
  buildAdminMarketCatalog,
  buildAdminMarketItem,
  buildAdminRewardRedemption,
  buildAdminRewardRedemptions,
  buildRedemptionCountByItemId,
  buildMarketOverviewWithMetrics,
  ensureMarketCatalogStore,
  getMarketItemRemainingStock,
} from '../lib/marketOverview.mjs';
import {
  buildAdminOfflineRaceEvent,
  buildAdminOfflineRaceEvents,
  buildOfflineRaceHub,
  decorateOfflineRaceEvent,
  ensureOfflineRaceStore,
  getOfflineRaceStatus,
} from './offlineRaceHub.mjs';
import { buildRunDetail } from '../lib/runHelpers.mjs';

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

export function getAuthRepository() {
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

export function getAdminReadService() {
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

export function getAdminRepository() {
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

export function getPostgresDatabase() {
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

export function getSessionRunsBridge() {
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

export function getRunsRepository() {
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
      // `savingRun`(저장 중인 기록의 실측 거리/시간/케이던스)까지 넘긴다: 세션 없는 분기의
      // 완주 판정은 내 쪽 기록도 목표 거리를 채웠는지 봐야 하는데, 그 기록은 아직 store.runs에
      // 없어서 블롭만으로는 알 수 없다.
      resolveMatchResult: (store, user, matchResult, savingRun = null) => (
        matchResult?.mode === 'group'
          ? resolveSavedGroupMatchResult(store, user, matchResult, undefined, { savingRun })
          : resolveSavedDuelMatchResult(store, user, matchResult, undefined, { savingRun })
      ),
      // 승자 0P 근치 (오너 2026-08-09): 저장이 끝난 뒤 같은 matchId의 상대 PENDING 블롭을
      // 같은 resolver로 승격시킨다. 고쳐진 유저 id 목록을 돌려주고, 저장소가 그 유저들의
      // 메모된 메트릭을 버려 파생 포인트가 즉시 맞춰진다.
      backFillMatchCounterparts: (store, matchResult) => (
        backFillMatchCounterpartSavedRuns(store, matchResult)
      ),
      invalidateUserMetrics,
      // #209: run detail responses re-attach GPS routes stored in the run_routes side table
      // (postgres driver); the json driver keeps routes embedded and this resolves to null.
      getStoredRunRoute,
    });
  }

  return runsRepository;
}

export function getFriendsRepository() {
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

export function getLeagueRepository() {
  if (!leagueRepository) {
    leagueRepository = createJsonLeagueRepository({
      loadStore,
      mutateStore,
      requireUserByToken: (store, token) => findUserByToken(store, token),
      getUserMetrics,
      createError: (statusCode, message) => new ApiError(statusCode, message),
    });
  }

  return leagueRepository;
}

export function getMarketRepository() {
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

export function getRaceRepository() {
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

export function getPostgresFriendsRepository() {
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

export function getPostgresLeagueRepository() {
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

export function getFriendsLeagueBridge() {
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

export async function closePostgresDatabaseIfOpen() {
  if (postgresDatabase) {
    await postgresDatabase.close();
  }
}
