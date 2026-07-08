// C-2 (finish-flow hang plan 2026-07-07) — module-level context of the LAST attempted match
// save, kept until the save definitively succeeds (runCleanupAfterSave) or the tracking is
// discarded. Why: when a match save FAILS, the catch leaves the tracker 'paused' but the match
// runtime (duel/group statuses, trackedMatchResult, roomLinkedMatchContext) has already been
// wiped — so the paused-shell "이 기록 저장하기" retry used to degrade to a SOLO save: no
// matchId (freeze clamp never reapplied → the goal freeze stayed immortal), no matchResult
// (no 대결 카드, no LP), and no matchSource (a party run could leak into ranked 전적).
//
// This store re-threads {matchId, mode, matchSource, matchResult} into the retry so the saved
// blob is full-fidelity and — critically — the freeze-clear contract stays intact: the freeze
// is cleared ONLY in runCleanupAfterSave (save success, keyed by this matchId) or on a
// resetBackgroundRunTracking-driven discard. In-memory v1: a relaunch loses the context and the
// retry degrades to today's behavior — acceptable, the persisted bg snapshot + freeze survive.

import type { RunMatchResult, RunMatchSource } from '@/domain';
import type { LocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';

export type PendingMatchSaveContext = {
  matchId: string;
  mode: 'duel' | 'group' | null;
  matchSource: RunMatchSource;
  matchResult: RunMatchResult | null;
};

// FIX-A (2026-07-09) — the minimal slice of a goal freeze the third fallback tier consumes.
// A live (un-cleared) freeze proves a crossed-but-unsaved match and carries its matchId plus
// the additive save metadata captured at the record sites.
export type GoalFreezeSaveFallback = Pick<
  LocalGoalFreeze,
  'matchId' | 'crossedAtIso' | 'mode' | 'matchSource'
>;

let pendingMatchSaveContext: PendingMatchSaveContext | null = null;

export function setPendingMatchSaveContext(context: PendingMatchSaveContext) {
  pendingMatchSaveContext = context;
}

export function getPendingMatchSaveContext(): PendingMatchSaveContext | null {
  return pendingMatchSaveContext;
}

// Cleared on save SUCCESS (runCleanupAfterSave) and on both discard paths — mirroring exactly
// where the goal freeze is released, so a stale context can never attach an old match to a
// future unrelated save.
export function clearPendingMatchSaveContext() {
  pendingMatchSaveContext = null;
}

// Pure fallback resolution used by useRunSaveCommand: the live runtime wins whenever it still
// knows the match; the pending context only backfills after the failure path wiped the runtime.
// Never mixes sources — a live matchId keeps the live matchResult/matchSource resolution, a
// pending matchId restores the pending snapshot wholesale.
//
// FIX-A third tier — when BOTH the live runtime and the pending context are gone (the 7/9
// incident: a mid-run vanish demotion wiped the runtime BEFORE any save attempt existed), a
// live goal freeze is the last proof of the crossed match: restore its matchId so the save
// carries the match identity instead of degrading to a plain solo run (+0P, no 대결 card, no
// heal path). matchSource correctness rule: NEVER mislabel a party run as official — the
// in-session party latch (liveMatchSource==='party') wins outright, then the freeze's recorded
// source, and an unprovable source resolves to 'party'.
export function resolvePendingMatchSaveFallbacks({
  liveMatchId,
  liveMatchResult,
  liveMatchSource,
  pendingContext,
  goalFreezes = [],
  runStartedAtIso = null,
}: {
  liveMatchId: string | null;
  liveMatchResult: RunMatchResult | null | undefined;
  liveMatchSource: RunMatchSource;
  pendingContext: PendingMatchSaveContext | null;
  goalFreezes?: GoalFreezeSaveFallback[];
  // ZOMBIE GATE (review FIX_FIRST 2026-07-09) — the start of the run being saved RIGHT NOW.
  // The freeze tier may only consume a freeze whose crossing happened INSIDE this run's
  // window: freezes are cleared solely on save-success/discard, so an orphaned one (goal
  // crossed → app killed → never saved) is immortal and would otherwise hijack a future
  // matchless solo save — attaching a dead matchId AND (via the save-site clamp keyed on
  // that matchId) silently clamping the new run down to the old crossing's distance/time.
  // No provable window (null/unparseable) → the freeze tier is disabled outright: a real
  // crossing always has GPS fixes, so a legitimate save always carries a start timestamp.
  runStartedAtIso?: string | null;
}): {
  activeMatchId: string | null;
  resolvedMatchResult: RunMatchResult | null | undefined;
  matchSource: RunMatchSource;
  // Set ONLY by the goal-freeze tier: the mode recorded at the crossing, so the save can
  // synthesize a minimal pending matchResult blob when no live/pending result exists.
  matchModeFallback?: 'duel' | 'group' | null;
} {
  if (liveMatchId) {
    return {
      activeMatchId: liveMatchId,
      // FIX-2 — only backfill the pending matchResult when it belongs to THIS match: a stale
      // context from a different (older) match must never attach its verdict to a new save.
      resolvedMatchResult:
        liveMatchResult
        ?? (pendingContext?.matchId === liveMatchId ? pendingContext.matchResult : undefined),
      matchSource: liveMatchSource,
    };
  }

  if (pendingContext?.matchId) {
    return {
      activeMatchId: pendingContext.matchId,
      resolvedMatchResult: liveMatchResult ?? pendingContext.matchResult,
      matchSource: pendingContext.matchSource,
    };
  }

  // FIX-A third tier — no live match, no pending context: a live goal freeze proves a
  // crossed-but-unsaved match. Prefer the most recent crossing when (rarely) several linger.
  // ZOMBIE GATE — only crossings inside THIS run's window qualify (see runStartedAtIso).
  const runStartedAtMs = runStartedAtIso ? Date.parse(runStartedAtIso) : Number.NaN;
  const freezeFallback = Number.isNaN(runStartedAtMs)
    ? null
    : goalFreezes
      .filter((freeze) => {
        if (!freeze?.matchId) {
          return false;
        }
        const crossedAtMs = Date.parse(freeze.crossedAtIso);
        return !Number.isNaN(crossedAtMs) && crossedAtMs >= runStartedAtMs;
      })
      .sort((left, right) => (left.crossedAtIso < right.crossedAtIso ? 1 : -1))[0] ?? null;

  if (freezeFallback) {
    return {
      activeMatchId: freezeFallback.matchId,
      resolvedMatchResult: liveMatchResult ?? null,
      // Party latch first, then the recorded source; unprovable → 'party' (a party run must
      // never leak into ranked 전적/LP; an official run degraded to 'party' only loses its
      // bonus, never pollutes).
      matchSource: liveMatchSource === 'party'
        ? 'party'
        : freezeFallback.matchSource ?? 'party',
      matchModeFallback: freezeFallback.mode ?? null,
    };
  }

  return {
    activeMatchId: null,
    resolvedMatchResult: liveMatchResult,
    matchSource: liveMatchSource,
  };
}
