import { useCallback } from 'react';
import {
  buildDuelReservationRoomView,
  type DuelReservationRoomView,
} from '@/features/runs/lifecycle/matchStateMachine';
import {
  useReservationRoomCore,
  type ReservationRoomBuildViewInput,
  type ReservationRoomCoreResult,
} from '@/features/match/hooks/useReservationRoomCore';
import { getCurrentUserProfile } from '@/lib/session/sessionState';

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

  // 내 행 이름 = 내 프로필 닉네임 (오너 2026-08-28: '나' 표기 폐지). useCallback([])이라
  // 참조 안정 — 코어의 view memo 요구 충족 (프로필은 세션 동안 안정된 값).
  const buildView = useCallback(
    (input: ReservationRoomBuildViewInput) => buildDuelReservationRoomView({
      ...input,
      currentUserName: getCurrentUserProfile()?.name ?? null,
    }),
    [],
  );

  return useReservationRoomCore({
    mode: 'duel',
    matchId,
    distanceKm,
    slotStartAt,
    isTestMatch,
    buildView,
    cancelErrorMessage: '1대1 예약을 취소하지 못했어요.',
  });
}
