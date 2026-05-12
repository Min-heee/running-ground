import { useMemo } from 'react';
import type {
  RunningMatchRoom,
  RunningMatchStatusResponse,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';
import {
  findNextStartingMatchedMatch,
  getMatchStartRemainingSeconds,
} from '@/lib/matchCountdown';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { useStableCountdownSeconds } from '@/features/runs/hooks/useStableCountdownSeconds';
import {
  buildPartyRunFlowSnapshot,
} from '@/features/runs/matchStateMachine';

type CountdownEntry = {
  title: string;
  subtitle: string;
  remainingSeconds: number;
};

type UseMatchCountdownModelInput = {
  matchMode: RunMatchMode;
  nowMs: number;
  syncedNowMs: number;
  visibleUpcomingMatches: UpcomingRunningMatchItem[];
  duelMatchState: RunningMatchStatusResponse['state'];
  groupMatchState: RunningMatchStatusResponse['state'];
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  visibleMatchRoom: RunningMatchRoom | null;
  matchRoom: RunningMatchRoom | null;
  currentRoomParticipantIsCountdownReady?: boolean | null;
};

export function useMatchCountdownModel({
  matchMode,
  nowMs,
  syncedNowMs,
  visibleUpcomingMatches,
  duelMatchState,
  groupMatchState,
  duelMatchStatus,
  groupMatchStatus,
  activeDuelSlotStartAt,
  activeGroupSlotStartAt,
  visibleMatchRoom,
  matchRoom,
  currentRoomParticipantIsCountdownReady,
}: UseMatchCountdownModelInput) {
  const rawDuelStartCountdownSeconds =
    duelMatchState === 'matched'
      ? getMatchStartRemainingSeconds(duelMatchStatus?.slotStartAt ?? activeDuelSlotStartAt, syncedNowMs)
      : null;
  const duelStartCountdownSeconds = useStableCountdownSeconds({
    key: duelMatchState === 'matched'
      ? `${duelMatchStatus?.matchId ?? 'duel'}:${duelMatchStatus?.slotStartAt ?? activeDuelSlotStartAt}`
      : null,
    rawRemainingSeconds: rawDuelStartCountdownSeconds,
    nowMs,
  });
  const rawGroupStartCountdownSeconds =
    groupMatchState === 'matched'
      ? getMatchStartRemainingSeconds(groupMatchStatus?.slotStartAt ?? activeGroupSlotStartAt, syncedNowMs)
      : null;
  const groupStartCountdownSeconds = useStableCountdownSeconds({
    key: groupMatchState === 'matched'
      ? `${groupMatchStatus?.matchId ?? 'group'}:${groupMatchStatus?.slotStartAt ?? activeGroupSlotStartAt}`
      : null,
    rawRemainingSeconds: rawGroupStartCountdownSeconds,
    nowMs,
  });
  const nextStartingMatch = useMemo(
    () => findNextStartingMatchedMatch(visibleUpcomingMatches, syncedNowMs),
    [syncedNowMs, visibleUpcomingMatches],
  );
  const stableNextStartingMatchKey = useMemo(
    () => nextStartingMatch
      ? `${nextStartingMatch.match.matchId}:${nextStartingMatch.match.slotStartAt}`
      : null,
    [nextStartingMatch],
  );
  const stableNextStartingMatchRemainingSeconds = useStableCountdownSeconds({
    key: stableNextStartingMatchKey,
    rawRemainingSeconds: nextStartingMatch?.remainingSeconds ?? null,
    nowMs,
  });
  const stableNextStartingMatch = useMemo(() => {
    if (!nextStartingMatch || stableNextStartingMatchRemainingSeconds === null) {
      return null;
    }

    return {
      ...nextStartingMatch,
      remainingSeconds: stableNextStartingMatchRemainingSeconds,
    };
  }, [nextStartingMatch, stableNextStartingMatchRemainingSeconds]);
  const activeUpcomingMatch = useMemo(
    () => visibleUpcomingMatches.find((match) => match.status === 'active') ?? null,
    [visibleUpcomingMatches],
  );
  const fallbackCountdownEntry = useMemo<CountdownEntry | null>(() => {
    if (matchMode === 'duel' && duelMatchState === 'matched' && duelMatchStatus && typeof duelStartCountdownSeconds === 'number') {
      return {
        title: '1대1 대결 곧 시작',
        subtitle: `${duelMatchStatus.opponent?.name ?? '상대'} · ${duelMatchStatus.distanceKm.toFixed(1)}km`,
        remainingSeconds: duelStartCountdownSeconds,
      };
    }

    if (matchMode === 'group' && groupMatchState === 'matched' && groupMatchStatus && typeof groupStartCountdownSeconds === 'number') {
      return {
        title: '그룹 대결 곧 시작',
        subtitle: `${groupMatchStatus.participantCount}명 그룹 · ${groupMatchStatus.distanceKm.toFixed(1)}km`,
        remainingSeconds: groupStartCountdownSeconds,
      };
    }

    return null;
  }, [
    duelMatchState,
    duelMatchStatus,
    duelStartCountdownSeconds,
    groupMatchState,
    groupMatchStatus,
    groupStartCountdownSeconds,
    matchMode,
  ]);
  const rawRoomCountdownRemainingSeconds = visibleMatchRoom?.linkedMatchSlotStartAt
    ? getMatchStartRemainingSeconds(visibleMatchRoom.linkedMatchSlotStartAt, syncedNowMs)
    : null;
  const roomCountdownRemainingSeconds = useStableCountdownSeconds({
    key: visibleMatchRoom?.linkedMatchId
      ? `${visibleMatchRoom.linkedMatchId}:${visibleMatchRoom.linkedMatchSlotStartAt ?? visibleMatchRoom.slotStartAt}`
      : null,
    rawRemainingSeconds: rawRoomCountdownRemainingSeconds,
    nowMs,
  });
  const visiblePartyRunFlow = useMemo(() => buildPartyRunFlowSnapshot({
    room: visibleMatchRoom,
    isCountdownReady: currentRoomParticipantIsCountdownReady ?? undefined,
    remainingSeconds: roomCountdownRemainingSeconds,
  }), [currentRoomParticipantIsCountdownReady, roomCountdownRemainingSeconds, visibleMatchRoom]);
  const matchRoomFlow = useMemo(() => buildPartyRunFlowSnapshot({
    room: matchRoom,
    isCountdownReady: currentRoomParticipantIsCountdownReady ?? undefined,
    remainingSeconds: roomCountdownRemainingSeconds,
  }), [currentRoomParticipantIsCountdownReady, matchRoom, roomCountdownRemainingSeconds]);
  const roomCountdownEntry = useMemo<CountdownEntry | null>(() => {
    if (
      !visibleMatchRoom?.linkedMatchId
      || typeof roomCountdownRemainingSeconds !== 'number'
      || !['arming', 'countdown', 'active'].includes(visibleMatchRoom.state)
    ) {
      return null;
    }

    return {
      title: visibleMatchRoom.mode === 'duel' ? '1대1 대결 곧 시작' : '그룹 대결 곧 시작',
      subtitle: `${visibleMatchRoom.hostName}님 방 · ${(visibleMatchRoom.linkedMatchDistanceKm ?? visibleMatchRoom.distanceKm).toFixed(1)}km`,
      remainingSeconds: roomCountdownRemainingSeconds,
    };
  }, [roomCountdownRemainingSeconds, visibleMatchRoom]);
  const visibleCountdownEntry = roomCountdownEntry ?? (stableNextStartingMatch
    ? {
        title: stableNextStartingMatch.match.mode === 'duel' ? '1대1 대결 곧 시작' : '그룹 대결 곧 시작',
        subtitle: `${stableNextStartingMatch.match.counterpartLabel} · ${stableNextStartingMatch.match.summary}`,
        remainingSeconds: stableNextStartingMatch.remainingSeconds,
      }
    : fallbackCountdownEntry);

  return {
    duelStartCountdownSeconds,
    groupStartCountdownSeconds,
    roomCountdownRemainingSeconds,
    visiblePartyRunFlow,
    matchRoomFlow,
    roomCountdownEntry,
    visibleCountdownEntry,
    nextStartingMatch,
    activeUpcomingMatch,
    shouldShowRoomArmingOverlay: Boolean(
      matchRoom?.linkedMatchId
      && matchRoomFlow.shouldShowLoading
      && (matchMode === 'duel' || matchMode === 'group'),
    ),
    canOpenRoomArena: visiblePartyRunFlow.shouldOpenArena,
  };
}
