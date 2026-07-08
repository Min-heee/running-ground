import type { MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';

// FIX-D1 (2026-07-09) — pure gating for the watchdog overlay on PLAIN match-attached saves.
//
// Field incident: the manual '러닝 종료하고 저장' save of a (demoted) duel run showed only the
// bare LiveMatchSavingIndicator spinner for 13-14s because MatchEndTransitionOverlay is set
// exclusively by the forfeit/exit command family (setMatchLeaving). These helpers decide when
// useRunSaveCommand should raise the same isLeavingDuel/GroupMatch flag itself so EVERY
// match-attached save gets the overlay's 12s/20s/40s watchdog — while pure solo saves keep
// the small spinner, and forfeit-family callers (which already own the flag) are left alone.

export type MatchSaveLeavingInput = {
  // The matchId the save resolved (live runtime, pending context, or goal-freeze fallback).
  activeMatchId: string | null;
  // The verdict/pending blob the save will attach (live, override, or pending-context backfill).
  hasResolvedMatchResult: boolean;
  // The mode the save resolved for the pending context / synthesized blob ('duel'|'group'|null).
  resolvedMatchMode: MatchExitSource | null;
  // True when the caller navigates itself AND already manages setMatchLeaving — today that is
  // exactly the forfeit-command family, whose one marker on SaveTrackingOptions is
  // skipPostProcessorNavigation. Raising/clearing the flag again from inside the save would
  // drop the caller's overlay early (finally runs before the caller's own navigation).
  callerManagesMatchLeaving: boolean;
};

// Which isLeaving flag the plain save should raise for its own duration, or null to keep
// today's small-spinner behavior.
export function resolveMatchSaveLeavingSource({
  activeMatchId,
  hasResolvedMatchResult,
  resolvedMatchMode,
  callerManagesMatchLeaving,
}: MatchSaveLeavingInput): MatchExitSource | null {
  if (callerManagesMatchLeaving) {
    return null;
  }
  if (!activeMatchId && !hasResolvedMatchResult) {
    return null;
  }
  // Keyed on matchId/matchResult presence, NOT matchMode: the incident save had already been
  // demoted to matchMode='solo', so the freeze-restored matchId is the only reliable signal.
  return resolvedMatchMode === 'group' ? 'group' : 'duel';
}

// C-1 abandon composition: the overlay watchdog's abandon bumps the save-navigation epoch and
// hides the overlay. If the epoch moved while THIS save (which raised the overlay) was in
// flight, the user already escaped the wait — a router.replace now would yank them out of
// whatever they are doing. Mirrors saveForfeitResultAndNavigate's entry-epoch check.
export function shouldSuppressPostSaveNavigation({
  matchLeavingSource,
  entrySaveNavEpoch,
  currentSaveNavEpoch,
}: {
  matchLeavingSource: MatchExitSource | null;
  entrySaveNavEpoch: number;
  currentSaveNavEpoch: number;
}): boolean {
  return matchLeavingSource !== null && currentSaveNavEpoch !== entrySaveNavEpoch;
}
