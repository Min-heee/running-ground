import {
  resetBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import { clearLocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';
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
  // The matchId the just-saved run belonged to (null for a solo/no-match save). Used to release
  // the hands-free-finish goal freeze now that the local record is safely persisted.
  activeMatchId: string | null;
  options: SaveTrackingOptions;
};

export async function runCleanupAfterSave({
  activeMatchId,
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
  // HANDS-FREE FINISH — the save SUCCEEDED (createTrackedRun resolved before this cleanup runs):
  // release the local goal freeze for the saved match. This is one of exactly two clear sites
  // (the other is the resetBackgroundRunTracking-driven discard) — never cleared on server ACK.
  if (activeMatchId) {
    clearLocalGoalFreeze(activeMatchId);
  }
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
