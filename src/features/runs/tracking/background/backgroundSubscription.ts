import * as Location from 'expo-location';
import {
  BACKGROUND_RUN_TASK_NAME,
  BACKGROUND_LOCATION_TASK_NAMES,
} from '@/features/runs/tracking/background/locationTaskNames';
import { buildLocationTaskOptions } from '@/features/runs/tracking/background/locationTask';
import { rgPerfMark, rgPerfTrackResource } from '@/utils/rgPerfTrace';

let stopBackgroundLocationTaskTrace: (() => void) | null = null;
let backgroundLocationTaskStartPromise: Promise<boolean> | null = null;
let backgroundLocationTaskKnownStarted = false;
let shouldKeepBackgroundLocationTask = false;

const BACKGROUND_TASK_START_TIMEOUT_MS = 4_000;

async function stopBackgroundLocationTaskByName(taskName: string) {
  const started = await Location.hasStartedLocationUpdatesAsync(taskName);

  if (started) {
    await Location.stopLocationUpdatesAsync(taskName);
  }
}

async function runBackgroundLocationTaskStart() {
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

    if (!shouldKeepBackgroundLocationTask) {
      await stopBackgroundLocationTaskByName(BACKGROUND_RUN_TASK_NAME);
      return false;
    }

    stopBackgroundLocationTaskTrace = rgPerfTrackResource('watcher', 'background location task', {
      taskName: BACKGROUND_RUN_TASK_NAME,
    });
    return true;
  } catch {
    // Foreground tracking is enough while the race screen is open; background updates are best-effort.
    return false;
  }
}

function withBackgroundStartTimeout(startPromise: Promise<boolean>) {
  return new Promise<boolean>((resolve) => {
    const timeoutId = setTimeout(() => {
      rgPerfMark('background task start deferred because timeout', {
        taskName: BACKGROUND_RUN_TASK_NAME,
        timeoutMs: BACKGROUND_TASK_START_TIMEOUT_MS,
      });
      resolve(false);
    }, BACKGROUND_TASK_START_TIMEOUT_MS);

    startPromise
      .then((started) => {
        clearTimeout(timeoutId);
        resolve(started);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve(false);
      });
  });
}

export async function stopBackgroundLocationTasksIfNeeded() {
  shouldKeepBackgroundLocationTask = false;

  for (const taskName of BACKGROUND_LOCATION_TASK_NAMES) {
    await stopBackgroundLocationTaskByName(taskName);
  }

  backgroundLocationTaskKnownStarted = false;
  stopBackgroundLocationTaskTrace?.();
  stopBackgroundLocationTaskTrace = null;
}

export async function startBackgroundLocationTaskIfNeeded() {
  shouldKeepBackgroundLocationTask = true;

  if (backgroundLocationTaskKnownStarted) {
    rgPerfMark('background task start skipped already started', {
      taskName: BACKGROUND_RUN_TASK_NAME,
    });
    return true;
  }

  if (backgroundLocationTaskStartPromise) {
    rgPerfMark('background task start skipped already starting', {
      taskName: BACKGROUND_RUN_TASK_NAME,
    });
    return withBackgroundStartTimeout(backgroundLocationTaskStartPromise);
  }

  backgroundLocationTaskStartPromise = runBackgroundLocationTaskStart()
    .then((started) => {
      backgroundLocationTaskKnownStarted = started;
      return started;
    })
    .finally(() => {
      backgroundLocationTaskStartPromise = null;
    });

  return withBackgroundStartTimeout(backgroundLocationTaskStartPromise);
}
