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
  validateRoutePreviewCoordinates,
  buildRoadAlignedRoutePreview,
  buildMyActivityReadPayload,
  buildHomeSummaryReadPayload,
  buildCurrentRunReadPayload,
  handleCreateManualRun,
  handleCreateTrackedRun,
}) {
  if (pathname === '/api/me/activity' && method === 'GET') {
    sendJson(response, 200, await buildMyActivityReadPayload(request));
    return true;
  }

  if (pathname === '/api/running/route-preview' && method === 'POST') {
    const store = loadStore();
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
    await handleCreateManualRun(request, response);
    return true;
  }

  if (pathname === '/api/runs/tracked' && method === 'POST') {
    await handleCreateTrackedRun(request, response);
    return true;
  }

  const ownRunMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);

  if (ownRunMatch && method === 'GET') {
    sendJson(response, 200, await buildCurrentRunReadPayload(request, ownRunMatch[1]));
    return true;
  }

  return false;
}
