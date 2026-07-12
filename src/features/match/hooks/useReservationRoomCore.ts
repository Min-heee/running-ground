import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelRunningMatch,
  fetchRunningMatchStatus,
  getApiErrorMessage,
} from '@/services';
import {
  applySharedServerClock,
  getSharedServerClockOffsetMs,
  hasSyncedServerClock,
  subscribeSharedServerClock,
} from '@/features/runs/sync/serverClockSync';
import {
  readLockedCountdownTargetMs,
  resolveLockedCountdownTarget,
} from '@/features/runs/lifecycle/hooks/useMatchCountdownModel';
import { MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS } from '@/lib/matchCountdown';
import type { RunningMatchStatusResponse } from '@/lib/api/types';

// Shared core behind useDuelReservationRoom / useGroupReservationRoom (previously
// byte-near-identical twins). Everything here — status polling, server-clock feed,
// the locked countdown derivation, and cancel — is mode-agnostic; the wrappers
// inject the mode string, the mode-specific view builder, and the cancel error copy.
// HARD CONSTRAINT: this sits on the countdown/handoff path. The countdown lock
// semantics (resolveLockedCountdownTarget keyed by `${matchId}:${slotStartAt}`)
// and the wrappers' returned prop surfaces are unchanged.

// The shared start-countdown overlay payload. The reservation room derives the SAME
// locked, ms-precise targetMs as the running-tab runtime (resolveLockedCountdownTarget,
// keyed by `${matchId}:${slotStartAt}`), so the centered overlay flips every digit on the
// same absolute instant on both phones — and stays continuous across the reservation →
// running-tab handoff (same key) with no re-flash.
export type ReservationCountdownOverlay = {
  countdownKey: string;
  targetMs: number | null;
  secondsRemaining: number;
};

// How often the room re-fetches the live match status. Far from the start the room mostly
// waits, so a relaxed cadence is fine — the per-second ticker drives the countdown locally
// between polls. But each fetch is also a SERVER-CLOCK SAMPLE (applySharedServerClock), and
// the countdown lock won't freeze until the shared clock is READY (a few agreeing RTT
// samples). At the relaxed 15s cadence a skewed phone could enter the lock window before
// gathering enough samples, so once we're within the fast window we poll every ~1s to reach
// clockReady (and snap the cold-start offset) BEFORE the lock freezes.
export const RESERVATION_STATUS_POLL_INTERVAL_MS = 15_000;
export const RESERVATION_STATUS_FAST_POLL_INTERVAL_MS = 1_000;
// Switch to the fast cadence once the slot is within this many seconds — comfortably ahead
// of the 30s lock window so a cold-start phone has gathered enough samples to be clockReady
// by the time the lock can freeze.
export const RESERVATION_STATUS_FAST_POLL_WITHIN_SECONDS = 60;

// The mode-agnostic inputs every reservation-room view builder receives. Wrappers
// close over any extra fallbacks (group: participantCount) inside their buildView.
export type ReservationRoomBuildViewInput = {
  matchStatus: RunningMatchStatusResponse | null;
  fallbackSlotStartAt: string | null;
  fallbackDistanceKm: number | null;
  fallbackIsTestMatch: boolean;
  syncedNowMs: number;
};

// The slice of the mode-specific view the core itself reads (poll speed-up,
// countdown lock gating, isActive).
type ReservationRoomCoreView = {
  reservation: {
    remainingSeconds: number | null;
    shouldShowStartOverlay: boolean;
  };
};

export type ReservationRoomCoreParams<TView extends ReservationRoomCoreView> = {
  mode: 'duel' | 'group';
  matchId: string | null;
  distanceKm: number | null;
  slotStartAt: string | null;
  isTestMatch: boolean;
  // Mode-specific room view builder. Must be referentially stable (module-level
  // function or useCallback) — its identity is a dependency of the view memo.
  buildView: (input: ReservationRoomBuildViewInput) => TView;
  // Mode-specific copy when the cancel API call fails.
  cancelErrorMessage: string;
};

export type ReservationRoomCoreResult<TView> = {
  loading: boolean;
  error: string | null;
  isCanceling: boolean;
  // null until the first status fetch settles; the view still renders from params.
  matchStatus: RunningMatchStatusResponse | null;
  view: TView;
  // The shared locked-target countdown payload for the centered start overlay (null
  // until inside the 30s window with a finite remaining).
  countdownOverlay: ReservationCountdownOverlay | null;
  // True once the slot has fired / the server says the match is active — the screen
  // hands off to the existing arena auto-open and stops offering cancel.
  isActive: boolean;
  cancel: () => Promise<boolean>;
  refresh: () => Promise<void>;
};

export function useReservationRoomCore<TView extends ReservationRoomCoreView>(
  params: ReservationRoomCoreParams<TView>,
): ReservationRoomCoreResult<TView> {
  const { mode, matchId, distanceKm, slotStartAt, isTestMatch, buildView, cancelErrorMessage } = params;

  const [matchStatus, setMatchStatus] = useState<RunningMatchStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(matchId));
  const [error, setError] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(() => getSharedServerClockOffsetMs());
  const [nowMs, setNowMs] = useState(() => Date.now());

  const matchStatusRef = useRef<RunningMatchStatusResponse | null>(null);
  useEffect(() => {
    matchStatusRef.current = matchStatus;
  }, [matchStatus]);

  // Keep the screen's clock aligned with the shared server-synced offset the rest of
  // the app uses, so the "N분 남음 / 곧 시작" countdown agrees with the running tab and
  // the arena (two phones reading the same absolute slot time agree on the second).
  useEffect(() => {
    return subscribeSharedServerClock((offsetMs) => {
      setServerClockOffsetMs(offsetMs);
    });
  }, []);

  // 1s local ticker drives the live countdown between status polls.
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    return () => clearInterval(timer);
  }, []);

  const loadStatus = useCallback(async () => {
    if (!matchId || !slotStartAt || typeof distanceKm !== 'number') {
      return;
    }

    try {
      const status = await fetchRunningMatchStatus({
        mode,
        distanceKm,
        slotStartAt,
        testMode: isTestMatch,
        matchId,
      });
      // Feed the shared clock so the countdown is server-aligned. Pass the whole
      // response (carries clientRequestStartedAtMs/clientResponseReceivedAtMs from
      // apiClient) so the offset is RTT-corrected (serverNow + rtt/2) — without it
      // the offset drops the ~rtt/2 latency and the two phones' countdowns skew ~1s.
      const nextOffsetMs = applySharedServerClock(status.serverNow, status);
      setServerClockOffsetMs(nextOffsetMs);
      setMatchStatus(status);
      setError(null);
    } catch (statusError) {
      // Don't blank the room on a transient fetch failure — keep the last good status
      // and surface a soft error; the next poll retries.
      setError(getApiErrorMessage(statusError, '예약 상태를 불러오지 못했어.'));
    } finally {
      setLoading(false);
    }
  }, [distanceKm, isTestMatch, matchId, mode, slotStartAt]);

  // Remaining seconds to the slot, read fresh by the self-rescheduling poll so it can speed
  // up near the start without re-subscribing the effect each tick.
  const remainingSecondsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!matchId || !slotStartAt || typeof distanceKm !== 'number') {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);

    const scheduleNext = () => {
      const remaining = remainingSecondsRef.current;
      const interval = typeof remaining === 'number' && remaining <= RESERVATION_STATUS_FAST_POLL_WITHIN_SECONDS
        ? RESERVATION_STATUS_FAST_POLL_INTERVAL_MS
        : RESERVATION_STATUS_POLL_INTERVAL_MS;
      timer = setTimeout(async () => {
        if (cancelled) {
          return;
        }
        await loadStatus();
        if (!cancelled) {
          scheduleNext();
        }
      }, interval);
    };

    void loadStatus().finally(() => {
      if (!cancelled) {
        scheduleNext();
      }
    });

    return () => {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [distanceKm, loadStatus, matchId, slotStartAt]);

  const syncedNowMs = nowMs + serverClockOffsetMs;

  const view = useMemo(
    () => buildView({
      matchStatus,
      fallbackSlotStartAt: slotStartAt,
      fallbackDistanceKm: distanceKm,
      fallbackIsTestMatch: isTestMatch,
      syncedNowMs,
    }),
    [buildView, matchStatus, slotStartAt, distanceKm, isTestMatch, syncedNowMs],
  );
  // Feed the poll's speed-up: keep the freshest remaining-to-slot so the next reschedule can
  // switch to the ~1s cadence as the start approaches (gathers clock samples → clockReady).
  remainingSecondsRef.current = view.reservation.remainingSeconds;

  // Derive the SAME locked countdown target the running-tab runtime uses, keyed by the
  // shared `${matchId}:${slotStartAt}` scheme. The lock freezes once on the ABSOLUTE SERVER
  // instant (slotStartMs) — only after clockReady — so the overlay ticks it against the LIVE
  // shared offset every frame and two phones flip every digit on the same tick, continuous
  // across the reservation→running-tab handoff. The `view` clock tick still gates WHEN the
  // overlay/arena-handoff fire; it no longer rounds the displayed digit (that's the lock's
  // job). Prefer the server-authoritative status slot over the route param.
  const effectiveSlotStartAt = matchStatus?.slotStartAt ?? slotStartAt;
  const effectiveSlotStartMs = effectiveSlotStartAt ? Date.parse(effectiveSlotStartAt) : NaN;
  const reservationCountdownKey = matchId && effectiveSlotStartAt
    ? `${matchId}:${effectiveSlotStartAt}`
    : null;
  const reservationLockedSeconds = resolveLockedCountdownTarget({
    key: reservationCountdownKey,
    maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    rawRemainingSeconds: view.reservation.remainingSeconds,
    rawRemainingMs: Number.isFinite(effectiveSlotStartMs) ? effectiveSlotStartMs - syncedNowMs : null,
    slotStartMs: Number.isFinite(effectiveSlotStartMs) ? effectiveSlotStartMs : null,
    syncedNowMs,
    clockReady: hasSyncedServerClock(),
  });
  const reservationLockedTargetMs = readLockedCountdownTargetMs(reservationCountdownKey);
  const countdownOverlay = useMemo<ReservationCountdownOverlay | null>(() => {
    if (
      !reservationCountdownKey
      || !view.reservation.shouldShowStartOverlay
      || view.reservation.remainingSeconds === null
    ) {
      return null;
    }

    return {
      countdownKey: reservationCountdownKey,
      targetMs: reservationLockedTargetMs,
      secondsRemaining: reservationLockedSeconds ?? view.reservation.remainingSeconds,
    };
  }, [
    reservationCountdownKey,
    reservationLockedSeconds,
    reservationLockedTargetMs,
    view.reservation.remainingSeconds,
    view.reservation.shouldShowStartOverlay,
  ]);

  const isActive = matchStatus?.state === 'active' || view.reservation.remainingSeconds === null;

  const cancel = useCallback(async () => {
    const status = matchStatusRef.current;
    const effectiveSlotStartAt = status?.slotStartAt ?? slotStartAt;
    const effectiveDistanceKm = status?.distanceKm ?? distanceKm;

    if (!effectiveSlotStartAt || typeof effectiveDistanceKm !== 'number') {
      setError('예약 정보를 찾지 못했어.');
      return false;
    }

    // Same rule as the inline/upcoming cancel: locked from 1 hour before the slot.
    if (status?.canCancel === false) {
      setError('출발 1시간 전부터는 예약을 취소할 수 없어.');
      return false;
    }

    try {
      setError(null);
      setIsCanceling(true);
      await cancelRunningMatch({
        mode,
        distanceKm: effectiveDistanceKm,
        slotStartAt: effectiveSlotStartAt,
        testMode: isTestMatch,
        ...(matchId ? { matchId } : {}),
      });
      return true;
    } catch (cancelError) {
      setError(getApiErrorMessage(cancelError, cancelErrorMessage));
      return false;
    } finally {
      setIsCanceling(false);
    }
  }, [cancelErrorMessage, distanceKm, isTestMatch, matchId, mode, slotStartAt]);

  return {
    loading,
    error,
    isCanceling,
    matchStatus,
    view,
    countdownOverlay,
    isActive,
    cancel,
    refresh: loadStatus,
  };
}
