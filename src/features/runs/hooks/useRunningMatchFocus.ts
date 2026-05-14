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
} from '@/features/runs/utils/matchScheduling';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  buildLiveMatchNavigationKey,
  shouldPromoteLiveMatchArena,
  shouldReuseRecentLiveMatchNavigation,
  type LiveMatchNavigationResult,
} from '@/features/runs/lifecycle/liveMatchNavigationGate';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type FocusRunningMatchInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId?: string;
  distanceKm?: number;
  slotStartAt?: string;
  isTestMatch?: boolean;
  preferArena?: boolean;
  roomState?: RunningMatchRoom['state'];
  source?: string;
};

type MarkLiveMatchMountedInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId?: string | null;
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

type LiveMatchNavigationStatus =
  | 'idle'
  | 'navigating'
  | 'mounted'
  | 'failed'
  | 'suppressed';

type LiveMatchNavigationRecord = {
  failedCount: number;
  key: string;
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  nextRetryAtMs?: number;
  owner: string;
  preferArena: boolean;
  requestId?: string;
  result?: LiveMatchNavigationResult;
  status: LiveMatchNavigationStatus;
  updatedAtMs: number;
};

const LIVE_MATCH_NAVIGATION_FAILED_BACKOFF_MS = 10_000;

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
  const navigationRecordRef = useRef<LiveMatchNavigationRecord | null>(null);
  const navigationSequenceRef = useRef(0);

  const promoteLiveArena = useCallback(() => {
    setForceOpenActiveMatch(true);
    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [livePagerRef, setForceOpenActiveMatch, setLiveArenaPage]);

  const markLiveMatchMounted = useCallback(({
    mode,
    matchId,
    source = 'live match screen mount',
  }: MarkLiveMatchMountedInput) => {
    if (!matchId) {
      return;
    }

    const navigationKey = buildLiveMatchNavigationKey({ matchId, mode });
    const activeNavigation = activeNavigationRef.current;
    const currentRecord = navigationRecordRef.current;
    const matchedRecord = currentRecord?.key === navigationKey ? currentRecord : null;
    const matchedActiveNavigation = activeNavigation?.key === navigationKey ? activeNavigation : null;

    if (!matchedRecord && !matchedActiveNavigation) {
      return;
    }

    if (matchedRecord?.status === 'mounted') {
      rgPerfMark('live match navigation suppressed because mounted', {
        matchId,
        mode,
        navigationKey,
        owner: matchedRecord.owner,
        reason: 'screen-mount-duplicate',
        source,
      });
      return;
    }

    const preferArena = matchedRecord?.preferArena ?? matchedActiveNavigation?.preferArena ?? true;
    const owner = matchedRecord?.owner ?? source;
    const requestId = matchedRecord?.requestId ?? matchedActiveNavigation?.requestId;

    completedNavigationRef.current = {
      completedAtMs: Date.now(),
      key: navigationKey,
      preferArena,
      result: matchedRecord?.result ?? null,
    };
    navigationRecordRef.current = {
      failedCount: 0,
      key: navigationKey,
      mode,
      owner,
      preferArena,
      requestId,
      result: matchedRecord?.result ?? null,
      status: 'mounted',
      updatedAtMs: Date.now(),
    };

    if (matchedActiveNavigation) {
      activeNavigationRef.current = null;
      setIsResolvingFocusedMatch(false);
    }

    rgPerfMark('live match navigation marked mounted by screen mount', {
      matchId,
      mode,
      navigationKey,
      owner,
      requestId,
      source,
    });
    rgPerfMark('live match navigation completed by mount signal', {
      matchId,
      mode,
      navigationKey,
      owner,
      requestId,
      source,
    });
    rgPerfMark('live match navigation success detached from gps start', {
      matchId,
      mode,
      navigationKey,
      source,
    });
  }, [setIsResolvingFocusedMatch]);

  const focusRunningMatch = useCallback(async ({
    mode,
    matchId,
    distanceKm,
    slotStartAt,
    isTestMatch,
    preferArena = false,
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

    if (activeNavigation?.key === navigationKey) {
      if (requestedPreferArena && !activeNavigation.preferArena) {
        activeNavigation.preferArena = true;
        if (currentRecord?.key === navigationKey) {
          currentRecord.preferArena = true;
          currentRecord.updatedAtMs = Date.now();
        }
        promoteLiveArena();
        rgPerfMark('live match navigation upgraded preferArena', {
          matchId: matchId ?? null,
          mode,
          navigationKey,
          owner: currentRecord?.owner ?? null,
          requestId: activeNavigation.requestId,
          source,
        });
      }

      rgPerfMark('live match navigation skipped duplicate', {
        matchId: matchId ?? null,
        mode,
        navigationKey,
        owner: currentRecord?.owner ?? null,
        preferArena: requestedPreferArena,
        reason: 'navigating',
        requestId: activeNavigation.requestId,
        source,
      });

      return activeNavigation.promise;
    }

    if (currentRecord?.key === navigationKey) {
      if (currentRecord.status === 'mounted') {
        if (requestedPreferArena && !currentRecord.preferArena) {
          currentRecord.preferArena = true;
          currentRecord.updatedAtMs = Date.now();
          promoteLiveArena();
          rgPerfMark('live match navigation upgraded preferArena', {
            matchId: matchId ?? null,
            mode,
            navigationKey,
            owner: currentRecord.owner,
            source,
          });
        }

        rgPerfMark('live match navigation suppressed because mounted', {
          matchId: matchId ?? null,
          mode,
          navigationKey,
          owner: currentRecord.owner,
          preferArena: requestedPreferArena,
          source,
        });
        return currentRecord.result ?? null;
      }

      if (
        (currentRecord.status === 'failed' || currentRecord.status === 'suppressed')
        && typeof currentRecord.nextRetryAtMs === 'number'
        && Date.now() < currentRecord.nextRetryAtMs
      ) {
        currentRecord.status = 'suppressed';
        currentRecord.updatedAtMs = Date.now();
        rgPerfMark('live match navigation skipped duplicate', {
          matchId: matchId ?? null,
          mode,
          navigationKey,
          nextRetryInMs: currentRecord.nextRetryAtMs - Date.now(),
          owner: currentRecord.owner,
          preferArena: requestedPreferArena,
          reason: 'failed-backoff',
          source,
        });
        return currentRecord.result ?? null;
      }
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
        requestedPreferArena,
      });

      if (shouldPromoteArena) {
        promoteLiveArena();
        if (completedNavigation) {
          completedNavigation.preferArena = true;
        }
      }

      if (completedNavigation) {
        navigationRecordRef.current = {
          failedCount: 0,
          key: navigationKey,
          mode,
          owner: source,
          preferArena: completedNavigation.preferArena,
          result: completedNavigation.result,
          status: 'mounted',
          updatedAtMs: nowMs,
        };
      }

      rgPerfMark('live match navigation suppressed because mounted', {
        matchId: matchId ?? null,
        mode,
        navigationKey,
        preferArena: requestedPreferArena,
        reason: 'recent-complete',
        source,
      });

      return completedNavigation?.result ?? null;
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

    const navigationPromise = (async (): Promise<LiveMatchNavigationResult> => {
      let navigationTraceSucceeded = false;
      let navigationResult: LiveMatchNavigationResult = null;
      let effectivePreferArena = requestedPreferArena;
      let navigationState: string | null = null;

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
          requestedPreferArena: requestedPreferArena || (
            payload.state === 'matched'
            && shouldAutoOpenMatchArena(getMatchStartRemainingSeconds(payload.slotStartAt, getSyncedNowMs()))
          ),
        });
        setForceOpenActiveMatch(effectivePreferArena);
        navigationTraceSucceeded = true;
        navigationResult = payload;
        return payload;
      } finally {
        const isCurrentRequest = navigationRecordRef.current?.requestId === requestId;
        const wasMountedBySignal = navigationRecordRef.current?.key === navigationKey
          && navigationRecordRef.current.status === 'mounted';
        const navigationSucceeded = navigationTraceSucceeded || wasMountedBySignal;

        if (navigationSucceeded && (isCurrentRequest || wasMountedBySignal)) {
          const existingRecord = navigationRecordRef.current?.key === navigationKey
            ? navigationRecordRef.current
            : null;
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
        } else if (navigationRecordRef.current?.requestId === requestId) {
          const failedCount = previousFailedCount + 1;
          navigationRecordRef.current = {
            failedCount,
            key: navigationKey,
            mode,
            nextRetryAtMs: Date.now() + LIVE_MATCH_NAVIGATION_FAILED_BACKOFF_MS * failedCount,
            owner: source,
            preferArena: effectivePreferArena,
            requestId,
            result: navigationResult,
            status: 'failed',
            updatedAtMs: Date.now(),
          };
        }

        endNavigationTrace({
          completedByMountSignal: wasMountedBySignal,
          effectivePreferArena: effectivePreferArena || navigationRecordRef.current?.preferArena || false,
          state: navigationState,
          success: navigationSucceeded,
        });

        if (activeNavigationRef.current?.requestId === requestId) {
          activeNavigationRef.current = null;
          setIsResolvingFocusedMatch(false);
        }
      }
    })();

    activeNavigationRef.current = {
      key: navigationKey,
      preferArena: requestedPreferArena,
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
      roomState: room.state,
      source: options?.source ?? 'room linked match sync',
    });
  }, [focusRunningMatch]);

  return {
    focusRoomLinkedMatch,
    focusRunningMatch,
    markLiveMatchMounted,
  };
}
