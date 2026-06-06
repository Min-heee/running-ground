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
  return {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    distanceInterval: 4,
    mayShowUserSettingsDialog: true,
    activityType: Location.ActivityType.Fitness,
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
    await flushBackgroundMatchProgressSync({ platform: Platform.OS }).catch(() => false);
  });
}

if (Platform.OS !== 'web') {
  defineBackgroundRunTask(BACKGROUND_RUN_TASK_NAME);
  defineBackgroundRunTask(LEGACY_BACKGROUND_RUN_TASK_NAME);
}
