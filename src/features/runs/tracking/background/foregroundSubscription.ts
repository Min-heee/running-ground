import * as Location from 'expo-location';
import { appendTrackedLocation } from '@/features/runs/tracking/background/routeAccumulator';
import { rgPerfTrackResource } from '@/utils/rgPerfTrace';

let foregroundLocationSubscription: { remove: () => void } | null = null;
let stopForegroundLocationTrace: (() => void) | null = null;

// CROSS-DEVICE SAMPLING PARITY — must mirror the bg-task options (locationTask.ts). Both streams
// feed appendTrackedLocation simultaneously (locationTaskPolicy), so the effective input is their
// UNION: if the foreground watch kept its old 4m displacement pre-gate, it would re-introduce on
// Android the very displacement filtering the bg stream no longer has (on iOS the 0m bg stream
// dominated anyway, which is why the two platforms diverged). distanceInterval 0 + timeInterval
// 1000 keeps the union platform-identical; duplicates and surplus fixes are dropped cheaply by the
// shared MIN_LOCATION_TIME_DELTA_MS (900ms) gate at the top of the filter chain.
const FOREGROUND_LOCATION_TIME_INTERVAL_MS = 1000;
const FOREGROUND_LOCATION_DISTANCE_INTERVAL_M = 0;

function buildForegroundLocationOptions(mayShowUserSettingsDialog: boolean): Location.LocationOptions {
  return {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: FOREGROUND_LOCATION_TIME_INTERVAL_MS,
    distanceInterval: FOREGROUND_LOCATION_DISTANCE_INTERVAL_M,
    mayShowUserSettingsDialog,
  };
}

export function hasForegroundLocationWatch() {
  return Boolean(foregroundLocationSubscription);
}

export function stopForegroundLocationWatch() {
  foregroundLocationSubscription?.remove();
  foregroundLocationSubscription = null;
  stopForegroundLocationTrace?.();
  stopForegroundLocationTrace = null;
}

export type StartForegroundLocationWatchOptions = {
  // Android location-settings popup. Automatic re-arms (the manager core's silent retry) MUST
  // pass false — a retry can fire with the user mid-run or mid-lock and must never surface a
  // system dialog. Only user-intent start paths keep the default true.
  mayShowUserSettingsDialog?: boolean;
};

// Resolves true when the watch is live after this call. A failed watchPositionAsync is swallowed
// on purpose (never reject: the detached start path fire-and-forgets, so a rejection would
// vanish) — this boolean is the only channel that carries the failure to the policy/manager
// layers, which own recording + retry.
export async function startForegroundLocationWatch(
  options?: StartForegroundLocationWatchOptions,
): Promise<boolean> {
  if (foregroundLocationSubscription) {
    return true;
  }

  try {
    foregroundLocationSubscription = await Location.watchPositionAsync(
      buildForegroundLocationOptions(options?.mayShowUserSettingsDialog ?? true),
      appendTrackedLocation,
    );
    stopForegroundLocationTrace = rgPerfTrackResource('watcher', 'foreground location watch', {
      distanceInterval: FOREGROUND_LOCATION_DISTANCE_INTERVAL_M,
      timeInterval: FOREGROUND_LOCATION_TIME_INTERVAL_MS,
    });
    return true;
  } catch {
    foregroundLocationSubscription = null;
    stopForegroundLocationTrace?.();
    stopForegroundLocationTrace = null;
    return false;
  }
}
