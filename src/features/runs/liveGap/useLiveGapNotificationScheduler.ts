import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import {
  buildDuelGapMessage,
  buildGroupGapMessage,
  type LiveGapMessage,
} from '@/features/runs/liveGap/liveGapMessage';
import {
  getLiveGapPushConfig,
  resolveLiveGapIntervalMs,
  subscribeLiveGapPushConfig,
  type LiveGapGroupTarget,
} from '@/features/runs/liveGap/liveGapPushConfig';
import {
  ensureLiveGapNotificationPermissions,
  presentLiveGapNotification,
} from '@/lib/liveMatchGapNotifications';

const SCHEDULER_TICK_MS = 1000;

export type LiveGapSchedulerInput = {
  active: boolean;
  matchMode: 'duel' | 'group';
  opponentName?: string | null;
  myPaceLabel?: string | null;
  opponentPaceLabel?: string | null;
  duelGapKm?: number | null;
  groupStandings?: GroupLiveStanding[];
};

function buildSchedulerMessage(
  input: LiveGapSchedulerInput,
  groupTargets: readonly LiveGapGroupTarget[],
): LiveGapMessage | null {
  if (input.matchMode === 'group') {
    return buildGroupGapMessage({
      standings: input.groupStandings ?? [],
      selectedTargets: groupTargets,
      myPaceLabel: input.myPaceLabel,
    });
  }

  return buildDuelGapMessage({
    opponentName: input.opponentName,
    myPaceLabel: input.myPaceLabel,
    opponentPaceLabel: input.opponentPaceLabel,
    gapKm: input.duelGapKm,
  });
}

// Fires a local notification every chosen interval during an active match. Cadence is
// driven by a 1s timer (cheap boundary check). On Android the run's GPS foreground
// service keeps this ticking with the screen off, so backgrounded delivery is reliable.
// On iOS the app only holds the `location` background mode, so a backgrounded timer is
// best-effort — in practice this is foreground-reliable on iPhone and may miss ticks
// when the screen is off. Reads the latest live data through a ref so the timer closure
// never goes stale.
export function useLiveGapNotificationScheduler(input: LiveGapSchedulerInput) {
  const config = useSyncExternalStore(
    subscribeLiveGapPushConfig,
    getLiveGapPushConfig,
    getLiveGapPushConfig,
  );

  const intervalMs = resolveLiveGapIntervalMs(config.interval);
  const schedulerActive = input.active && intervalMs !== null;

  const inputRef = useRef(input);
  inputRef.current = input;
  const groupTargetsRef = useRef(config.groupTargets);
  groupTargetsRef.current = config.groupTargets;

  const permissionRequestedRef = useRef(false);
  useEffect(() => {
    if (!schedulerActive || permissionRequestedRef.current) {
      return;
    }

    permissionRequestedRef.current = true;
    void ensureLiveGapNotificationPermissions();
  }, [schedulerActive]);

  const lastFiredAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!schedulerActive || intervalMs === null) {
      lastFiredAtRef.current = null;
      return undefined;
    }

    // Anchor the clock at activation so the first notification lands one full interval
    // in, not immediately.
    lastFiredAtRef.current = Date.now();

    const intervalId = setInterval(() => {
      const now = Date.now();
      const lastFiredAt = lastFiredAtRef.current ?? now;

      if (now - lastFiredAt < intervalMs) {
        return;
      }

      const message = buildSchedulerMessage(inputRef.current, groupTargetsRef.current);

      if (!message) {
        // Opponent data not ready yet — keep the clock past-due so we fire as soon as
        // it arrives rather than waiting another full interval.
        return;
      }

      lastFiredAtRef.current = now;
      void presentLiveGapNotification(message);
    }, SCHEDULER_TICK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [schedulerActive, intervalMs]);
}
