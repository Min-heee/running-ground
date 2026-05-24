import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

export const ANDROID_LIVE_MATCH_STARTUP_DELAY_MS = 150;

type UseAndroidLiveMatchStartupGateInput = {
  active: boolean;
  identity: string | null;
  delayMs?: number;
};

export function useAndroidLiveMatchStartupGate({
  active,
  identity,
  delayMs = ANDROID_LIVE_MATCH_STARTUP_DELAY_MS,
}: UseAndroidLiveMatchStartupGateInput) {
  const shouldDelayStartup = Platform.OS === 'android' && active && Boolean(identity);
  const [ready, setReady] = useState(!shouldDelayStartup);

  useEffect(() => {
    if (!shouldDelayStartup) {
      setReady(true);
      return undefined;
    }

    // Android only: let the first frame and touch handlers settle before heavy live-match work starts.
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
