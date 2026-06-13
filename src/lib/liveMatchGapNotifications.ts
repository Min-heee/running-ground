import { Platform } from 'react-native';

// Local (device-only) notifications fired during an active match to report the live
// gap versus opponents. Modeled on src/lib/matchNotifications.ts but enabled on BOTH
// platforms (the scheduled match reminders are Android-only by design; the live gap is
// meant to buzz the iPhone in your pocket too). Ships over OTA — expo-notifications is
// already compiled into the native binary.

const LIVE_GAP_KIND = 'runningground-live-gap';
const LIVE_GAP_CHANNEL_ID = 'runningground-live-gap';

type NotificationsModule = Awaited<ReturnType<typeof importNotifications>>;

async function importNotifications() {
  try {
    return await import('expo-notifications');
  } catch {
    // Older binaries may predate the native notification module.
    return null;
  }
}

async function configureAndroidLiveGapChannel(Notifications: NotificationsModule) {
  if (!Notifications || Platform.OS !== 'android' || typeof Notifications.setNotificationChannelAsync !== 'function') {
    return;
  }

  await Notifications.setNotificationChannelAsync(LIVE_GAP_CHANNEL_ID, {
    name: '대결 중간 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    vibrationPattern: [0, 200, 100, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => undefined);
}

export async function ensureLiveGapNotificationPermissions(): Promise<boolean> {
  const Notifications = await importNotifications();

  if (!Notifications) {
    return false;
  }

  await configureAndroidLiveGapChannel(Notifications);

  const currentPermission = await Notifications.getPermissionsAsync().catch(() => null);
  if (currentPermission?.granted) {
    return true;
  }

  const requestedPermission = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  }).catch(() => null);

  return Boolean(requestedPermission?.granted);
}

export type LiveGapNotificationContent = {
  title: string;
  body: string;
};

export async function presentLiveGapNotification(message: LiveGapNotificationContent): Promise<void> {
  const Notifications = await importNotifications();

  if (!Notifications) {
    return;
  }

  await configureAndroidLiveGapChannel(Notifications);

  // Android: a 1s TIME_INTERVAL trigger routes through our custom channel (sound +
  // vibration). iOS: a null trigger delivers immediately.
  const trigger = Platform.OS === 'android'
    ? {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
        channelId: LIVE_GAP_CHANNEL_ID,
      }
    : null;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: message.title,
      body: message.body,
      sound: 'default',
      data: {
        kind: LIVE_GAP_KIND,
      },
    },
    trigger,
  }).catch(() => undefined);
}
