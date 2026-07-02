import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import { resolveMatchStatusSnapshotApply } from '@/features/runs/sync/matchProgressSync';
import {
  clearBackgroundMatchProgressContext,
  clearBackgroundMatchStatusApplier,
  setBackgroundMatchStatusApplier,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import { stopBackgroundMatchProgressTimer } from '@/features/runs/tracking/background/backgroundMatchProgressTimer';
import type { RunningMatchStatusResponse } from '@/lib/api/types';

type UseTrackRunMatchStatusSnapshotApplierInput = {
  duelMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  forfeitedMatchIdsRef: MutableRefObject<Set<string>>;
  groupMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  latestDuelStatusServerNowMsRef: MutableRefObject<number>;
  latestGroupStatusServerNowMsRef: MutableRefObject<number>;
  roomLinkedMatchContextRef: MutableRefObject<PartyRunLinkedMatchContext | null>;
  setDuelMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  setGroupMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
};

// Bundle A2 — THE ONE guarded apply funnel. Every channel that writes another participant's
// live status into duel/groupMatchStatus (background flush, foreground heartbeat, and the
// mounted safety poll) routes through this single applier so all match types (party /
// matched-duel / matched-group) apply snapshots under the SAME rules and in the SAME order:
//   1) resolve apply target  → forfeitedMatchIdsRef guard FIRST (never resurrect a left match),
//   2) shouldAcceptServerSnapshot monotonic serverNow guard on the per-mode ref,
//   3) syncServerClock (the shared countdown clock depends on this),
//   4) setDuel/GroupMatchStatus,
//   5) terminal-status background teardown.
// The background flush (native Android / JS-fallback iOS) is the ONLY progress POST that fires
// while the screen is off; the foreground heartbeat is the channel that brings the opponent's
// forfeited/finished status back while a runner is stationary. Routing BOTH through this funnel
// means a late in-flight response (heartbeat OR background) can neither resurrect a forfeited
// match nor apply out of order — newest serverNow wins regardless of which channel delivered it.
export function useTrackRunMatchStatusSnapshotApplier({
  duelMatchStatusRef,
  forfeitedMatchIdsRef,
  groupMatchStatusRef,
  latestDuelStatusServerNowMsRef,
  latestGroupStatusServerNowMsRef,
  roomLinkedMatchContextRef,
  setDuelMatchStatus,
  setGroupMatchStatus,
  syncServerClock,
}: UseTrackRunMatchStatusSnapshotApplierInput) {
  // Stable mount-once applier. All match state it reads comes through refs, and the only functions
  // it closes over (setDuelMatchStatus / setGroupMatchStatus are React setters; syncServerClock
  // itself only writes a stable ref + a stable setter + module state) carry no stale per-render
  // values, so capturing them once here is safe. The `source` is for diagnostics only; the guard
  // ordering is IDENTICAL for every source. `forceAccept` is an explicit escape hatch that skips
  // ONLY the monotonic clock guard (the forfeit guard always stays first); it is currently used by
  // NO wired caller — every channel obeys the monotonic guard — and is kept solely so a future
  // caller whose serverNow stamp is NOT consistent with this clock can opt out deliberately.
  const applyMatchStatusSnapshotRef = useRef((
    nextStatus: RunningMatchStatusResponse,
    options?: { source?: string; forceAccept?: boolean },
  ) => {
    // THE guard decision (forfeit FIRST, monotonic serverNow SECOND) lives in ONE pure tested
    // place — resolveMatchStatusSnapshotApply (matchProgressSync.ts, matchProgressSync.test.ts) —
    // so the heartbeat / background / mounted-safety-poll channels can never drift out of the
    // same ordering. It reads ONLY refs here, so it never works off stale match state, and it
    // never advances a per-mode serverNow ref for a snapshot it drops (forfeit/not-live/mode-
    // mismatch return before the monotonic ref is touched).
    const decision = resolveMatchStatusSnapshotApply({
      status: nextStatus,
      duelMatchId: duelMatchStatusRef.current?.matchId,
      groupMatchId: groupMatchStatusRef.current?.matchId,
      roomLinkedMatchContext: roomLinkedMatchContextRef.current,
      forfeitedMatchIds: forfeitedMatchIdsRef.current,
      duelServerNowMsRef: latestDuelStatusServerNowMsRef,
      groupServerNowMsRef: latestGroupStatusServerNowMsRef,
      forceAccept: options?.forceAccept ?? false,
    });

    if (!decision.apply) {
      return;
    }

    // Side effects, in the SAME order as the foreground/poll paths:
    // 1) keep the shared server clock advancing (countdown depends on it),
    // 2) write the per-mode status (slot-clamped, like the poll funnel),
    // 3) terminal teardown.
    syncServerClock(nextStatus.serverNow, nextStatus);

    // STAGE 2 (clean core): NO client-side slot clamp. The server slot-gates the reported state and
    // the client gates countdown/arena/GPS on the slot, so an early SHARED-session 'active' can't
    // skip the guest. This channel (foreground heartbeat / background flush) only fires while a
    // runner is already measuring (past its slot) anyway. decision.isTerminal is derived from
    // currentUserLiveStatus, so finish / forfeit teardown is unaffected.
    const clampedStatus = nextStatus;

    if (decision.target === 'duel') {
      setDuelMatchStatus(clampedStatus);
    } else {
      setGroupMatchStatus(clampedStatus);
    }

    // M1 — finish-path cooperation. If the applied status is terminal for THIS runner (finished
    // or forfeited), idempotently tear down the background context + timer so the background
    // flush stops firing for a dead match instead of racing the foreground finish teardown.
    // clearBackgroundMatchProgressContext is match-id-scoped, so this is safe if another match
    // has already taken over the context.
    if (decision.isTerminal) {
      stopBackgroundMatchProgressTimer();
      clearBackgroundMatchProgressContext(nextStatus.matchId ?? undefined);
    }
  });

  // Stable funnel callback the foreground heartbeat (useMatchProgressSync) calls in place of its
  // former bare setDuel/GroupMatchStatus. Identity is stable for the component lifetime (the
  // closure lives in a ref), so passing it through the tracking-flow plumbing never re-subscribes
  // the heartbeat hook. The background flush registers the SAME ref via the module-level applier
  // setter below.
  const applyMatchStatusSnapshot = useCallback((
    nextStatus: RunningMatchStatusResponse,
    options?: { source?: string; forceAccept?: boolean },
  ) => {
    applyMatchStatusSnapshotRef.current(nextStatus, options);
  }, []);

  useEffect(() => {
    // M2 — register the STABLE applier and tear it down BY IDENTITY. Given the duplicate
    // runtime-mount history (#135) / StrictMode, an unconditional null on unmount could wipe a
    // surviving instance's applier; clearBackgroundMatchStatusApplier no-ops unless this exact
    // function is still the registered owner. The background flush carries no `source`/options, so
    // it lands as the default-source ('background') snapshot through the same guard order.
    const applier = (nextStatus: RunningMatchStatusResponse) => {
      applyMatchStatusSnapshotRef.current(nextStatus, { source: 'background' });
    };
    setBackgroundMatchStatusApplier(applier);
    return () => {
      clearBackgroundMatchStatusApplier(applier);
    };
  }, []);

  return {
    applyMatchStatusSnapshot,
  };
}
