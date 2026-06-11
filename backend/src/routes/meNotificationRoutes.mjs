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
    handleListMyNotifications({
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
      normalizeOptionalString,
      parseJsonBody,
      request,
      response,
      sendJson,
      validateBoolean,
    });
    return true;
  }

  return false;
}

function handleListMyNotifications({
  loadStore,
  request,
  requireUser,
  response,
  sendJson,
}) {
  const store = loadStore();
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
  const payload = mutateStore((store) => {
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
  const payload = mutateStore((store) => {
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

  const payload = mutateStore((store) => {
    const user = requireUser(store, request);
    user.notificationSettings = {
      friendAlerts: validateBoolean(body.friendAlerts, '친구 알림 설정값이 올바르지 않아.'),
      districtAlerts: validateBoolean(body.districtAlerts, '지역 알림 설정값이 올바르지 않아.'),
      marketAlerts: validateBoolean(body.marketAlerts, '마켓 알림 설정값이 올바르지 않아.'),
      matchReminders: validateBoolean(body.matchReminders, '매치 알림 설정값이 올바르지 않아.'),
    };

    return buildNotificationSettings(user);
  });

  sendJson(response, 200, payload);
}

async function handlePatchMyLiveSharing({
  getAccessToken,
  getFriendsRepository,
  getPostgresFriendsRepository,
  normalizeOptionalString,
  parseJsonBody,
  request,
  response,
  sendJson,
  validateBoolean,
}) {
  const body = await parseJsonBody(request);
  const token = getAccessToken(request);
  const enabled = validateBoolean(body.enabled, '위치 공유 설정값이 올바르지 않아.');
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
  });

  sendJson(response, 200, payload);
}
