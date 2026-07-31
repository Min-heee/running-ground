import {
  deleteUserNotifications,
  listUserNotifications,
  markUserNotificationsRead,
} from '../lib/userNotifications.mjs';

export async function routeMeNotificationRequest({
  method,
  pathname,
  request,
  response,
  sendJson,
  loadStore,
  mutateStore,
  getAccessToken,
  getPostgresFriendsRepository,
  getFriendsRepository,
  buildNotificationSettingsReadPayload,
  buildNotificationSettings,
  requireUser,
  validateBoolean,
  normalizeOptionalString,
  parseJsonBody,
}) {
  if (pathname === '/api/me/notifications' && method === 'GET') {
    sendJson(response, 200, await buildNotificationSettingsReadPayload(request));
    return true;
  }

  if (pathname === '/api/me/inbox' && method === 'GET') {
    await handleListMyNotifications({
      loadStore,
      request,
      requireUser,
      response,
      sendJson,
    });
    return true;
  }

  if (pathname === '/api/me/inbox/read' && method === 'POST') {
    await handleMarkMyNotificationsRead({
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
    });
    return true;
  }

  if (pathname === '/api/me/inbox/delete' && method === 'POST') {
    await handleDeleteMyNotifications({
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
    });
    return true;
  }

  if (pathname === '/api/me/notifications' && method === 'PATCH') {
    await handlePatchMyNotifications({
      buildNotificationSettings,
      mutateStore,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateBoolean,
    });
    return true;
  }

  if (pathname === '/api/me/live-sharing' && method === 'PATCH') {
    await handlePatchMyLiveSharing({
      getAccessToken,
      getFriendsRepository,
      getPostgresFriendsRepository,
      loadStore,
      normalizeOptionalString,
      parseJsonBody,
      request,
      requireUser,
      response,
      sendJson,
      validateBoolean,
    });
    return true;
  }

  return false;
}

async function handleListMyNotifications({
  loadStore,
  request,
  requireUser,
  response,
  sendJson,
}) {
  const store = await loadStore();
  const user = requireUser(store, request);
  sendJson(response, 200, listUserNotifications(store, user.id));
}

async function handleMarkMyNotificationsRead({
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);
  const ids = Array.isArray(body.ids) ? body.ids : undefined;
  const payload = await mutateStore((store) => {
    const user = requireUser(store, request);
    return markUserNotificationsRead(store, user.id, ids);
  });

  sendJson(response, 200, payload);
}

async function handleDeleteMyNotifications({
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
}) {
  const body = await parseJsonBody(request);
  const ids = Array.isArray(body.ids) ? body.ids : undefined;
  const payload = await mutateStore((store) => {
    const user = requireUser(store, request);
    return deleteUserNotifications(store, user.id, ids);
  });

  sendJson(response, 200, payload);
}

async function handlePatchMyNotifications({
  buildNotificationSettings,
  mutateStore,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateBoolean,
}) {
  const body = await parseJsonBody(request);

  const payload = await mutateStore((store) => {
    const user = requireUser(store, request);
    user.notificationSettings = {
      friendAlerts: validateBoolean(body.friendAlerts, '친구 알림 설정값이 올바르지 않아요.'),
      districtAlerts: validateBoolean(body.districtAlerts, '지역 알림 설정값이 올바르지 않아요.'),
      marketAlerts: validateBoolean(body.marketAlerts, '마켓 알림 설정값이 올바르지 않아요.'),
      matchReminders: validateBoolean(body.matchReminders, '매치 알림 설정값이 올바르지 않아요.'),
      // 라이브 러닝 공개 + 응원 메시지 (오너 2026-07-31). 구버전 앱은 이 키를 안 보낸다 —
      // 그때는 저장된 값을 보존해야 한다. 기본 true로 덮으면 구버전 기기에서 아무 설정이나
      // 저장하는 순간 비공개 선택이 소리 없이 풀린다(적대 검증 발견).
      liveRunPublic: typeof body.liveRunPublic === 'boolean'
        ? body.liveRunPublic
        : user.notificationSettings?.liveRunPublic !== false,
      cheerAlerts: typeof body.cheerAlerts === 'boolean'
        ? body.cheerAlerts
        : user.notificationSettings?.cheerAlerts !== false,
    };

    return buildNotificationSettings(user);
  });

  sendJson(response, 200, payload);
}

async function handlePatchMyLiveSharing({
  getAccessToken,
  getFriendsRepository,
  getPostgresFriendsRepository,
  loadStore,
  normalizeOptionalString,
  parseJsonBody,
  request,
  requireUser,
  response,
  sendJson,
  validateBoolean,
}) {
  const body = await parseJsonBody(request);
  const token = getAccessToken(request);
  const requestedEnabled = validateBoolean(body.enabled, '위치 공유 설정값이 올바르지 않아요.');
  // 비공개는 서버가 최종 게이트다 (적대 검증: 클라 게이트는 설정 조회 실패/타이밍으로
  // fail-open 한다). 설정의 저장처는 store 블롭이라 두 드라이버 모두 여기서 읽는 게 맞다.
  const settingsStore = await loadStore();
  const settingsUser = requireUser(settingsStore, request);
  const liveRunPublic = settingsUser.notificationSettings?.liveRunPublic !== false;
  const enabled = requestedEnabled && liveRunPublic;
  const status = ['idle', 'paused', 'running'].includes(body.status)
    ? body.status
    : 'idle';
  const locationLabel = normalizeOptionalString(body.locationLabel);
  const postgresRepository = getPostgresFriendsRepository();
  const repository = postgresRepository ?? getFriendsRepository();
  const payload = await repository.updateLiveSharing({
    token,
    enabled,
    status,
    locationLabel,
    // 친구 라이브 지도 재료 — 러너 하트비트가 25초마다 현재 위치/지표를 실어 보낸다.
    latitude: typeof body.latitude === 'number' ? body.latitude : null,
    longitude: typeof body.longitude === 'number' ? body.longitude : null,
    distanceKm: typeof body.distanceKm === 'number' ? body.distanceKm : null,
    paceLabel: normalizeOptionalString(body.paceLabel),
    // 응원 수신 허용 — 러너 기기의 설정값이 하트비트로 실려온다 (기본 허용).
    allowCheers: body.allowCheers !== false,
  });

  sendJson(response, 200, payload);
}
