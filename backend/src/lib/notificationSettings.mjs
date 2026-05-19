import { createDefaultNotificationSettings } from '../repositories/authRepository.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildNotificationSettings(user) {
  return clone({
    ...createDefaultNotificationSettings(),
    ...(user.notificationSettings ?? {}),
  });
}
