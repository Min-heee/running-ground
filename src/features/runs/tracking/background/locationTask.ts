import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  flushBackgroundMatchProgressSync,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import { appendTrackedLocation } from '@/features/runs/tracking/background/routeAccumulator';
import {
  BACKGROUND_RUN_TASK_NAME,
  LEGACY_BACKGROUND_RUN_TASK_NAME,
} from '@/features/runs/tracking/background/locationTaskNames';

export {
  BACKGROUND_RUN_TASK_NAME,
  LEGACY_BACKGROUND_RUN_TASK_NAME,
} from '@/features/runs/tracking/background/locationTaskNames';

export function buildLocationTaskOptions(): Location.LocationTaskOptions {
  const isIOS = Platform.OS === 'ios';

  return {
    accuracy: Location.Accuracy.BestForNavigation,
    // Fix A.4 — tighten the iOS background location cadence so the location-task callback (the
    // only surviving screen-off trigger for the progress flush) fires as often as iOS will deliver.
    // iOS gets distanceInterval 0 ("deliver every fix, do not gate on distance moved") so even a
    // stationary/slow runner keeps emitting fixes that drive the flush AND tick the native
    // CLLocationManager-backed re-POST. Android stays conservative (4m) to avoid worsening the known
    // Android JS-thread saturation lag (#195/#201) and battery — Android already has the time-based
    // ScheduledExecutorService + native-thread uploader, so it does not need a tighter GPS cadence.
    timeInterval: 2000,
    distanceInterval: isIOS ? 0 : 4,
    // iOS deferred-updates: keep them OFF so iOS does not batch/withhold fixes in the background
    // (batched delivery is what lets the screen-off flush go stale). A 0 distance/interval means
    // "deliver each fix immediately" rather than deferring.
    ...(isIOS
      ? {
          deferredUpdatesInterval: 0,
          deferredUpdatesDistance: 0,
        }
      : {}),
    mayShowUserSettingsDialog: true,
    // activityType fitness already biases iOS toward frequent pedestrian fixes.
    activityType: Location.ActivityType.Fitness,
    // pausesUpdatesAutomatically=false so iOS never auto-pauses background updates mid-run.
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    ...(Platform.OS === 'android'
      ? {
          foregroundService: {
            notificationTitle: 'RunningGround가 러닝을 측정 중이에요',
            notificationBody: '백그라운드에서도 거리와 경로를 계속 기록하고 있어요.',
          },
        }
      : {}),
  };
}

function defineBackgroundRunTask(taskName: string) {
  if (TaskManager.isTaskDefined(taskName)) {
    return;
  }

  TaskManager.defineTask(taskName, async ({ data, error }) => {
    if (error || !data) {
      return;
    }

    const locations = Array.isArray((data as { locations?: Location.LocationObject[] }).locations)
      ? (data as { locations?: Location.LocationObject[] }).locations ?? []
      : [];

    locations.forEach(appendTrackedLocation);
    // Fix A.3 — fire-and-forget. Do NOT await the flush: a stuck/hung background push must never
    // wedge the native location-task callback (which is what keeps the GPS route buffer + distance
    // accumulating). The flush has its own single-flight + stale-reclaim + per-request timeout, so
    // it self-heals. Swallow errors here so a rejected push can never surface as an unhandled
    // rejection out of the task callback.
    void flushBackgroundMatchProgressSync({ platform: Platform.OS }).catch(() => false);
  });
}

if (Platform.OS !== 'web') {
  defineBackgroundRunTask(BACKGROUND_RUN_TASK_NAME);
  defineBackgroundRunTask(LEGACY_BACKGROUND_RUN_TASK_NAME);
}
