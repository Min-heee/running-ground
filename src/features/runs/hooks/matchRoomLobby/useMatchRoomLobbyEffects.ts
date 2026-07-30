import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { type Href, router } from 'expo-router';
import {
  acknowledgeRunningMatchRoomCountdown,
  cleanupStaleRunningMatchRoomState,
  leaveRunningMatchRoom,
} from '@/services/matchService';
import { getApiErrorMessage } from '@/services/apiError';
import { findDivergedWaitingRoomFromCleanup } from '@/features/runs/sync/emptyLobbyReconcile';
import type { RunningMatchRoom } from '@/lib/api/types';
import { getMatchStartRemainingSeconds } from '@/lib/matchCountdown';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import { hydrateLiveMatchRouteState } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { shouldRouteLinkedMatchRoomToRunning } from './linkedMatchRoomRouting';

type PartyRunFlowSnapshot = ReturnType<typeof buildPartyRunFlowSnapshot>;

// 빈 대기실을 서버와 맞춰보기 전에 기다리는 시간 — 첫 조회가 늦어 잠깐 비어 보이는
// 정상 상태를 분기로 오해하지 않을 만큼만.
const EMPTY_LOBBY_RECONCILE_DELAY_MS = 2_000;

type UseMatchRoomLobbyEffectsInput = {
  commitRoom: (room: RunningMatchRoom | null) => void;
  currentUserTag: string;
  latestRoomServerNowMsRef: MutableRefObject<number>;
  loading: boolean;
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
  loading,
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
  const emptyLobbyReconcileStateRef = useRef<'idle' | 'done'>('idle');

  const reconcileEmptyLobby = useCallback(async () => {
    try {
      // 1) 서버에게 먼저 스스로 정리할 기회를 준다(만료된 방/세션/큐 prune + 유령 참조 제거).
      const cleanup = await cleanupStaleRunningMatchRoomState();
      const divergedRoom = findDivergedWaitingRoomFromCleanup({ cleanup });

      if (!divergedRoom) {
        return;
      }

      // 2) 그래도 서버가 "너는 아직 이 대기방에 있다"고 하면, 앱이 이미 없다고 말한 방이므로
      //    실제로 나간다. 방장이면 방 자체가 사라진다(혼자면 삭제, 남은 사람 있으면 위임).
      rgPerfMark('empty lobby reconcile leaving diverged room', {
        mode: divergedRoom.mode,
        roomId: divergedRoom.roomId,
        source: 'match-room empty lobby',
        state: divergedRoom.state,
      });
      await leaveRunningMatchRoom({ roomId: divergedRoom.roomId });
      await loadRoom().catch(() => null);
    } catch {
      // 네트워크 실패 등은 조용히 넘긴다 — 빈 대기실 화면은 그대로 유효하고,
      // 다음 진입에서 다시 시도된다.
    }
  }, [loadRoom]);

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
        setError(getApiErrorMessage(roomError, '파티런 카운트다운 준비를 맞추지 못했어요.'));
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

  // 빈 대기실 화해 — "열린 방이 없어요"인데 서버는 아직 나를 시작 전 대기방에 넣어두고 있는
  // 상태(= 방 만들기가 "이미 참여 중인 방이 있어요"로 막히고 관리자 화면에도 그 방이 남는
  // 상태)를 실제로 해소한다. 앱이 없다고 말한 방은 서버에도 없어야 한다.
  // 한 번 실행되면 다시 시도하지 않는다(무한 정리 루프 방지). 조건은 emptyLobbyReconcile 참고.
  useEffect(() => {
    if (loading || room || emptyLobbyReconcileStateRef.current !== 'idle') {
      return undefined;
    }

    // 첫 조회가 늦게 도착해 잠깐 비어 보이는 정상 상태와 구분하려고 조금 기다렸다 확인한다.
    const timer = setTimeout(() => {
      emptyLobbyReconcileStateRef.current = 'done';
      void reconcileEmptyLobby();
    }, EMPTY_LOBBY_RECONCILE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [loading, reconcileEmptyLobby, room]);
}
