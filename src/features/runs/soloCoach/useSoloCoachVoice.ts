import { useEffect } from 'react';

import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  getBackgroundRunElapsedSeconds,
  subscribeBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import { speakLiveGapMessage } from '@/lib/liveMatchGapVoice';
import {
  buildCoachStartAnnouncement,
  buildDistanceGoalReachedAnnouncement,
  buildSoloCoachAnnouncement,
  buildTimeGoalReachedAnnouncement,
} from './soloCoachModel';
import { getSoloCoachConfig } from './soloCoachStore';

// 페이스메이커 voice loop for SOLO runs. Mounted alongside useLiveActivityBridge
// and mirrors its pattern: subscribe to tracking snapshot commits (fires on
// every GPS tick, foreground AND background), decide from elapsed time whether
// a feedback window passed, and speak through the same TTS pipeline the match
// gap voice uses (expo-speech + duck-others audio mode — proven to work with
// the screen off). Fire-and-forget: speech failures never touch the run flow.
export function useSoloCoachVoice({
  isRunning,
  matchMode,
}: {
  isRunning: boolean;
  matchMode: RunMatchMode;
}) {
  useEffect(() => {
    if (!isRunning || matchMode !== 'solo') {
      return undefined;
    }

    const config = getSoloCoachConfig();
    if (!config) {
      return undefined;
    }

    let nextAnnounceAtSeconds = config.intervalMinutes * 60;
    let distanceGoalAnnounced = false;
    let timeGoalAnnounced = false;

    void speakLiveGapMessage(buildCoachStartAnnouncement(config));

    const unsubscribe = subscribeBackgroundRunTracking((snapshot) => {
      if (snapshot.status !== 'running') {
        return;
      }

      const elapsedSeconds = getBackgroundRunElapsedSeconds(snapshot);

      // One-time goal celebrations, independent of the cadence.
      if (!distanceGoalAnnounced && config.goalDistanceKm && snapshot.distanceKm >= config.goalDistanceKm) {
        distanceGoalAnnounced = true;
        void speakLiveGapMessage(buildDistanceGoalReachedAnnouncement(config.goalDistanceKm));
      }
      if (!timeGoalAnnounced && config.goalTimeMinutes && elapsedSeconds >= config.goalTimeMinutes * 60) {
        timeGoalAnnounced = true;
        void speakLiveGapMessage(buildTimeGoalReachedAnnouncement(config.goalTimeMinutes));
      }

      if (elapsedSeconds < nextAnnounceAtSeconds) {
        return;
      }

      // Catch up past any windows missed while paused/suspended so a long gap
      // produces ONE announcement, not a burst.
      while (nextAnnounceAtSeconds <= elapsedSeconds) {
        nextAnnounceAtSeconds += config.intervalMinutes * 60;
      }

      const announcement = buildSoloCoachAnnouncement(config, {
        elapsedSeconds,
        distanceKm: snapshot.distanceKm,
      });

      if (announcement) {
        void speakLiveGapMessage(announcement);
      }
    }, { cloneRoute: false });

    return () => {
      unsubscribe();
    };
  }, [isRunning, matchMode]);
}
