import { useEffect } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark, rgPerfTrackResource } from '@/utils/rgPerfTrace';
import { acquireRgPollingSlot } from '@/utils/rgPollingRegistry';
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
    const pollingKey = `room:${matchRoom.roomId}:party-room`;
    const pollingSlot = acquireRgPollingSlot(pollingKey, 'party room polling', {
      intervalMs,
      roomId: matchRoom.roomId,
      source: 'party room',
      state: matchRoom.state ?? null,
    });

    if (!pollingSlot.acquired) {
      return undefined;
    }

    rgPerfMark('match polling start', {
      intervalMs,
      pollingKey,
      roomId: matchRoom?.roomId ?? null,
      source: 'party room',
      state: matchRoom?.state ?? null,
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'party room polling', {
      intervalMs,
      pollingKey,
      roomId: matchRoom?.roomId ?? null,
      state: matchRoom?.state ?? null,
    });
    const timer = setInterval(() => {
      void callbacksRef.current.loadMatchRoom().catch(() => {});
    }, intervalMs);

    return () => {
      clearInterval(timer);
      stopPollingTrace();
      pollingSlot.release();
    };
  }, [callbacksRef, fastRoomPollMs, idleRoomPollMs, matchRoom?.linkedMatchId, matchRoom?.roomId, matchRoom?.state]);
}
