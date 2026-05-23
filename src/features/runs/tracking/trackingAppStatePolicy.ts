import type { AppStateStatus } from 'react-native';
import type { TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import {
  isBackgroundRunWarmupSnapshot,
} from '@/features/runs/tracking/background/warmupSnapshotPolicy';
import type {
  BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background/snapshotStore';
import type { UpdateRunningMatchProgressInput } from '@/lib/api/types';

type TrackingAppStateSyncPlanInput = {
  nextState: AppStateStatus;
  previousState: AppStateStatus;
  trackerStatus: TrackerStatus;
};

export type TrackingAppStateSyncPlan = {
  lifecycleStatus: Extract<UpdateRunningMatchProgressInput['status'], 'running' | 'background'> | null;
  locationTaskAppState: AppStateStatus | null;
  locationTaskDelayMs: number | null;
  shouldRefreshStaleArtifacts: boolean;
  shouldSyncBackgroundSnapshot: boolean;
};

export function shouldRunBackgroundElapsedTicker(
  snapshot: BackgroundRunTrackingSnapshot,
  options?: { enabled?: boolean },
) {
  return snapshot.status === 'running'
    && !isBackgroundRunWarmupSnapshot(snapshot)
    && (options?.enabled ?? true);
}

export function resolveTrackingAppStateSyncPlan({
  nextState,
  previousState,
  trackerStatus,
}: TrackingAppStateSyncPlanInput): TrackingAppStateSyncPlan {
  const isRunning = trackerStatus === 'running';

  if (nextState === 'active') {
    return {
      lifecycleStatus: isRunning ? 'running' : null,
      locationTaskAppState: isRunning ? 'active' : null,
      locationTaskDelayMs: isRunning ? 0 : null,
      shouldRefreshStaleArtifacts: true,
      shouldSyncBackgroundSnapshot: true,
    };
  }

  if (
    previousState === 'active'
    && (nextState === 'inactive' || nextState === 'background')
    && isRunning
  ) {
    return {
      lifecycleStatus: 'background',
      locationTaskAppState: nextState,
      locationTaskDelayMs: 400,
      shouldRefreshStaleArtifacts: false,
      shouldSyncBackgroundSnapshot: false,
    };
  }

  return {
    lifecycleStatus: null,
    locationTaskAppState: null,
    locationTaskDelayMs: null,
    shouldRefreshStaleArtifacts: false,
    shouldSyncBackgroundSnapshot: false,
  };
}
