import { findMatchSessionById } from '../lib/runningMatchSession/matchSessionLifecycle.mjs';

export async function routeRunRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  parseJsonBody,
  loadStore,
  mutateStore,
  requireUser,
  findChaseArena,
  settleChaseRunUpload,
  getStoredRunRoute,
  validateRequiredString,
  validateDistanceKm,
  validateDateOnly,
  validateNonNegativeInteger,
  validatePace,
  validatePositiveInteger,
  validateRoutePreviewCoordinates,
  validateRunMatchResult,
  validateTrackedRoute,
  buildRoadAlignedRoutePreview,
  buildMyActivityReadPayload,
  buildHomeSummaryReadPayload,
  buildCurrentRunReadPayload,
  getAccessToken,
  getRunsRepository,
  ApiError,
}) {
  if (pathname === '/api/me/activity' && method === 'GET') {
    sendJson(response, 200, await buildMyActivityReadPayload(request));
    return true;
  }

  if (pathname === '/api/running/route-preview' && method === 'POST') {
    const store = await loadStore();
    requireUser(store, request);
    const body = await parseJsonBody(request);
    const keyword = validateRequiredString(body.keyword, '원하는 모양을 입력해주세요.');
    const displayTitle = validateRequiredString(body.displayTitle, '추천 경로 제목이 비어 있어요.');
    const description = validateRequiredString(body.description, '추천 경로 설명이 비어 있어요.');
    const startLabel = validateRequiredString(body.startLabel, '출발지 정보가 비어 있어요.');
    const desiredDistanceKm = validateDistanceKm(body.desiredDistanceKm, '희망 거리를 입력해주세요.');
    const roughCoordinates = validateRoutePreviewCoordinates(body.roughCoordinates);

    sendJson(response, 200, await buildRoadAlignedRoutePreview({
      keyword,
      desiredDistanceKm,
      displayTitle,
      description,
      startLabel,
      roughCoordinates,
    }));
    return true;
  }

  if (pathname === '/api/home/summary' && method === 'GET') {
    sendJson(response, 200, await buildHomeSummaryReadPayload(request));
    return true;
  }

  if (pathname === '/api/runs/latest' && method === 'GET') {
    sendJson(response, 200, await buildCurrentRunReadPayload(request));
    return true;
  }

  if (pathname === '/api/runs/manual' && method === 'POST') {
    await handleCreateManualRun({
      getAccessToken,
      getRunsRepository,
      parseJsonBody,
      request,
      response,
      sendJson,
      validateDateOnly,
      validateDistanceKm,
      validatePace,
    });
    return true;
  }

  if (pathname === '/api/runs/tracked' && method === 'POST') {
    await handleCreateTrackedRun({
      ApiError,
      findChaseArena,
      getAccessToken,
      getRunsRepository,
      getStoredRunRoute,
      loadStore,
      mutateStore,
      parseJsonBody,
      request,
      response,
      sendJson,
      settleChaseRunUpload,
      validateDateOnly,
      validateDistanceKm,
      validateNonNegativeInteger,
      validatePace,
      validatePositiveInteger,
      validateRequiredString,
      validateRunMatchResult,
      validateTrackedRoute,
    });
    return true;
  }

  const ownRunMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);

  if (ownRunMatch && method === 'GET') {
    sendJson(response, 200, await buildCurrentRunReadPayload(request, ownRunMatch[1]));
    return true;
  }

  return false;
}

async function handleCreateManualRun({
  getAccessToken,
  getRunsRepository,
  parseJsonBody,
  request,
  response,
  sendJson,
  validateDateOnly,
  validateDistanceKm,
  validatePace,
}) {
  const body = await parseJsonBody(request);
  const payload = await getRunsRepository().createManualRun({
    token: getAccessToken(request),
    input: {
      date: validateDateOnly(body.date, '러닝 날짜를 입력해주세요.'),
      distanceKm: validateDistanceKm(body.distanceKm, '러닝 거리를 입력해주세요.'),
      pace: validatePace(body.pace, '페이스를 입력해주세요.'),
    },
  });

  sendJson(response, 201, payload);
}

async function handleCreateTrackedRun({
  ApiError,
  findChaseArena,
  getAccessToken,
  getRunsRepository,
  getStoredRunRoute,
  loadStore,
  mutateStore,
  parseJsonBody,
  request,
  response,
  sendJson,
  settleChaseRunUpload,
  validateDateOnly,
  validateDistanceKm,
  validateNonNegativeInteger,
  validatePace,
  validatePositiveInteger,
  validateRequiredString,
  validateRunMatchResult,
  validateTrackedRoute,
}) {
  const body = await parseJsonBody(request);
  const startedAt = validateRequiredString(body.startedAt, '러닝 시작 시각이 비어 있어요.');
  const endedAt = validateRequiredString(body.endedAt, '러닝 종료 시각이 비어 있어요.');
  const startedAtMs = new Date(startedAt).getTime();
  const endedAtMs = new Date(endedAt).getTime();

  if (Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs)) {
    throw new ApiError(400, '러닝 시작/종료 시각 형식이 올바르지 않아요.');
  }

  if (startedAtMs > endedAtMs) {
    throw new ApiError(400, '러닝 종료 시각은 시작 시각보다 빠를 수 없어요.');
  }

  // 경찰과 도둑런: 경기장 태그는 카탈로그에 실존할 때만 승인. 러닝 저장 자체는 chase와
  // 무관하게 성립해야 하므로 검증 실패만 400, 이후 정산 실패는 저장을 깨지 않는다.
  const chaseArenaId = typeof body.chaseArenaId === 'string' && body.chaseArenaId.trim()
    ? body.chaseArenaId.trim()
    : null;

  if (chaseArenaId && !findChaseArena(chaseArenaId)) {
    throw new ApiError(400, '알 수 없는 경기장이에요. 앱을 최신 버전으로 업데이트해주세요.');
  }

  let matchResult = typeof body.matchResult !== 'undefined' && body.matchResult !== null
    ? validateRunMatchResult(body.matchResult)
    : undefined;

  // 파티런 조기 종료 포인트 파밍 차단 (오너 2026-08-06): 저장 직전, 아직 살아있는
  // 세션에서 목표 거리를 찾아 블롭에 스탬프한다 — 포인트 집계(getMatchBonusPoints)가
  // "목표를 다 채웠는가"를 판정할 근거. 세션이 이미 정리됐으면 스탬프 없이 저장되고
  // 그 기록은 기존 정책대로 지급된다(합법 사용자 불이익 방지 fail-open).
  if (matchResult?.source === 'party' && matchResult.matchId) {
    try {
      const store = await loadStore();
      const session = findMatchSessionById(store, matchResult.matchId);
      if (Number.isFinite(session?.distanceKm) && session.distanceKm > 0) {
        matchResult = { ...matchResult, matchGoalDistanceKm: session.distanceKm };
      }
    } catch {
      // 스탬프 실패는 저장을 막지 않는다.
    }
  }

  const payload = await getRunsRepository().createTrackedRun({
    token: getAccessToken(request),
    input: {
      ...(chaseArenaId ? { chaseArenaId } : {}),
      date: validateDateOnly(body.date, '러닝 날짜를 입력해주세요.'),
      distanceKm: validateDistanceKm(body.distanceKm, '러닝 거리를 입력해주세요.'),
      pace: validatePace(body.pace, '페이스를 입력해주세요.'),
      durationSeconds: validatePositiveInteger(body.durationSeconds, '러닝 시간은 1초 이상이어야 해요.'),
      ...(typeof body.cadenceSpm !== 'undefined' && body.cadenceSpm !== null
        ? { cadenceSpm: validateNonNegativeInteger(body.cadenceSpm, '케이던스 값이 올바르지 않아요.') }
        : {}),
      ...(typeof body.elevationGainM !== 'undefined' && body.elevationGainM !== null
        ? { elevationGainM: validateNonNegativeInteger(body.elevationGainM, '고도 상승 값이 올바르지 않아요.') }
        : {}),
      route: validateTrackedRoute(body.route),
      startedAt,
      endedAt,
      ...(matchResult ? { matchResult } : {}),
    },
  });

  // chase 러닝이면 업로드 직후 소급 정산 — 실패해도 러닝 저장(201)은 그대로.
  let chaseSettlement = null;

  if (chaseArenaId && payload?.run?.id) {
    try {
      chaseSettlement = await settleChaseRunUpload({
        runId: payload.run.id,
        deps: { loadStore, mutateStore, getStoredRunRoute },
      });
    } catch (error) {
      console.warn('[chase] 정산 실패 (러닝 저장은 정상):', error?.message ?? error);
    }
  }

  sendJson(response, 201, chaseSettlement ? { ...payload, chaseSettlement } : payload);
}
