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

function buildManagedLocationTaskKey(options?: ManagedLocationTaskOptions) {
  return [
    options?.trackingKey ?? 'run',
    options?.appState ?? 'active',
  ].join(':');
}

export function createLocationTaskManager(adapter: LocationTaskManagerAdapter) {
  let activeLocationTaskKey: string | null = null;
  let locationTaskStartRequest: { key: string; promise: Promise<void> } | null = null;
  let pendingAppStateSync: PendingAppStateSync | null = null;
  let locationTaskGeneration = 0;

  const startLocationTaskWithTrace = async (options?: ManagedLocationTaskOptions) => {
    const taskKey = buildManagedLocationTaskKey(options);

    if (locationTaskStartRequest?.key === taskKey) {
      adapter.mark('background task start skipped already starting', {
        appState: options?.appState ?? null,
        taskKey,
        trackingKey: options?.trackingKey ?? null,
      });
      return locationTaskStartRequest.promise;
    }

    if (activeLocationTaskKey === taskKey) {
      adapter.mark('background task start skipped already started', {
        appState: options?.appState ?? null,
        taskKey,
        trackingKey: options?.trackingKey ?? null,
      });
      return;
    }

    const endBackgroundTaskStartTrace = adapter.measureStart('background task start', {
      appState: options?.appState ?? null,
      detached: Boolean(options?.detachLocationTask),
      taskKey,
      trackingKey: options?.trackingKey ?? null,
    });
    const startGeneration = locationTaskGeneration;

    const startPromise = adapter.startLocationTask({ appState: options?.appState })
      .then(() => {
        if (
          locationTaskGeneration === startGeneration
          && locationTaskStartRequest?.key === taskKey
        ) {
          activeLocationTaskKey = taskKey;
        }
        endBackgroundTaskStartTrace({ success: true });
      })
      .catch((taskError) => {
        endBackgroundTaskStartTrace({ success: false });
        throw taskError;
      })
      .finally(() => {
        if (
          locationTaskGeneration === startGeneration
          && locationTaskStartRequest?.key === taskKey
        ) {
          locationTaskStartRequest = null;
        }
      });

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
