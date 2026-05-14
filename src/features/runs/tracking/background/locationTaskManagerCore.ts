import type { AppStateStatus } from 'react-native';
import type { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import type { LocationTaskPolicy } from '@/features/runs/tracking/background/subscriptions';

export type ManagedLocationTaskOptions = LocationTaskPolicy & {
  detachLocationTask?: boolean;
  trackingKey?: string | null;
};

export type LocationTaskManagerAdapter = {
  startLocationTask: (policy: LocationTaskPolicy) => Promise<void>;
  stopLocationTaskIfNeeded: () => Promise<void>;
  mark: typeof rgPerfMark;
  measureStart: typeof rgPerfMeasureStart;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

type PendingAppStateSync = {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
};

const APP_STATE_LOCATION_TASK_DEBOUNCE_MS = 500;
const LOCATION_TASK_START_TIMEOUT_MS = 3_000;

function buildManagedLocationTaskKey(options?: ManagedLocationTaskOptions) {
  return [
    options?.trackingKey ?? 'run',
    options?.appState ?? 'active',
  ].join(':');
}

function resolveManagedAppState(options?: ManagedLocationTaskOptions) {
  return options?.appState ?? 'active';
}

function isForegroundActiveTask(options?: ManagedLocationTaskOptions) {
  return resolveManagedAppState(options) === 'active';
}

export function createLocationTaskManager(adapter: LocationTaskManagerAdapter) {
  let activeLocationTaskKey: string | null = null;
  let locationTaskStartRequest: { key: string; promise: Promise<void> } | null = null;
  let pendingAppStateSync: PendingAppStateSync | null = null;
  let locationTaskGeneration = 0;

  const startLocationTaskWithTrace = async (options?: ManagedLocationTaskOptions) => {
    const taskKey = buildManagedLocationTaskKey(options);
    const appState = resolveManagedAppState(options);
    const isForegroundActive = isForegroundActiveTask(options);

    if (isForegroundActive && options?.detachLocationTask && !options.trackingKey) {
      adapter.mark('background task start canceled before native call', {
        appState,
        taskKey,
        trackingKey: null,
      });
      return;
    }

    if (locationTaskStartRequest?.key === taskKey) {
      adapter.mark('background task start skipped already starting', {
        appState,
        taskKey,
        trackingKey: options?.trackingKey ?? null,
      });
      return locationTaskStartRequest.promise;
    }

    if (activeLocationTaskKey === taskKey) {
      adapter.mark('background task start skipped already started', {
        appState,
        taskKey,
        trackingKey: options?.trackingKey ?? null,
      });
      return;
    }

    if (isForegroundActive) {
      adapter.mark('background task start blocked foreground', {
        appState,
        taskKey,
        trackingKey: options?.trackingKey ?? null,
      });
    }

    const traceLabel = isForegroundActive ? 'GPS tracking start' : 'background task start';
    const endLocationTaskStartTrace = adapter.measureStart(traceLabel, {
      appState,
      detached: Boolean(options?.detachLocationTask),
      taskKey,
      trackingKey: options?.trackingKey ?? null,
    });
    const startGeneration = locationTaskGeneration;
    let traceEnded = false;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finishTrace = (detail: Record<string, string | number | boolean | null>) => {
      if (traceEnded) {
        return;
      }

      traceEnded = true;
      if (timeoutId) {
        adapter.clearTimeout(timeoutId);
        timeoutId = null;
      }
      endLocationTaskStartTrace(detail);
    };

    const markIgnoredLateResult = (reason: string) => {
      adapter.mark('background task start ignored stale appState', {
        appState,
        reason,
        taskKey,
        trackingKey: options?.trackingKey ?? null,
      });
    };

    const nativeStartPromise = adapter.startLocationTask({ appState })
      .then(() => {
        if (timedOut) {
          markIgnoredLateResult('timed out');
          return;
        }

        if (
          locationTaskGeneration === startGeneration
          && locationTaskStartRequest?.key === taskKey
        ) {
          activeLocationTaskKey = taskKey;
          finishTrace({ success: true });
          return;
        }

        markIgnoredLateResult('generation changed');
        finishTrace({ success: false, stale: true });
      })
      .catch((taskError) => {
        if (timedOut) {
          markIgnoredLateResult('timed out error');
          return;
        }

        finishTrace({ success: false });
        throw taskError;
      })
      .finally(() => {
        if (timeoutId) {
          adapter.clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (
          locationTaskGeneration === startGeneration
          && locationTaskStartRequest?.key === taskKey
        ) {
          locationTaskStartRequest = null;
        }
      });

    const startPromise = isForegroundActive
      ? nativeStartPromise
      : Promise.race([
        nativeStartPromise,
        new Promise<void>((resolve) => {
          timeoutId = adapter.setTimeout(() => {
            timedOut = true;
            adapter.mark('background task start timed out detached', {
              appState,
              taskKey,
              timeoutMs: LOCATION_TASK_START_TIMEOUT_MS,
              trackingKey: options?.trackingKey ?? null,
            });
            finishTrace({ success: false, timedOut: true });
            resolve();
          }, LOCATION_TASK_START_TIMEOUT_MS);
        }),
      ]);

    locationTaskStartRequest = { key: taskKey, promise: startPromise };
    return startPromise;
  };

  const startManagedLocationTask = async (options?: ManagedLocationTaskOptions) => {
    if (options?.detachLocationTask) {
      adapter.mark('GPS tracking start detached from navigation', {
        appState: options?.appState ?? null,
        trackingKey: options.trackingKey ?? null,
      });
      void startLocationTaskWithTrace(options).catch(() => {
        // Location task startup is best-effort after the UI has already become interactive.
      });
      return;
    }

    await startLocationTaskWithTrace(options);
  };

  const stopManagedLocationTask = async () => {
    if (pendingAppStateSync) {
      adapter.clearTimeout(pendingAppStateSync.timer);
      pendingAppStateSync.resolve();
      pendingAppStateSync = null;
    }

    activeLocationTaskKey = null;
    locationTaskStartRequest = null;
    locationTaskGeneration += 1;
    await adapter.stopLocationTaskIfNeeded();
  };

  const syncManagedLocationTaskAppState = (
    appState: AppStateStatus,
    options?: Pick<ManagedLocationTaskOptions, 'trackingKey'> & { debounceMs?: number },
  ) => {
    if (pendingAppStateSync) {
      adapter.clearTimeout(pendingAppStateSync.timer);
      pendingAppStateSync.resolve();
      pendingAppStateSync = null;
    }

    return new Promise<void>((resolve) => {
      const timer = adapter.setTimeout(() => {
        pendingAppStateSync = null;
        void startManagedLocationTask({
          appState,
          trackingKey: options?.trackingKey,
        }).finally(resolve);
      }, options?.debounceMs ?? APP_STATE_LOCATION_TASK_DEBOUNCE_MS);

      pendingAppStateSync = { resolve, timer };
    });
  };

  return {
    startManagedLocationTask,
    stopManagedLocationTask,
    syncManagedLocationTaskAppState,
  };
}
