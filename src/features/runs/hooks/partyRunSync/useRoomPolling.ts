import { useEffect } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { PartyRunSyncCallbackRef } from './types';

type UseRoomPollingInput = {
  matchRoom: RunningMatchRoom | null;
  fastRoomPollMs: number;
  idleRoomPollMs: number;
  callbacksRef: PartyRunSyncCallbackRef;
};

export function useRoomPolling({
  matchRoom,
  fastRoomPollMs,
  idleRoomPollMs,
  callbacksRef,
}: UseRoomPollingInput) {
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
      void callbacksRef.current.loadMatchRoom().catch(() => {});
    }, intervalMs);

    return () => clearInterval(timer);
  }, [callbacksRef, fastRoomPollMs, idleRoomPollMs, matchRoom?.linkedMatchId, matchRoom?.state]);
}
