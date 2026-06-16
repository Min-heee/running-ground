export async function routeSocialRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  parseJsonBody,
  mutateStore,
  buildFriendLeaderboardReadPayload,
  buildFriendActivityReadPayload,
  buildFriendRunReadPayload,
  buildIntegrationSourcesReadPayload,
  buildIntegrationSourceActionResult,
  ensureIntegrationImports,
  isExclusiveIntegrationSourceType,
  normalizeImportedRun,
  normalizeTag,
  requireConnectedSource,
  requireUser,
  validateRequiredString,
  getRunsRepository,
  getFriendsRepository,
  getAccessToken,
  ApiError,
}) {
  if (pathname === '/api/friends/leaderboard' && method === 'GET') {
    sendJson(response, 200, await buildFriendLeaderboardReadPayload(request));
    return true;
  }

  if (pathname === '/api/friends/requests' && method === 'POST') {
    const body = await parseJsonBody(request);
    await handleFriendRequestCreate({
      body,
      getAccessToken,
      getFriendsRepository,
      normalizeTag,
      request,
      response,
      sendJson,
      validateRequiredString,
    });
    return true;
  }

  const friendRequestActionMatch = pathname.match(/^\/api\/friends\/requests\/([^/]+)\/(accept|reject|cancel)$/);

  if (friendRequestActionMatch && method === 'POST') {
    await handleFriendRequestAction({
      action: friendRequestActionMatch[2],
      getAccessToken,
      getFriendsRepository,
      request,
      requestId: friendRequestActionMatch[1],
      response,
      sendJson,
    });
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
    await handleIntegrationSourceConnection({
      buildIntegrationSourceActionResult,
      ensureIntegrationImports,
      isExclusiveIntegrationSourceType,
      mutateStore,
      nextConnected: integrationSourceActionMatch[2] === 'connect',
      request,
      response,
      requireConnectedSource,
      requireUser,
      sendJson,
      sourceType: integrationSourceActionMatch[1],
    });
    return true;
  }

  const integrationSourceImportMatch = pathname.match(/^\/api\/integrations\/sources\/([^/]+)\/import$/);

  if (integrationSourceImportMatch && method === 'POST') {
    await handleQueueIntegrationImports({
      ApiError,
      getAccessToken,
      getRunsRepository,
      normalizeImportedRun,
      parseJsonBody,
      request,
      response,
      sendJson,
      sourceType: integrationSourceImportMatch[1],
    });
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

async function handleFriendRequestCreate({
  body,
  getAccessToken,
  getFriendsRepository,
  normalizeTag,
  request,
  response,
  sendJson,
  validateRequiredString,
}) {
  const payload = await getFriendsRepository().createRequest({
    token: getAccessToken(request),
    tag: normalizeTag(validateRequiredString(body.tag, '친구 태그를 입력해줘.')),
  });

  sendJson(response, 201, payload);
}

async function handleFriendRequestAction({
  action,
  getAccessToken,
  getFriendsRepository,
  request,
  requestId,
  response,
  sendJson,
}) {
  const payload = await getFriendsRepository().respondToRequest({
    token: getAccessToken(request),
    requestId,
    action,
  });

  sendJson(response, 200, payload);
}

async function handleIntegrationSourceConnection({
  buildIntegrationSourceActionResult,
  ensureIntegrationImports,
  isExclusiveIntegrationSourceType,
  mutateStore,
  nextConnected,
  request,
  response,
  requireConnectedSource,
  requireUser,
  sendJson,
  sourceType,
}) {
  const payload = await mutateStore((store) => {
    const user = requireUser(store, request);
    requireConnectedSource(user, sourceType);
    const sourceTypesToClear = new Set();

    if (nextConnected) {
      user.connectedSources = user.connectedSources.map((entry) => {
        if (entry.sourceType === sourceType) {
          return {
            ...entry,
            connected: true,
            connectionStatus: 'connected',
          };
        }

        if (isExclusiveIntegrationSourceType(sourceType) && isExclusiveIntegrationSourceType(entry.sourceType) && entry.connected) {
          sourceTypesToClear.add(entry.sourceType);
          return {
            ...entry,
            connected: false,
            connectionStatus: 'planned',
            lastSyncedAt: undefined,
          };
        }

        return entry;
      });
    } else {
      sourceTypesToClear.add(sourceType);
      user.connectedSources = user.connectedSources.map((entry) => (
        entry.sourceType === sourceType
          ? {
            ...entry,
            connected: false,
            connectionStatus: 'planned',
            lastSyncedAt: undefined,
          }
          : entry
      ));
    }

    if (sourceTypesToClear.size > 0) {
      store.integrationImports = ensureIntegrationImports(store).filter((entry) => (
        entry.userId !== user.id || !sourceTypesToClear.has(entry.sourceType)
      ));
    }

    const updatedSource = requireConnectedSource(user, sourceType);

    return buildIntegrationSourceActionResult(store, user, updatedSource);
  });

  sendJson(response, 200, payload);
}

async function handleQueueIntegrationImports({
  ApiError,
  getAccessToken,
  getRunsRepository,
  normalizeImportedRun,
  parseJsonBody,
  request,
  response,
  sendJson,
  sourceType,
}) {
  const body = await parseJsonBody(request);
  const rawRuns = Array.isArray(body.runs) ? body.runs : null;

  if (!rawRuns || rawRuns.length === 0) {
    throw new ApiError(400, '가져올 연동 기록 배열이 비어 있어.');
  }

  if (rawRuns.length > 500) {
    throw new ApiError(400, '한 번에 가져오는 기록은 500개 이하로 제한해줘.');
  }

  const payload = await getRunsRepository().queueIntegrationImports({
    token: getAccessToken(request),
    sourceType,
    normalizedRuns: rawRuns.map((run) => normalizeImportedRun(sourceType, run)),
  });

  sendJson(response, 202, payload);
}
