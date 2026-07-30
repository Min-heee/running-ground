import { nextId } from './idHelpers.mjs';

export const USER_NOTIFICATION_TYPES = new Set([
  'match_invite',
  'match_result',
  'friend_request',
  'friend_accepted',
  'rank_change',
  'chase_settlement',
  'inquiry_reply',
]);
export const MAX_USER_NOTIFICATIONS = 50;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function ensureUserNotificationsStore(store) {
  if (!Array.isArray(store.notifications)) {
    store.notifications = [];
  }

  return store.notifications;
}

function normalizeNotificationData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }

  return cloneJson(data);
}

function normalizeNotificationText(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 160);
}

function buildNotificationPayload(notification) {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    ...(notification.data && typeof notification.data === 'object' ? { data: cloneJson(notification.data) } : {}),
    createdAt: notification.createdAt,
    readAt: notification.readAt ?? null,
  };
}

export function pruneUserNotifications(store, userId, maxItems = MAX_USER_NOTIFICATIONS) {
  const notifications = ensureUserNotificationsStore(store);
  const userNotifications = notifications.filter((item) => item?.userId === userId);
  const overflowCount = userNotifications.length - maxItems;

  if (overflowCount <= 0) {
    return notifications;
  }

  const removeIds = new Set(
    userNotifications
      .toSorted((left, right) => {
        const leftReadPriority = left.readAt ? 0 : 1;
        const rightReadPriority = right.readAt ? 0 : 1;

        if (leftReadPriority !== rightReadPriority) {
          return leftReadPriority - rightReadPriority;
        }

        return Date.parse(left.createdAt ?? '') - Date.parse(right.createdAt ?? '');
      })
      .slice(0, overflowCount)
      .map((item) => item.id),
  );

  store.notifications = notifications.filter((item) => !removeIds.has(item?.id));
  return store.notifications;
}

export function appendUserNotification(store, {
  userId,
  type,
  title,
  body,
  data,
  nowIso = () => new Date().toISOString(),
}) {
  if (typeof userId !== 'string' || !userId.trim() || !USER_NOTIFICATION_TYPES.has(type)) {
    return null;
  }

  const normalizedTitle = normalizeNotificationText(title);
  const normalizedBody = normalizeNotificationText(body);

  if (!normalizedTitle || !normalizedBody) {
    return null;
  }

  const notification = {
    id: nextId('notification'),
    userId,
    type,
    title: normalizedTitle,
    body: normalizedBody,
    createdAt: nowIso(),
    readAt: null,
  };
  const normalizedData = normalizeNotificationData(data);

  if (normalizedData) {
    notification.data = normalizedData;
  }

  ensureUserNotificationsStore(store).push(notification);
  pruneUserNotifications(store, userId);

  return buildNotificationPayload(notification);
}

export function listUserNotifications(store, userId, { limit = MAX_USER_NOTIFICATIONS } = {}) {
  const safeLimit = Math.max(1, Math.min(MAX_USER_NOTIFICATIONS, Math.trunc(Number(limit) || MAX_USER_NOTIFICATIONS)));
  const userNotifications = ensureUserNotificationsStore(store)
    .filter((item) => item?.userId === userId)
    .toSorted((left, right) => Date.parse(right.createdAt ?? '') - Date.parse(left.createdAt ?? ''));
  const unreadCount = userNotifications.filter((item) => !item.readAt).length;

  return {
    items: userNotifications.slice(0, safeLimit).map(buildNotificationPayload),
    unreadCount,
  };
}

export function deleteUserNotifications(store, userId, ids) {
  const notifications = ensureUserNotificationsStore(store);
  const idSet = Array.isArray(ids)
    ? new Set(ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))
    : null;

  // ids omitted -> clear the user's whole inbox; ids given -> delete just those.
  store.notifications = notifications.filter((item) => {
    if (!item || item.userId !== userId) {
      return true;
    }

    return idSet ? !idSet.has(item.id) : false;
  });

  const remaining = store.notifications.filter((item) => item?.userId === userId);

  return {
    deletedCount: notifications.length - store.notifications.length,
    unreadCount: remaining.filter((item) => !item.readAt).length,
  };
}

export function markUserNotificationsRead(store, userId, ids, { nowIso = () => new Date().toISOString() } = {}) {
  const notifications = ensureUserNotificationsStore(store);
  const idSet = Array.isArray(ids)
    ? new Set(ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))
    : null;
  const readAt = nowIso();

  for (const notification of notifications) {
    if (!notification || notification.userId !== userId || notification.readAt) {
      continue;
    }

    if (idSet && !idSet.has(notification.id)) {
      continue;
    }

    notification.readAt = readAt;
  }

  const prunedNotifications = pruneUserNotifications(store, userId);

  return {
    unreadCount: prunedNotifications.filter((item) => item?.userId === userId && !item.readAt).length,
  };
}
