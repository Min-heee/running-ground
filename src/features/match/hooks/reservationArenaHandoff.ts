import { MATCH_RESERVATION_ARENA_HANDOFF_SECONDS } from '@/lib/matchCountdown';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

// Pure decision for the reservation-room -> running-tab arena handoff.
//
// A matched duel/group opened in its full-screen reservation room renders the centered
// countdown overlay for the final ≤30s, but the room itself never mounts the live
// ARENA. The arena auto-open lives only in the running-tab runtime. So, a touch BEFORE
// the runtime's ≤20s arena window opens, the room navigates to the running tab and lets
// the PROVEN running-tab flow mount the arena under the overlay and start the race at 0
// — no screen transition at countdown 0.
//
// `shouldHandOff` is true only for an ACTIVE matched reservation whose live countdown has
// entered the handoff window (0 < remaining <= 25s). It is false while merely viewing a
// far-future reservation, once the slot has already fired (remaining === null — the
// running tab's own active/route hydration owns that), or with no matchId to focus.
// The caller fires it exactly once per matchId via a ref guard.

export type ReservationArenaHandoffInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId: string | null;
  distanceKm: number | null;
  slotStartAt: string | null;
  isTestMatch: boolean;
  // The room's live countdown (reservation.remainingSeconds): seconds to slot start,
  // null once the slot has fired.
  remainingSeconds: number | null;
};

export type ReservationArenaHandoffDecision = {
  shouldHandOff: boolean;
  // The focus params the running tab route consumes (RunningScreen -> useMatchEntryEffects
  // -> focusRunningMatch({ preferArena: true })). null when shouldHandOff is false.
  focusParams: {
    focusMatchMode: 'duel' | 'group';
    focusMatchId: string;
    focusMatchDistanceKm?: string;
    focusMatchSlotStartAt?: string;
    focusMatchIsTest: '0' | '1';
    forceMatchArena: '1';
  } | null;
};

export function isWithinReservationArenaHandoffWindow(remainingSeconds: number | null): boolean {
  return (
    typeof remainingSeconds === 'number'
    && remainingSeconds > 0
    && remainingSeconds <= MATCH_RESERVATION_ARENA_HANDOFF_SECONDS
  );
}

export function resolveReservationArenaHandoff({
  mode,
  matchId,
  distanceKm,
  slotStartAt,
  isTestMatch,
  remainingSeconds,
}: ReservationArenaHandoffInput): ReservationArenaHandoffDecision {
  const shouldHandOff = Boolean(matchId) && isWithinReservationArenaHandoffWindow(remainingSeconds);

  if (!shouldHandOff || !matchId) {
    return { shouldHandOff: false, focusParams: null };
  }

  return {
    shouldHandOff: true,
    focusParams: {
      focusMatchMode: mode,
      focusMatchId: matchId,
      ...(typeof distanceKm === 'number' && Number.isFinite(distanceKm)
        ? { focusMatchDistanceKm: String(distanceKm) }
        : {}),
      ...(slotStartAt ? { focusMatchSlotStartAt: slotStartAt } : {}),
      focusMatchIsTest: isTestMatch ? '1' : '0',
      forceMatchArena: '1',
    },
  };
}
