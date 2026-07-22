import { useEffect } from 'react';

import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  getBackgroundRunElapsedSeconds,
  getBackgroundRunTrackingSnapshot,
  subscribeBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import {
  appendGhostSample,
  beginGhostRecording,
  finishGhostRecording,
} from './ghostRecorder';

// Records EVERY solo run's time→distance curve (페이스메이커/나와의 대결 포함)
// so the finished run can be offered as a 나와의 대결 ghost. Same snapshot
// subscription pattern as the Live Activity bridge — fires foreground and
// background, so screen-off stretches still sample.
export function useSoloGhostRecorder({
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

    beginGhostRecording(getBackgroundRunTrackingSnapshot({ cloneRoute: false }).startedAt ?? null);

    const unsubscribe = subscribeBackgroundRunTracking((snapshot) => {
      if (snapshot.status !== 'running') {
        return;
      }

      appendGhostSample(
        getBackgroundRunElapsedSeconds(snapshot),
        snapshot.distanceKm * 1000,
      );
    }, { cloneRoute: false });

    return () => {
      unsubscribe();
      // Run ended (or unmounted): compress into a save-prompt candidate when
      // the run was long enough to be worth racing.
      finishGhostRecording();
    };
  }, [isRunning, matchMode]);
}
