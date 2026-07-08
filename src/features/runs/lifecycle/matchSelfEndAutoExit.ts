// FIX-C (2026-07-09) — PURE decision for the hoisted self-end auto-exit (see
// useMatchSelfEndAutoExit for the full story). Kept in its own dependency-light module so the
// regression-prone gating (one-shot latch, single-flight, freeze deadline, countdown exclusion)
// is unit-testable without pulling the save command's service imports into the test runner.

import type { MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';

// Grace between the locally recorded goal crossing and the forced local exit. Long enough for
// the healthy server echo (≤2.5s heartbeat tick + RTT) to win and keep today's behavior; short
// enough that a degraded push channel no longer strands the runner on the live screen (the 7/9
// incident sat 13s+ with a recorded crossing and no echo).
export const LOCAL_GOAL_FREEZE_AUTO_EXIT_GRACE_MS = 5_000;

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

  // Freeze-deadline fallback — ONLY while the tracker is actively recording ('running' also
  // excludes the countdown phase: a freeze for the ACTIVE matchId cannot exist before that
  // match's own crossing, and a stale freeze from a previous match never matches this
  // matchId). Wall-clock measured from the recorded crossedAtIso.
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
