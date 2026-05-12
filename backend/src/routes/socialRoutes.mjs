export async function routeSocialRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  parseJsonBody,
  buildFriendLeaderboardReadPayload,
  buildFriendActivityReadPayload,
  buildFriendRunReadPayload,
  buildIntegrationSourcesReadPayload,
  handleFriendRequestCreate,
  handleFriendRequestAction,
  handleIntegrationSourceConnection,
  handleQueueIntegrationImports,
  getRunsRepository,
  getAccessToken,
}) {
  if (pathname === '/api/friends/leaderboard' && method === 'GET') {
    sendJson(response, 200, await buildFriendLeaderboardReadPayload(request));
    return true;
  }

  if (pathname === '/api/friends/requests' && method === 'POST') {
    const body = await parseJsonBody(request);
    handleFriendRequestCreate(request, response, body);
    return true;
  }

  const friendRequestActionMatch = pathname.match(/^\/api\/friends\/requests\/([^/]+)\/(accept|reject|cancel)$/);

  if (friendRequestActionMatch && method === 'POST') {
    handleFriendRequestAction(request, response, friendRequestActionMatch[1], friendRequestActionMatch[2]);
    return true;
  }

  const friendActivityMatch = pathname.match(/^\/api\/friends\/([^/]+)\/activity$/);

  if (friendActivityMatch && method === 'GET') {
    sendJson(response, 200, await buildFriendActivityReadPayload(request, friendActivityMatch[1]));
    return true;
  }

  const friendRunMatch = pathname.match(/^\/api\/friends\/([^/]+)\/runs\/([^/]+)$/);

  if (friendRunMatch && method === 'GET') {
    sendJson(response, 200, await buildFriendRunReadPayload(request, friendRunMatch[1], friendRunMatch[2]));
    return true;
  }

  if (pathname === '/api/integrations/sources' && method === 'GET') {
    sendJson(response, 200, await buildIntegrationSourcesReadPayload(request));
    return true;
  }

  const integrationSourceActionMatch = pathname.match(/^\/api\/integrations\/sources\/([^/]+)\/(connect|disconnect)$/);

  if (integrationSourceActionMatch && method === 'POST') {
    handleIntegrationSourceConnection(
      request,
      response,
      integrationSourceActionMatch[1],
      integrationSourceActionMatch[2] === 'connect',
    );
    return true;
  }

  const integrationSourceImportMatch = pathname.match(/^\/api\/integrations\/sources\/([^/]+)\/import$/);

  if (integrationSourceImportMatch && method === 'POST') {
    await handleQueueIntegrationImports(request, response, integrationSourceImportMatch[1]);
    return true;
  }

  if (pathname === '/api/integrations/sync' && method === 'POST') {
    const payload = await getRunsRepository().syncIntegrationImports({
      token: getAccessToken(request),
    });

    sendJson(response, 200, payload);
    return true;
  }

  return false;
}
