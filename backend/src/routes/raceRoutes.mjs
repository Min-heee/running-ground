export async function routeRaceRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  buildOfflineRaceHubReadPayload,
  getAccessToken,
  getRaceRepository,
  parseJsonBody,
}) {
  if (pathname === '/api/offline-races/hub' && method === 'GET') {
    // 8·15런: 마감이 지난 live_group 이벤트가 있으면 여기서 그룹 세션이 편성된다 — 신청자들이
    // 출발 전 레이스 탭을 보고 있으므로 이 GET이 사실상의 편성 트리거다.
    await getRaceRepository().sweepLiveGroupFormation();
    sendJson(response, 200, await buildOfflineRaceHubReadPayload(request));
    return true;
  }

  const offlineRaceActionMatch = pathname.match(/^\/api\/offline-races\/([^/]+)\/(join|cancel)$/);

  if (offlineRaceActionMatch && method === 'POST') {
    await handleOfflineRaceEntryAction({
      action: offlineRaceActionMatch[2],
      eventId: offlineRaceActionMatch[1],
      getAccessToken,
      getRaceRepository,
      parseJsonBody,
      request,
      response,
      sendJson,
    });
    return true;
  }

  return false;
}

async function handleOfflineRaceEntryAction({
  action,
  eventId,
  getAccessToken,
  getRaceRepository,
  parseJsonBody,
  request,
  response,
  sendJson,
}) {
  // join 본문은 선택적이다({password?}) — 구버전 클라는 빈 본문을 보내며, 비밀번호 없는
  // 이벤트에선 그대로 통과한다.
  const body = await parseJsonBody(request).catch(() => ({}));
  const payload = await getRaceRepository().applyEntryAction({
    token: getAccessToken(request),
    eventId,
    action,
    password: typeof body?.password === 'string' ? body.password : undefined,
  });

  sendJson(response, 200, payload);
}
