export async function routeRunningMatchRequestRoutes(deps) {
  const { method, pathname } = deps;

  if (pathname === '/api/running/matches/duel' && method === 'POST') {
    await handleRequestDuelMatch(deps);
    return true;
  }

  if (pathname === '/api/running/matches/group' && method === 'POST') {
    await handleRequestGroupMatch(deps);
    return true;
  }

  if (pathname === '/api/running/matches/summary' && method === 'POST') {
    await handleFetchMatchDemandSummary(deps);
    return true;
  }

  if (pathname === '/api/running/matches/upcoming' && method === 'GET') {
    deps.sendJson(deps.response, 200, await deps.buildUpcomingRunningMatchesReadPayload(deps.request));
    return true;
  }

  if (pathname === '/api/running/matches/accept' && method === 'POST') {
    await handleAcceptRunningMatch(deps);
    return true;
  }

  if (pathname === '/api/running/matches/cancel' && method === 'POST') {
    await handleCancelRunningMatch(deps);
    return true;
  }

  if (pathname === '/api/running/matches/leave' && method === 'POST') {
    await handleLeaveRunningMatch(deps);
    return true;
  }

  return false;
}

async function handleRequestDuelMatch({
  buildDuelMatchResponse,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchSlotInput,
}) {
  const body = await parseJsonBody(request);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const testMode = body.testMode === true;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildDuelMatchResponse(store, currentUser, {
      distanceKm,
      slotStartAt,
      testMode,
    });
  });

  sendJson(response, 200, payload);
}

async function handleRequestGroupMatch({
  buildGroupMatchResponse,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchSlotInput,
}) {
  const body = await parseJsonBody(request);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const testMode = body.testMode === true;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildGroupMatchResponse(store, currentUser, {
      distanceKm,
      slotStartAt,
      testMode,
    });
  });

  sendJson(response, 200, payload);
}

async function handleFetchMatchDemandSummary({
  buildMatchDemandSummaryResponse,
  loadStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchMode,
  validateMatchSlotInput,
}) {
  const body = await parseJsonBody(request);
  const store = loadStore();
  const currentUser = requireUser(store, request);
  const payload = buildMatchDemandSummaryResponse(store, currentUser, {
    mode: validateMatchMode(body.mode),
    distanceKm: validateDuelMatchDistanceKm(body.distanceKm),
    slotStartAt: validateMatchSlotInput(body.slotStartAt),
  });

  sendJson(response, 200, payload);
}

async function handleAcceptRunningMatch({
  acceptRunningMatch,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const matchId = validateRequiredString(body.matchId, '수락할 매치 아이디가 필요해.');
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return acceptRunningMatch(store, currentUser, matchId);
  });

  sendJson(response, 200, payload);
}

async function handleCancelRunningMatch({
  cancelRunningMatch,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateDuelMatchDistanceKm,
  validateMatchMode,
  validateMatchSlotInput,
}) {
  const body = await parseJsonBody(request);
  const mode = validateMatchMode(body.mode);
  const distanceKm = validateDuelMatchDistanceKm(body.distanceKm);
  const testMode = body.testMode === true;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const matchId = typeof body.matchId === 'string' && body.matchId.trim() ? body.matchId.trim() : '';
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return cancelRunningMatch(store, currentUser, {
      mode,
      distanceKm,
      slotStartAt,
      testMode,
      ...(matchId ? { matchId } : {}),
    });
  });

  sendJson(response, 200, payload);
}

async function handleLeaveRunningMatch({
  leaveRunningMatch,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const matchId = validateRequiredString(body.matchId, '이탈할 매치 아이디가 필요해.');
  const payload = mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return leaveRunningMatch(store, currentUser, { matchId });
  });

  sendJson(response, 200, payload);
}
