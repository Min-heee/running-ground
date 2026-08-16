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

  // 공개 경로 — request를 받지 않는다. 토큰을 읽을 일이 없다는 걸 서명으로 못 박아 둔다.
  async function buildPublicUniverseReadPayload(nodeId) {
    const { payload } = await getFriendsLeagueBridge().getPublicUniverse({ nodeId });
    return payload;
  }

  async function buildPublicUniverseSearchReadPayload(query) {
    const { payload } = await getFriendsLeagueBridge().searchPublicUniverse({ query });
    return payload;
  }

  async function buildUniverseSearchReadPayload(request, query) {
    const { payload } = await getFriendsLeagueBridge().searchUniverse({
      token: getAccessToken(request),
      query,
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
    buildPublicUniverseReadPayload,
    buildPublicUniverseSearchReadPayload,
    buildUniverseReadPayload,
    buildUniverseSearchReadPayload,
  };
}
