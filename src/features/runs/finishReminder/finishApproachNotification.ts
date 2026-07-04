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

// §3.⑤ (fair-verdict design) — SECOND reminder at the projected goal-ETA itself. Distinct kind so
// the two reminders schedule/cancel independently; same channel (both are 완주 임박 nudges).
const GOAL_ETA_REMINDER_KIND = 'runningground-finish-goal-eta';

export const FINISH_REMINDER_TITLE = '🏁 결승선이 곧이에요!';
export const FINISH_REMINDER_BODY = '화면을 켜두면 완주 시간이 정확하게 기록돼요.';

export const GOAL_ETA_REMINDER_TITLE = '🏁 지금쯤 완주했을 거예요!';
export const GOAL_ETA_REMINDER_BODY = '화면을 켜면 완주 기록이 바로 전송돼요.';

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

// Cancel every pending notification of the given kinds. Only our own kinds are ever passed, so
// this never touches the match-reminder or live-gap notifications.
async function cancelReminderNotificationsOfKinds(
  Notifications: NotificationsModule,
  kinds: readonly string[],
): Promise<void> {
  if (!Notifications) {
    return;
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    scheduled
      .filter((notification) => kinds.includes(String(notification.content.data?.kind)))
      .map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => undefined)),
  );
}

// (Re)schedule a one-shot reminder of `kind` `inSeconds` from now, REPLACING any previously
// scheduled reminder of the SAME kind (the other kind's schedule is untouched). Returns true when
// a notification was scheduled.
async function scheduleReminderNotification(
  kind: string,
  title: string,
  body: string,
  inSeconds: number,
): Promise<boolean> {
  const Notifications = await importNotifications();

  if (!Notifications) {
    return false;
  }

  await configureAndroidFinishReminderChannel(Notifications);

  if (!(await hasFinishReminderPermission(Notifications))) {
    return false;
  }

  // Replace any pending reminder of this kind before re-arming so only the latest ETA is queued.
  await cancelReminderNotificationsOfKinds(Notifications, [kind]);

  const fireAtMs = Date.now() + Math.max(0, inSeconds) * 1000;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: { kind },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(fireAtMs),
      channelId: Platform.OS === 'android' ? FINISH_REMINDER_CHANNEL_ID : undefined,
    },
  }).catch(() => undefined);

  return true;
}

// Present a reminder of `kind` immediately (already within its buffer). Android routes through the
// custom channel via a short TIME_INTERVAL trigger; iOS delivers immediately (null trigger).
async function presentReminderNotificationNow(kind: string, title: string, body: string): Promise<void> {
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
      title,
      body,
      sound: 'default',
      data: { kind },
    },
    trigger,
  }).catch(() => undefined);
}

// (Re)schedule the one-shot ~300m approach reminder `inSeconds` from now, REPLACING any previously
// scheduled approach reminder for this run. Returns true when a notification was scheduled.
export async function scheduleFinishApproachReminder(inSeconds: number): Promise<boolean> {
  return scheduleReminderNotification(
    FINISH_REMINDER_KIND,
    FINISH_REMINDER_TITLE,
    FINISH_REMINDER_BODY,
    inSeconds,
  );
}

// Present the approach reminder immediately (already within the buffer).
export async function presentFinishApproachReminderNow(): Promise<void> {
  return presentReminderNotificationNow(FINISH_REMINDER_KIND, FINISH_REMINDER_TITLE, FINISH_REMINDER_BODY);
}

// §3.⑤ — (re)schedule the one-shot GOAL-ETA reminder `inSeconds` from now (the projected moment of
// crossing the finish line), REPLACING any previously scheduled goal-ETA reminder for this run.
export async function scheduleGoalEtaReminder(inSeconds: number): Promise<boolean> {
  return scheduleReminderNotification(
    GOAL_ETA_REMINDER_KIND,
    GOAL_ETA_REMINDER_TITLE,
    GOAL_ETA_REMINDER_BODY,
    inSeconds,
  );
}

// §3.⑤ — present the goal-ETA reminder immediately (rejoined/evaluated past the projected ETA).
export async function presentGoalEtaReminderNow(): Promise<void> {
  return presentReminderNotificationNow(GOAL_ETA_REMINDER_KIND, GOAL_ETA_REMINDER_TITLE, GOAL_ETA_REMINDER_BODY);
}

// Cancel every pending finish reminder — BOTH the ~300m approach one and the goal-ETA one — on
// run end / finish / forfeit / unmount, so neither can fire after the run is over. Cancels only
// our own kinds, so it never touches the match-reminder or live-gap notifications.
export async function cancelFinishApproachReminder(): Promise<void> {
  const Notifications = await importNotifications();

  if (!Notifications) {
    return;
  }

  await cancelReminderNotificationsOfKinds(Notifications, [FINISH_REMINDER_KIND, GOAL_ETA_REMINDER_KIND]);
}
