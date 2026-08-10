import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Platform } from 'react-native';
import {
  getBackgroundRunTrackingSnapshot,
  resetBackgroundRunTracking,
  restorePersistedBackgroundRunTracking,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import { getLocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';
import {
  isWarmupEraSnapshot,
  resolvePreSlotWarmupTarget,
  WARMUP_ORPHAN_BACKSTOP_AFTER_SLOT_MS,
} from '@/features/runs/tracking/lifecycle/preSlotWarmup';
import {
  buildOfficialStartBaseline,
} from '@/features/runs/tracking/trackingSession';
import type { UseRunTrackingFlowInput } from '@/features/runs/types/runTrackingFlow';

// STAGE 4 (clean core): the pre-slot-warm-up inputs (duelMatchState/groupMatchState,
// visiblePartyRunShouldOpenArena, duel/groupStartCountdownSeconds, lifecycleWarmupMatchId)
// are gone — measuring now starts only on the slot-gated active path, which keys off the
// match STATUS (state === 'active') rather than any pre-slot countdown signal.
type UseMatchAutoTrackingEffectsInput = Pick<
  UseRunTrackingFlowInput,
  | 'autoStartedMatchIdRef'
  | 'autoStartingMatchTrackingRef'
  | 'appStateRef'
  | 'preStartWarmupMatchIdRef'
  | 'officialStartBaselineRef'
  | 'matchMode'
  | 'duelMatchStatus'
  | 'groupMatchStatus'
  | 'roomLinkedMatchContext'
  | 'status'
  | 'trackingSubscriptionsEnabled'
> & {
  hasLifecycleController: boolean;
  lifecycleActiveMatchId: string | null;
  lifecycleActiveMatchSlotStartAt: string | null;
  skippedAndroidWarmupMatchIdRef: MutableRefObject<string | null>;
  startMatchTrackingAutomatically: (
    matchId: string,
    options?: { allowCountdownWarmup?: boolean },
  ) => void;
  syncFromBackgroundTracking: (snapshot?: BackgroundRunTrackingSnapshot) => void;
};

export function useMatchAutoTrackingEffects({
  autoStartedMatchIdRef,
  autoStartingMatchTrackingRef,
  appStateRef,
  preStartWarmupMatchIdRef,
  officialStartBaselineRef,
  matchMode,
  duelMatchStatus,
  groupMatchStatus,
  roomLinkedMatchContext,
  status,
  trackingSubscriptionsEnabled,
  hasLifecycleController,
  lifecycleActiveMatchId,
  lifecycleActiveMatchSlotStartAt,
  skippedAndroidWarmupMatchIdRef,
  startMatchTrackingAutomatically,
  syncFromBackgroundTracking,
}: UseMatchAutoTrackingEffectsInput) {
  const restoringMatchIdRef = useRef<string | null>(null);
  // ONE warmup attempt per match (see the warmup effect) — never re-cleared within a match so a
  // failed attempt cannot loop; the slot-time active path remains the second, unconditional try.
  const warmupAttemptedMatchIdRef = useRef<string | null>(null);
  // 재검증 2026-08-11 (블로커): the warmup restore MUST NOT share restoringMatchIdRef. The active
  // effect runs in the SAME React commit (shared deps), computes activeMatchId=null during any
  // countdown, and its no-active branch nulls restoringMatchIdRef — before the warmup's restore
  // promise can possibly resolve (promises never run between same-commit effects). The warmup's
  // .then then saw a foreign marker and aborted, so the arm NEVER fired and the one-attempt guard
  // blocked every retry: the hardening had silently un-fixed the original incident.
  const warmupRestoringMatchIdRef = useRef<string | null>(null);
  // The zombie backstop's pending timer — cleared on unmount only (NOT on dep changes: the 2.5s
  // polls re-run effects constantly and a dep-scoped cleanup would cancel every backstop 2.5s
  // after scheduling). Without this, a stale timer from an unmounted instance could fire at
  // slot+120s holding old refs and reset a LIVE session started by the next instance.
  const warmupBackstopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (warmupBackstopTimerRef.current) {
      clearTimeout(warmupBackstopTimerRef.current);
      warmupBackstopTimerRef.current = null;
    }
  }, []);

  // STAGE 4 (clean core): the pre-slot GPS warm-up is GONE. The old warm-up branch was gated
  // on shouldAutoOpenMatchArena (≤20s) / the arena-handoff phase — i.e. it started MEASURING
  // during the countdown. GPS/measuring now starts ONLY at/after the slot, via the active path
  // below (which keys off the now-slot-gated state === 'active'). This effect is reduced to
  // clearing the pre-start warm-up ref so the active path's official-start baseline
  // reconciliation still resets cleanly when no live match is in flight.
  useEffect(() => {
    if (!trackingSubscriptionsEnabled) {
      return;
    }

    // 적대 검증 2026-08-11: this clear may only run when NO session is in flight. During a
    // countdown warmup the session is 'running' with the baseline deliberately still null — the
    // focus gate toggling trackingSubscriptionsEnabled on a mid-countdown tab flip used to re-run
    // this effect and wipe the warmup ref, and with it the only key both baseline builders accept:
    // the countdown meters then leaked into the official result. status==='idle' is the "no live
    // match in flight" this clear was always meant for (Stage 4 comment above).
    //
    // 재검증: the committed `status` LAGS the live session — the warmup ref is armed inside
    // handleStartTrackingInternal while the start is still awaiting (~0.3-3s of native FGS/GPS
    // spin-up), and 'running' only commits afterward. That whole window is covered by
    // autoStartingMatchTrackingRef (true from arm until finishDetachedAutoStart), which the active
    // effect never touches — unlike autoStartedMatchIdRef, which its no-active branch nulls every
    // countdown render and therefore cannot be trusted as the in-flight signal.
    if (
      !officialStartBaselineRef.current
      && status === 'idle'
      && !autoStartingMatchTrackingRef.current
      && !autoStartedMatchIdRef.current
    ) {
      preStartWarmupMatchIdRef.current = null;
    }
  }, [
    autoStartedMatchIdRef,
    autoStartingMatchTrackingRef,
    officialStartBaselineRef,
    preStartWarmupMatchIdRef,
    status,
    trackingSubscriptionsEnabled,
  ]);

  // PRE-SLOT WARMUP (회원K 파티런 2026-08-10): arm the tracking PLUMBING while the countdown is
  // still on screen — the runner is watching it, so the screen is guaranteed on. Without this the
  // whole arm waits for state === 'active' (countdown END) and rides JS timers that a lock at
  // +1-2s freezes: the FGS that would keep those timers alive is exactly the thing not started
  // yet, so a Galaxy locked right after the countdown showed 0.00km for the entire match and only
  // began measuring on unlock (server saw them at 0.04km all match). Measuring semantics are
  // unchanged: the warmup start records preStartWarmupMatchIdRef and the active effect below
  // replaces the warmup's few meters with the official-start baseline at the slot — the Stage 4
  // "measuring starts at the slot" invariant holds; only the plumbing starts early.
  //
  // Re-evaluation cadence needs no timer: the party-run room handoff CHANGES these deps when its
  // countdown begins (slot ≈ +10s), and a scheduled match's arena auto-open (≤20s before the slot)
  // MOUNTS this hook inside the window. A failed warmup start releases its guards
  // (finishDetachedAutoStart) and the active path retries exactly as before, so this can only ever
  // add an earlier attempt, never remove one.
  useEffect(() => {
    if (!trackingSubscriptionsEnabled || status !== 'idle') {
      return;
    }

    if (officialStartBaselineRef.current) {
      return;
    }

    const warmupTarget = resolvePreSlotWarmupTarget({
      matchMode,
      duelMatchStatus,
      groupMatchStatus,
      roomLinkedMatchContext,
      nowMs: Date.now(),
    });

    if (!warmupTarget) {
      return;
    }

    if (
      preStartWarmupMatchIdRef.current === warmupTarget.matchId
      || autoStartedMatchIdRef.current === warmupTarget.matchId
      || restoringMatchIdRef.current === warmupTarget.matchId
      || warmupRestoringMatchIdRef.current === warmupTarget.matchId
      // 적대 검증 2026-08-11: ONE warmup attempt per match. A failed start (e.g. permission
      // denied) releases the funnel guards, and the 2.5s status polls re-render this effect — an
      // unbounded retry re-opened the permission/disclosure prompt every poll for the rest of the
      // countdown. One attempt; on failure the slot-time active path starts exactly as before.
      || warmupAttemptedMatchIdRef.current === warmupTarget.matchId
    ) {
      return;
    }

    warmupAttemptedMatchIdRef.current = warmupTarget.matchId;

    // 적대 검증 2026-08-11 (zombie backstop): a match can dissolve AFTER warmup arms (room
    // cancelled mid-countdown, stale 'matched' context) and pre-slot there is no teardown path —
    // the FGS+GPS would spin until the user noticed. Backstop: if no official-start baseline has
    // materialized well past the slot, the warmup session has no match to serve — drop it. The
    // timer runs on JS the warmup's own FGS keeps alive; if the process died there is nothing to
    // clean. A legitimate late promotion loses nothing: the active path re-arms exactly as it
    // would have without warmup.
    const slotStartMs = Date.parse(warmupTarget.slotStartAt);
    const backstopDelayMs = Math.max(
      (Number.isFinite(slotStartMs) ? slotStartMs - Date.now() : 0) + WARMUP_ORPHAN_BACKSTOP_AFTER_SLOT_MS,
      WARMUP_ORPHAN_BACKSTOP_AFTER_SLOT_MS,
    );
    // 3차 재검증: do NOT clear a previous match's pending backstop here. Warmup can chain (match A
    // cancelled mid-countdown → match B arms within A's backstop window), and cancelling A's timer
    // let A's orphan escape its own watchdog. Overwriting the handle is safe: A's timer either
    // no-ops (the eager orphan cleanup below nulls the ref it guards on) or is the only pending
    // timer (no B) and thus still held here for the unmount cleanup.
    warmupBackstopTimerRef.current = setTimeout(() => {
      warmupBackstopTimerRef.current = null;
      const liveSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      if (
        officialStartBaselineRef.current
        || preStartWarmupMatchIdRef.current !== warmupTarget.matchId
        || liveSnapshot.status !== 'running'
        // 재검증 2026-08-11: an ORPHAN is a session with nothing on it — the runner never actually
        // raced (room cancelled, dead context), so stationary rejection kept it at ~0m. A session
        // with real distance is someone RUNNING whose promotion is merely late (server outage,
        // cellular dead zone); killing it — and its persisted snapshot — would destroy genuine
        // race data. Never reset a session that has measured meters.
        || liveSnapshot.distanceKm >= 0.03
      ) {
        return;
      }
      // warmupAttemptedMatchIdRef stays SET: this matchId is still inside the resolver's stale
      // floor, and clearing it here would let the effect re-arm the orphan and loop
      // start→backstop→start every two minutes until the floor expires.
      preStartWarmupMatchIdRef.current = null;
      void resetBackgroundRunTracking().then(() => {
        syncFromBackgroundTracking(getBackgroundRunTrackingSnapshot({ cloneRoute: false }));
      });
    }, backstopDelayMs);

    // 적대 검증 2026-08-11 (restore-first): the active path never starts fresh over a restorable
    // session, and neither may warmup — a cold relaunch inside a stale-'matched' window used to
    // reset straight over a crashed run's persisted meters. Same discipline, same goal-freeze
    // guard (never re-launch a finished match). Uses the warmup-OWNED marker: the shared
    // restoringMatchIdRef is nulled by the active effect's no-active branch in the same commit
    // during any countdown, which silently aborted this restore and un-fixed the incident (재검증).
    warmupRestoringMatchIdRef.current = warmupTarget.matchId;
    void restorePersistedBackgroundRunTracking(warmupTarget.matchId, {
      appState: appStateRef.current,
      detachLocationTask: Platform.OS === 'android' && matchMode !== 'solo',
      trackingKey: warmupTarget.matchId,
    }).then(async (restored) => {
      if (warmupRestoringMatchIdRef.current !== warmupTarget.matchId) {
        return;
      }

      if (restored) {
        autoStartedMatchIdRef.current = warmupTarget.matchId;
        const restoredSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
        // A restored pre-slot session must be re-marked as warmup so the baseline builders rebase
        // it at the slot — the ref died with the process, the snapshot's startedAt did not.
        if (isWarmupEraSnapshot(restoredSnapshot.startedAt, warmupTarget.slotStartAt)) {
          preStartWarmupMatchIdRef.current = warmupTarget.matchId;
        }
        syncFromBackgroundTracking(restoredSnapshot);
        return;
      }

      // 3차 재검증 (워밍업 연쇄 A→B): a PREVIOUS match's warmup orphan can still be squatting on
      // the session — A was cancelled mid-countdown, its backstop hasn't fired (or was lost), and
      // its 'running' status would block B's fresh start below. B would then race mis-keyed on A's
      // session: no baseline (both builders key on the ref matching B), elapsed counted from A's
      // arm, persistence filed under A. Evict the squatter EAGERLY under exactly the backstop's
      // safety envelope — no official baseline, a FOREIGN warmup ref, and no measured meters
      // (an official run or anything a runner actually ran is never touched).
      const squatterSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      if (
        squatterSnapshot.status === 'running'
        && !officialStartBaselineRef.current
        && preStartWarmupMatchIdRef.current !== null
        && preStartWarmupMatchIdRef.current !== warmupTarget.matchId
        && squatterSnapshot.distanceKm < 0.03
      ) {
        preStartWarmupMatchIdRef.current = null;
        await resetBackgroundRunTracking();
        syncFromBackgroundTracking(getBackgroundRunTrackingSnapshot({ cloneRoute: false }));
      }

      if (
        getBackgroundRunTrackingSnapshot({ cloneRoute: false }).status !== 'running'
        && !getLocalGoalFreeze(warmupTarget.matchId)
      ) {
        startMatchTrackingAutomatically(warmupTarget.matchId, { allowCountdownWarmup: true });
      }
    }).finally(() => {
      if (warmupRestoringMatchIdRef.current === warmupTarget.matchId) {
        warmupRestoringMatchIdRef.current = null;
      }
    });
  }, [
    appStateRef,
    autoStartedMatchIdRef,
    duelMatchStatus,
    groupMatchStatus,
    matchMode,
    officialStartBaselineRef,
    preStartWarmupMatchIdRef,
    roomLinkedMatchContext,
    startMatchTrackingAutomatically,
    status,
    syncFromBackgroundTracking,
    trackingSubscriptionsEnabled,
  ]);

  useEffect(() => {
    if (!trackingSubscriptionsEnabled) {
      return;
    }

    const roomActiveMatch =
      !hasLifecycleController
      && roomLinkedMatchContext
      && roomLinkedMatchContext.mode === matchMode
      && roomLinkedMatchContext.state === 'active'
        ? {
            matchId: roomLinkedMatchContext.matchId,
            slotStartAt: roomLinkedMatchContext.slotStartAt,
          }
        : null;
    const fallbackActiveMatch = matchMode === 'duel'
      ? duelMatchStatus?.state === 'active' && duelMatchStatus.matchId
        ? { matchId: duelMatchStatus.matchId, slotStartAt: duelMatchStatus.slotStartAt }
        : roomActiveMatch
      : matchMode === 'group'
        ? groupMatchStatus?.state === 'active' && groupMatchStatus.matchId
          ? { matchId: groupMatchStatus.matchId, slotStartAt: groupMatchStatus.slotStartAt }
          : roomActiveMatch
        : roomActiveMatch;
    const activeMatch = lifecycleActiveMatchId && lifecycleActiveMatchSlotStartAt
      ? {
          matchId: lifecycleActiveMatchId,
          slotStartAt: lifecycleActiveMatchSlotStartAt,
        }
      : fallbackActiveMatch;
    const activeMatchId = activeMatch?.matchId ?? null;

    if (!activeMatchId) {
      autoStartedMatchIdRef.current = null;
      restoringMatchIdRef.current = null;
      skippedAndroidWarmupMatchIdRef.current = null;
      if (!preStartWarmupMatchIdRef.current) {
        officialStartBaselineRef.current = null;
      }
      return;
    }

    if (skippedAndroidWarmupMatchIdRef.current === activeMatchId) {
      skippedAndroidWarmupMatchIdRef.current = null;
    }

    if (
      preStartWarmupMatchIdRef.current === activeMatchId
      && status === 'running'
      && !officialStartBaselineRef.current
    ) {
      const currentSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      officialStartBaselineRef.current = buildOfficialStartBaseline(
        currentSnapshot,
        activeMatchId,
        activeMatch?.slotStartAt ?? new Date().toISOString(),
      );
      preStartWarmupMatchIdRef.current = null;
      syncFromBackgroundTracking(currentSnapshot);
      return;
    }

    if (status !== 'idle') {
      return;
    }

    if (autoStartedMatchIdRef.current === activeMatchId) {
      return;
    }

    if (restoringMatchIdRef.current === activeMatchId) {
      return;
    }

    restoringMatchIdRef.current = activeMatchId;
    void restorePersistedBackgroundRunTracking(activeMatchId, {
      appState: appStateRef.current,
      detachLocationTask: Platform.OS === 'android' && matchMode !== 'solo',
      trackingKey: activeMatchId,
    }).then((restored) => {
      if (restoringMatchIdRef.current !== activeMatchId) {
        return;
      }

      if (restored) {
        autoStartedMatchIdRef.current = activeMatchId;
        const restoredSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
        // 적대 검증 2026-08-11: a crash-restored session that STARTED before the slot is a warmup
        // session whose baseline died with the process. Re-mark it so the baseline branch above
        // rebuilds the official-start baseline (route truncation at the slot) on the next pass —
        // otherwise the countdown meters and seconds would count as match performance.
        if (isWarmupEraSnapshot(restoredSnapshot.startedAt, activeMatch?.slotStartAt ?? null)) {
          preStartWarmupMatchIdRef.current = activeMatchId;
        }
        syncFromBackgroundTracking(restoredSnapshot);
        return;
      }

      // HANDS-FREE FINISH (Stage 4b) — never start a FRESH run for a match whose goal was already
      // crossed (a local goal freeze exists for this exact matchId): after a stale-deleted or
      // missing snapshot this used to re-launch a bogus 0km re-run over a finished match. The
      // restore path above (freeze-aware 24h staleness, 4a) is the recovery channel instead.
      // restoreBackgroundRunSnapshot awaited freeze hydration, so this synchronous read is settled.
      if (
        getBackgroundRunTrackingSnapshot({ cloneRoute: false }).status !== 'running'
        && !getLocalGoalFreeze(activeMatchId)
      ) {
        startMatchTrackingAutomatically(activeMatchId);
      }
    }).finally(() => {
      if (restoringMatchIdRef.current === activeMatchId) {
        restoringMatchIdRef.current = null;
      }
    });
    return;

  }, [
    autoStartedMatchIdRef,
    appStateRef,
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    duelMatchStatus?.slotStartAt,
    groupMatchStatus?.matchId,
    groupMatchStatus?.state,
    groupMatchStatus?.slotStartAt,
    hasLifecycleController,
    lifecycleActiveMatchId,
    lifecycleActiveMatchSlotStartAt,
    matchMode,
    officialStartBaselineRef,
    preStartWarmupMatchIdRef,
    roomLinkedMatchContext,
    skippedAndroidWarmupMatchIdRef,
    startMatchTrackingAutomatically,
    status,
    syncFromBackgroundTracking,
    trackingSubscriptionsEnabled,
  ]);
}
