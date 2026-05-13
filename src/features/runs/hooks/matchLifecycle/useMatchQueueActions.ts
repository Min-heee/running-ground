import { useEffect, useRef, useState } from 'react';
import { buildWeeklyHourlySlots } from '@/features/runs/matchScheduling';
import { parseServerNowMs, resolveStableServerClockOffset } from '@/features/runs/serverClockSync';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';

export function useMatchQueueActions() {
  const initialMatchSlotOptions = buildWeeklyHourlySlots();
  const initialMatchSlot = initialMatchSlotOptions.find((slot) => !slot.isClosed) ?? initialMatchSlotOptions[0] ?? null;
  const weeklyMatchSlotOptions = buildWeeklyHourlySlots();
  const serverClockOffsetMsRef = useRef(0);

  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingRunningMatchItem[]>([]);
  const [matchRemindersEnabled, setMatchRemindersEnabled] = useState(true);
  const [cancelingUpcomingMatchId, setCancelingUpcomingMatchId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [liveArenaPage, setLiveArenaPage] = useState(0);
  const [forceOpenActiveMatch, setForceOpenActiveMatch] = useState(false);
  const [isResolvingFocusedMatch, setIsResolvingFocusedMatch] = useState(false);

  const syncedNowMs = nowMs + serverClockOffsetMs;

  useEffect(() => {
    serverClockOffsetMsRef.current = serverClockOffsetMs;
  }, [serverClockOffsetMs]);

  const syncServerClock = (serverNow?: string) => {
    const serverNowMs = parseServerNowMs(serverNow);
    if (serverNowMs === null) {
      return;
    }

    const nextOffsetMs = serverNowMs - Date.now();
    setServerClockOffsetMs((currentOffsetMs) => {
      const stableOffsetMs = resolveStableServerClockOffset(currentOffsetMs, nextOffsetMs);
      serverClockOffsetMsRef.current = stableOffsetMs;
      return stableOffsetMs;
    });
  };

  const getSyncedNowMs = () => Date.now() + serverClockOffsetMsRef.current;

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
