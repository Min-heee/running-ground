import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Platform } from 'react-native';
import {
  getBackgroundRunTrackingSnapshot,
  restorePersistedBackgroundRunTracking,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import { getLocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';
import { resolvePreSlotWarmupTarget } from '@/features/runs/tracking/lifecycle/preSlotWarmup';
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

    if (!officialStartBaselineRef.current) {
      preStartWarmupMatchIdRef.current = null;
    }
  }, [
    officialStartBaselineRef,
    preStartWarmupMatchIdRef,
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
    ) {
      return;
    }

    startMatchTrackingAutomatically(warmupTarget.matchId, { allowCountdownWarmup: true });
  }, [
    autoStartedMatchIdRef,
    duelMatchStatus,
    groupMatchStatus,
    matchMode,
    officialStartBaselineRef,
    preStartWarmupMatchIdRef,
    roomLinkedMatchContext,
    startMatchTrackingAutomatically,
    status,
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
        syncFromBackgroundTracking(getBackgroundRunTrackingSnapshot({ cloneRoute: false }));
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
