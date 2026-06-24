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
  // Whether the row responds to a press at all.
  isTappable: boolean;
};

export function resolveUpcomingMatchInteraction(
  match: Pick<UpcomingRunningMatchItem, 'mode' | 'status'>,
  remainingSeconds: number | null,
): UpcomingMatchInteraction {
  const canOpenArena = match.status === 'active'
    || (match.status === 'matched' && shouldAutoOpenMatchArena(remainingSeconds));
  // A matched duel or a matched (matchmade) group both open their reservation room
  // before the arena window. Party-run group items aren't surfaced through this list,
  // so any matched group here is a matchmade reservation.
  const opensReservationRoom = (match.mode === 'duel' || match.mode === 'group')
    && match.status === 'matched'
    && !canOpenArena;

  return {
    canOpenArena,
    opensReservationRoom,
    reservationRoomMode: opensReservationRoom ? match.mode : null,
    isTappable: canOpenArena || opensReservationRoom,
  };
}
