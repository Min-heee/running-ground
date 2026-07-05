import { useCallback, useEffect, useRef, useState } from 'react';
import { getWeeklyHourlySlotsForNow } from '@/features/runs/utils/matchScheduling';
import {
  applySharedServerClock,
  getSharedServerClockOffsetMs,
  hasSyncedServerClock,
  subscribeSharedServerClock,
} from '@/features/runs/sync/serverClockSync';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';

export function useMatchQueueActions() {
  // Built once (hour-keyed module cache) and shared for both the default-slot pick
  // and the picker list, instead of two full 8-day×24-hour rebuilds per render.
  const weeklyMatchSlotOptions = getWeeklyHourlySlotsForNow();
  const initialMatchSlot = weeklyMatchSlotOptions.find((slot) => !slot.isClosed) ?? weeklyMatchSlotOptions[0] ?? null;
  const serverClockOffsetMsRef = useRef(getSharedServerClockOffsetMs());

  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingRunningMatchItem[]>([]);
  const [duelSlotCounts, setDuelSlotCounts] = useState<Record<string, number>>({});
  const [matchRemindersEnabled, setMatchRemindersEnabled] = useState(true);
  const [cancelingUpcomingMatchId, setCancelingUpcomingMatchId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(() => getSharedServerClockOffsetMs());
  // clockReady: true only once the shared offset is trustworthy (a few agreeing RTT-timed
  // samples). The countdown lock waits for this before freezing its absolute target, so a
  // skewed phone never freezes a multi-second-wrong instant during cold-start convergence.
  const [serverClockReady, setServerClockReady] = useState(() => hasSyncedServerClock());
  const [liveArenaPage, setLiveArenaPage] = useState(0);
  const [forceOpenActiveMatch, setForceOpenActiveMatch] = useState(false);
  const [isResolvingFocusedMatch, setIsResolvingFocusedMatch] = useState(false);

  const syncedNowMs = nowMs + serverClockOffsetMs;

  useEffect(() => {
    serverClockOffsetMsRef.current = serverClockOffsetMs;
  }, [serverClockOffsetMs]);

  useEffect(() => {
    return subscribeSharedServerClock((offsetMs) => {
      serverClockOffsetMsRef.current = offsetMs;
      setServerClockOffsetMs(offsetMs);
      setServerClockReady(hasSyncedServerClock());
    });
  }, []);

  const syncServerClock = (serverNow?: string, timingSource?: unknown) => {
    const nextOffsetMs = applySharedServerClock(serverNow, timingSource);
    serverClockOffsetMsRef.current = nextOffsetMs;
    setServerClockOffsetMs(nextOffsetMs);
    // clockReady can trip even when the offset value DIDN'T move (a second agreeing sample),
    // so refresh it here too — the subscription only fires on an offset change.
    setServerClockReady(hasSyncedServerClock());
  };

  const getSyncedNowMs = useCallback(() => Date.now() + getSharedServerClockOffsetMs(), []);

  return {
    initialMatchSlot,
    weeklyMatchSlotOptions,
    upcomingMatches,
    setUpcomingMatches,
    duelSlotCounts,
    setDuelSlotCounts,
    matchRemindersEnabled,
    setMatchRemindersEnabled,
    cancelingUpcomingMatchId,
    setCancelingUpcomingMatchId,
    nowMs,
    setNowMs,
    serverClockOffsetMs,
    serverClockReady,
    syncedNowMs,
    serverClockOffsetMsRef,
    syncServerClock,
    getSyncedNowMs,
    liveArenaPage,
    setLiveArenaPage,
    forceOpenActiveMatch,
    setForceOpenActiveMatch,
    isResolvingFocusedMatch,
    setIsResolvingFocusedMatch,
  };
}
