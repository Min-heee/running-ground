// The teardown ordering contract of resetBackgroundRunTracking, extracted pure so fake tests can
// pin the ORDER itself (this funnel's sagas have all been ordering bugs).
//
// ORDER IS THE FIX (TOCTOU zombie GPS, 적대 검증 2026-08-11): the public snapshot must flip to
// idle SYNCHRONOUSLY, BEFORE the awaited native stop. stopManagedLocationTask bumps its
// generation synchronously but then awaits the native stop for 100s of ms (Android multi-task
// loop); with the old order (stop → flip) the snapshot still read 'running' through that whole
// window, so an AppState-debounce intent minted DURING the window passed
// syncBackgroundRunTrackingAppState's status gate and armed GPS for a run that no longer
// existed — and nothing reaped it (the abandoned reaper ignores idle snapshots). Flipping first
// makes every status-gated consumer (app-state sync, warmup backstop, squatter eviction) see the
// truth the moment teardown begins, the same discipline pause and the abandoned reaper already
// follow. Late GPS fixes during the stop-await are dropped by appendTrackedLocation's own
// status gate, so the early flip loses nothing.
export type BackgroundResetSequenceSteps = {
  // Returns the matchId whose periodic persistence was running, or null.
  stopPersistence: () => string | null;
  // Synchronous public-state wipe: snapshot → idle, route accumulator, match progress context.
  resetTrackingStateOnly: () => void;
  emitSnapshot: () => void;
  stopManagedLocationTask: () => Promise<void>;
  clearPersistedSnapshot: (matchId: string | null) => Promise<void>;
  clearGoalFreeze: (matchId: string) => void;
};

export async function runBackgroundResetSequence(steps: BackgroundResetSequenceSteps) {
  const previousMatchId = steps.stopPersistence();
  steps.resetTrackingStateOnly();
  steps.emitSnapshot();
  await steps.stopManagedLocationTask();
  await steps.clearPersistedSnapshot(previousMatchId);
  // HANDS-FREE FINISH — a reset-driven discard drops the local goal freeze together with the
  // persisted snapshot (the user chose to throw the run away, or the post-save reset already ran
  // after runCleanupAfterSave cleared it — double-clearing is a no-op). This is one of exactly
  // two clear sites; the freeze is never cleared on server ACK.
  if (previousMatchId) {
    steps.clearGoalFreeze(previousMatchId);
  }
}
