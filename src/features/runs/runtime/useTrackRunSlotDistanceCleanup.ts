import type { Dispatch, SetStateAction } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type {
  MatchLifecycleController,
  MatchLifecycleStage,
} from '@/features/runs/lifecycle/matchLifecycleController';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type {
  RequestDuelMatchResponse,
  RequestGroupMatchResponse,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import { rgDiagLog } from '@/utils/rgPerfTrace';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

type UseTrackRunSlotDistanceCleanupInput = {
  duelDistanceKm: number;
  groupDistanceKm: number;
  matchLifecycleSource: MatchLifecycleController['source'];
  matchLifecycleStage: MatchLifecycleStage;
  matchMode: RunMatchMode;
  roomLinkedMatchMode: PartyRunLinkedMatchContext['mode'] | undefined;
  selectedDuelSlot: { startsAt: string } | null;
  selectedDuelSlotStartAt: string;
  selectedGroupSlot: { startsAt: string } | null;
  selectedGroupSlotStartAt: string;
  setDuelMatchNotice: Dispatch<SetStateAction<string | null>>;
  setDuelMatchResult: Dispatch<SetStateAction<RequestDuelMatchResponse | null>>;
  setDuelMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  setGroupMatchNotice: Dispatch<SetStateAction<string | null>>;
  setGroupMatchResult: Dispatch<SetStateAction<RequestGroupMatchResponse | null>>;
  setGroupMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
};

export function useTrackRunSlotDistanceCleanup({
  duelDistanceKm,
  groupDistanceKm,
  matchLifecycleSource,
  matchLifecycleStage,
  matchMode,
  roomLinkedMatchMode,
  selectedDuelSlot,
  selectedDuelSlotStartAt,
  selectedGroupSlot,
  selectedGroupSlotStartAt,
  setDuelMatchNotice,
  setDuelMatchResult,
  setDuelMatchStatus,
  setGroupMatchNotice,
  setGroupMatchResult,
  setGroupMatchStatus,
}: UseTrackRunSlotDistanceCleanupInput) {
  const shouldSkipDuelSlotDistanceCleanup = matchLifecycleSource === 'party-room'
    && roomLinkedMatchMode === 'duel'
    && matchLifecycleStage !== 'waiting';
  const shouldSkipGroupSlotDistanceCleanup = matchLifecycleSource === 'party-room'
    && roomLinkedMatchMode === 'group'
    && matchLifecycleStage !== 'waiting';

  useAndroidDeferredEffect(() => {
    if (matchMode !== 'duel' || shouldSkipDuelSlotDistanceCleanup) {
      return;
    }

    setDuelMatchResult((current) => {
      if (!current) {
        return null;
      }

      if (current.isTestMatch) {
        return current;
      }

      if (current.matched) {
        return current;
      }

      const activeSlotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt;
      return current.distanceKm === duelDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setDuelMatchStatus((current) => {
      if (!current) {
        return null;
      }

      if (current.isTestMatch) {
        return current;
      }

      if (current.matchId) {
        return current;
      }

      const activeSlotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt;
      const shouldKeepStatus = current.distanceKm === duelDistanceKm && current.slotStartAt === activeSlotStartAt;
      if (!shouldKeepStatus) {
        rgDiagLog('duel match status reset by slot/distance effect', {
          currentDistanceKm: current.distanceKm,
          currentMatchId: current.matchId ?? null,
          currentSlotStartAt: current.slotStartAt ?? null,
          currentState: current.state,
          isTestMatch: current.isTestMatch,
          nextDistanceKm: duelDistanceKm,
          nextSlotStartAt: activeSlotStartAt ?? null,
          reason: 'slot-or-distance-mismatch',
        });
      }
      return shouldKeepStatus ? current : null;
    });
    setDuelMatchNotice(null);
  }, [duelDistanceKm, matchMode, selectedDuelSlot, selectedDuelSlotStartAt, shouldSkipDuelSlotDistanceCleanup]);

  useAndroidDeferredEffect(() => {
    if (matchMode !== 'group' || shouldSkipGroupSlotDistanceCleanup) {
      return;
    }

    setGroupMatchResult((current) => {
      if (!current) {
        return null;
      }

      if (current.isTestMatch) {
        return current;
      }

      if (current.matched) {
        return current;
      }

      const activeSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;
      return current.distanceKm === groupDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setGroupMatchStatus((current) => {
      if (!current) {
        return null;
      }

      if (current.isTestMatch) {
        return current;
      }

      if (current.matchId) {
        return current;
      }

      const activeSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;
      return current.distanceKm === groupDistanceKm && current.slotStartAt === activeSlotStartAt ? current : null;
    });
    setGroupMatchNotice(null);
  }, [groupDistanceKm, matchMode, selectedGroupSlot, selectedGroupSlotStartAt, shouldSkipGroupSlotDistanceCleanup]);
}
