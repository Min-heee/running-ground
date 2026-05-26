import { buildRankLeaderboardResponse } from './rankLeaderboardBuilder.mjs';

export function createLeagueReadService({
  getAccessToken,
  getFriendsLeagueBridge,
  loadCurrentUserReadContext,
  loadStore,
}) {
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

  async function buildTodayRankingReadPayload(request, category) {
    const { payload } = await getFriendsLeagueBridge().getTodayRankings({
      category,
      store: loadStore(),
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
    buildUniversityLeagueReadPayload,
  };
}
