import * as Location from 'expo-location';
import { appendTrackedLocation } from '@/features/runs/tracking/background/routeAccumulator';
import { rgPerfTrackResource } from '@/utils/rgPerfTrace';

let foregroundLocationSubscription: { remove: () => void } | null = null;
let stopForegroundLocationTrace: (() => void) | null = null;

function buildForegroundLocationOptions(): Location.LocationOptions {
  return {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    distanceInterval: 4,
    mayShowUserSettingsDialog: true,
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

export async function startForegroundLocationWatch() {
  if (foregroundLocationSubscription) {
    return;
  }

  try {
    foregroundLocationSubscription = await Location.watchPositionAsync(
      buildForegroundLocationOptions(),
      appendTrackedLocation,
    );
    stopForegroundLocationTrace = rgPerfTrackResource('watcher', 'foreground location watch', {
      distanceInterval: 4,
      timeInterval: 2000,
    });
  } catch {
    foregroundLocationSubscription = null;
    stopForegroundLocationTrace?.();
    stopForegroundLocationTrace = null;
  }
}
