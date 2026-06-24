import { Platform } from 'react-native';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import { MATCH_REMINDER_OFFSETS_MINUTES } from '@/lib/matchNotificationOffsets';

export { MATCH_REMINDER_OFFSETS_MINUTES };

const MATCH_REMINDER_KIND = 'runningground-match-reminder';
const MATCH_REMINDER_CHANNEL_ID = 'runningground-match-reminders';

async function getNotificationsModule() {
  // DATE-trigger notifications are cross-platform; iOS schedules these the same as
  // Android (ensureMatchReminderPermissions requests iOS alert/sound permission too),
  // so we no longer short-circuit iOS here.
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

async function configureAndroidMatchReminderChannel(Notifications: Awaited<ReturnType<typeof getNotificationsModule>>) {
  if (!Notifications || Platform.OS !== 'android' || typeof Notifications.setNotificationChannelAsync !== 'function') {
    return;
  }

  await Notifications.setNotificationChannelAsync(MATCH_REMINDER_CHANNEL_ID, {
    name: '매치 알림',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function ensureMatchReminderPermissions() {
  const Notifications = await getNotificationsModule();

  if (!Notifications) {
    return false;
  }

  await configureAndroidMatchReminderChannel(Notifications);

  const currentPermission = await Notifications.getPermissionsAsync();
  if (currentPermission.granted) {
    return true;
  }

  const requestedPermission = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });

  return requestedPermission.granted;
}

function buildReminderTitle(match: UpcomingRunningMatchItem, minutesBefore: number) {
  const matchLabel = match.mode === 'duel' ? '1대1 대결' : '그룹 대결';

  if (minutesBefore <= 1) {
    return `${matchLabel} 곧 시작해요`;
  }

  return `${matchLabel} ${minutesBefore}분 전이에요`;
}

function buildReminderBody(match: UpcomingRunningMatchItem, minutesBefore: number) {
  if (minutesBefore <= 1) {
    return `잠시 후 ${match.counterpartLabel}과 ${match.summary}가 시작돼요.`;
  }

  return `${minutesBefore}분 뒤 ${match.counterpartLabel}과 ${match.summary}가 시작돼요.`;
}

export async function syncScheduledMatchNotifications(matches: UpcomingRunningMatchItem[], enabled: boolean) {
  const Notifications = await getNotificationsModule();

  if (!Notifications) {
    return;
  }

  await configureAndroidMatchReminderChannel(Notifications);

  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const existingMatchNotifications = scheduledNotifications.filter((notification) => notification.content.data?.kind === MATCH_REMINDER_KIND);

  await Promise.all(
    existingMatchNotifications.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => undefined)),
  );

  if (!enabled) {
    return;
  }

  const hasPermission = await ensureMatchReminderPermissions();
  if (!hasPermission) {
    return;
  }

  const now = Date.now();
  const reservableMatches = matches.filter((match) => match.status === 'matched');

  for (const match of reservableMatches) {
    const slotStartAtMs = new Date(match.slotStartAt).getTime();

    if (!Number.isFinite(slotStartAtMs)) {
      continue;
    }

    for (const minutesBefore of MATCH_REMINDER_OFFSETS_MINUTES) {
      const triggerAtMs = slotStartAtMs - minutesBefore * 60 * 1000;

      if (triggerAtMs <= now + 5000) {
        continue;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: buildReminderTitle(match, minutesBefore),
          body: buildReminderBody(match, minutesBefore),
          sound: 'default',
          data: {
            kind: MATCH_REMINDER_KIND,
            matchId: match.matchId,
            mode: match.mode,
            roomId: match.roomId,
            slotStartAt: match.slotStartAt,
            minutesBefore,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(triggerAtMs),
          channelId: Platform.OS === 'android' ? MATCH_REMINDER_CHANNEL_ID : undefined,
        },
      }).catch(() => undefined);
    }
  }
}
