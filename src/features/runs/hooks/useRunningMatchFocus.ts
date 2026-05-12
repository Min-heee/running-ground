import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
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

type FocusRunningMatchInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId?: string;
  distanceKm?: number;
  slotStartAt?: string;
  isTestMatch?: boolean;
  preferArena?: boolean;
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
  const focusRunningMatch = useCallback(async ({
    mode,
    matchId,
    distanceKm,
    slotStartAt,
    isTestMatch,
    preferArena = false,
  }: FocusRunningMatchInput) => {
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
        setForceOpenActiveMatch(
          payload.state === 'active'
            || (payload.state === 'matched' && (
              preferArena
              || shouldAutoOpenMatchArena(getMatchStartRemainingSeconds(payload.slotStartAt, getSyncedNowMs()))
            )),
        );
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
      setForceOpenActiveMatch(
        payload.state === 'active'
        || (payload.state === 'matched' && (
          preferArena
          || shouldAutoOpenMatchArena(getMatchStartRemainingSeconds(payload.slotStartAt, getSyncedNowMs()))
        )),
      );
      return payload;
    } finally {
      setIsResolvingFocusedMatch(false);
    }
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
  ]);

  const focusRoomLinkedMatch = useCallback(async (room: RunningMatchRoom, options?: { preferArena?: boolean }) => {
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
    });
  }, [focusRunningMatch]);

  return {
    focusRoomLinkedMatch,
    focusRunningMatch,
  };
}
