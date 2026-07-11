// CHECKPOINT STALE-FALLBACK (2026-07-10) — the common-checkpoint comparison is fair but
// FRAGILE: it advances only when BOTH runners' server rows advance, so one side's dead push
// channel pins the whole head-to-head display (both dots frozen) even while the opponent's
// data keeps arriving. This tiny module-level tracker remembers when the official duel
// checkpoint last ADVANCED; once it has been pinned longer than the stall window the display
// model degrades to the raw last-received comparison (footer flips off '서버 공식'), so the
// screen keeps moving during transport hiccups and the fair comparison resumes automatically
// the moment the checkpoint advances again. Module state (not React state) on purpose: the
// display model is a pure per-render function, and renders are driven by arriving data — the
// exact circumstance where the fallback matters.

export const OFFICIAL_CHECKPOINT_STALE_MS = 15_000;

let tracked: { matchId: string; checkpointSeconds: number; advancedAtMs: number } | null = null;

export function isOfficialDuelCheckpointStale(
  matchId: string,
  checkpointSeconds: number,
  nowMs: number = Date.now(),
  staleMs: number = OFFICIAL_CHECKPOINT_STALE_MS,
): boolean {
  // New match, first sighting, or ANY movement (forward normally; backward on a server
  // restart/new session) re-arms the freshness window.
  if (
    !tracked
    || tracked.matchId !== matchId
    || tracked.checkpointSeconds !== checkpointSeconds
  ) {
    tracked = { matchId, checkpointSeconds, advancedAtMs: nowMs };
    return false;
  }

  return nowMs - tracked.advancedAtMs > staleMs;
}

export function __resetOfficialCheckpointStalenessForTest() {
  tracked = null;
}
