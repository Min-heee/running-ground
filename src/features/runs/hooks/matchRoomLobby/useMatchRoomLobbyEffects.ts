import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { type Href, router } from 'expo-router';
import { acknowledgeRunningMatchRoomCountdown } from '@/services/matchService';
import { getApiErrorMessage } from '@/services/apiError';
import type { RunningMatchRoom } from '@/lib/api/types';
import { getMatchStartRemainingSeconds } from '@/lib/matchCountdown';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import { hydrateLiveMatchRouteState } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { shouldRouteLinkedMatchRoomToRunning } from './linkedMatchRoomRouting';

type PartyRunFlowSnapshot = ReturnType<typeof buildPartyRunFlowSnapshot>;

type UseMatchRoomLobbyEffectsInput = {
  commitRoom: (room: RunningMatchRoom | null) => void;
  currentUserTag: string;
  latestRoomServerNowMsRef: MutableRefObject<number>;
  loadRoom: () => Promise<RunningMatchRoom | null>;
  partyRunFlow: PartyRunFlowSnapshot;
  pauseRoomPolling: () => void;
  room: RunningMatchRoom | null;
  serverClockOffsetMs: number;
  setError: Dispatch<SetStateAction<string | null>>;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
};

export function useMatchRoomLobbyEffects({
  commitRoom,
  currentUserTag,
  latestRoomServerNowMsRef,
  loadRoom,
  partyRunFlow,
  pauseRoomPolling,
  room,
  serverClockOffsetMs,
  setError,
  syncServerClock,
}: UseMatchRoomLobbyEffectsInput) {
  const openedLinkedMatchKeyRef = useRef<string | null>(null);
  const countdownReadyRoomAckRef = useRef<string | null>(null);
  const missingSlotStartRefreshKeyRef = useRef<string | null>(null);

  const openLinkedMatchInRunning = useCallback((nextRoom: RunningMatchRoom) => {
    if (!nextRoom.linkedMatchId) {
      return;
    }

    const nextParticipant = nextRoom.participants.find((participant) => (
      participant.userId === currentUserTag || participant.tag === currentUserTag
    )) ?? null;
    const syncedNowMs = Date.now() + serverClockOffsetMs;
    const remainingSeconds = getMatchStartRemainingSeconds(
      nextRoom.linkedMatchSlotStartAt ?? nextRoom.slotStartAt,
      syncedNowMs,
    );
    const flow = buildPartyRunFlowSnapshot({
      room: nextRoom,
      isCountdownReady: nextParticipant?.isCountdownReady,
      remainingSeconds,
      syncedNowMs,
    });

    if (!shouldRouteLinkedMatchRoomToRunning({
      flow,
      room: nextRoom,
      syncedNowMs,
    })) {
      return;
    }

    const nextKey = [
      nextRoom.roomId,
      nextRoom.linkedMatchId,
      nextRoom.linkedMatchSlotStartAt ?? nextRoom.slotStartAt,
    ].join(':');

    if (openedLinkedMatchKeyRef.current === nextKey) {
      return;
    }

    openedLinkedMatchKeyRef.current = nextKey;
    pauseRoomPolling();
    rgPerfMark('match lifecycle owner handoff to live match', {
      matchId: nextRoom.linkedMatchId,
      roomId: nextRoom.roomId,
      source: 'match-room linked match route',
      state: nextRoom.state,
    });
    rgPerfMark('match-room polling stopped after handoff', {
      matchId: nextRoom.linkedMatchId,
      roomId: nextRoom.roomId,
      source: 'match-room linked match route',
      state: nextRoom.state,
    });
    hydrateLiveMatchRouteState({
      distanceKm: nextRoom.linkedMatchDistanceKm ?? nextRoom.distanceKm,
      matchId: nextRoom.linkedMatchId,
      mode: nextRoom.mode,
      preferArena: flow.shouldOpenArena,
      room: nextRoom,
      roomId: nextRoom.roomId,
      slotStartAt: nextRoom.linkedMatchSlotStartAt ?? nextRoom.slotStartAt,
      source: 'match-room linked match route',
    });
    rgPerfMark('live match route state hydrated', {
      matchId: nextRoom.linkedMatchId,
      roomId: nextRoom.roomId,
      source: 'match-room linked match route',
      state: nextRoom.state,
    });

    router.replace({
      pathname: '/(tabs)/running',
      params: {
        focusMatchMode: nextRoom.mode,
        focusMatchId: nextRoom.linkedMatchId,
        focusMatchDistanceKm: String(nextRoom.linkedMatchDistanceKm ?? nextRoom.distanceKm),
        focusMatchSlotStartAt: nextRoom.linkedMatchSlotStartAt ?? nextRoom.slotStartAt,
        focusRoomId: nextRoom.roomId,
        ...(flow.shouldOpenArena ? { forceMatchArena: '1' } : {}),
        focusMatchNonce: `room-${Date.now()}`,
      },
    } as Href);
  }, [currentUserTag, pauseRoomPolling, serverClockOffsetMs]);

  useEffect(() => {
    if (!room?.linkedMatchId) {
      return undefined;
    }

    openLinkedMatchInRunning(room);

    const timer = setInterval(() => {
      openLinkedMatchInRunning(room);
    }, 500);

    return () => clearInterval(timer);
  }, [
    openLinkedMatchInRunning,
    room,
    room?.linkedMatchId,
    room?.linkedMatchSlotStartAt,
    room?.linkedMatchStatus,
    room?.mode,
    room?.roomId,
    room?.slotStartAt,
    room?.state,
    serverClockOffsetMs,
  ]);

  // BLOCKER 3b — null-slot guard. A linked match exists but its slot start never arrived,
  // so remainingSeconds stays null and the guest is stuck in the room, never entering
  // running. Force a room refresh (instead of silently stalling) so a fresh snapshot can
  // deliver the missing slot start. Keyed per (room, linkedMatch) so it fires once per
  // stuck match rather than on every render.
  useEffect(() => {
    if (!room?.roomId || !room.linkedMatchId) {
      missingSlotStartRefreshKeyRef.current = null;
      return;
    }

    const slotStartAt = room.linkedMatchSlotStartAt ?? room.slotStartAt;
    if (slotStartAt) {
      missingSlotStartRefreshKeyRef.current = null;
      return;
    }

    const refreshKey = `${room.roomId}:${room.linkedMatchId}`;
    if (missingSlotStartRefreshKeyRef.current === refreshKey) {
      return;
    }

    missingSlotStartRefreshKeyRef.current = refreshKey;
    rgPerfMark('match-room linked match missing slot start — forcing refresh', {
      linkedMatchId: room.linkedMatchId,
      roomId: room.roomId,
      state: room.state,
    });
    void loadRoom().catch(() => {});
  }, [
    loadRoom,
    room?.linkedMatchId,
    room?.linkedMatchSlotStartAt,
    room?.roomId,
    room?.slotStartAt,
    room?.state,
  ]);

  useEffect(() => {
    if (!room?.roomId || !partyRunFlow.canAcknowledgeCountdownReady) {
      if (!partyRunFlow.hasLinkedMatch || partyRunFlow.phase !== 'arming') {
        countdownReadyRoomAckRef.current = null;
      }
      return;
    }

    const ackKey = `${room.roomId}:${room.linkedMatchId}:${currentUserTag}`;
    if (countdownReadyRoomAckRef.current === ackKey) {
      return;
    }

    const ackRoomId = room.roomId;
    countdownReadyRoomAckRef.current = ackKey;
    void acknowledgeRunningMatchRoomCountdown({ roomId: ackRoomId })
      .then((payload) => {
        // BLOCKER 3d — version/timestamp guard. The ACK is a one-shot HTTP response that can
        // land AFTER a fresher polled snapshot. shouldAcceptServerSnapshot rejects an ACK
        // whose serverNow is older than the latest committed snapshot, so a stale ACK can't
        // overwrite newer polled state and make two phones disagree.
        if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
          return;
        }

        syncServerClock(payload.serverNow, payload);
        commitRoom(payload.room);
        setError(null);
      })
      .catch((roomError) => {
        countdownReadyRoomAckRef.current = null;
        setError(getApiErrorMessage(roomError, '파티런 카운트다운 준비를 맞추지 못했어.'));
        // BLOCKER 3c — on ACK timeout/failure, refresh the room immediately instead of
        // waiting for the next poll. The host may already be counting down; a fresh snapshot
        // pulls the slot start / active transition so the guest isn't stranded in arming.
        void loadRoom().catch(() => {});
      });
  }, [
    commitRoom,
    currentUserTag,
    latestRoomServerNowMsRef,
    loadRoom,
    partyRunFlow.canAcknowledgeCountdownReady,
    partyRunFlow.hasLinkedMatch,
    partyRunFlow.phase,
    room?.linkedMatchId,
    room?.roomId,
    setError,
    syncServerClock,
  ]);
}
