export async function routeLeagueRequest({
  method,
  pathname,
  request,
  response,
  url,
  sendJson,
  buildDistrictPersonalReadPayload,
  buildRankLeaderboardReadPayload,
  buildRegionLeagueReadPayload,
  buildTodayRankingReadPayload,
  buildUniverseReadPayload,
  buildUniverseSearchReadPayload,
}) {
  if (pathname === '/api/league/district-personal' && method === 'GET') {
    sendJson(
      response,
      200,
      await buildDistrictPersonalReadPayload(request, url.searchParams.get('nodeId') ?? undefined),
    );
    return true;
  }

  if (pathname === '/api/league/regions' && method === 'GET') {
    sendJson(response, 200, await buildRegionLeagueReadPayload(request, url.searchParams.get('nodeId') ?? undefined));
    return true;
  }

  // 더 구체적인 경로가 먼저 — '/api/universe'가 먼저 걸리면 검색이 영영 안 잡힌다.
  if (pathname === '/api/universe/search' && method === 'GET') {
    sendJson(response, 200, await buildUniverseSearchReadPayload(request, url.searchParams.get('q') ?? ''));
    return true;
  }

  if (pathname === '/api/universe' && method === 'GET') {
    sendJson(response, 200, await buildUniverseReadPayload(request, url.searchParams.get('nodeId') ?? undefined));
    return true;
  }

  if ((pathname === '/api/league/rank' || pathname === '/api/leagues/rank') && method === 'GET') {
    sendJson(response, 200, await buildRankLeaderboardReadPayload(request));
    return true;
  }

  if (pathname === '/api/running/today-rankings' && method === 'GET') {
    sendJson(
      response,
      200,
      await buildTodayRankingReadPayload(request, url.searchParams.get('category') ?? 'pace'),
    );
    return true;
  }

  return false;
}
