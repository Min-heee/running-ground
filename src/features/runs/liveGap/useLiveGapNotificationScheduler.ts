import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import {
  buildDuelGapMessage,
  buildDuelGapSpeech,
  buildGroupGapMessage,
  buildGroupGapSpeech,
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
import { speakLiveGapMessage } from '@/lib/liveMatchGapVoice';
import { subscribeBackgroundRunTracking } from '@/features/runs/tracking/background';

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

function buildSchedulerSpeech(
  input: LiveGapSchedulerInput,
  groupTargets: readonly LiveGapGroupTarget[],
): string | null {
  if (input.matchMode === 'group') {
    return buildGroupGapSpeech({
      standings: input.groupStandings ?? [],
      selectedTargets: groupTargets,
      myPaceLabel: input.myPaceLabel,
    });
  }

  return buildDuelGapSpeech({
    opponentName: input.opponentName,
    myPaceLabel: input.myPaceLabel,
    opponentPaceLabel: input.opponentPaceLabel,
    gapKm: input.duelGapKm,
  });
}

// Fires a local notification (and optional voice) every chosen interval during an active
// match. Driven by TWO cadences so it survives the screen being off on both platforms:
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
  const schedulerActive = input.active && intervalMs !== null;

  const inputRef = useRef(input);
  inputRef.current = input;
  const groupTargetsRef = useRef(config.groupTargets);
  groupTargetsRef.current = config.groupTargets;
  const voiceEnabledRef = useRef(config.voiceEnabled);
  voiceEnabledRef.current = config.voiceEnabled;

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

      const message = buildSchedulerMessage(inputRef.current, groupTargetsRef.current);

      if (!message) {
        // Opponent data not ready yet — keep the clock past-due so we fire as soon as
        // it arrives rather than waiting another full interval.
        return;
      }

      lastFiredAtRef.current = now;
      void presentLiveGapNotification(message);

      if (voiceEnabledRef.current) {
        const speech = buildSchedulerSpeech(inputRef.current, groupTargetsRef.current);
        if (speech) {
          void speakLiveGapMessage(speech);
        }
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
