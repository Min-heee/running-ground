import { Platform } from 'react-native';

const ANDROID_NOTIFICATION_PERMISSION_API_LEVEL = 33;
const DECIMAL_RADIX = 10;

function getAndroidApiLevel() {
  const version = Platform.Version;
  return typeof version === 'number' ? version : Number.parseInt(String(version), DECIMAL_RADIX);
}

export async function requestAndroidRunTrackingNotificationPermission() {
  if (Platform.OS !== 'android') {
    return true;
  }

  const apiLevel = getAndroidApiLevel();
  if (!Number.isFinite(apiLevel) || apiLevel < ANDROID_NOTIFICATION_PERMISSION_API_LEVEL) {
    return true;
  }

  try {
    const Notifications = await import('expo-notifications');
    const currentPermission = await Notifications.getPermissionsAsync();
    if (currentPermission.granted) {
      return true;
    }

    const requestedPermission = await Notifications.requestPermissionsAsync();
    return requestedPermission.granted;
  } catch {
    return false;
  }
}
