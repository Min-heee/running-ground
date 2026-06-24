import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  resolveReservationArenaHandoff,
} from '@/features/match/hooks/reservationArenaHandoff';

type UseReservationArenaHandoffInput = {
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  matchId: string | null;
  distanceKm: number | null;
  slotStartAt: string | null;
  isTestMatch: boolean;
  // The room's live countdown (reservation.remainingSeconds).
  remainingSeconds: number | null;
  // The room sets this false while a cancel is settling (and the screen pops on success)
  // so we never hand off a reservation the user is tearing down.
  enabled?: boolean;
};

// Drives the reservation-room -> running-tab arena handoff. When the active matched
// reservation's countdown enters the handoff window (≤25s, a few seconds before the
// runtime's ≤20s arena-open window), this replaces the route with the running tab,
// passing the existing focus params + forceMatchArena. The running tab's
// useMatchEntryEffects then fires focusRunningMatch({ preferArena: true }) immediately,
// mounting the arena UNDER the same countdown overlay. Both screens read the same
// slotStartAt + shared server clock, so the visible number continues without a jump,
// and the race starts at 0 with no transition.
//
// Fires exactly once per matchId (ref guard). Does nothing while merely viewing a
// far-future reservation, once the slot has already fired, after cancel (enabled=false),
// or with no matchId.
export function useReservationArenaHandoff({
  mode,
  matchId,
  distanceKm,
  slotStartAt,
  isTestMatch,
  remainingSeconds,
  enabled = true,
}: UseReservationArenaHandoffInput) {
  // The matchId we have already handed off, so the trigger fires at most once per match
  // even as the per-second countdown keeps re-rendering inside the window.
  const handedOffMatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const { shouldHandOff, focusParams } = resolveReservationArenaHandoff({
      mode,
      matchId,
      distanceKm,
      slotStartAt,
      isTestMatch,
      remainingSeconds,
    });

    if (!shouldHandOff || !focusParams || !matchId) {
      return;
    }

    if (handedOffMatchIdRef.current === matchId) {
      return;
    }

    handedOffMatchIdRef.current = matchId;

    router.replace({
      pathname: '/(tabs)/running',
      params: {
        ...focusParams,
        // Unique per navigation so the running tab's focus effect re-fires for this
        // handoff even if a stale nonce was handled earlier in the session.
        focusMatchNonce: `reservation-handoff-${matchId}-${Date.now()}`,
      },
    });
  }, [distanceKm, enabled, isTestMatch, matchId, mode, remainingSeconds, slotStartAt]);
}
