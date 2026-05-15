import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import {
  cancelRunningMatch,
  fetchMatchDemandSummary,
  getApiErrorMessage,
  requestDuelMatch,
  requestGroupMatch,
} from '@/services';
import type { UseTrackRunRuntimeMatchActionsInput } from '@/features/runs/runtime/trackRunRuntimeMatchActionTypes';

export function useTrackRunRuntimeMatchRequestActions(input: UseTrackRunRuntimeMatchActionsInput) {
  const {
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    duelDistanceKm,
    duelMatchState,
    duelMatchStatus,
    groupDistanceKm,
    groupMatchState,
    groupMatchStatus,
    isDuelTestFlow,
    isGroupTestFlow,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
    loadUpcomingMatches,
    selectedDuelSlot,
    selectedDuelSlotStartAt,
    selectedGroupSlot,
    selectedGroupSlotStartAt,
    setCancelingUpcomingMatchId,
    setDuelDemandSummary,
    setDuelMatchNotice,
    setDuelMatchResult,
    setDuelMatchStatus,
    setError,
    setGroupDemandSummary,
    setGroupMatchNotice,
    setGroupMatchResult,
    setGroupMatchStatus,
    setIsCancelingDuelMatch,
    setIsCancelingGroupMatch,
    setIsRequestingDuelMatch,
    setIsRequestingGroupMatch,
  } = input;

  async function handleRequestDuelMatch(slotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt, options?: { testMode?: boolean }) {
    try {
      setError(null);
      setDuelMatchNotice(null);
      setIsRequestingDuelMatch(true);
      const payload = await requestDuelMatch({ distanceKm: duelDistanceKm, slotStartAt, testMode: options?.testMode });

      setDuelMatchResult(payload);
      if (payload.isTestMatch) {
        setDuelDemandSummary(null);
        await loadDuelMatchStatus(slotStartAt, { testMode: true });
      } else {
        const [nextSummary] = await Promise.all([
          fetchMatchDemandSummary({ mode: 'duel', distanceKm: duelDistanceKm, slotStartAt }),
          loadDuelMatchStatus(slotStartAt),
        ]);
        setDuelDemandSummary(nextSummary);
      }
    } catch (matchError) {
      setError(getApiErrorMessage(matchError, '1대1 매칭을 찾지 못했어.'));
    } finally {
      setIsRequestingDuelMatch(false);
    }
  }

  async function handleRequestGroupMatch(slotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt, options?: { testMode?: boolean }) {
    try {
      setError(null);
      setGroupMatchNotice(null);
      setIsRequestingGroupMatch(true);
      const payload = await requestGroupMatch({ distanceKm: groupDistanceKm, slotStartAt, testMode: options?.testMode });

      setGroupMatchResult(payload);
      if (payload.isTestMatch) {
        setGroupDemandSummary(null);
        await loadGroupMatchStatus(slotStartAt, { testMode: true });
      } else {
        const [nextSummary] = await Promise.all([
          fetchMatchDemandSummary({ mode: 'group', distanceKm: groupDistanceKm, slotStartAt }),
          loadGroupMatchStatus(slotStartAt),
        ]);
        setGroupDemandSummary(nextSummary);
      }
    } catch (matchError) {
      setError(getApiErrorMessage(matchError, '그룹 매칭을 찾지 못했어.'));
    } finally {
      setIsRequestingGroupMatch(false);
    }
  }

  async function handleCancelDuelMatch() {
    try {
      if (duelMatchState === 'matched' && duelMatchStatus?.canCancel === false) {
        throw new Error('출발 1시간 전부터는 예약을 취소할 수 없어.');
      }

      const wasTestMatch = isDuelTestFlow;
      setError(null);
      setDuelMatchNotice(null);
      setIsCancelingDuelMatch(true);
      await cancelRunningMatch({
        mode: 'duel',
        distanceKm: duelDistanceKm,
        slotStartAt: activeDuelSlotStartAt,
        testMode: wasTestMatch,
        ...(duelMatchStatus?.matchId ? { matchId: duelMatchStatus.matchId } : {}),
      });
      setDuelMatchResult(null);
      const nextStatus = await loadDuelMatchStatus(activeDuelSlotStartAt, { testMode: wasTestMatch });
      if (wasTestMatch) {
        setDuelDemandSummary(null);
      } else {
        setDuelDemandSummary(await fetchMatchDemandSummary({ mode: 'duel', distanceKm: duelDistanceKm, slotStartAt: activeDuelSlotStartAt }));
      }
      if (nextStatus.state === 'idle') {
        setDuelMatchStatus(null);
      }
    } catch (matchError) {
      setError(getApiErrorMessage(matchError, '1대1 매치를 취소하지 못했어.'));
    } finally {
      setIsCancelingDuelMatch(false);
    }
  }

  async function handleCancelGroupMatch() {
    try {
      if (groupMatchState === 'matched' && groupMatchStatus?.canCancel === false) {
        throw new Error('출발 1시간 전부터는 예약을 취소할 수 없어.');
      }

      const wasTestMatch = isGroupTestFlow;
      setError(null);
      setGroupMatchNotice(null);
      setIsCancelingGroupMatch(true);
      await cancelRunningMatch({
        mode: 'group',
        distanceKm: groupDistanceKm,
        slotStartAt: activeGroupSlotStartAt,
        testMode: wasTestMatch,
        ...(groupMatchStatus?.matchId ? { matchId: groupMatchStatus.matchId } : {}),
      });
      setGroupMatchResult(null);
      const nextStatus = await loadGroupMatchStatus(activeGroupSlotStartAt, { testMode: wasTestMatch });
      if (wasTestMatch) {
        setGroupDemandSummary(null);
      } else {
        setGroupDemandSummary(await fetchMatchDemandSummary({ mode: 'group', distanceKm: groupDistanceKm, slotStartAt: activeGroupSlotStartAt }));
      }
      if (nextStatus.state === 'idle') {
        setGroupMatchStatus(null);
      }
    } catch (matchError) {
      setError(getApiErrorMessage(matchError, '그룹 매치를 취소하지 못했어.'));
    } finally {
      setIsCancelingGroupMatch(false);
    }
  }

  async function handleCancelUpcomingMatch(match: UpcomingRunningMatchItem) {
    try {
      if (!match.canCancel) {
        throw new Error('출발 1시간 전부터는 예약을 취소할 수 없어.');
      }

      setError(null);
      setCancelingUpcomingMatchId(match.matchId);
      await cancelRunningMatch({
        mode: match.mode,
        distanceKm: match.distanceKm,
        slotStartAt: match.slotStartAt,
        matchId: match.matchId,
      });
      await loadUpcomingMatches();
      if (match.mode === 'duel' && duelMatchStatus?.matchId === match.matchId) {
        setDuelMatchResult(null);
        setDuelMatchStatus(null);
      }
      if (match.mode === 'group' && groupMatchStatus?.matchId === match.matchId) {
        setGroupMatchResult(null);
        setGroupMatchStatus(null);
      }
    } catch (cancelError) {
      setError(getApiErrorMessage(cancelError, '예약을 취소하지 못했어.'));
    } finally {
      setCancelingUpcomingMatchId(null);
    }
  }

  return {
    handleCancelDuelMatch,
    handleCancelGroupMatch,
    handleCancelUpcomingMatch,
    handleRequestDuelMatch,
    handleRequestGroupMatch,
  };
}
