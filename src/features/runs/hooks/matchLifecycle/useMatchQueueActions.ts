import { useCallback, useEffect, useRef, useState } from 'react';
import { buildWeeklyHourlySlots } from '@/features/runs/utils/matchScheduling';
import {
  applySharedServerClock,
  getSharedServerClockOffsetMs,
  subscribeSharedServerClock,
} from '@/features/runs/sync/serverClockSync';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';

export function useMatchQueueActions() {
  const initialMatchSlotOptions = buildWeeklyHourlySlots();
  const initialMatchSlot = initialMatchSlotOptions.find((slot) => !slot.isClosed) ?? initialMatchSlotOptions[0] ?? null;
  const weeklyMatchSlotOptions = buildWeeklyHourlySlots();
  const serverClockOffsetMsRef = useRef(getSharedServerClockOffsetMs());

  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingRunningMatchItem[]>([]);
  const [matchRemindersEnabled, setMatchRemindersEnabled] = useState(true);
  const [cancelingUpcomingMatchId, setCancelingUpcomingMatchId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(() => getSharedServerClockOffsetMs());
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
    });
  }, []);

  const syncServerClock = (serverNow?: string) => {
    const nextOffsetMs = applySharedServerClock(serverNow);
    serverClockOffsetMsRef.current = nextOffsetMs;
    setServerClockOffsetMs(nextOffsetMs);
  };

  const getSyncedNowMs = useCallback(() => Date.now() + getSharedServerClockOffsetMs(), []);

  return {
    initialMatchSlot,
    weeklyMatchSlotOptions,
    upcomingMatches,
    setUpcomingMatches,
    matchRemindersEnabled,
    setMatchRemindersEnabled,
    cancelingUpcomingMatchId,
    setCancelingUpcomingMatchId,
    nowMs,
    setNowMs,
    serverClockOffsetMs,
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
