export async function routeRunRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  parseJsonBody,
  loadStore,
  requireUser,
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
    const keyword = validateRequiredString(body.keyword, '원하는 모양을 입력해줘.');
    const displayTitle = validateRequiredString(body.displayTitle, '추천 경로 제목이 비어 있어.');
    const description = validateRequiredString(body.description, '추천 경로 설명이 비어 있어.');
    const startLabel = validateRequiredString(body.startLabel, '출발지 정보가 비어 있어.');
    const desiredDistanceKm = validateDistanceKm(body.desiredDistanceKm, '희망 거리를 입력해줘.');
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
      getAccessToken,
      getRunsRepository,
      parseJsonBody,
      request,
      response,
      sendJson,
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
      date: validateDateOnly(body.date, '러닝 날짜를 입력해줘.'),
      distanceKm: validateDistanceKm(body.distanceKm, '러닝 거리를 입력해줘.'),
      pace: validatePace(body.pace, '페이스를 입력해줘.'),
    },
  });

  sendJson(response, 201, payload);
}

async function handleCreateTrackedRun({
  ApiError,
  getAccessToken,
  getRunsRepository,
  parseJsonBody,
  request,
  response,
  sendJson,
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
  const startedAt = validateRequiredString(body.startedAt, '러닝 시작 시각이 비어 있어.');
  const endedAt = validateRequiredString(body.endedAt, '러닝 종료 시각이 비어 있어.');
  const startedAtMs = new Date(startedAt).getTime();
  const endedAtMs = new Date(endedAt).getTime();

  if (Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs)) {
    throw new ApiError(400, '러닝 시작/종료 시각 형식이 올바르지 않아.');
  }

  if (startedAtMs > endedAtMs) {
    throw new ApiError(400, '러닝 종료 시각은 시작 시각보다 빠를 수 없어.');
  }

  const payload = await getRunsRepository().createTrackedRun({
    token: getAccessToken(request),
    input: {
      date: validateDateOnly(body.date, '러닝 날짜를 입력해줘.'),
      distanceKm: validateDistanceKm(body.distanceKm, '러닝 거리를 입력해줘.'),
      pace: validatePace(body.pace, '페이스를 입력해줘.'),
      durationSeconds: validatePositiveInteger(body.durationSeconds, '러닝 시간은 1초 이상이어야 해.'),
      ...(typeof body.cadenceSpm !== 'undefined' && body.cadenceSpm !== null
        ? { cadenceSpm: validateNonNegativeInteger(body.cadenceSpm, '케이던스 값이 올바르지 않아.') }
        : {}),
      ...(typeof body.elevationGainM !== 'undefined' && body.elevationGainM !== null
        ? { elevationGainM: validateNonNegativeInteger(body.elevationGainM, '고도 상승 값이 올바르지 않아.') }
        : {}),
      route: validateTrackedRoute(body.route),
      startedAt,
      endedAt,
      ...(typeof body.matchResult !== 'undefined' && body.matchResult !== null
        ? { matchResult: validateRunMatchResult(body.matchResult) }
        : {}),
    },
  });

  sendJson(response, 201, payload);
}
