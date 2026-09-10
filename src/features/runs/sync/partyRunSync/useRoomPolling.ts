import { useEffect, useRef } from 'react';
import { isMatchRoomReservedForFuture } from '@/features/runs/lifecycle/matchRoomFlow';
import { getSharedServerClockOffsetMs } from '@/features/runs/sync/serverClockSync';
import { armBlockingMatchStatusPollRetry } from '@/features/runs/sync/matchPolling/useBlockingMatchStatusPolling';
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
  linkedMatchReservedForFuture = false,
  roomId,
  state,
}: {
  fastRoomPollMs: number;
  idleRoomPollMs: number;
  linkedMatchId?: string | null;
  // 예약 파티런: 링크됐지만 슬롯이 카운트다운 창 밖 — 상대의 이탈·취소·늦은 합류를 보려면
  // 느린 주기로라도 계속 조회한다. 창 안에 들어오면 예전처럼 매치 상태 폴러가 넘겨받는다.
  linkedMatchReservedForFuture?: boolean;
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

  if (linkedMatchId && linkedMatchReservedForFuture) {
    return {
      enabled: true,
      intervalMs: idleRoomPollMs,
      reason: 'reserved-party-room-sync',
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

// Lobby-room poll latch fix (docs/lobby-room-poll-latch-diag-2026-07-06.md, Piece 1b) — the
// party-room poller had the same never-retried keyed-slot latch as the lobby snapshot poller: a
// lost acquire returned a bare `undefined` cleanup (and logged NOTHING), leaving the poll
// permanently dead until an effect dep changed via new poll data — which a dead poll never
// delivers. This seam marks the lost acquire and arms df02afc's proven retry helper on the
// party-room key: re-attempt every intervalMs, one catch-up loadMatchRoom on re-acquire, stop()
// halting whichever is live (retry timer or acquired poll handle). Exported so the node tests can
// exercise it directly (same pattern as armBlockingMatchStatusPollRetry); timer fns are
// injectable for those tests.
export function armPartyRoomPollRetry({
  intervalMs,
  onTick,
  pollingKey,
  reason,
  roomId,
  state,
  clearIntervalFn,
  setIntervalFn,
}: {
  intervalMs: number;
  onTick: () => unknown | Promise<unknown>;
  pollingKey: string;
  reason: string;
  roomId: string;
  state: RunningMatchRoom['state'] | null;
  clearIntervalFn?: typeof clearInterval;
  setIntervalFn?: typeof setInterval;
}) {
  rgPerfMark('party room polling lost acquire', {
    intervalMs,
    pollingKey,
    reason,
    roomId,
    source: 'party room',
    state,
  });

  return armBlockingMatchStatusPollRetry({
    intervalMs,
    onReacquired: (handle) => {
      rgPerfMark('party room polling reacquired after retry', {
        ownerId: handle.ownerId,
        pollingKey,
        source: 'party room',
      });
    },
    onTick,
    startPolling: () => startRgPollingInterval({
      intervalMs,
      key: pollingKey,
      label: 'party room polling',
      onTick,
      detail: {
        intervalMs,
        owner: 'party room',
        reason,
        roomId,
        source: 'party room',
        state,
      },
    }),
    ...(clearIntervalFn ? { clearIntervalFn } : {}),
    ...(setIntervalFn ? { setIntervalFn } : {}),
  });
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
  const linkedMatchReservedForFuture = isMatchRoomReservedForFuture(matchRoom, Date.now() + getSharedServerClockOffsetMs());
  const lastRoomPollingSkipKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const policy = resolvePartyRoomPollingPolicy({
      fastRoomPollMs,
      idleRoomPollMs,
      linkedMatchId,
      linkedMatchReservedForFuture,
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
      // Piece 1b — same un-latch as the snapshot poller: keep re-attempting the slot at the poll
      // cadence; on re-acquire fire one catch-up loadMatchRoom and hold the real handle.
      const retry = armPartyRoomPollRetry({
        intervalMs,
        onTick: () => callbacksRef.current.loadMatchRoom(),
        pollingKey,
        reason: policy.reason,
        roomId,
        state: roomState,
      });
      return () => {
        retry.stop();
      };
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
  }, [callbacksRef, enabled, fastRoomPollMs, idleRoomPollMs, linkedMatchId, linkedMatchReservedForFuture, roomId, roomState]);
}
