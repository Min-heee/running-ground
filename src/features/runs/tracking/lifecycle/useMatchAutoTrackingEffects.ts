import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Platform } from 'react-native';
import {
  getBackgroundRunTrackingSnapshot,
  restorePersistedBackgroundRunTracking,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import {
  buildOfficialStartBaseline,
} from '@/features/runs/tracking/trackingSession';
import type { UseRunTrackingFlowInput } from '@/features/runs/types/runTrackingFlow';
import { shouldAutoOpenMatchArena } from '@/lib/matchCountdown';

type UseMatchAutoTrackingEffectsInput = Pick<
  UseRunTrackingFlowInput,
  | 'autoStartedMatchIdRef'
  | 'appStateRef'
  | 'preStartWarmupMatchIdRef'
  | 'officialStartBaselineRef'
  | 'matchMode'
  | 'duelMatchState'
  | 'groupMatchState'
  | 'duelMatchStatus'
  | 'groupMatchStatus'
  | 'roomLinkedMatchContext'
  | 'status'
  | 'visiblePartyRunShouldOpenArena'
  | 'duelStartCountdownSeconds'
  | 'groupStartCountdownSeconds'
  | 'trackingSubscriptionsEnabled'
> & {
  hasLifecycleController: boolean;
  lifecycleActiveMatchId: string | null;
  lifecycleActiveMatchSlotStartAt: string | null;
  lifecycleWarmupMatchId: string | null;
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
  duelMatchState,
  groupMatchState,
  duelMatchStatus,
  groupMatchStatus,
  roomLinkedMatchContext,
  status,
  visiblePartyRunShouldOpenArena,
  duelStartCountdownSeconds,
  groupStartCountdownSeconds,
  trackingSubscriptionsEnabled,
  hasLifecycleController,
  lifecycleActiveMatchId,
  lifecycleActiveMatchSlotStartAt,
  lifecycleWarmupMatchId,
  skippedAndroidWarmupMatchIdRef,
  startMatchTrackingAutomatically,
  syncFromBackgroundTracking,
}: UseMatchAutoTrackingEffectsInput) {
  const restoringMatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!trackingSubscriptionsEnabled) {
      return;
    }

    const roomWarmupMatchId = !hasLifecycleController
      && roomLinkedMatchContext
      && roomLinkedMatchContext.mode === matchMode
      && roomLinkedMatchContext.state === 'matched'
      && visiblePartyRunShouldOpenArena
        ? roomLinkedMatchContext.matchId
        : null;
    const warmupMatchId = lifecycleWarmupMatchId
      ?? (matchMode === 'duel'
        ? duelMatchState === 'matched' && shouldAutoOpenMatchArena(duelStartCountdownSeconds)
          ? duelMatchStatus?.matchId ?? roomWarmupMatchId
          : roomWarmupMatchId
        : matchMode === 'group'
          ? groupMatchState === 'matched' && shouldAutoOpenMatchArena(groupStartCountdownSeconds)
            ? groupMatchStatus?.matchId ?? roomWarmupMatchId
            : roomWarmupMatchId
          : roomWarmupMatchId);

    if (!warmupMatchId) {
      if (!officialStartBaselineRef.current) {
        preStartWarmupMatchIdRef.current = null;
      }
      return;
    }

    if (status !== 'idle') {
      return;
    }

    if (autoStartedMatchIdRef.current === warmupMatchId) {
      return;
    }

    if (skippedAndroidWarmupMatchIdRef.current === warmupMatchId) {
      return;
    }

    startMatchTrackingAutomatically(warmupMatchId, { allowCountdownWarmup: true });
  }, [
    autoStartedMatchIdRef,
    duelMatchState,
    duelMatchStatus?.matchId,
    duelStartCountdownSeconds,
    groupMatchState,
    groupMatchStatus?.matchId,
    groupStartCountdownSeconds,
    hasLifecycleController,
    lifecycleWarmupMatchId,
    matchMode,
    officialStartBaselineRef,
    preStartWarmupMatchIdRef,
    roomLinkedMatchContext,
    skippedAndroidWarmupMatchIdRef,
    startMatchTrackingAutomatically,
    status,
    trackingSubscriptionsEnabled,
    visiblePartyRunShouldOpenArena,
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

      if (getBackgroundRunTrackingSnapshot({ cloneRoute: false }).status !== 'running') {
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
