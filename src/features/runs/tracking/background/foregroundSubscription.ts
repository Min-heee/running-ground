import * as Location from 'expo-location';
import { appendTrackedLocation } from '@/features/runs/tracking/background/routeAccumulator';

let foregroundLocationSubscription: { remove: () => void } | null = null;

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
  } catch {
    foregroundLocationSubscription = null;
  }
}
