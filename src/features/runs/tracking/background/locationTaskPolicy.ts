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

function shouldUseForegroundLocationWatch(platform: LocationTaskPlatform, _appState: AppStateStatus) {
  if (platform === 'web') {
    return false;
  }

  // Android + iOS both run the foreground watch for reliable in-app GPS.
  // (Expo's background task does not fire dependably while foregrounded, so a
  // foreground watch is required; the background FG-service task below covers
  // screen-off / backgrounded tracking.)
  return true;
}

function shouldUseBackgroundLocationTask(platform: LocationTaskPlatform, _appState: AppStateStatus) {
  if (platform === 'web') {
    return false;
  }

  // Keep the foreground-service background task armed for the whole run so
  // screen-off / backgrounded GPS + match progress keep flowing.
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
        rgPerfMark('background task start blocked foreground', {
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
