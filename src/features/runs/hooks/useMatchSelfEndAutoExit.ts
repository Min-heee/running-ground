// FIX-C (2026-07-09 field incident) — HOISTED self-end auto-exit.
//
// The one-shot auto-exit effect used to live inside LiveMatchExitActionCard, which is mounted
// ONLY on the arena pager page (page 0) or the standalone result page — on both platforms only
// the ACTIVE pager page renders. A runner sitting on the 기록 page at goal-cross therefore had
// NO auto-exit at all, and the exit depended 100% on the server 'finished' echo. This hook
// mounts at the runtime-model layer (always mounted while the run experience exists), so it
// fires regardless of the active pager segment. Two triggers:
//
//   1) SERVER-ECHO trigger (the card's old effect, relocated): actionable self-finished /
//      self-forfeited state → dispatch the same save-and-navigate handler the card used.
//   2) FREEZE-DEADLINE fallback (never depend solely on the echo): a localGoalFreeze exists
//      for the active matchId (the crossing was detected and recorded locally) but
//      currentUserLiveStatus has not gone terminal within the grace window of the recorded
//      crossedAtIso → dispatch the SAME handler anyway. The save path delivers the frozen
//      finish via buildPendingFinishIntentFromFreeze and the server finish is first-write-wins,
//      so this stays idempotent even when the echo later lands.
//
// One-shot bug fix (the old card latched autoExitTriggeredRef BEFORE the handler ran, and the
// handler early-returns on isSaving — a single swallowed dispatch permanently disabled
// auto-exit for the mount): the latch here is keyed by matchId and is set ONLY when a dispatch
// actually starts, i.e. after every skip condition (isLeaving / isSaving / FIX-1's
// saveCommandInFlight single-flight) has passed. A blocked tick simply retries. The pure
// gating lives in lifecycle/matchSelfEndAutoExit.ts (unit-tested).

import { useEffect, useRef } from 'react';
import type { MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';
import { resolveSelfEndAutoExit } from '@/features/runs/lifecycle/matchSelfEndAutoExit';
import { getLocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';
import { isSaveCommandInFlight } from '@/features/runs/hooks/runSaveFlow/useRunSaveCommand';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export function useMatchSelfEndAutoExit({
  source,
  matchId,
  isTestMatch,
  selfFinished,
  selfForfeited,
  isLeaving,
  isSaving,
  trackingStatus,
  onShowResultAfterCounterpartForfeit,
  onShowResultAfterSelfForfeit,
}: {
  source: MatchExitSource | null;
  matchId: string | null;
  isTestMatch: boolean;
  selfFinished: boolean;
  selfForfeited: boolean;
  isLeaving: boolean;
  isSaving: boolean;
  trackingStatus: string;
  onShowResultAfterCounterpartForfeit: (source: MatchExitSource) => Promise<void> | void;
  onShowResultAfterSelfForfeit: (source: MatchExitSource) => Promise<void> | void;
}) {
  // matchId-keyed once-latch (NOT a mount-scoped boolean): survives pager remounts, re-arms
  // for the next match, and is set only when a dispatch actually starts.
  const dispatchedMatchIdRef = useRef<string | null>(null);

  // Render-updated ref so the 1s tick below always reads the current values without the
  // effect having to re-subscribe on every render.
  const latestRef = useRef({
    source,
    matchId,
    isTestMatch,
    selfFinished,
    selfForfeited,
    isLeaving,
    isSaving,
    trackingStatus,
    onShowResultAfterCounterpartForfeit,
    onShowResultAfterSelfForfeit,
  });
  latestRef.current = {
    source,
    matchId,
    isTestMatch,
    selfFinished,
    selfForfeited,
    isLeaving,
    isSaving,
    trackingStatus,
    onShowResultAfterCounterpartForfeit,
    onShowResultAfterSelfForfeit,
  };

  useEffect(() => {
    const tick = () => {
      const latest = latestRef.current;
      if (!latest.source || !latest.matchId) {
        return;
      }

      const freeze = getLocalGoalFreeze(latest.matchId);
      const freezeCrossedAtMs = freeze ? Date.parse(freeze.crossedAtIso) : NaN;
      const decision = resolveSelfEndAutoExit({
        source: latest.source,
        matchId: latest.matchId,
        isTestMatch: latest.isTestMatch,
        selfFinished: latest.selfFinished,
        selfForfeited: latest.selfForfeited,
        isLeaving: latest.isLeaving,
        isSaving: latest.isSaving,
        saveInFlight: isSaveCommandInFlight(),
        trackingStatus: latest.trackingStatus,
        alreadyDispatchedMatchId: dispatchedMatchIdRef.current,
        freezeCrossedAtMs: Number.isFinite(freezeCrossedAtMs) ? freezeCrossedAtMs : null,
        nowMs: Date.now(),
      });
      if (!decision) {
        return;
      }

      // Latch NOW — every skip condition has passed, so the dispatch genuinely starts.
      dispatchedMatchIdRef.current = latest.matchId;
      rgPerfMark('match end auto result dispatch', {
        kind: decision,
        matchId: latest.matchId,
        source: latest.source,
        trigger: decision === 'freeze-deadline' ? 'local-goal-freeze' : 'server-echo',
      });
      if (decision === 'self-forfeited') {
        void latest.onShowResultAfterSelfForfeit(latest.source);
      } else {
        // 'self-finished' and 'freeze-deadline' both end WITHOUT marking the runner as
        // forfeited — the same non-forfeit show-result handler the card's button uses.
        void latest.onShowResultAfterCounterpartForfeit(latest.source);
      }
    };

    // Immediate check on any relevant state change (the deps below), plus a 500ms wall-clock
    // tick that catches the local goal-crossing freeze (recorded in a module store, which does
    // NOT re-render this hook) within ≤0.5s so 저장중 appears the moment the goal is reached —
    // not ~0.2km later (the 7/9 report). Ref-only reads + a pure gate, no setState, so the
    // tighter cadence adds negligible cost.
    tick();
    const intervalId = setInterval(tick, 500);
    return () => {
      clearInterval(intervalId);
    };
  }, [source, matchId, isTestMatch, selfFinished, selfForfeited, isLeaving, isSaving, trackingStatus]);
}
