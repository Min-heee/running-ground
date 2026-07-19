// Standalone permission/connect helpers for the welcome-tour permissions gate. Thin wrappers
// over the same native paths the rest of the app already uses, so the onboarding step can fire
// the real OS dialogs and the Health Connect authorization sheet (Android-only — iOS has no
// health integration in this version, see nativeHealth.ts) inline without dragging in the whole
// run-tracking / 연동관리 flow.
//
// OTA-safety (see the per-key notes below):
// - location (fg + bg), notifications, HEALTH read  -> declarations already in the native build
//   (expo-location plist + Android manifest, expo-notifications POST_NOTIFICATIONS, the
//   withHealthAccess plugin's Health Connect manifest perms). Requesting
//   them is a pure JS runtime call = OTA-safe, no rebuild.
// - motion/activity (Pedometer): OTA-safe on BOTH platforms. iOS NSMotionUsageDescription is
//   declared (app.config.ts); ANDROID android.permission.ACTIVITY_RECOGNITION is present in the
//   merged manifest (expo-sensors ships it in its own module AndroidManifest, and it is also
//   declared in app.json), so Pedometer.requestPermissionsAsync() shows a real runtime dialog on
//   Android just like iOS. Motion is therefore a first-class grantable permission on both.

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import {
  getPreferredNativeHealthSource,
  importRunsFromRecommendedNativeHealthSource,
} from '@/integrations/nativeHealth';
import { connectIntegrationSource, fetchIntegrationStatus } from '@/services';
import {
  isBatteryOptimizationControlAvailable,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
} from '../../../../modules/match-progress-uploader';

export type OnboardingPermissionKey =
  | 'location'
  | 'backgroundLocation'
  | 'notifications'
  | 'motion'
  | 'health';

export type OnboardingPermissionStatuses = Record<OnboardingPermissionKey, boolean>;

// Whether the in-app prompt can still surface a system dialog for this key. Once the OS has
// recorded a hard denial (canAskAgain === false on iOS), re-requesting is a silent no-op, so the
// UI must redirect the user to Settings instead of showing a dead "허용하기" button.
export type OnboardingPermissionCanAsk = Record<OnboardingPermissionKey, boolean>;

export const ONBOARDING_PERMISSION_DENIED: OnboardingPermissionStatuses = {
  location: false,
  backgroundLocation: false,
  notifications: false,
  motion: false,
  health: false,
};

// Default to "can still ask" so a fresh first-run shows the request button, not 설정 열기.
export const ONBOARDING_PERMISSION_CAN_ASK: OnboardingPermissionCanAsk = {
  location: true,
  backgroundLocation: true,
  notifications: true,
  motion: true,
  health: true,
};

type PermissionLike = { granted?: boolean; status?: string; canAskAgain?: boolean } | null | undefined;

function isGranted(permission: PermissionLike): boolean {
  return Boolean(permission && (permission.granted || permission.status === 'granted'));
}

// Treat a missing canAskAgain as "can still ask" (true). Only an explicit false means the OS has
// locked further prompts and we should route to Settings.
function canAskAgain(permission: PermissionLike): boolean {
  return permission?.canAskAgain !== false;
}

async function getNotificationsModule() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

// --- read-only status (never prompts) -------------------------------------------------------

// Exported for the competitive pre-flight (ensureCompetitivePreflight), which soft-requests
// notifications on match entry. Never prompts — pure read.
export async function readNotificationGate(): Promise<{ granted: boolean; canAsk: boolean }> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return { granted: false, canAsk: false };
  }
  try {
    const current = await Notifications.getPermissionsAsync();
    return { granted: isGranted(current), canAsk: canAskAgain(current) };
  } catch {
    return { granted: false, canAsk: false };
  }
}

// Exported for the competitive pre-flight's motion gate (ensureCompetitivePreflight), which needs the
// extra `available` flag to tell "no step sensor at all" apart from "hard-denied" — both read as
// {granted: false, canAsk: false} otherwise. Onboarding callers ignore the extra field.
export async function readMotionGate(): Promise<{
  granted: boolean;
  canAsk: boolean;
  available: boolean;
}> {
  try {
    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      // No hardware / Expo Go: surface as not-granted and not-askable so the UI shows a
      // graceful "나중에" instead of a button that does nothing.
      return { granted: false, canAsk: false, available: false };
    }
    const current = await Pedometer.getPermissionsAsync();
    return { granted: isGranted(current), canAsk: canAskAgain(current), available: true };
  } catch {
    return { granted: false, canAsk: false, available: false };
  }
}

// Location gate read for the competitive pre-flight (ensureCompetitivePreflight). Never prompts.
// backgroundGranted is expo's "always"-equivalent check (on iOS only authorizedAlways reads as
// granted here — While-Using does not), which is exactly the bar competitive screen-off tracking
// needs. backgroundCanAsk === false means the OS has locked further background prompts, so a
// request would silently no-op and only the Settings app can fix it.
export async function readLocationGate(): Promise<{
  backgroundCanAsk: boolean;
  backgroundGranted: boolean;
  foregroundGranted: boolean;
}> {
  const [fg, bg] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
  ]);
  return {
    backgroundCanAsk: canAskAgain(bg),
    backgroundGranted: isGranted(bg),
    foregroundGranted: isGranted(fg),
  };
}

// Health "granted" here means the preferred native source is already backend-connected (the
// prerequisite the 연동관리 import path enforces before it can read). The actual Health Connect
// authorization sheet is fired lazily by the connect action below, mirroring the import flow —
// we never block onboarding on the OS sheet itself. On iOS getPreferredNativeHealthSource()
// is null (no health integration in this version), so this reads not-granted / not-askable.
async function readHealthGate(): Promise<{ granted: boolean; canAsk: boolean }> {
  const preferred = getPreferredNativeHealthSource();
  if (!preferred) {
    return { granted: false, canAsk: false };
  }
  try {
    const status = await fetchIntegrationStatus();
    const source = status.sources.find((entry) => entry.sourceType === preferred);
    return { granted: Boolean(source?.connected), canAsk: true };
  } catch {
    // Offline / not signed in yet: leave it connectable, don't crash the checklist.
    return { granted: false, canAsk: true };
  }
}

// Read current grant state for every onboarding permission WITHOUT prompting — used to render the
// checklist and to re-check after returning from the OS Settings app. motionAvailable rides along
// so the 필수 게이트 can exempt devices that have no step sensor at all (they could never pass).
export async function getOnboardingPermissionStatuses(): Promise<{
  statuses: OnboardingPermissionStatuses;
  canAsk: OnboardingPermissionCanAsk;
  motionAvailable: boolean;
}> {
  const [fg, bg, notif, motion, health] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
    readNotificationGate(),
    readMotionGate(),
    readHealthGate(),
  ]);

  return {
    statuses: {
      location: isGranted(fg),
      backgroundLocation: isGranted(bg),
      notifications: notif.granted,
      motion: motion.granted,
      health: health.granted,
    },
    canAsk: {
      location: canAskAgain(fg),
      backgroundLocation: canAskAgain(bg),
      notifications: notif.canAsk,
      motion: motion.canAsk,
      health: health.canAsk,
    },
    motionAvailable: motion.available,
  };
}

// --- individual request actions (each guarded, sequenced by the caller) ----------------------

export async function requestForegroundLocation(): Promise<boolean> {
  try {
    return isGranted(await Location.requestForegroundPermissionsAsync());
  } catch {
    return false;
  }
}

// Background ("always") location can only be granted once foreground is granted, so this no-ops
// to false when foreground isn't in place yet (the caller requests foreground first).
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

// Merged "위치" row request: foreground first, then background ("always"), sequenced. The merged
// onboarding row only shows ✓ once background is granted, so this returns the background result.
// requestBackgroundLocation already no-ops to false until foreground is in place, so this order is
// the only correct one.
export async function requestLocation(): Promise<boolean> {
  await requestForegroundLocation();
  return requestBackgroundLocation();
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

export async function requestMotion(): Promise<boolean> {
  try {
    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      return false;
    }
    const current = await Pedometer.getPermissionsAsync();
    if (isGranted(current)) {
      return true;
    }
    // Shows a real OS dialog on BOTH platforms: iOS via NSMotionUsageDescription, Android via the
    // manifest-declared ACTIVITY_RECOGNITION runtime permission. If the user has hard-denied it
    // before (canAskAgain === false) this no-ops to not-granted and the onboarding UI routes to
    // Settings via resolvePermissionRowAction — same as every other permission.
    return isGranted(await Pedometer.requestPermissionsAsync());
  } catch {
    return false;
  }
}

// Connect + authorize the preferred native health source using the SAME path as 연동관리 import:
// connectIntegrationSource(...) registers the source backend-side, then
// importRunsFromRecommendedNativeHealthSource(...) drives readRuns(), which is what surfaces the
// Health Connect authorization sheet. Fully guarded so a device without the native module
// (Expo Go / unsupported) just returns false instead of crashing onboarding. On iOS the
// preferred source is null, so this no-ops to false without touching any health API.
export async function requestHealthConnect(): Promise<boolean> {
  const preferred = getPreferredNativeHealthSource();
  if (!preferred) {
    return false;
  }

  try {
    const connectResult = await connectIntegrationSource(preferred);
    const sources = connectResult.sources;
    // Triggers the native authorization sheet via readRuns(); a thrown error (no native module,
    // user dismissed the sheet, nothing to import) is swallowed so we still report connected.
    try {
      await importRunsFromRecommendedNativeHealthSource();
    } catch {
      // Connection succeeded even if the inline read found nothing / was declined — that's fine.
    }
    const connected = sources.find((entry) => entry.sourceType === preferred)?.connected;
    return Boolean(connected);
  } catch {
    return false;
  }
}

// --- Android-only battery-optimization exemption -------------------------------------------------
// Thin wrappers over the native match-progress-uploader control. These are OTA-safe: on iOS and on
// old Android binaries the native control reports unavailable, so isBatteryControlAvailable() is
// false and the read/request helpers no-op to safe defaults. Kept OUT of the unified
// OnboardingPermissionKey model — the welcome-tour screen tracks battery as isolated Android-only
// local state so the permission model + its tests stay unchanged.

export function isBatteryControlAvailable(): boolean {
  return Platform.OS === 'android' && isBatteryOptimizationControlAvailable();
}

export function readBatteryExempt(): boolean {
  return isBatteryControlAvailable() ? isIgnoringBatteryOptimizations() : false;
}

export async function requestBatteryExemption(): Promise<boolean> {
  if (!isBatteryControlAvailable()) {
    return false;
  }
  requestIgnoreBatteryOptimizations();
  return isIgnoringBatteryOptimizations();
}
