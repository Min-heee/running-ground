import {
  resetBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import type { SaveTrackingOptions } from '@/features/runs/hooks/useRunTracking';
import type { UseRunSaveFlowInput } from './types';

type RunCleanupAfterSaveInput = Pick<
  UseRunSaveFlowInput,
  | 'autoStartedMatchIdRef'
  | 'officialStartBaselineRef'
  | 'preStartWarmupMatchIdRef'
  | 'resetMatchRuntimeAfterTrackingCleared'
  | 'resetForegroundTrackingState'
  | 'setStatus'
  | 'syncLiveSharing'
> & {
  options: SaveTrackingOptions;
};

export async function runCleanupAfterSave({
  autoStartedMatchIdRef,
  officialStartBaselineRef,
  options,
  preStartWarmupMatchIdRef,
  resetMatchRuntimeAfterTrackingCleared,
  resetForegroundTrackingState,
  setStatus,
  syncLiveSharing,
}: RunCleanupAfterSaveInput) {
  await syncLiveSharing({
    enabled: false,
    status: 'idle',
  }).catch(() => {});
  preStartWarmupMatchIdRef.current = null;
  officialStartBaselineRef.current = null;
  autoStartedMatchIdRef.current = null;

  if (options.resetAfterSave) {
    await resetBackgroundRunTracking();
    resetForegroundTrackingState();
    setStatus('idle');
    resetMatchRuntimeAfterTrackingCleared('save-reset');
  }
}
