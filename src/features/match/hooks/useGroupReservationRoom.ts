import { useCallback } from 'react';
import {
  buildGroupReservationRoomView,
  type GroupReservationRoomView,
} from '@/features/runs/lifecycle/matchStateMachine';
import {
  useReservationRoomCore,
  type ReservationRoomBuildViewInput,
  type ReservationRoomCoreResult,
} from '@/features/match/hooks/useReservationRoomCore';

// Thin group wrapper over the shared reservation-room core (status polling,
// server-clock feed, locked countdown overlay, cancel). Only the mode string,
// the group view builder (with its extra participantCount fallback), and the
// cancel error copy are group-specific.
export type { ReservationCountdownOverlay } from '@/features/match/hooks/useReservationRoomCore';
// [test-only] Re-exported so the cadence pin can assert both rooms share one poll cadence.
export {
  RESERVATION_STATUS_FAST_POLL_INTERVAL_MS,
  RESERVATION_STATUS_FAST_POLL_WITHIN_SECONDS,
  RESERVATION_STATUS_POLL_INTERVAL_MS,
} from '@/features/match/hooks/useReservationRoomCore';

export type GroupReservationRoomParams = {
  matchId: string | null;
  distanceKm: number | null;
  slotStartAt: string | null;
  participantCount: number | null;
  isTestMatch: boolean;
};

export type UseGroupReservationRoomResult = ReservationRoomCoreResult<GroupReservationRoomView>;

export function useGroupReservationRoom(
  params: GroupReservationRoomParams,
): UseGroupReservationRoomResult {
  const { matchId, distanceKm, slotStartAt, participantCount, isTestMatch } = params;

  // Closes the group-only participantCount fallback into the shared build input.
  // Identity changes only with participantCount, so the core's view memo re-runs
  // exactly when the original hook's dependency list would have.
  const buildView = useCallback(
    (input: ReservationRoomBuildViewInput) => buildGroupReservationRoomView({
      ...input,
      fallbackParticipantCount: participantCount,
    }),
    [participantCount],
  );

  return useReservationRoomCore({
    mode: 'group',
    matchId,
    distanceKm,
    slotStartAt,
    isTestMatch,
    buildView,
    cancelErrorMessage: '그룹 예약을 취소하지 못했어.',
  });
}
