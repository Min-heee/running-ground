import {
  buildProfile,
  findUserById,
  getRunsForUser,
} from '../lib/userStoreHelpers.mjs';

function buildMatchRecord(runs) {
  const matchRuns = runs.filter((run) => run?.matchResult);
  const duel = matchRuns.filter((run) => run.matchResult?.mode === 'duel').length;
  const group = matchRuns.filter((run) => run.matchResult?.mode === 'group').length;

  return {
    total: matchRuns.length,
    duel,
    group,
  };
}

export async function routeUserRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  loadStore,
  requireUser,
  ApiError,
}) {
  const matchProfileMatch = pathname.match(/^\/api\/users\/([^/]+)\/match-profile$/);

  if (matchProfileMatch && method === 'GET') {
    let userId;

    try {
      userId = decodeURIComponent(matchProfileMatch[1]).trim();
    } catch {
      throw new ApiError(400, '사용자 정보가 올바르지 않아.');
    }

    if (!userId || userId.length > 128) {
      throw new ApiError(400, '사용자 정보가 올바르지 않아.');
    }

    const store = loadStore();
    requireUser(store, request);
    const user = findUserById(store, userId);
    const profile = buildProfile(store, user);
    const runs = getRunsForUser(store, userId);

    sendJson(response, 200, {
      id: user.id,
      name: profile.name,
      publicTag: profile.publicTag,
      districtName: profile.districtName,
      ...(profile.provinceName ? { provinceName: profile.provinceName } : {}),
      ...(profile.cityName ? { cityName: profile.cityName } : {}),
      rankState: profile.rankState,
      lifetimeDistanceKm: profile.lifetimeDistanceKm,
      matchRecord: buildMatchRecord(runs),
    });
    return true;
  }

  return false;
}
