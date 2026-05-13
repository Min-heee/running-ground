import { useEffect, useRef } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { PartyRunFlowSnapshot } from '@/features/runs/matchStateMachine';
import { getApiErrorMessage } from '@/services/apiError';
import type { PartyRunSyncCallbackRef } from './types';

type UseCountdownReadyAckInput = {
  currentUserId: string;
  matchRoom: RunningMatchRoom | null;
  matchRoomFlow: PartyRunFlowSnapshot;
  callbacksRef: PartyRunSyncCallbackRef;
};

export function useCountdownReadyAck({
  currentUserId,
  matchRoom,
  matchRoomFlow,
  callbacksRef,
}: UseCountdownReadyAckInput) {
  const countdownReadyRoomAckRef = useRef<string | null>(null);

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
    void callbacksRef.current.acknowledgeCountdownReady(matchRoom.roomId)
      .catch((roomError) => {
        countdownReadyRoomAckRef.current = null;
        callbacksRef.current.onError(getApiErrorMessage(roomError, '파티런 카운트다운 준비를 맞추지 못했어.'));
      });
  }, [
    callbacksRef,
    currentUserId,
    matchRoom?.linkedMatchId,
    matchRoom?.roomId,
    matchRoomFlow.canAcknowledgeCountdownReady,
    matchRoomFlow.hasLinkedMatch,
    matchRoomFlow.phase,
  ]);
}
