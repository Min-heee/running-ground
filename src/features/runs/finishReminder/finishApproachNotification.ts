import { Platform } from 'react-native';

// Device-only "finish approaching — turn your screen on" reminder. A single DATE-scheduled
// local notification fired ~1 min before the runner reaches the finish line, so a screen-off
// runner turns the screen on in time for the distance + finish to be captured accurately. The
// OS delivers DATE-scheduled notifications even while the JS thread is suspended (locked iOS).
//
// Modeled on src/lib/liveMatchGapNotifications.ts + src/lib/matchNotifications.ts. Ships over
// OTA — expo-notifications is already compiled into the native binary.

const FINISH_REMINDER_KIND = 'runningground-finish-approach';
const FINISH_REMINDER_CHANNEL_ID = 'runningground-finish-approach';

export const FINISH_REMINDER_TITLE = '🏁 결승선이 곧이에요!';
export const FINISH_REMINDER_BODY = '화면을 켜두면 완주 시간이 정확하게 기록돼요.';

type NotificationsModule = Awaited<ReturnType<typeof importNotifications>>;

async function importNotifications() {
  try {
    return await import('expo-notifications');
  } catch {
    // Older binaries may predate the native notification module.
    return null;
  }
}

async function configureAndroidFinishReminderChannel(Notifications: NotificationsModule) {
  if (
    !Notifications
    || Platform.OS !== 'android'
    || typeof Notifications.setNotificationChannelAsync !== 'function'
  ) {
    return;
  }

  await Notifications.setNotificationChannelAsync(FINISH_REMINDER_CHANNEL_ID, {
    name: '완주 임박 알림',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => undefined);
}

// Permission is already requested at onboarding; never re-request here. Returns false (no-op)
// when the native module is absent or permission is not granted.
async function hasFinishReminderPermission(Notifications: NotificationsModule): Promise<boolean> {
  if (!Notifications) {
    return false;
  }

  const currentPermission = await Notifications.getPermissionsAsync().catch(() => null);
  return Boolean(currentPermission?.granted);
}

// (Re)schedule the one-shot reminder `inSeconds` from now, REPLACING any previously-scheduled
// finish reminder for this run. Returns true when a notification was scheduled.
export async function scheduleFinishApproachReminder(inSeconds: number): Promise<boolean> {
  const Notifications = await importNotifications();

  if (!Notifications) {
    return false;
  }

  await configureAndroidFinishReminderChannel(Notifications);

  if (!(await hasFinishReminderPermission(Notifications))) {
    return false;
  }

  // Replace any pending reminder before re-arming so only the latest ETA is queued.
  await cancelFinishApproachReminder();

  const fireAtMs = Date.now() + Math.max(0, inSeconds) * 1000;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: FINISH_REMINDER_TITLE,
      body: FINISH_REMINDER_BODY,
      sound: 'default',
      data: { kind: FINISH_REMINDER_KIND },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(fireAtMs),
      channelId: Platform.OS === 'android' ? FINISH_REMINDER_CHANNEL_ID : undefined,
    },
  }).catch(() => undefined);

  return true;
}

// Present the reminder immediately (already within the buffer). Android routes through the
// custom channel via a short TIME_INTERVAL trigger; iOS delivers immediately (null trigger).
export async function presentFinishApproachReminderNow(): Promise<void> {
  const Notifications = await importNotifications();

  if (!Notifications) {
    return;
  }

  await configureAndroidFinishReminderChannel(Notifications);

  if (!(await hasFinishReminderPermission(Notifications))) {
    return;
  }

  const trigger = Platform.OS === 'android'
    ? {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
        channelId: FINISH_REMINDER_CHANNEL_ID,
      }
    : null;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: FINISH_REMINDER_TITLE,
      body: FINISH_REMINDER_BODY,
      sound: 'default',
      data: { kind: FINISH_REMINDER_KIND },
    },
    trigger,
  }).catch(() => undefined);
}

// Cancel any pending finish-approach reminder (run end / finish / forfeit / unmount). Cancels
// only our own kind, so it never touches the match-reminder or live-gap notifications.
export async function cancelFinishApproachReminder(): Promise<void> {
  const Notifications = await importNotifications();

  if (!Notifications) {
    return;
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    scheduled
      .filter((notification) => notification.content.data?.kind === FINISH_REMINDER_KIND)
      .map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => undefined)),
  );
}
