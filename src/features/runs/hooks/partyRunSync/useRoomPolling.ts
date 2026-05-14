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

export function resolvePartyRoomPollingPolicy({
  fastRoomPollMs,
  idleRoomPollMs,
  linkedMatchId,
  roomId,
  state,
}: {
  fastRoomPollMs: number;
  idleRoomPollMs: number;
  linkedMatchId?: string | null;
  roomId?: string | null;
  state?: RunningMatchRoom['state'] | null;
}) {
  if (!roomId) {
    return {
      enabled: false,
      intervalMs: idleRoomPollMs,
      reason: 'no-room',
    };
  }

  if (linkedMatchId) {
    return {
      enabled: false,
      intervalMs: idleRoomPollMs,
      reason: 'linked-match-status-owner',
    };
  }

  if (state === 'waiting') {
    return {
      enabled: false,
      intervalMs: idleRoomPollMs,
      reason: 'match-room-snapshot-owner',
    };
  }

  if (state === 'arming' || state === 'countdown' || state === 'active') {
    return {
      enabled: false,
      intervalMs: fastRoomPollMs,
      reason: `${state}-linked-transition-owner`,
    };
  }

  return {
    enabled: true,
    intervalMs: idleRoomPollMs,
    reason: 'party-room-owner',
  };
}

export function useRoomPolling({
  matchRoom,
  fastRoomPollMs,
  idleRoomPollMs,
  callbacksRef,
}: UseRoomPollingInput) {
  const roomId = matchRoom?.roomId ?? null;
  const linkedMatchId = matchRoom?.linkedMatchId ?? null;
  const roomState = matchRoom?.state ?? null;

  useEffect(() => {
    const policy = resolvePartyRoomPollingPolicy({
      fastRoomPollMs,
      idleRoomPollMs,
      linkedMatchId,
      roomId,
      state: roomState,
    });

    if (!roomId || !policy.enabled) {
      rgPerfMark('match polling skipped', {
        owner: 'party room',
        pollingKey: roomId ? `room:${roomId}:party-room` : null,
        reason: policy.reason,
        roomId,
        state: roomState,
      });
      return undefined;
    }

    const intervalMs = policy.intervalMs;
    const pollingKey = `room:${roomId}:party-room`;
    const pollingSlot = acquireRgPollingSlot(pollingKey, 'party room polling', {
      intervalMs,
      owner: 'party room',
      reason: policy.reason,
      roomId,
      source: 'party room',
      state: roomState,
    });

    if (!pollingSlot.acquired) {
      return undefined;
    }

    rgPerfMark('match polling start', {
      intervalMs,
      pollingKey,
      pollingOwner: 'party room',
      reason: policy.reason,
      roomId,
      source: 'party room',
      state: roomState,
    });
    const stopPollingTrace = rgPerfTrackResource('polling', 'party room polling', {
      intervalMs,
      pollingKey,
      pollingOwner: 'party room',
      reason: policy.reason,
      roomId,
      state: roomState,
    });
    const timer = setInterval(() => {
      void callbacksRef.current.loadMatchRoom().catch(() => {});
    }, intervalMs);

    return () => {
      clearInterval(timer);
      stopPollingTrace();
      pollingSlot.release();
    };
  }, [callbacksRef, fastRoomPollMs, idleRoomPollMs, linkedMatchId, roomId, roomState]);
}
