import { useCallback, useRef } from 'react';
import {
  buildLiveMatchNavigationKey,
} from '@/features/runs/lifecycle/liveMatchNavigationGate';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import {
  type ActiveLiveMatchNavigation,
  type CompletedLiveMatchNavigation,
  type FocusRunningMatchInput,
  type LiveMatchNavigationRecord,
  type UseRunningMatchFocusInput,
} from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';
import { useMatchFocusHydration } from '@/features/runs/lifecycle/hooks/runningMatchFocus/useMatchFocusHydration';
import {
  useLiveMatchRecoveryPolicy,
} from '@/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchRecoveryPolicy';
import { useLiveMatchMountSignalBridge } from '@/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchMountSignalBridge';
import { useLiveMatchNavigationExecutor } from '@/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationExecutor';
import {
  resolveActiveNavigationDuplicate,
  resolveExistingNavigationRecord,
  resolveRecentCompletedNavigation,
} from '@/features/runs/lifecycle/hooks/runningMatchFocus/liveMatchNavigationOwnerPolicy';

type UseLiveMatchNavigationOwnerInput = UseRunningMatchFocusInput;

export function useLiveMatchNavigationOwner({
  livePagerRef,
  activeDuelSlotStartAt,
  activeGroupSlotStartAt,
  focusedDuelMatchIdRef,
  focusedGroupMatchIdRef,
  setMatchMode,
  setDuelDistanceText,
  setGroupDistanceText,
  setSelectedDuelSlotStartAt,
  setSelectedGroupSlotStartAt,
  setSelectedDuelDateKey,
  setSelectedGroupDateKey,
  setSelectedDuelTimeSection,
  setSelectedGroupTimeSection,
  setLiveArenaPage,
  setForceOpenActiveMatch,
  setIsResolvingFocusedMatch,
  getSyncedNowMs,
  isLiveMatchViewConfirmed,
  loadDuelMatchStatus,
  loadGroupMatchStatus,
}: UseLiveMatchNavigationOwnerInput) {
  const activeNavigationRef = useRef<ActiveLiveMatchNavigation | null>(null);
  const completedNavigationRef = useRef<CompletedLiveMatchNavigation | null>(null);
  const navigationRecordRef = useRef<LiveMatchNavigationRecord | null>(null);
  const navigationSequenceRef = useRef(0);
  const hydrateMatchFocusRoute = useMatchFocusHydration();
  const {
    getFailedRetryAtMs,
    getMountWaitRetryAtMs,
    isInFailedBackoff,
    isWaitingForMountSignal,
    shouldSuppressRecoveryRetry,
  } = useLiveMatchRecoveryPolicy();

  const promoteLiveArena = useCallback(() => {
    setForceOpenActiveMatch(true);
    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [livePagerRef, setForceOpenActiveMatch, setLiveArenaPage]);

  const markLiveMatchMounted = useLiveMatchMountSignalBridge({
    activeNavigationRef,
    completedNavigationRef,
    navigationRecordRef,
    setIsResolvingFocusedMatch,
  });

  const runLiveMatchNavigation = useLiveMatchNavigationExecutor({
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    activeNavigationRef,
    completedNavigationRef,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    getSyncedNowMs,
    hydrateMatchFocusRoute,
    isLiveMatchViewConfirmed,
    livePagerRef,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
    navigationRecordRef,
    setDuelDistanceText,
    setForceOpenActiveMatch,
    setGroupDistanceText,
    setIsResolvingFocusedMatch,
    setLiveArenaPage,
    setMatchMode,
    setSelectedDuelDateKey,
    setSelectedDuelSlotStartAt,
    setSelectedDuelTimeSection,
    setSelectedGroupDateKey,
    setSelectedGroupSlotStartAt,
    setSelectedGroupTimeSection,
  });

  const focusRunningMatch = useCallback(async ({
    mode,
    matchId,
    distanceKm,
    slotStartAt,
    isTestMatch,
    preferArena = false,
    roomId,
    roomState,
    source = 'running match focus',
  }: FocusRunningMatchInput) => {
    const requestedPreferArena = Boolean(roomState === 'active' || preferArena);
    const navigationKey = buildLiveMatchNavigationKey({
      distanceKm,
      isTestMatch,
      matchId,
      mode,
      slotStartAt,
    });
    const activeNavigation = activeNavigationRef.current;
    const currentRecord = navigationRecordRef.current;

    const activeDuplicateResult = resolveActiveNavigationDuplicate({
      activeNavigation,
      currentRecord,
      matchId,
      mode,
      navigationKey,
      promoteLiveArena,
      requestedPreferArena,
      source,
    });
    if (activeDuplicateResult.handled) {
      return activeDuplicateResult.value;
    }

    const existingRecordResult = resolveExistingNavigationRecord({
      currentRecord,
      isInFailedBackoff,
      isWaitingForMountSignal,
      matchId,
      mode,
      navigationKey,
      navigationRecordRef,
      promoteLiveArena,
      requestedPreferArena,
      shouldSuppressRecoveryRetry,
      source,
    });
    if (existingRecordResult.handled) {
      return existingRecordResult.value;
    }

    const completedNavigation = completedNavigationRef.current;
    const nowMs = Date.now();
    const recentCompletedResult = resolveRecentCompletedNavigation({
      completedNavigation,
      matchId,
      mode,
      navigationKey,
      navigationRecordRef,
      nowMs,
      promoteLiveArena,
      requestedPreferArena,
      source,
    });
    if (recentCompletedResult.handled) {
      return recentCompletedResult.value;
    }

    navigationSequenceRef.current += 1;
    const requestId = `live-nav-${navigationSequenceRef.current}`;
    const previousFailedCount = currentRecord?.key === navigationKey ? currentRecord.failedCount : 0;
    navigationRecordRef.current = {
      failedCount: previousFailedCount,
      key: navigationKey,
      mode,
      owner: source,
      preferArena: requestedPreferArena,
      requestId,
      status: 'navigating',
      updatedAtMs: nowMs,
    };
    rgPerfMark('live match navigation owner selected', {
      matchId: matchId ?? null,
      mode,
      navigationKey,
      owner: source,
      preferArena: requestedPreferArena,
      requestId,
    });
    const endNavigationTrace = rgPerfMeasureStart('live match navigation', {
      matchId: matchId ?? null,
      mode,
      navigationKey,
      preferArena: requestedPreferArena,
      requestId,
      source,
    });

    const navigationPromise = runLiveMatchNavigation({
      distanceKm,
      endNavigationTrace,
      getFailedRetryAtMs,
      getMountWaitRetryAtMs,
      isTestMatch,
      matchId,
      mode,
      navigationKey,
      previousFailedCount,
      requestId,
      requestedPreferArena,
      roomId,
      slotStartAt,
      source,
    });

    activeNavigationRef.current = {
      key: navigationKey,
      preferArena: requestedPreferArena,
      promise: navigationPromise,
      requestId,
    };

    return navigationPromise;
  }, [
    getFailedRetryAtMs,
    getMountWaitRetryAtMs,
    isInFailedBackoff,
    isWaitingForMountSignal,
    shouldSuppressRecoveryRetry,
    promoteLiveArena,
    runLiveMatchNavigation,
  ]);

  return {
    focusRunningMatch,
    markLiveMatchMounted,
  };
}
