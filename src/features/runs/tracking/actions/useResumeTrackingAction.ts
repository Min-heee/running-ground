import { useCallback } from 'react';
import {
  getBackgroundRunTrackingSnapshot,
  resumeBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import { resolveActiveMatchId } from '@/features/runs/lifecycle/matchStateMachine';
import { getApiErrorMessage } from '@/services/apiError';
import type { PauseResumeTrackingActionsInput } from './types';

export function useResumeTrackingAction({
  appStateRef,
  buildDisplayedMatchProgress,
  duelMatchStatus,
  ensureBackgroundLocationPermission,
  groupMatchStatus,
  liveShareEnabledRef,
  liveShareLabelRef,
  matchMode,
  pushRunningMatchProgress,
  resolveLiveShareLabel,
  roomLinkedMatchContext,
  setError,
  setStatus,
  stopForegroundTrackingHelpers,
  syncFromBackgroundTracking,
  syncLiveSharing,
}: PauseResumeTrackingActionsInput) {
  return useCallback(async () => {
    try {
      setError(null);
      const resumeMatchId = resolveActiveMatchId({
        matchMode,
        duelMatchId: duelMatchStatus?.matchId,
        groupMatchId: groupMatchStatus?.matchId,
        roomLinkedMatchContext,
      });
      await ensureBackgroundLocationPermission();
      await resumeBackgroundRunTracking({
        appState: appStateRef.current,
        persistenceMatchId: resumeMatchId,
        trackingKey: resumeMatchId ?? (matchMode === 'solo' ? 'solo' : `${matchMode}:resume`),
      });
      syncFromBackgroundTracking();

      if (liveShareEnabledRef.current) {
        const currentSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
        const latestTrackedPoint = currentSnapshot.route[currentSnapshot.route.length - 1];
        const nextLocationLabel = liveShareLabelRef.current ?? await resolveLiveShareLabel(
          latestTrackedPoint
            ? { latitude: latestTrackedPoint.latitude, longitude: latestTrackedPoint.longitude }
            : undefined,
        );
        await syncLiveSharing({
          enabled: true,
          status: 'running',
          locationLabel: nextLocationLabel,
        });
      }

      if (resumeMatchId) {
        const currentSnapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
        const progress = buildDisplayedMatchProgress(currentSnapshot);
        await pushRunningMatchProgress({
          matchId: resumeMatchId,
          distanceKm: progress.distanceKm,
          elapsedSeconds: progress.elapsedSeconds,
          currentPace: progress.currentPace,
          status: 'running',
        });
      }
    } catch (resumeError) {
      setError(getApiErrorMessage(resumeError, '러닝 측정을 다시 시작하지 못했어.'));
      stopForegroundTrackingHelpers();
      setStatus('paused');
    }
  }, [
    appStateRef,
    buildDisplayedMatchProgress,
    duelMatchStatus?.matchId,
    ensureBackgroundLocationPermission,
    groupMatchStatus?.matchId,
    liveShareEnabledRef,
    liveShareLabelRef,
    matchMode,
    pushRunningMatchProgress,
    resolveLiveShareLabel,
    roomLinkedMatchContext,
    setError,
    setStatus,
    stopForegroundTrackingHelpers,
    syncFromBackgroundTracking,
    syncLiveSharing,
  ]);
}
