import { useEffect } from 'react';

type UseSyncedCountdownTickerInput = {
  serverClockOffsetMsRef: { current: number };
  onNowMsChange: (nowMs: number) => void;
};

export function useSyncedCountdownTicker({
  serverClockOffsetMsRef,
  onNowMsChange,
}: UseSyncedCountdownTickerInput) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextTick = () => {
      const currentNowMs = Date.now();
      onNowMsChange(currentNowMs);
      const syncedTickMs = currentNowMs + serverClockOffsetMsRef.current;
      const msUntilNextSecond = 1000 - (syncedTickMs % 1000);
      timer = setTimeout(scheduleNextTick, Math.max(120, Math.min(msUntilNextSecond + 20, 1000)));
    };

    timer = setTimeout(scheduleNextTick, 120);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [onNowMsChange, serverClockOffsetMsRef]);
}
