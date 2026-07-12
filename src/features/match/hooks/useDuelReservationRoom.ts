import {
  buildDuelReservationRoomView,
  type DuelReservationRoomView,
} from '@/features/runs/lifecycle/matchStateMachine';
import {
  useReservationRoomCore,
  type ReservationRoomCoreResult,
} from '@/features/match/hooks/useReservationRoomCore';

// Thin duel wrapper over the shared reservation-room core (status polling,
// server-clock feed, locked countdown overlay, cancel). Only the mode string,
// the duel view builder, and the cancel error copy are duel-specific.
export type { ReservationCountdownOverlay } from '@/features/match/hooks/useReservationRoomCore';
// [test-only] Re-exported so the cadence pin can assert both rooms share one poll cadence.
export {
  RESERVATION_STATUS_FAST_POLL_INTERVAL_MS,
  RESERVATION_STATUS_FAST_POLL_WITHIN_SECONDS,
  RESERVATION_STATUS_POLL_INTERVAL_MS,
} from '@/features/match/hooks/useReservationRoomCore';

export type DuelReservationRoomParams = {
  matchId: string | null;
  distanceKm: number | null;
  slotStartAt: string | null;
  isTestMatch: boolean;
};

export type UseDuelReservationRoomResult = ReservationRoomCoreResult<DuelReservationRoomView>;

export function useDuelReservationRoom(
  params: DuelReservationRoomParams,
): UseDuelReservationRoomResult {
  const { matchId, distanceKm, slotStartAt, isTestMatch } = params;

  return useReservationRoomCore({
    mode: 'duel',
    matchId,
    distanceKm,
    slotStartAt,
    isTestMatch,
    // Module-level function — referentially stable, as the core's view memo requires.
    buildView: buildDuelReservationRoomView,
    cancelErrorMessage: '1대1 예약을 취소하지 못했어.',
  });
}
