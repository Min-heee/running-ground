import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Platform } from 'react-native';
import {
  getBackgroundRunTrackingSnapshot,
  restorePersistedBackgroundRunTracking,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import { getLocalGoalFreeze } from '@/features/runs/sync/localGoalFreezeStore';
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
