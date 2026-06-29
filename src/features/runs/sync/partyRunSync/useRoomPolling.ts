import { useEffect, useRef } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgDiagLog, rgPerfMark } from '@/utils/rgPerfTrace';
import { startRgPollingInterval } from '@/utils/rgPollingRegistry';
import type { PartyRunSyncCallbackRef } from './types';

type UseRoomPollingInput = {
  matchRoom: RunningMatchRoom | null;
  fastRoomPollMs: number;
  idleRoomPollMs: number;
  enabled?: boolean;
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
  enabled = true,
  callbacksRef,
}: UseRoomPollingInput) {
  const roomId = matchRoom?.roomId ?? null;
  const linkedMatchId = matchRoom?.linkedMatchId ?? null;
  const roomState = matchRoom?.state ?? null;
  const lastRoomPollingSkipKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const policy = resolvePartyRoomPollingPolicy({
      fastRoomPollMs,
      idleRoomPollMs,
      linkedMatchId,
      roomId,
      state: roomState,
    });

    if (!enabled || !roomId || !policy.enabled) {
      const skipDetail = {
        enabled,
        linkedMatchId,
        reason: enabled ? policy.reason : 'lifecycle-controller-disabled',
        roomId,
        roomState,
      };
      const skipKey = JSON.stringify(skipDetail);
      if (lastRoomPollingSkipKeyRef.current !== skipKey) {
        lastRoomPollingSkipKeyRef.current = skipKey;
        rgDiagLog('room polling skipped', skipDetail);
      }
      rgPerfMark('match polling skipped', {
        enabled,
        owner: 'party room',
        pollingKey: roomId ? `room:${roomId}:party-room` : null,
        reason: enabled ? policy.reason : 'lifecycle-controller-disabled',
        roomId,
        state: roomState,
      });
      return undefined;
    }

    const intervalMs = policy.intervalMs;
    const pollingKey = `room:${roomId}:party-room`;
    const polling = startRgPollingInterval({
      intervalMs,
      key: pollingKey,
      label: 'party room polling',
      onTick: () => callbacksRef.current.loadMatchRoom(),
      detail: {
        intervalMs,
        owner: 'party room',
        reason: policy.reason,
        roomId,
        source: 'party room',
        state: roomState,
      },
    });

    if (!polling.acquired) {
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
    return () => {
      polling.stop();
    };
  }, [callbacksRef, enabled, fastRoomPollMs, idleRoomPollMs, linkedMatchId, roomId, roomState]);
}
