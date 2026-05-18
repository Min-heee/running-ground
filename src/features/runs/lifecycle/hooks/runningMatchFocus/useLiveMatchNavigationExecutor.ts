import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { ScrollView } from 'react-native';
import {
  getMatchStartRemainingSeconds,
  shouldAutoOpenMatchArena,
} from '@/lib/matchCountdown';
import {
  formatMatchDateKey,
  resolveMatchTimeSection,
} from '@/features/runs/utils/matchScheduling';
import {
  shouldPromoteLiveMatchArena,
  type LiveMatchNavigationResult,
} from '@/features/runs/lifecycle/liveMatchNavigationGate';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import type { rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import type {
  ActiveLiveMatchNavigation,
  CompletedLiveMatchNavigation,
  FocusRunningMatchInput,
  LiveMatchNavigationRecord,
  LoadMatchStatusOptions,
} from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import type { MatchTimeSection } from '@/features/runs/utils/matchScheduling';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  getLiveMatchNavigationTraceOutcome,
  getLiveMatchNavigationTraceSuccess,
  LIVE_MATCH_NAVIGATION_MOUNT_WAIT_MS,
  shouldKeepRouteStateNavigationPendingRecovery,
} from './useLiveMatchRecoveryPolicy';

type HydrateMatchFocusRoute = (input: Pick<
  FocusRunningMatchInput,
  'distanceKm' | 'matchId' | 'mode' | 'roomId' | 'slotStartAt' | 'source'
> & {
  navigationKey: string;
  preferArena: boolean;
  requestId: string;
}) => boolean;

type EndNavigationTrace = ReturnType<typeof rgPerfMeasureStart>;

type RunLiveMatchNavigationInput = FocusRunningMatchInput & {
  endNavigationTrace: EndNavigationTrace;
  getFailedRetryAtMs: (failedCount: number, nowMs?: number) => number;
  getMountWaitRetryAtMs: (nowMs?: number) => number;
  navigationKey: string;
  previousFailedCount: number;
  requestId: string;
  requestedPreferArena: boolean;
};

export function useLiveMatchNavigationExecutor({
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
}: {
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  activeNavigationRef: MutableRefObject<ActiveLiveMatchNavigation | null>;
  completedNavigationRef: MutableRefObject<CompletedLiveMatchNavigation | null>;
  focusedDuelMatchIdRef: MutableRefObject<string | null>;
  focusedGroupMatchIdRef: MutableRefObject<string | null>;
  getSyncedNowMs: () => number;
  hydrateMatchFocusRoute: HydrateMatchFocusRoute;
  isLiveMatchViewConfirmed?: (input: { matchId: string; mode: Extract<RunMatchMode, 'duel' | 'group'> }) => boolean;
  livePagerRef: RefObject<ScrollView | null>;
  loadDuelMatchStatus: (slotStartAt?: string, options?: LoadMatchStatusOptions) => Promise<RunningMatchStatusResponse>;
  loadGroupMatchStatus: (slotStartAt?: string, options?: LoadMatchStatusOptions) => Promise<RunningMatchStatusResponse>;
  navigationRecordRef: MutableRefObject<LiveMatchNavigationRecord | null>;
  setDuelDistanceText: Dispatch<SetStateAction<string>>;
  setForceOpenActiveMatch: Dispatch<SetStateAction<boolean>>;
  setGroupDistanceText: Dispatch<SetStateAction<string>>;
  setIsResolvingFocusedMatch: Dispatch<SetStateAction<boolean>>;
  setLiveArenaPage: Dispatch<SetStateAction<number>>;
  setMatchMode: Dispatch<SetStateAction<RunMatchMode>>;
  setSelectedDuelDateKey: Dispatch<SetStateAction<string>>;
  setSelectedDuelSlotStartAt: Dispatch<SetStateAction<string>>;
  setSelectedDuelTimeSection: Dispatch<SetStateAction<MatchTimeSection>>;
  setSelectedGroupDateKey: Dispatch<SetStateAction<string>>;
  setSelectedGroupSlotStartAt: Dispatch<SetStateAction<string>>;
  setSelectedGroupTimeSection: Dispatch<SetStateAction<MatchTimeSection>>;
}) {
  return useCallback(async ({
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
    source = 'running match focus',
  }: RunLiveMatchNavigationInput): Promise<LiveMatchNavigationResult> => {
    let navigationResult: LiveMatchNavigationResult = null;
    let effectivePreferArena = requestedPreferArena;
    let navigationState: string | null = null;
    let routeStateHydrated = false;

    const markRouteStateHydrated = () => {
      if (routeStateHydrated) {
        return;
      }

      routeStateHydrated = hydrateMatchFocusRoute({
        distanceKm,
        matchId,
        mode,
        navigationKey,
        preferArena: requestedPreferArena,
        requestId,
        roomId,
        slotStartAt,
        source,
      });
    };

    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
    setForceOpenActiveMatch(requestedPreferArena);
    setIsResolvingFocusedMatch(true);

    try {
      if (mode === 'duel') {
        setMatchMode('duel');
        if (typeof distanceKm === 'number' && Number.isFinite(distanceKm)) {
          setDuelDistanceText(String(distanceKm));
        }

        if (slotStartAt) {
          setSelectedDuelSlotStartAt(slotStartAt);
          setSelectedDuelDateKey(formatMatchDateKey(new Date(slotStartAt)));
          setSelectedDuelTimeSection(resolveMatchTimeSection(slotStartAt));
        }
        focusedDuelMatchIdRef.current = matchId ?? focusedDuelMatchIdRef.current;
        markRouteStateHydrated();

        const payload = await loadDuelMatchStatus(slotStartAt ?? activeDuelSlotStartAt, {
          distanceKm,
          testMode: isTestMatch,
          matchId,
        });
        navigationState = payload.state;
        effectivePreferArena = shouldPromoteLiveMatchArena({
          currentPreferArena: activeNavigationRef.current?.key === navigationKey
            ? activeNavigationRef.current.preferArena
            : false,
          matchState: payload.state,
          requestedPreferArena: requestedPreferArena || (
            payload.state === 'matched'
            && shouldAutoOpenMatchArena(getMatchStartRemainingSeconds(payload.slotStartAt, getSyncedNowMs()))
          ),
        });
        setForceOpenActiveMatch(effectivePreferArena);
        navigationResult = payload;
        return payload;
      }

      setMatchMode('group');
      if (typeof distanceKm === 'number' && Number.isFinite(distanceKm)) {
        setGroupDistanceText(String(distanceKm));
      }

      if (slotStartAt) {
        setSelectedGroupSlotStartAt(slotStartAt);
        setSelectedGroupDateKey(formatMatchDateKey(new Date(slotStartAt)));
        setSelectedGroupTimeSection(resolveMatchTimeSection(slotStartAt));
      }
      focusedGroupMatchIdRef.current = matchId ?? focusedGroupMatchIdRef.current;
      markRouteStateHydrated();

      const payload = await loadGroupMatchStatus(slotStartAt ?? activeGroupSlotStartAt, {
        distanceKm,
        testMode: isTestMatch,
        matchId,
      });
      navigationState = payload.state;
      effectivePreferArena = shouldPromoteLiveMatchArena({
        currentPreferArena: activeNavigationRef.current?.key === navigationKey
          ? activeNavigationRef.current.preferArena
          : false,
        matchState: payload.state,
        requestedPreferArena: requestedPreferArena || (
          payload.state === 'matched'
          && shouldAutoOpenMatchArena(getMatchStartRemainingSeconds(payload.slotStartAt, getSyncedNowMs()))
        ),
      });
      setForceOpenActiveMatch(effectivePreferArena);
      navigationResult = payload;
      return payload;
    } catch (navigationError) {
      if (routeStateHydrated && matchId) {
        rgPerfMark('live match navigation route state only', {
          matchId,
          mode,
          navigationKey,
          requestId,
          source,
        });
        return null;
      }

      throw navigationError;
    } finally {
      const isCurrentRequest = navigationRecordRef.current?.requestId === requestId;
      const wasMountedBySignal = navigationRecordRef.current?.key === navigationKey
        && navigationRecordRef.current.status === 'mounted';
      const confirmedByLiveMatchView = Boolean(
        matchId
        && isLiveMatchViewConfirmed?.({ matchId, mode }),
      );
      const existingRecord = navigationRecordRef.current?.key === navigationKey
        ? navigationRecordRef.current
        : null;
      const wasRecoveringNavigation = Boolean(
        existingRecord?.status === 'recovering'
        || previousFailedCount > 0
      );
      const routeStateOnly = shouldKeepRouteStateNavigationPendingRecovery({
        confirmedByLiveMatchView,
        isCurrentRequest,
        matchId,
        routeStateHydrated,
        wasMountedBySignal,
      });
      const navigationSucceeded = wasMountedBySignal || confirmedByLiveMatchView;
      const navigationTraceOutcome = getLiveMatchNavigationTraceOutcome({
        navigationSucceeded,
        recovered: wasRecoveringNavigation,
        routeStateOnly,
      });

      if (navigationSucceeded && (isCurrentRequest || wasMountedBySignal)) {
        const finalPreferArena = effectivePreferArena || existingRecord?.preferArena || false;
        const finalResult = navigationResult ?? existingRecord?.result ?? null;

        completedNavigationRef.current = {
          completedAtMs: Date.now(),
          key: navigationKey,
          preferArena: finalPreferArena,
          result: finalResult,
        };
        navigationRecordRef.current = {
          failedCount: 0,
          key: navigationKey,
          mode,
          owner: existingRecord?.owner ?? source,
          preferArena: finalPreferArena,
          requestId,
          result: finalResult,
          status: 'mounted',
          updatedAtMs: Date.now(),
        };
        if (confirmedByLiveMatchView && !wasMountedBySignal) {
          rgPerfMark('live match navigation fallback mounted', {
            matchId,
            mode,
            navigationKey,
            requestId,
            source,
          });
        }
        if (wasMountedBySignal) {
          rgPerfMark('live match navigation confirmed by screen mount', {
            matchId,
            mode,
            navigationKey,
            requestId,
            source,
          });
        }
        if (navigationTraceOutcome === 'recovered' && !wasMountedBySignal) {
          rgPerfMark('live match navigation recovered by retry', {
            failedCount: previousFailedCount,
            matchId,
            mode,
            navigationKey,
            requestId,
            source,
          });
        }
      } else if (routeStateOnly && navigationRecordRef.current?.requestId === requestId) {
        const recoveryCount = previousFailedCount + 1;
        navigationRecordRef.current = {
          failedCount: recoveryCount,
          key: navigationKey,
          mode,
          nextRetryAtMs: getMountWaitRetryAtMs(),
          owner: source,
          preferArena: effectivePreferArena,
          requestId,
          result: navigationResult,
          status: 'recovering',
          updatedAtMs: Date.now(),
        };
        rgPerfMark('live match navigation route state only', {
          matchId,
          mode,
          navigationKey,
          recoveryCount,
          requestId,
          source,
        });
        rgPerfMark('live match mount signal missing reason', {
          matchId,
          mode,
          navigationKey,
          reason: 'route-state-only-waiting-for-shell-mount',
          recoveryCount,
          requestId,
          source,
        });
        rgPerfMark('live match navigation waiting for mount signal', {
          matchId,
          mode,
          navigationKey,
          recoveryCount,
          retryInMs: LIVE_MATCH_NAVIGATION_MOUNT_WAIT_MS,
          requestId,
          source,
        });
        rgPerfMark('live match navigation pending recovery', {
          matchId,
          mode,
          navigationKey,
          recoveryCount,
          requestId,
          source,
        });
      } else if (navigationRecordRef.current?.requestId === requestId) {
        const failedCount = previousFailedCount + 1;
        rgPerfMark('live match mount signal missing reason', {
          matchId: matchId ?? null,
          mode,
          navigationKey,
          reason: routeStateHydrated
            ? 'navigation-failed-after-route-hydration'
            : 'target-route-not-hydrated',
          requestId,
          source,
        });
        navigationRecordRef.current = {
          failedCount,
          key: navigationKey,
          mode,
          nextRetryAtMs: getFailedRetryAtMs(failedCount),
          owner: source,
          preferArena: effectivePreferArena,
          requestId,
          result: navigationResult,
          status: 'failed',
          updatedAtMs: Date.now(),
        };
        rgPerfMark('live match navigation failure finalized', {
          failedCount,
          matchId: matchId ?? null,
          mode,
          navigationKey,
          requestId,
          source,
        });
      }

      endNavigationTrace({
        completedByMountSignal: wasMountedBySignal,
        completedByLiveMatchView: confirmedByLiveMatchView,
        routeStateOnly,
        effectivePreferArena: effectivePreferArena || navigationRecordRef.current?.preferArena || false,
        navigationRecoveryState: navigationTraceOutcome,
        pendingRecovery: routeStateOnly,
        recovered: navigationTraceOutcome === 'recovered',
        state: navigationState,
        success: getLiveMatchNavigationTraceSuccess({
          navigationSucceeded,
          recoveryOutcome: navigationTraceOutcome,
          routeStateOnly,
        }),
      });

      if (activeNavigationRef.current?.requestId === requestId) {
        activeNavigationRef.current = null;
        setIsResolvingFocusedMatch(false);
      }
    }
  }, [
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
  ]);
}
