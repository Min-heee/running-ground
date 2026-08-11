import { Platform } from 'react-native';
import {
  startBackgroundLocationTaskIfNeeded,
  stopBackgroundLocationTasksIfNeeded,
} from '@/features/runs/tracking/background/backgroundSubscription';
import {
  startForegroundLocationWatch,
  stopForegroundLocationWatch,
} from '@/features/runs/tracking/background/foregroundSubscription';
import {
  createLocationTaskController,
  type LocationTaskPolicy,
} from '@/features/runs/tracking/background/locationTaskPolicy';

export type {
  LocationTaskPolicy,
  LocationTaskStartOutcome,
} from '@/features/runs/tracking/background/locationTaskPolicy';

const locationTaskController = createLocationTaskController({
  platform: Platform.OS,
  startForegroundLocationWatch,
  stopForegroundLocationWatch,
  startBackgroundLocationTaskIfNeeded,
  stopBackgroundLocationTasksIfNeeded,
});

export async function stopLocationTaskIfNeeded() {
  await locationTaskController.stopLocationTaskIfNeeded();
}

export async function startLocationTask(policy: LocationTaskPolicy = {}) {
  return locationTaskController.startLocationTask(policy);
}
