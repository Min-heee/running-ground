// C-1 (finish-flow hang plan 2026-07-07) — pure phase model for the 결과 저장 중 overlay
// watchdog. The overlay used to be able to sit forever: every timeout in the save chain is a
// JS setTimeout that SUSPENDS while the app is backgrounded (H1), so nothing ever re-evaluated
// the overlay. The watchdog is therefore WALL-CLOCK based: callers compute
// `Date.now() - startMs` and feed the delta here, so a suspended-timer gap (screen off for 10
// minutes, app-switch, …) is fully counted the moment the app resumes and immediately jumps
// the overlay to the right phase.
//
// Phases (thresholds are cumulative wall-clock time since the overlay became visible):
//   'saving'     <12s  — normal copy, nothing extra.
//   'slow'       ≥12s  — honest sub-copy: the server is slow but the save is still running.
//   'exit-offer' ≥20s  — additionally offer 기다리지 않고 나가기 (abandon the WAIT, not the save).
//   'expired'    ≥40s  — hard cap: auto-invoke the abandon once; the overlay must never be
//                        infinite.

export type MatchEndOverlayWatchdogPhase = 'saving' | 'slow' | 'exit-offer' | 'expired';

export const MATCH_END_OVERLAY_SLOW_MS = 12_000;
export const MATCH_END_OVERLAY_EXIT_OFFER_MS = 20_000;
export const MATCH_END_OVERLAY_EXPIRED_MS = 40_000;

export function resolveOverlayWatchdogPhase(elapsedMs: number): MatchEndOverlayWatchdogPhase {
  if (elapsedMs >= MATCH_END_OVERLAY_EXPIRED_MS) {
    return 'expired';
  }
  if (elapsedMs >= MATCH_END_OVERLAY_EXIT_OFFER_MS) {
    return 'exit-offer';
  }
  if (elapsedMs >= MATCH_END_OVERLAY_SLOW_MS) {
    return 'slow';
  }
  return 'saving';
}
