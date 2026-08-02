import { buildNotificationSettings } from '../lib/notificationSettings.mjs';
import { getAvailableRewardPoints } from '../lib/points.mjs';
import { buildProfileWithMetrics, getRedeemedPointCost } from '../lib/userStoreHelpers.mjs';
import { buildUpcomingRunningMatchesResponse } from '../lib/runningMatchStoreHelpers.mjs';
import { buildIntegrationSources } from '../lib/integrationSources.mjs';
import { buildHomeSummaryWithMetrics, buildMyActivityWithRunsAndMetrics } from '../lib/homeBuilders.mjs';
import { attachStoredRunRoute, buildRunDetail, getRunFromList } from '../lib/runHelpers.mjs';

export function createReadPayloadBuilders({
  getAccessToken,
  getFriendsLeagueBridge,
  getMarketRepository,
  getRaceRepository,
  loadCurrentUserReadContext,
  loadStore,
  // #209: resolves a run's GPS route from the run_routes side table when the store driver keeps
  // routes out of the whole-store blob (postgres). Defaults to null so json-driver callers keep
  // today's embedded-route behavior byte-for-byte.
  getStoredRunRoute = async () => null,
}) {
  async function buildProfileReadPayload(request) {
    const { store, user, metrics } = await loadCurrentUserReadContext(request, {
      includeMetrics: true,
    });

    return buildProfileWithMetrics(user, metrics, {
      // 마이탭 보유 포인트 — 마켓 currentPoints와 같은 기준(적립 − 사용 리워드 비용).
      // 리워드 교환 내역은 드라이버와 무관하게 blob store에 있다.
      availablePoints: getAvailableRewardPoints(metrics, getRedeemedPointCost(store, user.id)),
    });
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
      store: await loadStore(),
      token: getAccessToken(request),
    });

    return payload;
  }

  async function buildFriendActivityReadPayload(request, friendId) {
    const { payload } = await getFriendsLeagueBridge().getFriendActivity({
      store: await loadStore(),
      token: getAccessToken(request),
      friendId,
    });

    return payload;
  }

  async function buildFriendRunReadPayload(request, friendId, runId) {
    const { payload } = await getFriendsLeagueBridge().getFriendRun({
      store: await loadStore(),
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
    // #209: run detail is the endpoint that actually needs the GPS route — re-attach it from
    // the run_routes side table so the response shape stays exactly as before the blob split.
    const run = await attachStoredRunRoute(getRunFromList(runs, runId), getStoredRunRoute);

    return buildRunDetail(run, metrics.currentWeekDistanceKm, undefined, metrics);
  }

  return {
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
  };
}
