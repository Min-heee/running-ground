import type { AppStateStatus } from 'react-native';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export type LocationTaskPlatform = 'android' | 'ios' | 'web' | string;

export type LocationTaskPolicy = {
  appState?: AppStateStatus;
};

export type LocationTaskControllerAdapter = {
  platform: LocationTaskPlatform;
  startForegroundLocationWatch: () => Promise<void>;
  stopForegroundLocationWatch: () => void;
  startBackgroundLocationTaskIfNeeded: () => Promise<boolean>;
  stopBackgroundLocationTasksIfNeeded: () => Promise<void>;
};

function shouldUseForegroundLocationWatch(platform: LocationTaskPlatform, appState: AppStateStatus) {
  if (platform === 'web') {
    return false;
  }

  if (platform === 'android') {
    return appState === 'active';
  }

  return true;
}

function shouldUseBackgroundLocationTask(platform: LocationTaskPlatform, appState: AppStateStatus) {
  if (platform === 'web') {
    return false;
  }

  if (platform === 'android') {
    return appState !== 'active';
  }

  return true;
}

export function createLocationTaskController(adapter: LocationTaskControllerAdapter) {
  let locationTaskOperation: Promise<void> = Promise.resolve();

  const enqueueLocationTaskOperation = (operation: () => Promise<void>) => {
    const nextOperation = locationTaskOperation.catch(() => {}).then(operation);
    locationTaskOperation = nextOperation.catch(() => {});
    return nextOperation;
  };

  const stopLocationTaskIfNeededUnsafe = async () => {
    adapter.stopForegroundLocationWatch();
    await adapter.stopBackgroundLocationTasksIfNeeded();
  };

  const stopLocationTaskIfNeeded = async () => {
    if (adapter.platform === 'web') {
      return;
    }

    await enqueueLocationTaskOperation(stopLocationTaskIfNeededUnsafe);
  };

  const startLocationTask = async (policy: LocationTaskPolicy = {}) => {
    if (adapter.platform === 'web') {
      return;
    }

    await enqueueLocationTaskOperation(async () => {
      const appState = policy.appState ?? 'active';
      const useForegroundLocationWatch = shouldUseForegroundLocationWatch(adapter.platform, appState);
      const useBackgroundLocationTask = shouldUseBackgroundLocationTask(adapter.platform, appState);

      if (adapter.platform === 'android' && useForegroundLocationWatch && !useBackgroundLocationTask) {
        rgPerfMark('background task start deferred because foreground active', {
          appState,
        });
      }

      if (useForegroundLocationWatch && useBackgroundLocationTask) {
        await adapter.startForegroundLocationWatch();
        await adapter.startBackgroundLocationTaskIfNeeded();
        return;
      }

      if (useForegroundLocationWatch) {
        await adapter.startForegroundLocationWatch();
        await adapter.stopBackgroundLocationTasksIfNeeded();
        return;
      }

      if (useBackgroundLocationTask) {
        const backgroundTaskReady = await adapter.startBackgroundLocationTaskIfNeeded();
        if (backgroundTaskReady) {
          adapter.stopForegroundLocationWatch();
        }
        return;
      }

      await stopLocationTaskIfNeededUnsafe();
    });
  };

  return {
    startLocationTask,
    stopLocationTaskIfNeeded,
  };
}
