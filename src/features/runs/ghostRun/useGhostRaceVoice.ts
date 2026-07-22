import { useEffect } from 'react';

import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  getBackgroundRunElapsedSeconds,
  subscribeBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import { speakLiveGapMessage } from '@/lib/liveMatchGapVoice';
import {
  buildGhostFinishAnnouncement,
  buildGhostFinishedFirstAnnouncement,
  buildGhostRaceAnnouncement,
  buildGhostStartAnnouncement,
} from './ghostRaceModel';
import { getGhostRaceConfig } from './ghostRaceStore';

// 나와의 대결 voice loop — the ghost-race sibling of useSoloCoachVoice, same
// snapshot subscription + TTS pipeline (screen-off capable, fire-and-forget).
export function useGhostRaceVoice({
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

    const config = getGhostRaceConfig();
    if (!config) {
      return undefined;
    }

    let nextAnnounceAtSeconds = config.intervalMinutes * 60;
    let finishAnnounced = false;
    let ghostFinishedFirstAnnounced = false;

    void speakLiveGapMessage(buildGhostStartAnnouncement(config));

    const unsubscribe = subscribeBackgroundRunTracking((snapshot) => {
      if (snapshot.status !== 'running') {
        return;
      }

      const elapsedSeconds = getBackgroundRunElapsedSeconds(snapshot);
      const myDistanceM = snapshot.distanceKm * 1000;

      // The race verdict — once, when I cross the ghost's final distance.
      if (!finishAnnounced && myDistanceM >= config.ghost.distanceM) {
        finishAnnounced = true;
        void speakLiveGapMessage(buildGhostFinishAnnouncement(config, elapsedSeconds));
        return;
      }

      if (finishAnnounced) {
        return;
      }

      // The ghost finishing first — once, the moment its recorded duration
      // passes while I am still short of its distance.
      if (!ghostFinishedFirstAnnounced && elapsedSeconds >= config.ghost.durationSec) {
        ghostFinishedFirstAnnounced = true;
        void speakLiveGapMessage(buildGhostFinishedFirstAnnouncement());
      }

      if (elapsedSeconds < nextAnnounceAtSeconds) {
        return;
      }

      // Collapse windows missed while paused/suspended into ONE announcement.
      while (nextAnnounceAtSeconds <= elapsedSeconds) {
        nextAnnounceAtSeconds += config.intervalMinutes * 60;
      }

      const announcement = buildGhostRaceAnnouncement(config, {
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
