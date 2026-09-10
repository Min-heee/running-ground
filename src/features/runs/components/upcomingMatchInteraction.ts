import { shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';

// What a tap on an upcoming-match row does. Pure so the "다가오는 매치" tap wiring is
// testable without rendering. A matched 1:1 (duel) OR matched matchmade group opens
// its full-screen reservation waiting room any time before the arena window; once
// inside the ≤20s arena window (or active) the existing arena handoff takes over for
// both. `reservationRoomMode` says which room to open so the caller can route to the
// right screen.
export type UpcomingMatchInteraction = {
  // Within the ≤20s arena-handoff window or already active -> open the arena (existing behavior).
  canOpenArena: boolean;
  // A matched duel/group before the arena window -> navigate to the reservation room screen.
  opensReservationRoom: boolean;
  // Which reservation room the row opens (null when it opens none).
  reservationRoomMode: 'duel' | 'group' | null;
  // 파티런 예약 (오너 2026-09-09): roomId가 붙은 매치는 공식 예약 대기실이 아니라 파티런
  // 대기방(/match-room)으로 간다 — 그 방이 카운트다운·핸드오프를 이미 맡고 있다.
  opensPartyRoom: boolean;
  // Whether the row responds to a press at all.
  isTappable: boolean;
};

export function isPartyRunUpcomingMatch(match: Pick<UpcomingRunningMatchItem, 'roomId'>) {
  return typeof match.roomId === 'string' && match.roomId.trim().length > 0;
}

export function resolveUpcomingMatchInteraction(
  match: Pick<UpcomingRunningMatchItem, 'mode' | 'status'> & Partial<Pick<UpcomingRunningMatchItem, 'roomId'>>,
  remainingSeconds: number | null,
): UpcomingMatchInteraction {
  const canOpenArena = match.status === 'active'
    || (match.status === 'matched' && shouldAutoOpenMatchArena(remainingSeconds));
  const isPartyRun = isPartyRunUpcomingMatch(match);
  // A party-run session (linked to a 대기방) opens that room before the arena window; the
  // room owns the reservation view. Everything else matched opens the official reservation
  // room for its mode.
  const opensPartyRoom = isPartyRun && match.status === 'matched' && !canOpenArena;
  const opensReservationRoom = !isPartyRun
    && (match.mode === 'duel' || match.mode === 'group')
    && match.status === 'matched'
    && !canOpenArena;

  return {
    canOpenArena,
    opensReservationRoom,
    reservationRoomMode: opensReservationRoom ? match.mode : null,
    opensPartyRoom,
    isTappable: canOpenArena || opensReservationRoom || opensPartyRoom,
  };
}
