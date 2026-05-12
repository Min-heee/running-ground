import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import type {
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import { getMatchStartRemainingSeconds, shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import {
  buildPartyRunFlowSnapshot,
  type PartyRunFlowSnapshot,
  type PartyRunLinkedMatchContext,
} from '@/features/runs/matchStateMachine';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

type UsePartyRunSyncInput = {
  currentUserId: string;
  matchRoom: RunningMatchRoom | null;
  matchRoomFlow: PartyRunFlowSnapshot;
  visiblePartyRunFlow: PartyRunFlowSnapshot;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  roomCountdownRemainingSeconds: number | null;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  focusedDuelMatchIdRef: RefObject<string | null>;
  focusedGroupMatchIdRef: RefObject<string | null>;
  livePagerRef: RefObject<ScrollView | null>;
  fastRoomPollMs: number;
  idleRoomPollMs: number;
  fastMatchStatusPollMs: number;
  idleMatchStatusPollMs: number;
  getSyncedNowMs: () => number;
  loadMatchRoom: () => Promise<RunningMatchRoom | null>;
  acknowledgeCountdownReady: (roomId: string) => Promise<void>;
  focusRoomLinkedMatch: (
    room: RunningMatchRoom,
    options?: { preferArena?: boolean },
  ) => Promise<RunningMatchStatusResponse | null>;
  syncRoomLinkedMatchStatus: (
    context: PartyRunLinkedMatchContext,
  ) => Promise<RunningMatchStatusResponse | null>;
  loadUpcomingMatches: () => Promise<unknown>;
  onMatchModeChange: (mode: Extract<RunMatchMode, 'duel' | 'group'>) => void;
  onForceOpenActiveMatchChange: (value: boolean) => void;
  onLiveArenaPageChange: (page: number) => void;
  onError: (message: string) => void;
};

export function canOpenPartyRunLinkedMatch({
  room,
  currentUserId,
  nowMs,
}: {
  room: RunningMatchRoom;
  currentUserId: string;
  nowMs: number;
}) {
  if (!room.linkedMatchId) {
    return false;
  }

  const participant = room.participants.find((roomParticipant) => (
    roomParticipant.userId === currentUserId || roomParticipant.tag === currentUserId
  )) ?? null;
  const remainingSeconds = getMatchStartRemainingSeconds(
    room.linkedMatchSlotStartAt ?? room.slotStartAt,
    nowMs,
  );
  const flow = buildPartyRunFlowSnapshot({
    room,
    isCountdownReady: participant?.isCountdownReady,
    remainingSeconds,
  });

  return flow.canOpenLinkedMatch;
}

function buildRoomLinkedMatchFocusKey(room: RunningMatchRoom, preferArena: boolean) {
  return [
    room.roomId,
    room.linkedMatchId,
    room.state,
    room.linkedMatchSlotStartAt ?? room.slotStartAt,
    preferArena ? 'arena' : 'countdown',
  ].join(':');
}

export function usePartyRunSync({
  currentUserId,
  matchRoom,
  matchRoomFlow,
  visiblePartyRunFlow,
  roomLinkedMatchContext,
  roomCountdownRemainingSeconds,
  duelMatchStatus,
  groupMatchStatus,
  focusedDuelMatchIdRef,
  focusedGroupMatchIdRef,
  livePagerRef,
  fastRoomPollMs,
  idleRoomPollMs,
  fastMatchStatusPollMs,
  idleMatchStatusPollMs,
  getSyncedNowMs,
  loadMatchRoom,
  acknowledgeCountdownReady,
  focusRoomLinkedMatch,
  syncRoomLinkedMatchStatus,
  loadUpcomingMatches,
  onMatchModeChange,
  onForceOpenActiveMatchChange,
  onLiveArenaPageChange,
  onError,
}: UsePartyRunSyncInput) {
  const countdownReadyRoomAckRef = useRef<string | null>(null);
  const roomLinkedMatchAutoFocusRef = useRef<string | null>(null);
  const callbackRef = useRef({
    getSyncedNowMs,
    loadMatchRoom,
    acknowledgeCountdownReady,
    focusRoomLinkedMatch,
    syncRoomLinkedMatchStatus,
    loadUpcomingMatches,
    onMatchModeChange,
    onForceOpenActiveMatchChange,
    onLiveArenaPageChange,
    onError,
  });

  callbackRef.current = {
    getSyncedNowMs,
    loadMatchRoom,
    acknowledgeCountdownReady,
    focusRoomLinkedMatch,
    syncRoomLinkedMatchStatus,
    loadUpcomingMatches,
    onMatchModeChange,
    onForceOpenActiveMatchChange,
    onLiveArenaPageChange,
    onError,
  };

  useEffect(() => {
    const needsFastRoomPolling = Boolean(
      matchRoom?.linkedMatchId || ['arming', 'countdown'].includes(matchRoom?.state ?? ''),
    );
    const intervalMs = matchRoom?.state === 'active'
      ? idleRoomPollMs
      : needsFastRoomPolling
        ? fastRoomPollMs
        : idleRoomPollMs;
    const timer = setInterval(() => {
      void callbackRef.current.loadMatchRoom().catch(() => {});
    }, intervalMs);

    return () => clearInterval(timer);
  }, [fastRoomPollMs, idleRoomPollMs, matchRoom?.linkedMatchId, matchRoom?.state]);

  useEffect(() => {
    if (!matchRoom?.roomId || !matchRoomFlow.canAcknowledgeCountdownReady) {
      if (!matchRoomFlow.hasLinkedMatch || matchRoomFlow.phase !== 'arming') {
        countdownReadyRoomAckRef.current = null;
      }
      return;
    }

    const ackKey = `${matchRoom.roomId}:${matchRoom.linkedMatchId}:${currentUserId}`;
    if (countdownReadyRoomAckRef.current === ackKey) {
      return;
    }

    countdownReadyRoomAckRef.current = ackKey;
    void callbackRef.current.acknowledgeCountdownReady(matchRoom.roomId)
      .catch((roomError) => {
        countdownReadyRoomAckRef.current = null;
        callbackRef.current.onError(
          roomError instanceof Error ? roomError.message : '파티런 카운트다운 준비를 맞추지 못했어.',
        );
      });
  }, [
    currentUserId,
    matchRoom?.linkedMatchId,
    matchRoom?.roomId,
    matchRoomFlow.canAcknowledgeCountdownReady,
    matchRoomFlow.hasLinkedMatch,
    matchRoomFlow.phase,
  ]);

  useEffect(() => {
    if (
      !matchRoom?.linkedMatchId
      || !canOpenPartyRunLinkedMatch({
        room: matchRoom,
        currentUserId,
        nowMs: callbackRef.current.getSyncedNowMs(),
      })
    ) {
      roomLinkedMatchAutoFocusRef.current = null;
      return;
    }

    const shouldPreferArena = matchRoomFlow.shouldPreferArena;
    const nextKey = buildRoomLinkedMatchFocusKey(matchRoom, shouldPreferArena);
    const currentFocusedMatchId = matchRoom.mode === 'duel'
      ? duelMatchStatus?.matchId ?? focusedDuelMatchIdRef.current
      : groupMatchStatus?.matchId ?? focusedGroupMatchIdRef.current;
    const currentFocusedState = matchRoom.mode === 'duel'
      ? duelMatchStatus?.state
      : groupMatchStatus?.state;

    if (
      roomLinkedMatchAutoFocusRef.current === nextKey
      && currentFocusedMatchId === matchRoom.linkedMatchId
      && currentFocusedState === (matchRoom.linkedMatchStatus === 'active' ? 'active' : currentFocusedState)
    ) {
      return;
    }

    roomLinkedMatchAutoFocusRef.current = nextKey;
    void callbackRef.current.focusRoomLinkedMatch(matchRoom, { preferArena: shouldPreferArena }).catch(() => {
      roomLinkedMatchAutoFocusRef.current = null;
    });
  }, [
    currentUserId,
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    groupMatchStatus?.matchId,
    groupMatchStatus?.state,
    matchRoom?.linkedMatchId,
    matchRoom?.linkedMatchStatus,
    matchRoom?.linkedMatchSlotStartAt,
    matchRoom?.mode,
    matchRoom?.roomId,
    matchRoom?.slotStartAt,
    matchRoom?.state,
    matchRoomFlow.shouldPreferArena,
    roomCountdownRemainingSeconds,
  ]);

  useEffect(() => {
    if (!roomLinkedMatchContext) {
      return undefined;
    }

    let canceled = false;

    const syncRoomLinkedMatch = async () => {
      try {
        const payload = await callbackRef.current.syncRoomLinkedMatchStatus(roomLinkedMatchContext);

        if (canceled || !payload) {
          return;
        }

        callbackRef.current.onMatchModeChange(roomLinkedMatchContext.mode);

        const shouldPinArenaPage = shouldAutoOpenMatchArena(
          getMatchStartRemainingSeconds(payload.slotStartAt, callbackRef.current.getSyncedNowMs()),
        );

        if (payload.state === 'active' || shouldPinArenaPage) {
          callbackRef.current.onForceOpenActiveMatchChange(true);

          if (shouldPinArenaPage) {
            callbackRef.current.onLiveArenaPageChange(0);
            livePagerRef.current?.scrollTo({ x: 0, animated: false });
          }
        }
      } catch {
        // The room snapshot still keeps the arena open; retry on the next short poll.
      }
    };

    void syncRoomLinkedMatch();

    const intervalMs = visiblePartyRunFlow.phase === 'countdown'
      || visiblePartyRunFlow.shouldOpenArena
      ? fastMatchStatusPollMs
      : idleMatchStatusPollMs;
    const timer = setInterval(() => {
      void syncRoomLinkedMatch();
    }, intervalMs);

    return () => {
      canceled = true;
      clearInterval(timer);
    };
  }, [
    fastMatchStatusPollMs,
    idleMatchStatusPollMs,
    livePagerRef,
    roomLinkedMatchContext?.distanceKm,
    roomLinkedMatchContext?.matchId,
    roomLinkedMatchContext?.mode,
    roomLinkedMatchContext?.slotStartAt,
    roomLinkedMatchContext?.state,
    visiblePartyRunFlow.phase,
    visiblePartyRunFlow.shouldOpenArena,
  ]);

  useEffect(() => {
    void callbackRef.current.loadUpcomingMatches().catch(() => {});
  }, [matchRoom?.linkedMatchId, matchRoom?.state]);
}
