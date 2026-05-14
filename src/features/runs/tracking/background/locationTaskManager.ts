import {
  startLocationTask,
  stopLocationTaskIfNeeded,
} from '@/features/runs/tracking/background/subscriptions';
import {
  createLocationTaskManager,
} from '@/features/runs/tracking/background/locationTaskManagerCore';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

export type {
  ManagedLocationTaskOptions,
} from '@/features/runs/tracking/background/locationTaskManagerCore';

const locationTaskManager = createLocationTaskManager({
  startLocationTask,
  stopLocationTaskIfNeeded,
  mark: rgPerfMark,
  measureStart: rgPerfMeasureStart,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
});

export const startManagedLocationTask = locationTaskManager.startManagedLocationTask;
export const stopManagedLocationTask = locationTaskManager.stopManagedLocationTask;
export const syncManagedLocationTaskAppState = locationTaskManager.syncManagedLocationTaskAppState;
