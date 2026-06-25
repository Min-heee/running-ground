import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import {
  buildLiveGapOutput,
  type LiveGapOutput,
} from '@/features/runs/liveGap/liveGapMessage';
import {
  getLiveGapPushConfig,
  resolveLiveGapIntervalMs,
  subscribeLiveGapPushConfig,
  type LiveGapDeliveryMode,
  type LiveGapGroupTarget,
  type LiveGapMetric,
} from '@/features/runs/liveGap/liveGapPushConfig';
import {
  ensureLiveGapNotificationPermissions,
  presentLiveGapNotification,
} from '@/lib/liveMatchGapNotifications';
import { speakLiveGapMessage } from '@/lib/liveMatchGapVoice';
import { subscribeBackgroundRunTracking } from '@/features/runs/tracking/background';
import { isMyMatchDistanceStale } from '@/features/runs/sync/matchDistanceStaleness';

const SCHEDULER_TICK_MS = 1000;

export type LiveGapSchedulerInput = {
  active: boolean;
  matchMode: 'duel' | 'group';
  opponentName?: string | null;
  // My average (arena) pace label, e.g. '5:30/km'.
  myPaceLabel?: string | null;
  // Distance left to the match target, in km (my distance subtracted from target).
  remainingDistanceKm?: number | null;
  opponentPaceLabel?: string | null;
  duelGapKm?: number | null;
  groupStandings?: GroupLiveStanding[];
  // Epoch ms of the freshest MY-distance signal (most recent local distance update or the synced
  // match-progress checkpoint's updatedAt). Re-evaluated against Date.now() at each fire so a
  // notification built from a frozen MY-distance (screen-off JS suspend) withholds the my-distance
  // derived avg pace + gap. null when no fresh signal yet (early run) — then not treated as stale.
  myDistanceUpdatedAtMs?: number | null;
};

function buildSchedulerOutput(
  input: LiveGapSchedulerInput,
  metrics: readonly LiveGapMetric[],
  groupTargets: readonly LiveGapGroupTarget[],
  nowMs: number,
): LiveGapOutput {
  return buildLiveGapOutput({
    matchMode: input.matchMode,
    metrics,
    remainingDistanceKm: input.remainingDistanceKm,
    avgPaceLabel: input.myPaceLabel,
    opponentName: input.opponentName,
    opponentGapKm: input.duelGapKm,
    opponentPaceLabel: input.opponentPaceLabel,
    standings: input.groupStandings ?? [],
    groupTargets,
    isMyDistanceStale: isMyMatchDistanceStale({
      lastUpdatedAtMs: input.myDistanceUpdatedAtMs,
      nowMs,
    }),
  });
}

// Fires a local notification (and/or voice) every chosen interval during an active match.
// Driven by TWO cadences so it survives the screen being off on both platforms:
//   1. a 1s timer — reliable while the screen is on, and on iOS during the background
//      location CPU windows;
//   2. each GPS tracking-snapshot emission — on Android the screen-off JS timer is
//      suspended even with the run's foreground service, but the native GPS location task
//      keeps emitting snapshots, so re-checking the boundary on each emission is what
//      actually delivers the gap with the Android screen off.
// Both call the same boundary check sharing one lastFiredAt clock, so there is no
// double-fire. Reads the latest live data through refs so neither closure goes stale.
export function useLiveGapNotificationScheduler(input: LiveGapSchedulerInput) {
  const config = useSyncExternalStore(
    subscribeLiveGapPushConfig,
    getLiveGapPushConfig,
    getLiveGapPushConfig,
  );

  const intervalMs = resolveLiveGapIntervalMs(config.interval);
  // With no metric selected there is nothing to push, so treat it as inactive.
  const schedulerActive = input.active && intervalMs !== null && config.metrics.length > 0;

  const inputRef = useRef(input);
  inputRef.current = input;
  const metricsRef = useRef(config.metrics);
  metricsRef.current = config.metrics;
  const groupTargetsRef = useRef(config.groupTargets);
  groupTargetsRef.current = config.groupTargets;
  const deliveryModeRef = useRef<LiveGapDeliveryMode>(config.deliveryMode);
  deliveryModeRef.current = config.deliveryMode;

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

    const maybeFire = () => {
      const now = Date.now();
      const lastFiredAt = lastFiredAtRef.current ?? now;

      if (now - lastFiredAt < intervalMs) {
        return;
      }

      const output = buildSchedulerOutput(inputRef.current, metricsRef.current, groupTargetsRef.current, now);

      if (!output.notification && !output.speech) {
        // Data not ready yet — keep the clock past-due so we fire as soon as it arrives
        // rather than waiting another full interval.
        return;
      }

      lastFiredAtRef.current = now;

      const deliveryMode = deliveryModeRef.current;
      const wantNotification = deliveryMode === 'notification' || deliveryMode === 'both';
      const wantVoice = deliveryMode === 'voice' || deliveryMode === 'both';

      if (wantNotification && output.notification) {
        void presentLiveGapNotification(output.notification);
      }

      if (wantVoice && output.speech) {
        void speakLiveGapMessage(output.speech);
      }
    };

    const intervalId = setInterval(maybeFire, SCHEDULER_TICK_MS);
    // GPS-emission cadence — the screen-off-reliable driver on Android. The immediate
    // listener call on subscribe is a no-op here (we just anchored lastFiredAt).
    const unsubscribeTracking = subscribeBackgroundRunTracking(() => {
      maybeFire();
    }, { cloneRoute: false });

    return () => {
      clearInterval(intervalId);
      unsubscribeTracking();
    };
  }, [schedulerActive, intervalMs]);
}
