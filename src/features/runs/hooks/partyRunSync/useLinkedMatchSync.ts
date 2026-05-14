import { useEffect, useRef } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { getMatchStartRemainingSeconds, shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import { buildPartyRunFlowSnapshot } from '@/features/runs/matchStateMachine';
import { rgPerfMark, rgPerfTrackResource } from '@/utils/rgPerfTrace';
import { acquireRgPollingSlot } from '@/utils/rgPollingRegistry';
import type { LinkedMatchSyncInput } from './types';

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

function buildRoomLinkedMatchFocusKey(room: RunningMatchRoom) {
  return [
    room.roomId,
    room.linkedMatchId,
    room.state,
    room.linkedMatchSlotStartAt ?? room.slotStartAt,
  ].join(':');
}

export function useLinkedMatchSync({
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
  fastMatchStatusPollMs,
  idleMatchStatusPollMs,
  callbacksRef,
  enabled = true,
}: LinkedMatchSyncInput) {
  const roomLinkedMatchAutoFocusRef = useRef<string | null>(null);
  const roomLinkedArenaPinRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !enabled
      || !matchRoom?.linkedMatchId
      || !canOpenPartyRunLinkedMatch({
        room: matchRoom,
        currentUserId,
        nowMs: callbacksRef.current.getSyncedNowMs(),
      })
    ) {
      roomLinkedMatchAutoFocusRef.current = null;
      return;
    }

    const shouldPreferArena = matchRoomFlow.shouldPreferArena;
    const nextKey = buildRoomLinkedMatchFocusKey(matchRoom);
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
    rgPerfMark('live match navigation request', {
      matchId: matchRoom.linkedMatchId,
      mode: matchRoom.mode,
      preferArena: shouldPreferArena,
      roomId: matchRoom.roomId,
      source: 'room linked match sync',
    });
    void callbacksRef.current.focusRoomLinkedMatch(matchRoom, {
      preferArena: shouldPreferArena,
      source: 'room linked match sync',
    })
      .catch(() => {
        roomLinkedMatchAutoFocusRef.current = null;
      });
  }, [
    callbacksRef,
    currentUserId,
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    enabled,
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
    if (!enabled || !roomLinkedMatchContext) {
      roomLinkedArenaPinRef.current = null;
      return undefined;
    }

    let canceled = false;

    const syncRoomLinkedMatch = async () => {
      try {
        const payload = await callbacksRef.current.syncRoomLinkedMatchStatus(roomLinkedMatchContext);

        if (canceled || !payload) {
          return;
        }

        callbacksRef.current.onMatchModeChange(roomLinkedMatchContext.mode);

        const shouldPinArenaPage = shouldAutoOpenMatchArena(
          getMatchStartRemainingSeconds(payload.slotStartAt, callbacksRef.current.getSyncedNowMs()),
        );

        if (payload.state === 'active' || shouldPinArenaPage) {
          callbacksRef.current.onForceOpenActiveMatchChange(true);

          const pinKey = [
            roomLinkedMatchContext.matchId,
            payload.slotStartAt,
            'arena-handoff',
          ].join(':');

          if (shouldPinArenaPage && roomLinkedArenaPinRef.current !== pinKey) {
            roomLinkedArenaPinRef.current = pinKey;
            callbacksRef.current.onLiveArenaPageChange(0);
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
    const pollingKey = `match:${roomLinkedMatchContext.matchId}:linked-match-status`;
    const pollingSlot = acquireRgPollingSlot(pollingKey, 'linked match status polling', {
      intervalMs,
      matchId: roomLinkedMatchContext.matchId,
      mode: roomLinkedMatchContext.mode,
      source: 'linked match status',
    });

    if (!pollingSlot.acquired) {
      return () => {
        canceled = true;
      };
    }

    rgPerfMark('match polling start', {
      intervalMs,
      matchId: roomLinkedMatchContext.matchId,
      pollingKey,
      source: 'linked match status',
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'linked match status polling', {
      intervalMs,
      matchId: roomLinkedMatchContext.matchId,
      mode: roomLinkedMatchContext.mode,
      pollingKey,
    });
    const timer = setInterval(() => {
      void syncRoomLinkedMatch();
    }, intervalMs);

    return () => {
      canceled = true;
      clearInterval(timer);
      stopPollingTrace();
      pollingSlot.release();
    };
  }, [
    callbacksRef,
    enabled,
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
    if (!enabled) {
      return;
    }

    void callbacksRef.current.loadUpcomingMatches().catch(() => {});
  }, [callbacksRef, enabled, matchRoom?.linkedMatchId, matchRoom?.state]);
}
