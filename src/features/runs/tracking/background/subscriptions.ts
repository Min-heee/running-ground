import { Platform } from 'react-native';
import * as Location from 'expo-location';
import {
  BACKGROUND_RUN_TASK_NAME,
  buildLocationTaskOptions,
  LEGACY_BACKGROUND_RUN_TASK_NAME,
} from '@/features/runs/tracking/background/locationTask';
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

export async function stopLocationTaskIfNeeded() {
  if (Platform.OS === 'web') {
    return;
  }

  foregroundLocationSubscription?.remove();
  foregroundLocationSubscription = null;

  for (const taskName of [BACKGROUND_RUN_TASK_NAME, LEGACY_BACKGROUND_RUN_TASK_NAME]) {
    const started = await Location.hasStartedLocationUpdatesAsync(taskName);

    if (started) {
      await Location.stopLocationUpdatesAsync(taskName);
    }
  }
}

export async function startLocationTask() {
  if (Platform.OS === 'web') {
    return;
  }

  await stopLocationTaskIfNeeded();

  try {
    foregroundLocationSubscription = await Location.watchPositionAsync(
      buildForegroundLocationOptions(),
      appendTrackedLocation,
    );
  } catch {
    foregroundLocationSubscription = null;
  }

  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME, buildLocationTaskOptions());
  } catch {
    // Foreground tracking is enough while the race screen is open; background updates are best-effort.
  }
}
