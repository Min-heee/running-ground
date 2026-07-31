import { partitionImportRunsByLaunchCutoff } from '../lib/integrationImportCutoff.mjs';

export async function routeSocialRequest({
  method,
  pathname,
  url,
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
  getPostgresFriendsRepository,
  getAccessToken,
  ApiError,
}) {
  if (pathname === '/api/friends/leaderboard' && method === 'GET') {
    sendJson(response, 200, await buildFriendLeaderboardReadPayload(request));
    return true;
  }

  // 달리는 친구에게 응원 보내기 — 러너의 라이브 엔트리에 쌓이고 하트비트가 가져간다.
  if (pathname === '/api/friends/cheer' && method === 'POST') {
    const body = await parseJsonBody(request);
    const repository = getPostgresFriendsRepository() ?? getFriendsRepository();
    const payload = await repository.sendCheer({
      token: getAccessToken(request),
      friendId: validateRequiredString(body.friendId, '응원할 친구를 선택해주세요.'),
      message: validateRequiredString(body.message, '응원 메시지를 입력해주세요.'),
    });
    sendJson(response, 201, payload);
    return true;
  }

  // 친구 라이브 러닝 조회 — 실시간 지도 화면이 폴링한다.
  if (pathname === '/api/friends/live-run' && method === 'GET') {
    const friendId = url.searchParams.get('friendId') ?? '';
    const repository = getPostgresFriendsRepository() ?? getFriendsRepository();
    const payload = await repository.getFriendLiveRun({
      token: getAccessToken(request),
      friendId: validateRequiredString(friendId, '친구를 선택해주세요.'),
    });
    sendJson(response, 200, payload);
    return true;
  }

  // 랭킹 보드 등에서 유저ID로 직접 친구 신청 (태그 노출이 없는 지점용).
  if (pathname === '/api/friends/requests/by-user' && method === 'POST') {
    const body = await parseJsonBody(request);
    const payload = await getFriendsRepository().createRequestByUserId({
      token: getAccessToken(request),
      userId: validateRequiredString(body.userId, '사용자를 선택해주세요.'),
    });
    sendJson(response, 201, payload);
    return true;
  }

  // 사람 탭 분기용 관계 조회: self/friend/outgoing/incoming/none.
  const friendRelationMatch = pathname.match(/^\/api\/friends\/relation\/([^/]+)$/);

  if (friendRelationMatch && method === 'GET') {
    const payload = await getFriendsRepository().getUserRelation({
      token: getAccessToken(request),
      userId: friendRelationMatch[1],
    });
    sendJson(response, 200, payload);
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
    tag: normalizeTag(validateRequiredString(body.tag, '친구 태그를 입력해주세요.')),
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
    throw new ApiError(400, '가져올 연동 기록 배열이 비어 있어요.');
  }

  if (rawRuns.length > 500) {
    throw new ApiError(400, '한 번에 가져오는 기록은 500개 이하로 제한해주세요.');
  }

  // Launch-date cutoff (authoritative, lib/integrationImportCutoff.mjs): drop
  // pre-launch-dated entries right where each entry's date is normalized/validated,
  // BEFORE anything reaches the import queue — old app versions that skip the
  // client-side mirror still cannot push historical records past this point.
  // When every entry is pre-launch we still queue the empty set (auth + source
  // checks run as usual) and answer with queuedRuns: 0 + the skip count.
  const { importableRuns, skippedPreLaunch } = partitionImportRunsByLaunchCutoff(
    rawRuns.map((run) => normalizeImportedRun(sourceType, run)),
  );

  const payload = await getRunsRepository().queueIntegrationImports({
    token: getAccessToken(request),
    sourceType,
    normalizedRuns: importableRuns,
  });

  // Additive optional field — existing consumers only read success/source/
  // queuedRuns/pendingRuns, so tacking the skip count on is backward compatible.
  sendJson(response, 202, { ...payload, skippedPreLaunch });
}
