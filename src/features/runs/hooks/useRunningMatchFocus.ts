import { useCallback, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { ScrollView } from 'react-native';
import {
  getMatchStartRemainingSeconds,
  shouldAutoOpenMatchArena,
} from '@/lib/matchCountdown';
import type {
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import {
  formatMatchDateKey,
  resolveMatchTimeSection,
  type MatchTimeSection,
} from '@/features/runs/matchScheduling';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  buildLiveMatchNavigationKey,
  shouldPromoteLiveMatchArena,
  shouldReuseRecentLiveMatchNavigation,
  type LiveMatchNavigationResult,
} from '@/features/runs/liveMatchNavigationGate';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type FocusRunningMatchInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId?: string;
  distanceKm?: number;
  slotStartAt?: string;
  isTestMatch?: boolean;
  preferArena?: boolean;
  source?: string;
};

type LoadMatchStatusOptions = {
  testMode?: boolean;
  distanceKm?: number;
  matchId?: string;
  forceAccept?: boolean;
};

type UseRunningMatchFocusInput = {
  livePagerRef: RefObject<ScrollView | null>;
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  focusedDuelMatchIdRef: MutableRefObject<string | null>;
  focusedGroupMatchIdRef: MutableRefObject<string | null>;
  setMatchMode: Dispatch<SetStateAction<RunMatchMode>>;
  setDuelDistanceText: Dispatch<SetStateAction<string>>;
  setGroupDistanceText: Dispatch<SetStateAction<string>>;
  setSelectedDuelSlotStartAt: Dispatch<SetStateAction<string>>;
  setSelectedGroupSlotStartAt: Dispatch<SetStateAction<string>>;
  setSelectedDuelDateKey: Dispatch<SetStateAction<string>>;
  setSelectedGroupDateKey: Dispatch<SetStateAction<string>>;
  setSelectedDuelTimeSection: Dispatch<SetStateAction<MatchTimeSection>>;
  setSelectedGroupTimeSection: Dispatch<SetStateAction<MatchTimeSection>>;
  setLiveArenaPage: Dispatch<SetStateAction<number>>;
  setForceOpenActiveMatch: Dispatch<SetStateAction<boolean>>;
  setIsResolvingFocusedMatch: Dispatch<SetStateAction<boolean>>;
  getSyncedNowMs: () => number;
  loadDuelMatchStatus: (slotStartAt?: string, options?: LoadMatchStatusOptions) => Promise<RunningMatchStatusResponse>;
  loadGroupMatchStatus: (slotStartAt?: string, options?: LoadMatchStatusOptions) => Promise<RunningMatchStatusResponse>;
};

type ActiveLiveMatchNavigation = {
  key: string;
  preferArena: boolean;
  promise: Promise<LiveMatchNavigationResult>;
  requestId: string;
};

type CompletedLiveMatchNavigation = {
  completedAtMs: number;
  key: string;
  preferArena: boolean;
  result: LiveMatchNavigationResult;
};

export function useRunningMatchFocus({
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
  loadDuelMatchStatus,
  loadGroupMatchStatus,
}: UseRunningMatchFocusInput) {
  const activeNavigationRef = useRef<ActiveLiveMatchNavigation | null>(null);
  const completedNavigationRef = useRef<CompletedLiveMatchNavigation | null>(null);
  const navigationSequenceRef = useRef(0);

  const promoteLiveArena = useCallback(() => {
    setForceOpenActiveMatch(true);
    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [livePagerRef, setForceOpenActiveMatch, setLiveArenaPage]);

  const focusRunningMatch = useCallback(async ({
    mode,
    matchId,
    distanceKm,
    slotStartAt,
    isTestMatch,
    preferArena = false,
    source = 'running match focus',
  }: FocusRunningMatchInput) => {
    const navigationKey = buildLiveMatchNavigationKey({
      distanceKm,
      isTestMatch,
      matchId,
      mode,
      slotStartAt,
    });
    const activeNavigation = activeNavigationRef.current;

    if (activeNavigation?.key === navigationKey) {
      if (preferArena && !activeNavigation.preferArena) {
        activeNavigation.preferArena = true;
        promoteLiveArena();
      }

      rgPerfMark('live match navigation reuse', {
        matchId: matchId ?? null,
        mode,
        navigationKey,
        preferArena,
        requestId: activeNavigation.requestId,
        source,
      });

      return activeNavigation.promise;
    }

    const completedNavigation = completedNavigationRef.current;
    const nowMs = Date.now();
    if (shouldReuseRecentLiveMatchNavigation({
      completedAtMs: completedNavigation?.completedAtMs,
      lastKey: completedNavigation?.key,
      nextKey: navigationKey,
      nowMs,
    })) {
      const shouldPromoteArena = shouldPromoteLiveMatchArena({
        currentPreferArena: completedNavigation?.preferArena,
        matchState: completedNavigation?.result?.state,
        requestedPreferArena: preferArena,
      });

      if (shouldPromoteArena) {
        promoteLiveArena();
        if (completedNavigation) {
          completedNavigation.preferArena = true;
        }
      }

      rgPerfMark('live match navigation skipped', {
        matchId: matchId ?? null,
        mode,
        navigationKey,
        preferArena,
        reason: 'recent-complete',
        source,
      });

      return completedNavigation?.result ?? null;
    }

    navigationSequenceRef.current += 1;
    const requestId = `live-nav-${navigationSequenceRef.current}`;
    const endNavigationTrace = rgPerfMeasureStart('live match navigation', {
      matchId: matchId ?? null,
      mode,
      navigationKey,
      preferArena,
      requestId,
      source,
    });

    const navigationPromise = (async (): Promise<LiveMatchNavigationResult> => {
      let navigationTraceSucceeded = false;
      let navigationResult: LiveMatchNavigationResult = null;
      let effectivePreferArena = Boolean(preferArena);
      let navigationState: string | null = null;

      setLiveArenaPage(0);
      livePagerRef.current?.scrollTo({ x: 0, animated: false });
      setForceOpenActiveMatch(Boolean(preferArena));
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
            requestedPreferArena: preferArena || (
              payload.state === 'matched'
              && shouldAutoOpenMatchArena(getMatchStartRemainingSeconds(payload.slotStartAt, getSyncedNowMs()))
            ),
          });
          setForceOpenActiveMatch(effectivePreferArena);
          navigationTraceSucceeded = true;
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
          requestedPreferArena: preferArena || (
            payload.state === 'matched'
            && shouldAutoOpenMatchArena(getMatchStartRemainingSeconds(payload.slotStartAt, getSyncedNowMs()))
          ),
        });
        setForceOpenActiveMatch(effectivePreferArena);
        navigationTraceSucceeded = true;
        navigationResult = payload;
        return payload;
      } finally {
        if (navigationTraceSucceeded) {
          completedNavigationRef.current = {
            completedAtMs: Date.now(),
            key: navigationKey,
            preferArena: effectivePreferArena,
            result: navigationResult,
          };
        }

        endNavigationTrace({
          effectivePreferArena,
          state: navigationState,
          success: navigationTraceSucceeded,
        });

        if (activeNavigationRef.current?.requestId === requestId) {
          activeNavigationRef.current = null;
          setIsResolvingFocusedMatch(false);
        }
      }
    })();

    activeNavigationRef.current = {
      key: navigationKey,
      preferArena: Boolean(preferArena),
      promise: navigationPromise,
      requestId,
    };

    return navigationPromise;
  }, [
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    getSyncedNowMs,
    livePagerRef,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
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
    promoteLiveArena,
  ]);

  const focusRoomLinkedMatch = useCallback(async (room: RunningMatchRoom, options?: { preferArena?: boolean; source?: string }) => {
    if (!room.linkedMatchId) {
      return null;
    }

    return focusRunningMatch({
      mode: room.mode,
      matchId: room.linkedMatchId ?? undefined,
      distanceKm: room.linkedMatchDistanceKm ?? room.distanceKm,
      slotStartAt: room.linkedMatchSlotStartAt ?? room.slotStartAt,
      isTestMatch: false,
      preferArena: Boolean(options?.preferArena),
      source: options?.source ?? 'room linked match sync',
    });
  }, [focusRunningMatch]);

  return {
    focusRoomLinkedMatch,
    focusRunningMatch,
  };
}
