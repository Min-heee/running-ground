import { shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';

// What a tap on an upcoming-match row does. Pure so the "다가오는 매치" tap wiring is
// testable without rendering. A matched 1:1 (duel) opens the full-screen reservation
// waiting room any time before the arena window; once inside the ≤20s arena window
// (or active) the existing arena handoff takes over. Group items are unchanged: they
// only open at the arena window / when active.
export type UpcomingMatchInteraction = {
  // Within the ≤20s arena-handoff window or already active -> open the arena (existing behavior).
  canOpenArena: boolean;
  // A matched duel before the arena window -> navigate to the reservation room screen.
  opensReservationRoom: boolean;
  // Whether the row responds to a press at all.
  isTappable: boolean;
};

export function resolveUpcomingMatchInteraction(
  match: Pick<UpcomingRunningMatchItem, 'mode' | 'status'>,
  remainingSeconds: number | null,
): UpcomingMatchInteraction {
  const canOpenArena = match.status === 'active'
    || (match.status === 'matched' && shouldAutoOpenMatchArena(remainingSeconds));
  const opensReservationRoom = match.mode === 'duel'
    && match.status === 'matched'
    && !canOpenArena;

  return {
    canOpenArena,
    opensReservationRoom,
    isTappable: canOpenArena || opensReservationRoom,
  };
}
