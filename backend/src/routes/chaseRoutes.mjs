// 경찰과 도둑런 경기장 API — 카탈로그+점유 조회, 러닝 시작 직전 입장(슬롯 확보), 퇴장.
// 스침 판정/포인트 정산은 러닝 업로드 경로(runRoutes → chaseSettlement)에서 일어난다.

export async function routeChaseRequest({
  method,
  pathname,
  request,
  response,
  url,
  sendJson,
  parseJsonBody,
  loadStore,
  mutateStore,
  requireUser,
  validateRequiredString,
  buildChaseArenaListPayload,
  buildChaseLivePayload,
  joinChaseArenaPresence,
  leaveChaseArenaPresence,
  updateChasePresencePosition,
}) {
  if (pathname === '/api/chase/arenas' && method === 'GET') {
    const store = await loadStore();
    requireUser(store, request);
    sendJson(response, 200, buildChaseArenaListPayload(store));
    return true;
  }

  if (pathname === '/api/chase/join' && method === 'POST') {
    const body = await parseJsonBody(request);
    const arenaId = validateRequiredString(body.arenaId, '경기장을 선택해주세요.');
    const payload = await mutateStore((store) => {
      const user = requireUser(store, request);
      return joinChaseArenaPresence(store, user, arenaId);
    });
    sendJson(response, 200, payload);
    return true;
  }

  // 러닝 중 위치 하트비트 (10초 주기) — 라이브 지도 데이터의 공급면.
  if (pathname === '/api/chase/position' && method === 'POST') {
    const body = await parseJsonBody(request);
    const arenaId = validateRequiredString(body.arenaId, '경기장을 선택해주세요.');
    const payload = await mutateStore((store) => {
      const user = requireUser(store, request);
      return updateChasePresencePosition(store, user, {
        arenaId,
        latitude: body.latitude,
        longitude: body.longitude,
        headingDeg: body.headingDeg,
        paceLabel: body.paceLabel,
      });
    });
    sendJson(response, 200, payload);
    return true;
  }

  // 라이브 지도 — 그 경기장에 입장한 러너만 (읽기 전용).
  if (pathname === '/api/chase/live' && method === 'GET') {
    const arenaId = validateRequiredString(url.searchParams.get('arenaId'), '경기장을 선택해주세요.');
    const store = await loadStore();
    const user = requireUser(store, request);
    sendJson(response, 200, buildChaseLivePayload(store, user, arenaId));
    return true;
  }

  if (pathname === '/api/chase/leave' && method === 'POST') {
    const payload = await mutateStore((store) => {
      const user = requireUser(store, request);
      return leaveChaseArenaPresence(store, user);
    });
    sendJson(response, 200, payload);
    return true;
  }

  return false;
}
