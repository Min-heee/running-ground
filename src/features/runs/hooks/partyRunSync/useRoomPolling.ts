import { useEffect } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark, rgPerfTrackResource } from '@/utils/rgPerfTrace';
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
    if (!matchRoom?.roomId) {
      return undefined;
    }

    const needsFastRoomPolling = Boolean(
      matchRoom?.linkedMatchId || ['arming', 'countdown'].includes(matchRoom?.state ?? ''),
    );
    const intervalMs = matchRoom?.state === 'active'
      ? idleRoomPollMs
      : needsFastRoomPolling
        ? fastRoomPollMs
        : idleRoomPollMs;
    rgPerfMark('match polling start', {
      intervalMs,
      roomId: matchRoom?.roomId ?? null,
      source: 'party room',
      state: matchRoom?.state ?? null,
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'party room polling', {
      intervalMs,
      roomId: matchRoom?.roomId ?? null,
      state: matchRoom?.state ?? null,
    });
    const timer = setInterval(() => {
      void callbacksRef.current.loadMatchRoom().catch(() => {});
    }, intervalMs);

    return () => {
      stopPollingTrace();
      clearInterval(timer);
    };
  }, [callbacksRef, fastRoomPollMs, idleRoomPollMs, matchRoom?.linkedMatchId, matchRoom?.roomId, matchRoom?.state]);
}
