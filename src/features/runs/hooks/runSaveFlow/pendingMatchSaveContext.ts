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

export type PendingMatchSaveContext = {
  matchId: string;
  mode: 'duel' | 'group' | null;
  matchSource: RunMatchSource;
  matchResult: RunMatchResult | null;
};

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
export function resolvePendingMatchSaveFallbacks({
  liveMatchId,
  liveMatchResult,
  liveMatchSource,
  pendingContext,
}: {
  liveMatchId: string | null;
  liveMatchResult: RunMatchResult | null | undefined;
  liveMatchSource: RunMatchSource;
  pendingContext: PendingMatchSaveContext | null;
}): {
  activeMatchId: string | null;
  resolvedMatchResult: RunMatchResult | null | undefined;
  matchSource: RunMatchSource;
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

  return {
    activeMatchId: null,
    resolvedMatchResult: liveMatchResult,
    matchSource: liveMatchSource,
  };
}
