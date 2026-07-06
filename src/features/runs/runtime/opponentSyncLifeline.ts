// Opponent-sync lifeline — pure tick decision (docs/opponent-poll-stall-diag-2026-07-06.md,
// Piece 2). The lifeline is a registry-free, render-independent 5s timer — a timer-shaped clone
// of the proven OS-resume recovery path: while a duel/group match is ACTIVE and the app is
// FOREGROUNDED, an accepted match-status apply must have landed within the last 8s; if not, every
// foreground delivery channel (blocking/safety poll, heartbeat apply, linked poll) is provably
// silent and the lifeline fires one guarded status GET through the normal loader funnel. Kept
// pure + RN-free so the fire/skip rule is unit testable under the plain node runner.
export const OPPONENT_SYNC_LIFELINE_INTERVAL_MS = 5_000;
export const OPPONENT_SYNC_LIFELINE_STALE_AFTER_MS = 8_000;

export function shouldFireOpponentSyncLifeline({
  appStateActive,
  inFlight,
  lastAppliedMs,
  matchActive,
  nowMs,
}: {
  appStateActive: boolean;
  inFlight: boolean;
  lastAppliedMs: number;
  matchActive: boolean;
  nowMs: number;
}): boolean {
  if (!appStateActive) {
    // Backgrounded — the background flush/applier owns opponent delivery there.
    return false;
  }

  if (!matchActive) {
    // No active duel/group match: nothing to keep alive.
    return false;
  }

  if (inFlight) {
    // A lifeline fetch is already out — never stack requests.
    return false;
  }

  return nowMs - lastAppliedMs > OPPONENT_SYNC_LIFELINE_STALE_AFTER_MS;
}
