// FIX-C (2026-07-09) — PURE decision for the hoisted self-end auto-exit (see
// useMatchSelfEndAutoExit for the full story). Kept in its own dependency-light module so the
// regression-prone gating (one-shot latch, single-flight, freeze deadline, countdown exclusion)
// is unit-testable without pulling the save command's service imports into the test runner.

import type { MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';

// Grace between the locally recorded goal crossing and the forced local exit. ZERO on purpose:
// for a DISTANCE goal the local crossing IS the finish — recordLocalGoalFreezeOnce already
// clamps the saved run to the exact at-crossing distance/time, so the result is identical
// whether we exit now or later, and the server 'finished' echo carries no independent judgment
// (it is just my own finish push round-tripping). Waiting for it only made the runner keep
// measuring past the goal (the 7/9 report: notification at 7.00km but 저장중 only ~0.2km later).
// The moment the crossing freeze exists, the exit fires; the echo becomes redundant idempotent
// confirmation. (Kept as a named, injectable param so tests can still exercise a non-zero grace.)
export const LOCAL_GOAL_FREEZE_AUTO_EXIT_GRACE_MS = 0;

export type SelfEndAutoExitKind = 'self-finished' | 'self-forfeited' | 'freeze-deadline';

// Returns which auto-dispatch should fire now, or null. The caller latches its once-per-match
// ref ONLY after this returns non-null — i.e. after every skip condition passed — so a blocked
// tick (isSaving / isLeaving / save single-flight) retries instead of permanently consuming
// the one-shot (the old card's latch-before-dispatch bug).
export function resolveSelfEndAutoExit({
  source,
  matchId,
  isTestMatch,
  selfFinished,
  selfForfeited,
  isLeaving,
  isSaving,
  saveInFlight,
  trackingStatus,
  alreadyDispatchedMatchId,
  freezeCrossedAtMs,
  nowMs,
  graceMs = LOCAL_GOAL_FREEZE_AUTO_EXIT_GRACE_MS,
}: {
  source: MatchExitSource | null;
  matchId: string | null;
  isTestMatch: boolean;
  selfFinished: boolean;
  selfForfeited: boolean;
  isLeaving: boolean;
  isSaving: boolean;
  saveInFlight: boolean;
  trackingStatus: string;
  alreadyDispatchedMatchId: string | null;
  freezeCrossedAtMs: number | null;
  nowMs: number;
  graceMs?: number;
}): SelfEndAutoExitKind | null {
  if (!source || !matchId || isTestMatch) {
    return null;
  }

  // Once per matchId — a new match (new matchId) re-arms automatically.
  if (alreadyDispatchedMatchId === matchId) {
    return null;
  }

  // Single-flight: never dispatch while a save/forfeit is already in flight (FIX-1's
  // saveCommandInFlight) or while an exit command is running (isLeaving). Skipping here does
  // NOT latch — the next tick retries.
  if (isLeaving || isSaving || saveInFlight) {
    return null;
  }

  // Server-echo trigger — identical semantics to the card's old auto-exit (my own endings go
  // straight to the run detail; counterpart-forfeited stays MANUAL on purpose).
  if (selfForfeited) {
    return 'self-forfeited';
  }
  if (selfFinished) {
    return 'self-finished';
  }

  // Local goal-crossing trigger — the PRIMARY finish for a distance goal (grace defaults to 0),
  // ahead of the server echo. Fires ONLY while the tracker is actively recording ('running' also
  // excludes the countdown phase: a freeze for the ACTIVE matchId cannot exist before that
  // match's own crossing, and a stale freeze from a previous match never matches this
  // matchId). Wall-clock measured from the recorded crossedAtIso, so a future-stamped crossing
  // (clock skew) still waits until now catches up.
  if (
    trackingStatus === 'running'
    && typeof freezeCrossedAtMs === 'number'
    && Number.isFinite(freezeCrossedAtMs)
    && nowMs - freezeCrossedAtMs >= graceMs
  ) {
    return 'freeze-deadline';
  }

  return null;
}
