import {
  resetBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import { clearLocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';
import type { SaveTrackingOptions } from '@/features/runs/hooks/useRunTracking';
import { clearPendingMatchSaveContext } from './pendingMatchSaveContext';
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
  // FIX-D2 (2026-07-09) — fire-and-forget: this awaited PATCH /me/live-sharing (error already
  // swallowed, latency fully paid) held the post-save navigation for up to a full RTT against
  // the convoyed droplet. Nothing below reads its result; the synchronous clears that follow
  // (goal freeze, pending context, refs) still run before the caller navigates. Do NOT reorder
  // anything else here — the C-3/C-4 ghost-shell contracts depend on the current sequence.
  void syncLiveSharing({
    enabled: false,
    status: 'idle',
  }).catch(() => {});
  // HANDS-FREE FINISH — the save SUCCEEDED (createTrackedRun resolved before this cleanup runs):
  // release the local goal freeze for the saved match. This is one of exactly two clear sites
  // (the other is the resetBackgroundRunTracking-driven discard) — never cleared on server ACK.
  if (activeMatchId) {
    clearLocalGoalFreeze(activeMatchId);
  }
  // C-2 — the save landed, so the pending match-save context is consumed. Same clear sites as
  // the freeze (save success here + the discard paths), so a stale context can never attach an
  // old match to a future save.
  clearPendingMatchSaveContext();
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
