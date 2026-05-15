import { useCallback } from 'react';
import { pauseBackgroundRunTracking } from '@/features/runs/tracking/background';
import { resolveActiveMatchId } from '@/features/runs/lifecycle/matchStateMachine';
import type { PauseResumeTrackingActionsInput } from './types';

export function usePauseTrackingAction({
  buildDisplayedMatchProgress,
  duelMatchStatus,
  groupMatchStatus,
  liveShareEnabledRef,
  liveShareLabelRef,
  matchMode,
  pushRunningMatchProgress,
  roomLinkedMatchContext,
  setError,
  stopForegroundTrackingHelpers,
  syncFromBackgroundTracking,
  syncLiveSharing,
}: PauseResumeTrackingActionsInput) {
  return useCallback(async () => {
    await pauseBackgroundRunTracking();
    stopForegroundTrackingHelpers();
    syncFromBackgroundTracking();

    const activeMatchId = resolveActiveMatchId({
      matchMode,
      duelMatchId: duelMatchStatus?.matchId,
      groupMatchId: groupMatchStatus?.matchId,
      roomLinkedMatchContext,
    });

    if (activeMatchId) {
      try {
        const progress = buildDisplayedMatchProgress();
        await pushRunningMatchProgress({
          matchId: activeMatchId,
          distanceKm: progress.distanceKm,
          elapsedSeconds: progress.elapsedSeconds,
          currentPace: progress.currentPace,
          status: 'paused',
        });
      } catch {
        setError('러닝은 멈췄지만 경쟁 상태를 업데이트하지 못했어요.');
      }
    }

    try {
      await syncLiveSharing({
        enabled: liveShareEnabledRef.current,
        status: liveShareEnabledRef.current ? 'paused' : 'idle',
        locationLabel: liveShareLabelRef.current,
      });
    } catch {
      setError('측정은 멈췄지만 위치 공유 상태를 업데이트하지 못했어요.');
    }
  }, [
    buildDisplayedMatchProgress,
    duelMatchStatus?.matchId,
    groupMatchStatus?.matchId,
    liveShareEnabledRef,
    liveShareLabelRef,
    matchMode,
    pushRunningMatchProgress,
    roomLinkedMatchContext,
    setError,
    stopForegroundTrackingHelpers,
    syncFromBackgroundTracking,
    syncLiveSharing,
  ]);
}
