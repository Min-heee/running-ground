import { useEffect, useRef } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { PartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import { getApiErrorMessage } from '@/services/apiError';
import { rgDiagLog } from '@/utils/rgPerfTrace';
import type { PartyRunSyncCallbackRef } from './types';

// A guest's slot start is delivered only by the one-shot countdown-ready ACK response,
// which the shared monotonic room guard can drop on a 2nd consecutive party-run. With
// room polling and the active-room re-fetch both disabled once linkedMatchId is set, a
// dropped ACK leaves the room in 'arming' with no slot start and no recovery path — the
// "로딩중..." overlay sticks forever. While that exact state holds, re-issue the ACK on a
// short timer so a later response (whose serverNow has advanced past the stale guard, or
// which now carries the slot start) gets through and is committed.
const COUNTDOWN_READY_RECOVERY_INTERVAL_MS = 2000;
// After this many fast attempts (~40s) we stop spamming at the fast cadence and surface a
// recoverable error so the user knows to use the always-visible leave control — but we do
// NOT give up: the watchdog keeps retrying at a slower backoff cadence so a late ACK can
// still rescue the room without the user having to bail out. The user is never frozen with
// no path forward (the arming overlay's force-leave control is always available too).
const COUNTDOWN_READY_RECOVERY_MAX_ATTEMPTS = 20;
const COUNTDOWN_READY_RECOVERY_BACKOFF_INTERVAL_MS = 8000;
// A delivered slot start is only trustworthy when it is near. The host-start visible
// window is 10s; a slot sitting further out than this is a stale PRE-ARM slot (start
// +18s) the device got before the backend re-armed it (+12s), with no remaining
// delivery channel to correct it — observed live as the overlay frozen at r:17.
const COUNTDOWN_READY_SLOT_FAR_MS = 13_000;

export function isRoomStuckArming({
  hasLinkedMatch,
  linkedMatchSlotStartAt,
  nowMs,
  phase,
}: {
  hasLinkedMatch: boolean;
  linkedMatchSlotStartAt?: string | null;
  nowMs: number;
  phase: PartyRunFlowSnapshot['phase'];
}) {
  if (!hasLinkedMatch) {
    return false;
  }

  // All pre-countdown phases can stall: 'arming' (the ACK was dropped, so the room
  // never updated), 'readyAcked' (in a group the slot start only lands once the LAST
  // participant acks), and 'arenaHandoff' (a stale far-out slot keeps the phase pinned
  // before the visible countdown).
  if (phase !== 'arming' && phase !== 'readyAcked' && phase !== 'arenaHandoff') {
    return false;
  }

  if (!linkedMatchSlotStartAt) {
    return true;
  }

  const slotStartMs = Date.parse(linkedMatchSlotStartAt);
  return Number.isFinite(slotStartMs) && slotStartMs - nowMs > COUNTDOWN_READY_SLOT_FAR_MS;
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
  const recoveryErrorSurfacedRef = useRef(false);

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
        // SILENT: the ack is best-effort (the backend arms the shared slot after its max
        // loading wait even without it) and the recovery watchdog below re-issues it every
        // 2s while the room is genuinely stuck. Painting the raw ApiError here (e.g. a
        // one-off 10s timeout on cellular) stamped a scary red banner onto a perfectly
        // healthy run — the countdown proceeded via the re-ack, but nothing ever cleared
        // the text. The watchdog's friendly notice (after ~40s truly stuck) is the ONE
        // user-facing surface for this failure, and it now self-clears on recovery.
        countdownReadyRoomAckRef.current = null;
        rgDiagLog('countdownReadyAck initial attempt failed; watchdog will retry', {
          message: getApiErrorMessage(roomError, 'ack failed'),
        });
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
  // Self-clearing — once a slot start arrives this effect re-runs with
  // isRoomStuckArming() === false. It NEVER permanently gives up: after a fast burst it
  // surfaces a recoverable error (so the user is told to use the leave control) and slows
  // to a backoff cadence, but keeps re-issuing the ACK so a late response can still rescue
  // the room. A self-rescheduling timeout (not a fixed interval) lets the cadence change.
  useEffect(() => {
    if (!enabled || !matchRoom?.roomId) {
      return undefined;
    }

    if (!isRoomStuckArming({
      hasLinkedMatch: matchRoomFlow.hasLinkedMatch,
      linkedMatchSlotStartAt: matchRoom.linkedMatchSlotStartAt,
      nowMs: Date.now(),
      phase: matchRoomFlow.phase,
    })) {
      recoveryAttemptsRef.current = 0;
      if (recoveryErrorSurfacedRef.current) {
        // The room progressed after we told the user the start was delayed — clear OUR
        // notice so it doesn't linger over a now-healthy countdown/run. Only fires when
        // this hook was the one that surfaced it.
        recoveryErrorSurfacedRef.current = false;
        callbacksRef.current.onError(null);
      }
      return undefined;
    }

    const { roomId, linkedMatchSlotStartAt } = matchRoom;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const slotIsNearEnough = () => {
      if (typeof linkedMatchSlotStartAt !== 'string') {
        return false;
      }
      const slotStartMs = Date.parse(linkedMatchSlotStartAt);
      return Number.isFinite(slotStartMs) && slotStartMs - Date.now() <= COUNTDOWN_READY_SLOT_FAR_MS;
    };

    const scheduleNext = (delayMs: number) => {
      if (cancelled) {
        return;
      }
      timeoutId = setTimeout(tick, delayMs);
    };

    const tick = () => {
      // Re-check inside the tick with the live clock: once the (closure) slot is near
      // enough to be the real armed slot, the room is progressing normally — stop.
      // This runs even if React renders are wedged, so a re-ACK that commits a fresh
      // room snapshot also restarts the frozen UI.
      if (slotIsNearEnough()) {
        return;
      }

      const pastFastCap = recoveryAttemptsRef.current >= COUNTDOWN_READY_RECOVERY_MAX_ATTEMPTS;
      if (pastFastCap && !recoveryErrorSurfacedRef.current) {
        recoveryErrorSurfacedRef.current = true;
        // Surface a recoverable error instead of silently freezing. The arming overlay's
        // always-visible leave control gives the user an immediate way out; retries continue.
        callbacksRef.current.onError(
          '대결 시작 준비가 늦어지고 있어요. 잠시 더 기다리거나 나가기를 눌러 다시 시도해주세요.',
        );
      }

      recoveryAttemptsRef.current += 1;
      void callbacksRef.current.acknowledgeCountdownReady(roomId).catch(() => {});
      scheduleNext(pastFastCap
        ? COUNTDOWN_READY_RECOVERY_BACKOFF_INTERVAL_MS
        : COUNTDOWN_READY_RECOVERY_INTERVAL_MS);
    };

    scheduleNext(COUNTDOWN_READY_RECOVERY_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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
