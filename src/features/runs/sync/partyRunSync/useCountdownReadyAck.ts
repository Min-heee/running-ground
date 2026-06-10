import { useEffect, useRef } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { PartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import { getApiErrorMessage } from '@/services/apiError';
import type { PartyRunSyncCallbackRef } from './types';

// A guest's slot start is delivered only by the one-shot countdown-ready ACK response,
// which the shared monotonic room guard can drop on a 2nd consecutive party-run. With
// room polling and the active-room re-fetch both disabled once linkedMatchId is set, a
// dropped ACK leaves the room in 'arming' with no slot start and no recovery path — the
// "로딩중..." overlay sticks forever. While that exact state holds, re-issue the ACK on a
// short timer so a later response (whose serverNow has advanced past the stale guard, or
// which now carries the slot start) gets through and is committed.
const COUNTDOWN_READY_RECOVERY_INTERVAL_MS = 2000;
const COUNTDOWN_READY_RECOVERY_MAX_ATTEMPTS = 20;

export function isRoomStuckArming({
  hasLinkedMatch,
  linkedMatchSlotStartAt,
  phase,
}: {
  hasLinkedMatch: boolean;
  linkedMatchSlotStartAt?: string | null;
  phase: PartyRunFlowSnapshot['phase'];
}) {
  // Both pre-countdown phases can stall with no slot start: 'arming' (the ACK was
  // dropped, so the room never updated) and 'readyAcked' (we acked, but in a group the
  // slot start only lands once the LAST participant acks, and that later room update has
  // no delivery channel either).
  return hasLinkedMatch && (phase === 'arming' || phase === 'readyAcked') && !linkedMatchSlotStartAt;
}

type UseCountdownReadyAckInput = {
  currentUserId: string;
  matchRoom: RunningMatchRoom | null;
  matchRoomFlow: PartyRunFlowSnapshot;
  enabled?: boolean;
  callbacksRef: PartyRunSyncCallbackRef;
};

export function useCountdownReadyAck({
  currentUserId,
  matchRoom,
  matchRoomFlow,
  enabled = true,
  callbacksRef,
}: UseCountdownReadyAckInput) {
  const countdownReadyRoomAckRef = useRef<string | null>(null);
  const recoveryAttemptsRef = useRef(0);

  useEffect(() => {
    if (!enabled || !matchRoom?.roomId || !matchRoomFlow.canAcknowledgeCountdownReady) {
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
    void callbacksRef.current.acknowledgeCountdownReady(matchRoom.roomId)
      .catch((roomError) => {
        countdownReadyRoomAckRef.current = null;
        callbacksRef.current.onError(getApiErrorMessage(roomError, '파티런 카운트다운 준비를 맞추지 못했어.'));
      });
  }, [
    callbacksRef,
    currentUserId,
    enabled,
    matchRoom?.linkedMatchId,
    matchRoom?.roomId,
    matchRoomFlow.canAcknowledgeCountdownReady,
    matchRoomFlow.hasLinkedMatch,
    matchRoomFlow.phase,
  ]);

  // Recovery watchdog: while stuck in arming with no slot start (a dropped ACK with no
  // other delivery channel), re-issue the ACK on a timer until the slot start lands.
  // Capped so a genuinely broken match isn't spammed forever, and self-clearing — once a
  // slot start arrives this effect re-runs with isRoomStuckArming() === false.
  useEffect(() => {
    if (!enabled || !matchRoom?.roomId) {
      return undefined;
    }

    if (!isRoomStuckArming({
      hasLinkedMatch: matchRoomFlow.hasLinkedMatch,
      linkedMatchSlotStartAt: matchRoom.linkedMatchSlotStartAt,
      phase: matchRoomFlow.phase,
    })) {
      recoveryAttemptsRef.current = 0;
      return undefined;
    }

    const { roomId } = matchRoom;
    const intervalId = setInterval(() => {
      if (recoveryAttemptsRef.current >= COUNTDOWN_READY_RECOVERY_MAX_ATTEMPTS) {
        clearInterval(intervalId);
        return;
      }

      recoveryAttemptsRef.current += 1;
      void callbacksRef.current.acknowledgeCountdownReady(roomId).catch(() => {});
    }, COUNTDOWN_READY_RECOVERY_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    callbacksRef,
    enabled,
    matchRoom?.linkedMatchSlotStartAt,
    matchRoom?.roomId,
    matchRoomFlow.hasLinkedMatch,
    matchRoomFlow.phase,
  ]);
}
