import { ENABLE_PUBLIC_UNIVERSE } from '../config.mjs';

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
  buildPublicUniverseReadPayload,
  buildPublicUniverseSearchReadPayload,
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

  // 로그인 없이 보는 우주 — 사이트 전용 공개 경로. 토큰을 요구하지 않는 유일한 읽기라서
  // **기본 꺼짐**이다(BACKEND_ENABLE_PUBLIC_UNIVERSE=true일 때만 열림). 앱 탭은 아래의
  // 인증 경로를 쓰므로 이 게이트와 무관하고, 꺼져 있으면 여기 매치가 안 돼 404로 떨어진다 —
  // 회원 이름·거리가 로그인 없이 노출되는 건 사이트 출시 때 오너 확인 후에만 켠다.
  if (ENABLE_PUBLIC_UNIVERSE && pathname === '/api/public/universe/search' && method === 'GET') {
    sendJson(response, 200, await buildPublicUniverseSearchReadPayload(url.searchParams.get('q') ?? ''));
    return true;
  }

  if (ENABLE_PUBLIC_UNIVERSE && pathname === '/api/public/universe' && method === 'GET') {
    sendJson(response, 200, await buildPublicUniverseReadPayload(url.searchParams.get('nodeId') ?? undefined));
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
