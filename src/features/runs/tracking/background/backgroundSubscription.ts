import * as Location from 'expo-location';
import {
  BACKGROUND_RUN_TASK_NAME,
  BACKGROUND_LOCATION_TASK_NAMES,
} from '@/features/runs/tracking/background/locationTaskNames';
import { buildLocationTaskOptions } from '@/features/runs/tracking/background/locationTask';
import { rgPerfTrackResource } from '@/utils/rgPerfTrace';

let stopBackgroundLocationTaskTrace: (() => void) | null = null;

export async function stopBackgroundLocationTasksIfNeeded() {
  for (const taskName of BACKGROUND_LOCATION_TASK_NAMES) {
    const started = await Location.hasStartedLocationUpdatesAsync(taskName);

    if (started) {
      await Location.stopLocationUpdatesAsync(taskName);
    }
  }

  stopBackgroundLocationTaskTrace?.();
  stopBackgroundLocationTaskTrace = null;
}

export async function startBackgroundLocationTaskIfNeeded() {
  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME);

  if (started) {
    if (!stopBackgroundLocationTaskTrace) {
      stopBackgroundLocationTaskTrace = rgPerfTrackResource('watcher', 'background location task', {
        taskName: BACKGROUND_RUN_TASK_NAME,
      });
    }
    return true;
  }

  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME, buildLocationTaskOptions());
    stopBackgroundLocationTaskTrace = rgPerfTrackResource('watcher', 'background location task', {
      taskName: BACKGROUND_RUN_TASK_NAME,
    });
    return true;
  } catch {
    // Foreground tracking is enough while the race screen is open; background updates are best-effort.
    return false;
  }
}
