import { ALLOW_TEST_MATCHES } from '../../config.mjs';

// Client-supplied testMode is only honored where the env allows it (default: any
// non-production APP_ENV). When disallowed it is silently coerced to false — never a
// 400 — so an old client that still sends the flag just runs the real match flow.
function resolveTestModeIntake(body) {
  return ALLOW_TEST_MATCHES && body.testMode === true;
}

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
  const testMode = resolveTestModeIntake(body);
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const payload = await mutateStore((store) => {
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
  const testMode = resolveTestModeIntake(body);
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const payload = await mutateStore((store) => {
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
  const store = await loadStore();
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
  const matchId = validateRequiredString(body.matchId, '수락할 매치 아이디가 필요해요.');
  const payload = await mutateStore((store) => {
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
  const testMode = resolveTestModeIntake(body);
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : validateMatchSlotInput(body.slotStartAt);
  const matchId = typeof body.matchId === 'string' && body.matchId.trim() ? body.matchId.trim() : '';
  const payload = await mutateStore((store) => {
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
  ApiError,
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
  const matchId = validateRequiredString(body.matchId, '이탈할 매치 아이디가 필요해요.');
  // 선택 필드 `reason` (오너 2026-09-09): 'disqualified'만 안다 — 케이던스 워치독 실격패.
  // 모르는 값은 조용히 기권으로 바꾸지 않고 400 — 계약 오타가 실격을 기권으로 둔갑시키면 안 된다.
  const reason = typeof body.reason === 'undefined' || body.reason === null ? undefined : body.reason;

  if (typeof reason !== 'undefined' && reason !== 'disqualified') {
    throw new ApiError(400, '매치 이탈 사유가 올바르지 않아요.');
  }

  const payload = await mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return leaveRunningMatch(store, currentUser, { matchId, ...(reason ? { reason } : {}) });
  });

  sendJson(response, 200, payload);
}
