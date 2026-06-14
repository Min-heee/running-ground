// Standalone permission helpers for the welcome-tour permissions gate. Thin wrappers over
// expo-location (statically imported, like useLocationTracking) and expo-notifications
// (dynamic-import guarded, like the rest of the notification code) so the gate can request
// and read status without dragging in the whole run-tracking flow.
//
// All four modules are already compiled into the native build (location/background-location
// plist + Android manifest, motion, notifications), so this is OTA-safe — no rebuild.

import * as Location from 'expo-location';

export type OnboardingPermissionKey = 'location' | 'backgroundLocation' | 'notifications';

export type OnboardingPermissionStatuses = Record<OnboardingPermissionKey, boolean>;

export const ONBOARDING_PERMISSION_DENIED: OnboardingPermissionStatuses = {
  location: false,
  backgroundLocation: false,
  notifications: false,
};

async function getNotificationsModule() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

function isGranted(permission: { granted?: boolean; status?: string } | null | undefined): boolean {
  return Boolean(permission && (permission.granted || permission.status === 'granted'));
}

async function getNotificationGranted(): Promise<boolean> {
  const Notifications = await getNotificationsModule();

  if (!Notifications) {
    return false;
  }

  try {
    return isGranted(await Notifications.getPermissionsAsync());
  } catch {
    return false;
  }
}

// Read current grant state for all three required permissions WITHOUT prompting — used to
// render the checklist and to re-check after returning from the OS Settings app.
export async function getOnboardingPermissionStatuses(): Promise<OnboardingPermissionStatuses> {
  const [location, backgroundLocation, notifications] = await Promise.all([
    Location.getForegroundPermissionsAsync().then(isGranted).catch(() => false),
    Location.getBackgroundPermissionsAsync().then(isGranted).catch(() => false),
    getNotificationGranted(),
  ]);

  return { location, backgroundLocation, notifications };
}

export async function requestForegroundLocation(): Promise<boolean> {
  try {
    return isGranted(await Location.requestForegroundPermissionsAsync());
  } catch {
    return false;
  }
}

// Background ("always") location can only be granted once foreground is granted, so this
// no-ops to false when foreground isn't in place yet (the caller requests foreground first).
export async function requestBackgroundLocation(): Promise<boolean> {
  try {
    if (!isGranted(await Location.getForegroundPermissionsAsync())) {
      return false;
    }

    return isGranted(await Location.requestBackgroundPermissionsAsync());
  } catch {
    return false;
  }
}

export async function requestNotifications(): Promise<boolean> {
  const Notifications = await getNotificationsModule();

  if (!Notifications) {
    return false;
  }

  try {
    const current = await Notifications.getPermissionsAsync();
    if (isGranted(current)) {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return isGranted(requested);
  } catch {
    return false;
  }
}

// Request all three in order (foreground location must come before background) and report
// the resulting grant state.
export async function requestAllOnboardingPermissions(): Promise<OnboardingPermissionStatuses> {
  await requestForegroundLocation();
  await requestBackgroundLocation();
  await requestNotifications();
  return getOnboardingPermissionStatuses();
}
