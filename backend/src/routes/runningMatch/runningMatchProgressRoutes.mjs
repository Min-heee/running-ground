import { parseLenientMatchSlotInput } from '../../lib/matchSlotValidation.mjs';

export async function routeRunningMatchProgressRoutes(deps) {
  const { method, pathname } = deps;

  if (pathname === '/api/running/matches/status' && method === 'POST') {
    await handleFetchRunningMatchStatus(deps);
    return true;
  }

  if (pathname === '/api/running/matches/progress' && method === 'POST') {
    await handleUpdateRunningMatchProgress(deps);
    return true;
  }

  const resultMatch = pathname.match(/^\/api\/running\/matches\/([^/]+)\/result$/);

  if (resultMatch && method === 'GET') {
    await handleFetchRunningMatchResult(deps, resultMatch[1]);
    return true;
  }

  return false;
}

async function handleFetchRunningMatchResult({
  ApiError,
  buildMatchResultByMatchId,
  loadStore,
  request,
  requireUser,
  response,
  sendJson,
}, rawMatchId) {
  let matchId;

  try {
    matchId = decodeURIComponent(rawMatchId).trim();
  } catch {
    // A malformed id can never name a real match → same 404 a participant check would give,
    // so the endpoint never leaks whether an id format is "valid but missing".
    throw new ApiError(404, '대결 결과를 찾을 수 없어.');
  }

  if (!matchId || matchId.length > 128) {
    throw new ApiError(404, '대결 결과를 찾을 수 없어.');
  }

  const store = await loadStore();
  const currentUser = requireUser(store, request);
  const payload = buildMatchResultByMatchId(store, currentUser, matchId);

  sendJson(response, 200, payload);
}

async function handleFetchRunningMatchStatus({
  buildRunningMatchStatusResponse,
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
  const matchId = typeof body.matchId === 'string' && body.matchId.trim() ? body.matchId.trim() : undefined;
  const slotStartAt = testMode
    ? (typeof body.slotStartAt === 'string' && body.slotStartAt.trim() ? body.slotStartAt.trim() : new Date().toISOString())
    : matchId
      ? parseLenientMatchSlotInput(body.slotStartAt)
      : validateMatchSlotInput(body.slotStartAt);
  const payload = await mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return buildRunningMatchStatusResponse(store, currentUser, {
      mode,
      distanceKm,
      slotStartAt,
      testMode,
      matchId,
    });
  });

  sendJson(response, 200, payload);
}

async function handleUpdateRunningMatchProgress({
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  updateRunningMatchProgress,
  validateDistanceKm,
  validateRunningMatchProgressDistanceKm = validateDistanceKm,
  validateNonNegativeInteger,
  validatePace,
  validateRequiredString,
}) {
  const body = await parseJsonBody(request);
  const matchId = validateRequiredString(body.matchId, '진행 상태를 반영할 매치 아이디가 필요해.');
  const distanceKm = validateRunningMatchProgressDistanceKm(body.distanceKm, '러닝 거리를 입력해줘.');
  const elapsedSeconds = validateNonNegativeInteger(body.elapsedSeconds, '러닝 시간은 0초 이상이어야 해.');
  const currentPace = String(body.currentPace ?? '').trim() === '--:--/km'
    ? '--:--/km'
    : validatePace(body.currentPace, '현재 페이스가 올바르지 않아.');
  const status = ['running', 'background', 'paused', 'finished'].includes(body.status)
    ? body.status
    : 'running';
  const payload = await mutateStore((store) => {
    const currentUser = requireUser(store, request);
    return updateRunningMatchProgress(store, currentUser, {
      matchId,
      distanceKm,
      elapsedSeconds,
      currentPace,
      status,
    });
  });

  sendJson(response, 200, payload);
}
