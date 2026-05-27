import {
  resetBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import type { SaveTrackingOptions } from '@/features/runs/hooks/useRunTracking';
import { forceResetRunningMatchState } from '@/services';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import type { UseRunSaveFlowInput } from './types';

type RunCleanupAfterSaveInput = Pick<
  UseRunSaveFlowInput,
  | 'autoStartedMatchIdRef'
  | 'officialStartBaselineRef'
  | 'preStartWarmupMatchIdRef'
  | 'resetForegroundTrackingState'
  | 'setStatus'
  | 'syncLiveSharing'
> & {
  forceResetRunningMatchStateAfterSave: boolean;
  options: SaveTrackingOptions;
};

export async function runCleanupAfterSave({
  autoStartedMatchIdRef,
  forceResetRunningMatchStateAfterSave,
  officialStartBaselineRef,
  options,
  preStartWarmupMatchIdRef,
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

  if (forceResetRunningMatchStateAfterSave) {
    try {
      const payload = await forceResetRunningMatchState();
      rgPerfMark('running match force reset after save', {
        cleaned: payload.cleaned,
        cleanedItems: payload.cleanedItems.join(','),
      });
    } catch (error) {
      rgPerfMark('running match force reset after save failed', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (options.resetAfterSave) {
    await resetBackgroundRunTracking();
    resetForegroundTrackingState();
    setStatus('idle');
  }
}
