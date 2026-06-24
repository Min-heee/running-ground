import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelRunningMatch,
  fetchRunningMatchStatus,
  getApiErrorMessage,
} from '@/services';
import {
  applySharedServerClock,
  getSharedServerClockOffsetMs,
  subscribeSharedServerClock,
} from '@/features/runs/sync/serverClockSync';
import {
  buildDuelReservationRoomView,
  type DuelReservationRoomView,
} from '@/features/runs/lifecycle/matchStateMachine';
import type { RunningMatchStatusResponse } from '@/lib/api/types';

// How often the room re-fetches the live duel status. The reservation room mostly
// waits, so a relaxed cadence is fine — the per-second ticker drives the countdown
// locally between polls. Mirrors the upcoming-match poll spirit without coupling to
// the running-tab runtime.
const RESERVATION_STATUS_POLL_INTERVAL_MS = 15_000;

export type DuelReservationRoomParams = {
  matchId: string | null;
  distanceKm: number | null;
  slotStartAt: string | null;
  isTestMatch: boolean;
};

export type UseDuelReservationRoomResult = {
  loading: boolean;
  error: string | null;
  isCanceling: boolean;
  // null until the first status fetch settles; the view still renders from params.
  matchStatus: RunningMatchStatusResponse | null;
  view: DuelReservationRoomView;
  // True once the slot has fired / the server says the match is active — the screen
  // hands off to the existing arena auto-open and stops offering cancel.
  isActive: boolean;
  cancel: () => Promise<boolean>;
  refresh: () => Promise<void>;
};

export function useDuelReservationRoom(
  params: DuelReservationRoomParams,
): UseDuelReservationRoomResult {
  const { matchId, distanceKm, slotStartAt, isTestMatch } = params;

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
        mode: 'duel',
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
  }, [distanceKm, isTestMatch, matchId, slotStartAt]);

  useEffect(() => {
    if (!matchId || !slotStartAt || typeof distanceKm !== 'number') {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    void loadStatus();

    const timer = setInterval(() => {
      if (!cancelled) {
        void loadStatus();
      }
    }, RESERVATION_STATUS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [distanceKm, loadStatus, matchId, slotStartAt]);

  const syncedNowMs = nowMs + serverClockOffsetMs;

  const view = useMemo(
    () => buildDuelReservationRoomView({
      matchStatus,
      fallbackSlotStartAt: slotStartAt,
      fallbackDistanceKm: distanceKm,
      fallbackIsTestMatch: isTestMatch,
      syncedNowMs,
    }),
    [matchStatus, slotStartAt, distanceKm, isTestMatch, syncedNowMs],
  );

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
        mode: 'duel',
        distanceKm: effectiveDistanceKm,
        slotStartAt: effectiveSlotStartAt,
        testMode: isTestMatch,
        ...(matchId ? { matchId } : {}),
      });
      return true;
    } catch (cancelError) {
      setError(getApiErrorMessage(cancelError, '1대1 예약을 취소하지 못했어.'));
      return false;
    } finally {
      setIsCanceling(false);
    }
  }, [distanceKm, isTestMatch, matchId, slotStartAt]);

  return {
    loading,
    error,
    isCanceling,
    matchStatus,
    view,
    isActive,
    cancel,
    refresh: loadStatus,
  };
}
