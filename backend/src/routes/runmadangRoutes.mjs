// 그라운드 API — 기간제 포인트 내기 (생성/참가/거절/취소/내 목록).
// 정산은 지연 실행: 조회 때 만기 판이 보이면 그때 정산하고(mutateStore), 아무도 앱을
// 안 열어도 staleMatchStateSweeper가 5분 주기로 정산해 알림을 보낸다.

export async function routeRunmadangRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  parseJsonBody,
  loadStore,
  mutateStore,
  requireUser,
  validateRequiredString,
  createRunmadangChallenge,
  joinRunmadangChallenge,
  declineRunmadangChallenge,
  cancelRunmadangChallenge,
  hideRunmadangChallenge,
  withdrawRunmadangChallenge,
  buildRunmadangMinePayload,
  hasDueRunmadangChallenges,
  settleDueRunmadangChallenges,
}) {
  if (pathname === '/api/runmadang/mine' && method === 'GET') {
    let store = await loadStore();
    requireUser(store, request);

    // 만기 미정산 판이 있으면 먼저 정산 — 결과 알림·환불이 이 조회에 실려 나간다.
    if (hasDueRunmadangChallenges(store)) {
      await mutateStore((lockedStore) => {
        settleDueRunmadangChallenges(lockedStore);
      });
      store = await loadStore();
    }

    const user = requireUser(store, request);
    sendJson(response, 200, buildRunmadangMinePayload(store, user));
    return true;
  }

  if (pathname === '/api/runmadang' && method === 'POST') {
    const body = await parseJsonBody(request);
    const payload = await mutateStore((store) => {
      const user = requireUser(store, request);
      createRunmadangChallenge(store, user, body);
      return buildRunmadangMinePayload(store, user);
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (pathname === '/api/runmadang/join' && method === 'POST') {
    const body = await parseJsonBody(request);
    const challengeId = validateRequiredString(body.challengeId, '그라운드를 선택해주세요.');
    const payload = await mutateStore((store) => {
      const user = requireUser(store, request);
      joinRunmadangChallenge(store, user, challengeId);
      return buildRunmadangMinePayload(store, user);
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (pathname === '/api/runmadang/decline' && method === 'POST') {
    const body = await parseJsonBody(request);
    const challengeId = validateRequiredString(body.challengeId, '그라운드를 선택해주세요.');
    const payload = await mutateStore((store) => {
      const user = requireUser(store, request);
      declineRunmadangChallenge(store, user, challengeId);
      return buildRunmadangMinePayload(store, user);
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (pathname === '/api/runmadang/withdraw' && method === 'POST') {
    const body = await parseJsonBody(request);
    const challengeId = validateRequiredString(body.challengeId, '그라운드를 선택해주세요.');
    const payload = await mutateStore((store) => {
      const user = requireUser(store, request);
      withdrawRunmadangChallenge(store, user, challengeId);
      return buildRunmadangMinePayload(store, user);
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (pathname === '/api/runmadang/hide' && method === 'POST') {
    const body = await parseJsonBody(request);
    const challengeId = validateRequiredString(body.challengeId, '그라운드를 선택해주세요.');
    const payload = await mutateStore((store) => {
      const user = requireUser(store, request);
      hideRunmadangChallenge(store, user, challengeId);
      return buildRunmadangMinePayload(store, user);
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (pathname === '/api/runmadang/cancel' && method === 'POST') {
    const body = await parseJsonBody(request);
    const challengeId = validateRequiredString(body.challengeId, '그라운드를 선택해주세요.');
    const payload = await mutateStore((store) => {
      const user = requireUser(store, request);
      cancelRunmadangChallenge(store, user, challengeId);
      return buildRunmadangMinePayload(store, user);
    });
    sendJson(response, 200, payload);
    return true;
  }

  return false;
}
