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
  buildUniversityLeagueReadPayload,
}) {
  if (pathname === '/api/league/district-personal' && method === 'GET') {
    sendJson(response, 200, await buildDistrictPersonalReadPayload(request));
    return true;
  }

  if (pathname === '/api/league/regions' && method === 'GET') {
    sendJson(response, 200, await buildRegionLeagueReadPayload(request, url.searchParams.get('nodeId') ?? undefined));
    return true;
  }

  if (pathname === '/api/league/universities' && method === 'GET') {
    sendJson(response, 200, await buildUniversityLeagueReadPayload(request));
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
