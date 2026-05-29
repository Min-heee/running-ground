import { useEffect, useRef } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { getMatchStartRemainingSeconds, shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import type { PartyRunStartPhase } from '@/features/runs/types/matchStateMachine';
import { rgDiagLog, rgPerfMark } from '@/utils/rgPerfTrace';
import { startRgPollingInterval } from '@/utils/rgPollingRegistry';
import type { LinkedMatchSyncInput } from './types';

export const LINKED_MATCH_ARMING_POLL_MS = 1000;

export function resolveLinkedMatchPollingCadence({
  fastMatchStatusPollMs,
  idleMatchStatusPollMs,
  phase,
  shouldOpenArena,
}: {
  fastMatchStatusPollMs: number;
  idleMatchStatusPollMs: number;
  phase: PartyRunStartPhase;
  shouldOpenArena: boolean;
}) {
  if (phase === 'arming' || phase === 'readyAcked') {
    return {
      intervalMs: Math.min(fastMatchStatusPollMs, LINKED_MATCH_ARMING_POLL_MS),
      transitionReason: `${phase}-poll-in`,
    };
  }

  if (phase === 'countdown' || shouldOpenArena) {
    return {
      intervalMs: fastMatchStatusPollMs,
      transitionReason: `${phase}-handoff`,
    };
  }

  return {
    intervalMs: idleMatchStatusPollMs,
    transitionReason: 'linked-idle-sync',
  };
}

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
    syncedNowMs: nowMs,
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
  currentUserDoneWithLinkedMatch = false,
  duelMatchStatus,
  groupMatchStatus,
  focusedDuelMatchIdRef,
  focusedGroupMatchIdRef,
  livePagerRef,
  fastMatchStatusPollMs,
  idleMatchStatusPollMs,
  callbacksRef,
  enabled = true,
  navigationEnabled = true,
  pollingEnabled = true,
  upcomingRefreshEnabled = true,
}: LinkedMatchSyncInput) {
  const roomLinkedMatchAutoFocusRef = useRef<string | null>(null);
  const roomLinkedArenaPinRef = useRef<string | null>(null);
  const lastLinkedMatchSyncGateKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (enabled && currentUserDoneWithLinkedMatch) {
      callbacksRef.current.onForceOpenActiveMatchChange(false);
    }

    if (
      !enabled
      || !navigationEnabled
      || currentUserDoneWithLinkedMatch
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
    currentUserDoneWithLinkedMatch,
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
    navigationEnabled,
    roomCountdownRemainingSeconds,
  ]);

  useEffect(() => {
    const gateDetail = {
      enabled,
      hasRoomLinkedMatchContext: Boolean(roomLinkedMatchContext),
      matchId: roomLinkedMatchContext?.matchId ?? null,
      pollingEnabled,
    };
    const gateKey = JSON.stringify(gateDetail);
    if (lastLinkedMatchSyncGateKeyRef.current !== gateKey) {
      lastLinkedMatchSyncGateKeyRef.current = gateKey;
      rgDiagLog('linked match sync gate', gateDetail);
    }

    if (!enabled || !pollingEnabled || !roomLinkedMatchContext) {
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

        if (!currentUserDoneWithLinkedMatch && (payload.state === 'active' || shouldPinArenaPage)) {
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

    const { intervalMs, transitionReason } = resolveLinkedMatchPollingCadence({
      fastMatchStatusPollMs,
      idleMatchStatusPollMs,
      phase: visiblePartyRunFlow.phase,
      shouldOpenArena: visiblePartyRunFlow.shouldOpenArena,
    });
    const pollingKey = `match:${roomLinkedMatchContext.matchId}:linked-match-status`;
    const polling = startRgPollingInterval({
      intervalMs,
      key: pollingKey,
      label: 'linked match status polling',
      onTick: syncRoomLinkedMatch,
      detail: {
        intervalMs,
        matchId: roomLinkedMatchContext.matchId,
        mode: roomLinkedMatchContext.mode,
        owner: 'linked match status',
        reason: transitionReason,
        source: 'linked match status',
        state: roomLinkedMatchContext.state ?? null,
      },
    });

    if (!polling.acquired) {
      return () => {
        canceled = true;
      };
    }

    rgPerfMark('live match recovery polling started', {
      matchId: roomLinkedMatchContext.matchId,
      mode: roomLinkedMatchContext.mode,
      pollingKey,
      reason: transitionReason,
      source: 'linked match status',
      state: roomLinkedMatchContext.state ?? null,
    });
    rgPerfMark('match polling start', {
      intervalMs,
      matchId: roomLinkedMatchContext.matchId,
      owner: 'linked match status',
      pollingKey,
      reason: transitionReason,
      source: 'linked match status',
      state: roomLinkedMatchContext.state ?? null,
    });
    return () => {
      canceled = true;
      polling.stop();
    };
  }, [
    callbacksRef,
    currentUserDoneWithLinkedMatch,
    enabled,
    fastMatchStatusPollMs,
    idleMatchStatusPollMs,
    livePagerRef,
    pollingEnabled,
    roomLinkedMatchContext?.distanceKm,
    roomLinkedMatchContext?.matchId,
    roomLinkedMatchContext?.mode,
    roomLinkedMatchContext?.slotStartAt,
    roomLinkedMatchContext?.state,
    visiblePartyRunFlow.phase,
    visiblePartyRunFlow.shouldOpenArena,
  ]);

  useEffect(() => {
    if (!enabled || !upcomingRefreshEnabled) {
      return;
    }

    void callbacksRef.current.loadUpcomingMatches().catch(() => {});
  }, [callbacksRef, enabled, matchRoom?.linkedMatchId, matchRoom?.state, upcomingRefreshEnabled]);
}
