import * as Location from 'expo-location';
import {
  BACKGROUND_RUN_TASK_NAME,
  BACKGROUND_LOCATION_TASK_NAMES,
} from '@/features/runs/tracking/background/locationTaskNames';
import {
  recordBackgroundTaskAttempt,
  recordBackgroundTaskFailed,
  recordBackgroundTaskStarted,
} from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import { buildLocationTaskOptions } from '@/features/runs/tracking/background/locationTask';
import { rgPerfMark, rgPerfTrackResource } from '@/utils/rgPerfTrace';

let stopBackgroundLocationTaskTrace: (() => void) | null = null;
let backgroundLocationTaskStartPromise: Promise<boolean> | null = null;
let backgroundLocationTaskKnownStarted = false;
let shouldKeepBackgroundLocationTask = false;
let backgroundLocationTaskGeneration = 0;

const BACKGROUND_TASK_START_TIMEOUT_MS = 3_000;

async function stopBackgroundLocationTaskByName(taskName: string) {
  const started = await Location.hasStartedLocationUpdatesAsync(taskName);

  if (started) {
    await Location.stopLocationUpdatesAsync(taskName);
  }
}

function isStaleBackgroundTaskStart(startGeneration: number) {
  return backgroundLocationTaskGeneration !== startGeneration || !shouldKeepBackgroundLocationTask;
}

function markStaleBackgroundTaskStart(reason: string) {
  rgPerfMark('background task start ignored stale appState', {
    reason,
    taskName: BACKGROUND_RUN_TASK_NAME,
  });
}

async function runBackgroundLocationTaskStart(startGeneration: number) {
  if (isStaleBackgroundTaskStart(startGeneration)) {
    rgPerfMark('background task start canceled before native call', {
      taskName: BACKGROUND_RUN_TASK_NAME,
    });
    recordBackgroundTaskFailed('background task start canceled before native call');
    return false;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME);

  if (isStaleBackgroundTaskStart(startGeneration)) {
    const reason = 'generation changed before native start';
    markStaleBackgroundTaskStart(reason);
    recordBackgroundTaskFailed(reason);
    return false;
  }

  if (started) {
    if (!stopBackgroundLocationTaskTrace) {
      stopBackgroundLocationTaskTrace = rgPerfTrackResource('watcher', 'background location task', {
        taskName: BACKGROUND_RUN_TASK_NAME,
      });
    }
    recordBackgroundTaskStarted();
    return true;
  }

  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME, buildLocationTaskOptions());

    if (isStaleBackgroundTaskStart(startGeneration)) {
      const reason = 'generation changed after native start';
      markStaleBackgroundTaskStart(reason);
      recordBackgroundTaskFailed(reason);
      await stopBackgroundLocationTaskByName(BACKGROUND_RUN_TASK_NAME);
      return false;
    }

    stopBackgroundLocationTaskTrace = rgPerfTrackResource('watcher', 'background location task', {
      taskName: BACKGROUND_RUN_TASK_NAME,
    });
    recordBackgroundTaskStarted();
    return true;
  } catch (error) {
    // Foreground tracking is enough while the race screen is open; background updates are best-effort.
    const errorMessage = error instanceof Error ? error.message : String(error);
    rgPerfMark('background location task start failed', {
      errorMessage,
      taskName: BACKGROUND_RUN_TASK_NAME,
    });
    recordBackgroundTaskFailed(errorMessage);
    return false;
  }
}

function withBackgroundStartTimeout(startPromise: Promise<boolean>) {
  return new Promise<boolean>((resolve) => {
    const timeoutId = setTimeout(() => {
      recordBackgroundTaskFailed('background task start timed out');
      rgPerfMark('background task start timed out detached', {
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
  if (backgroundLocationTaskStartPromise) {
    rgPerfMark('background task start canceled before native call', {
      taskName: BACKGROUND_RUN_TASK_NAME,
    });
  }

  shouldKeepBackgroundLocationTask = false;
  backgroundLocationTaskGeneration += 1;

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
    recordBackgroundTaskStarted();
    rgPerfMark('background task start skipped already started', {
      taskName: BACKGROUND_RUN_TASK_NAME,
    });
    return true;
  }

  recordBackgroundTaskAttempt();
  rgPerfMark('bg task: attempting start', {
    alreadyStarting: Boolean(backgroundLocationTaskStartPromise),
    taskName: BACKGROUND_RUN_TASK_NAME,
  });

  if (backgroundLocationTaskStartPromise) {
    rgPerfMark('background task start skipped already starting', {
      taskName: BACKGROUND_RUN_TASK_NAME,
    });
    return withBackgroundStartTimeout(backgroundLocationTaskStartPromise);
  }

  const startGeneration = backgroundLocationTaskGeneration;

  backgroundLocationTaskStartPromise = runBackgroundLocationTaskStart(startGeneration)
    .then((started) => {
      if (backgroundLocationTaskGeneration === startGeneration) {
        backgroundLocationTaskKnownStarted = started;
      }
      return started;
    })
    .finally(() => {
      backgroundLocationTaskStartPromise = null;
    });

  return withBackgroundStartTimeout(backgroundLocationTaskStartPromise);
}
