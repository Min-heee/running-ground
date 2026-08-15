import { buildRankLeaderboardResponse } from './rankLeaderboardBuilder.mjs';

export function createLeagueReadService({
  getAccessToken,
  getFriendsLeagueBridge,
  loadCurrentUserReadContext,
  loadStore,
}) {
  async function buildDistrictPersonalReadPayload(request, nodeId) {
    const { payload } = await getFriendsLeagueBridge().getDistrictPersonal({
      store: await loadStore(),
      token: getAccessToken(request),
      nodeId,
    });

    return payload;
  }

  async function buildRegionLeagueReadPayload(request, nodeId) {
    const { payload } = await getFriendsLeagueBridge().getRegions({
      store: await loadStore(),
      token: getAccessToken(request),
      nodeId,
    });

    return payload;
  }

  async function buildUniverseReadPayload(request, nodeId) {
    const { payload } = await getFriendsLeagueBridge().getUniverse({
      token: getAccessToken(request),
      nodeId,
    });

    return payload;
  }

  async function buildTodayRankingReadPayload(request, category) {
    const { payload } = await getFriendsLeagueBridge().getTodayRankings({
      category,
      store: await loadStore(),
      token: getAccessToken(request),
    });

    return payload;
  }

  async function buildRankLeaderboardReadPayload(request) {
    const { store, user } = await loadCurrentUserReadContext(request);
    return buildRankLeaderboardResponse(store, user);
  }

  return {
    buildDistrictPersonalReadPayload,
    buildRankLeaderboardReadPayload,
    buildRegionLeagueReadPayload,
    buildTodayRankingReadPayload,
    buildUniverseReadPayload,
  };
}
