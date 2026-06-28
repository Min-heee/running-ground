import { useEffect, useMemo, useState } from 'react';

export const ANDROID_LIVE_MATCH_STARTUP_DELAY_MS = 150;

type UseAndroidLiveMatchStartupGateInput = {
  active: boolean;
  identity: string | null;
  delayMs?: number;
};

// Live-match startup readiness gate. Drives `deferRankingCalculations` on cold start.
//
// Bundle A1 made this PLATFORM-SYMMETRIC: readiness now keys on the live-match startup
// IDENTITY (active + a stable identity), the same signal on both iOS and Android, instead
// of `Platform.OS === 'android'`. After the step-3 row/distance split this gate only
// staggers the heavy rank/gap DECORATION (never the row data or live distances), so the
// brief settle is render-cost-only and safe to apply on both platforms. The cold-start
// identity-change reset is preserved (the effect depends on `identity`), so a new match
// re-arms the settle window.
export function useAndroidLiveMatchStartupGate({
  active,
  identity,
  delayMs = ANDROID_LIVE_MATCH_STARTUP_DELAY_MS,
}: UseAndroidLiveMatchStartupGateInput) {
  const shouldDelayStartup = active && Boolean(identity);
  const [ready, setReady] = useState(!shouldDelayStartup);

  useEffect(() => {
    if (!shouldDelayStartup) {
      setReady(true);
      return undefined;
    }

    // Both platforms: let the first frame and touch handlers settle before the heavy
    // live-match rank/gap decoration runs. Row data + live distances are already rendered
    // un-gated, so this only defers decoration polish.
    setReady(false);
    const timer = setTimeout(() => {
      setReady(true);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [delayMs, identity, shouldDelayStartup]);

  return useMemo(() => ({
    ready: !shouldDelayStartup || ready,
    delaying: shouldDelayStartup && !ready,
  }), [ready, shouldDelayStartup]);
}
