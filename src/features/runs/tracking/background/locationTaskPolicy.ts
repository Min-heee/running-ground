import type { AppStateStatus } from 'react-native';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export type LocationTaskPlatform = 'android' | 'ios' | 'web' | string;

export type LocationTaskPolicy = {
  appState?: AppStateStatus;
  // Routed through to the foreground watch's mayShowUserSettingsDialog so an AUTOMATIC start
  // (the manager core's silent retry) can never pop Android's location-settings dialog.
  // User-intent starts omit it (default true → unchanged behavior).
  allowUserSettingsDialog?: boolean;
};

// Resolve-value start report. This funnel deliberately never rejects for "a piece didn't start"
// (the detached start path fire-and-forgets, so a rejection would vanish) — this outcome is the
// only channel that carries partial failure up to the manager, which must NOT record the
// pipeline as armed unless fullyArmed is true.
export type LocationTaskStartOutcome = {
  // Every piece THIS policy branch required is actually running.
  fullyArmed: boolean;
  // null = the branch did not need that piece.
  foregroundWatchActive: boolean | null;
  backgroundTaskStarted: boolean | null;
};

export type LocationTaskControllerAdapter = {
  platform: LocationTaskPlatform;
  startForegroundLocationWatch: (
    options?: { mayShowUserSettingsDialog?: boolean },
  ) => Promise<boolean>;
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
  let locationTaskOperation: Promise<unknown> = Promise.resolve();

  const enqueueLocationTaskOperation = <T>(operation: () => Promise<T>) => {
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

  const startLocationTask = async (policy: LocationTaskPolicy = {}): Promise<LocationTaskStartOutcome> => {
    if (adapter.platform === 'web') {
      return { fullyArmed: true, foregroundWatchActive: null, backgroundTaskStarted: null };
    }

    return enqueueLocationTaskOperation(async (): Promise<LocationTaskStartOutcome> => {
      const appState = policy.appState ?? 'active';
      const useForegroundLocationWatch = shouldUseForegroundLocationWatch(adapter.platform, appState);
      const useBackgroundLocationTask = shouldUseBackgroundLocationTask(adapter.platform, appState);
      const foregroundWatchOptions = {
        mayShowUserSettingsDialog: policy.allowUserSettingsDialog ?? true,
      };

      if (adapter.platform === 'android' && useForegroundLocationWatch && !useBackgroundLocationTask) {
        rgPerfMark('background task start blocked foreground', {
          appState,
        });
      }

      if (useForegroundLocationWatch && useBackgroundLocationTask) {
        const foregroundWatchActive = await adapter.startForegroundLocationWatch(foregroundWatchOptions);
        const backgroundTaskStarted = await adapter.startBackgroundLocationTaskIfNeeded();
        return {
          fullyArmed: foregroundWatchActive && backgroundTaskStarted,
          foregroundWatchActive,
          backgroundTaskStarted,
        };
      }

      if (useForegroundLocationWatch) {
        const foregroundWatchActive = await adapter.startForegroundLocationWatch(foregroundWatchOptions);
        await adapter.stopBackgroundLocationTasksIfNeeded();
        return {
          fullyArmed: foregroundWatchActive,
          foregroundWatchActive,
          backgroundTaskStarted: null,
        };
      }

      if (useBackgroundLocationTask) {
        const backgroundTaskStarted = await adapter.startBackgroundLocationTaskIfNeeded();
        if (backgroundTaskStarted) {
          adapter.stopForegroundLocationWatch();
        }
        return {
          fullyArmed: backgroundTaskStarted,
          foregroundWatchActive: null,
          backgroundTaskStarted,
        };
      }

      await stopLocationTaskIfNeededUnsafe();
      return { fullyArmed: true, foregroundWatchActive: null, backgroundTaskStarted: null };
    });
  };

  return {
    startLocationTask,
    stopLocationTaskIfNeeded,
  };
}
