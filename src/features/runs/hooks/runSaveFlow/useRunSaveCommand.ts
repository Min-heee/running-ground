import {
  getBackgroundRunTrackingSnapshot,
  pauseBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import { isUnsavableShortRunError } from '@/features/runs/utils/matchScheduling';
import { resolveActiveMatchId } from '@/features/runs/lifecycle/matchStateMachine';
import {
  buildPendingFinishIntentFromFreeze,
  getLocalGoalFreeze,
} from '@/features/runs/sync/localGoalFreezeStore';
import { createTrackedRun, forceResetRunningMatchState, getApiErrorMessage } from '@/services';
import type { SaveTrackingOptions } from '@/features/runs/hooks/useRunTracking';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { applyGoalFreezeToDisplayedSnapshot } from './goalFreezeClamp';
import { buildRunSaveResultSnapshot } from './runSaveResultMapper';
import { runCleanupAfterSave } from './runCleanupAfterSave';
import { runPointRankingPostProcessor } from './runPointRankingPostProcessor';
import type { UseRunSaveFlowInput } from './types';

export function useRunSaveCommand({
  autoStartedMatchIdRef,
  buildDisplayedMatchProgress,
  discardCurrentTracking,
  duelMatchStatus,
  getDisplayedTrackingSnapshot,
  groupMatchStatus,
  isTabMode,
  matchMode,
  officialStartBaselineRef,
  preStartWarmupMatchIdRef,
  pushRunningMatchProgress,
  resetMatchRuntimeAfterTrackingCleared,
  resetForegroundTrackingState,
  roomLinkedMatchContext,
  setError,
  setStatus,
  status,
  stopForegroundTrackingHelpers,
  syncElapsedSeconds,
  syncFromBackgroundTracking,
  syncLiveSharing,
  totalStepsRef,
  trackedMatchResult,
  isPartyRun,
}: Pick<
  UseRunSaveFlowInput,
  | 'autoStartedMatchIdRef'
  | 'buildDisplayedMatchProgress'
  | 'duelMatchStatus'
  | 'getDisplayedTrackingSnapshot'
  | 'groupMatchStatus'
  | 'isTabMode'
  | 'matchMode'
  | 'officialStartBaselineRef'
  | 'preStartWarmupMatchIdRef'
  | 'pushRunningMatchProgress'
  | 'resetMatchRuntimeAfterTrackingCleared'
  | 'resetForegroundTrackingState'
  | 'roomLinkedMatchContext'
  | 'setError'
  | 'setStatus'
  | 'status'
  | 'stopForegroundTrackingHelpers'
  | 'syncElapsedSeconds'
  | 'syncFromBackgroundTracking'
  | 'syncLiveSharing'
  | 'totalStepsRef'
  | 'trackedMatchResult'
> & {
  discardCurrentTracking: () => Promise<void>;
  isPartyRun: boolean;
}) {
  return async (options: SaveTrackingOptions = {}) => {
    try {
      setError(null);

      if (status === 'running') {
        await pauseBackgroundRunTracking();
        stopForegroundTrackingHelpers();
      }

      const trackingSnapshot = getBackgroundRunTrackingSnapshot();
      const displayedSnapshot = getDisplayedTrackingSnapshot(trackingSnapshot);
      syncFromBackgroundTracking(trackingSnapshot);
      const resolvedMatchResult = options.matchResultOverride ?? trackedMatchResult;
      const activeMatchId = resolveActiveMatchId({
        matchMode,
        duelMatchId: duelMatchStatus?.matchId,
        groupMatchId: groupMatchStatus?.matchId,
        roomLinkedMatchContext,
      });

      // HANDS-FREE FINISH (Stage 3d) — when the goal was crossed for THIS exact match, clamp the
      // snapshot being saved down to the at-crossing freeze (min-only elapsed/distance + route
      // truncated at the crossing) so the saved record matches the server-frozen verdict instead
      // of the post-goal drift. No freeze / no match → passthrough (today's behavior). Covers
      // BOTH save flows — the auto-exit path routes saveForfeitResultAndNavigate →
      // handleSaveTracking; forfeit saves are inherently safe (a freeze exists only if the goal
      // was crossed, and min() can only lower values).
      const goalFreeze = activeMatchId ? getLocalGoalFreeze(activeMatchId) : null;
      const clampedDisplayedSnapshot = applyGoalFreezeToDisplayedSnapshot(displayedSnapshot, goalFreeze);

      const saveSnapshot = buildRunSaveResultSnapshot({
        allowShortDistanceSave: Boolean(options.allowShortDistanceSave),
        // A run that carries a match result is a decided competition — it must save even
        // at 0.00km with no GPS fixes (e.g. friends start a party run, then immediately
        // forfeit to redo it). Without this, the manual save button on the fallback
        // screen kept rejecting with '이동한 러닝 경로가 필요해', leaving no way out.
        allowStationaryForfeitSave: Boolean(options.allowStationaryForfeitSave) || Boolean(resolvedMatchResult),
        displayedSnapshot: clampedDisplayedSnapshot,
        // Persist the originating matchId onto the saved matchResult so '결과 보기' is
        // reachable from 내 러닝 기록 too — not only right after the match (which threads
        // matchId via nav params). The backend stores whatever the blob carries.
        matchId: activeMatchId,
        matchSource: isPartyRun ? 'party' : 'official',
        totalSteps: totalStepsRef.current,
        trackedMatchResult: resolvedMatchResult,
      });
      syncElapsedSeconds(saveSnapshot.finalElapsedSeconds);

      if (activeMatchId) {
        try {
          // HANDS-FREE FINISH (Stage 3d) — the save-time final push had the same drift leak as
          // the match-end delivery: it posted the LIVE progress with status 'finished'. Prefer
          // the at-crossing freeze when one exists for this match; without one this is exactly
          // the live progress as before. Server first-write-wins keeps re-pushes idempotent.
          const progress = buildDisplayedMatchProgress(trackingSnapshot);
          const finishIntent = buildPendingFinishIntentFromFreeze(goalFreeze, {
            matchId: activeMatchId,
            elapsedSeconds: progress.elapsedSeconds,
            distanceKm: progress.distanceKm,
            pace: progress.currentPace,
          });
          await pushRunningMatchProgress({
            matchId: activeMatchId,
            distanceKm: finishIntent.distanceKm,
            elapsedSeconds: finishIntent.finishElapsedSeconds,
            currentPace: finishIntent.pace,
            status: 'finished',
          });
        } catch {
          setError('러닝 결과는 계산됐지만 경쟁 상태를 마지막으로 반영하지 못했어요.');
        }
      }

      setStatus('saving');
      const savedRun = await createTrackedRun(saveSnapshot.createRunInput);
      options.onSavedRun?.(savedRun.run.id);
      await runCleanupAfterSave({
        activeMatchId,
        autoStartedMatchIdRef,
        officialStartBaselineRef,
        options,
        preStartWarmupMatchIdRef,
        resetMatchRuntimeAfterTrackingCleared,
        resetForegroundTrackingState,
        setStatus,
        syncLiveSharing,
      });
      if (activeMatchId) {
        void forceResetRunningMatchState()
          .then((payload) => {
            rgPerfMark('running match force reset after save completed', {
              cleaned: payload.cleaned,
              cleanedItems: payload.cleanedItems.join(','),
              matchId: activeMatchId,
            });
          })
          .catch((cleanupError) => {
            rgPerfMark('running match force reset after save failed', {
              matchId: activeMatchId,
              reason: getApiErrorMessage(cleanupError, 'unknown'),
            });
          });
      }

      runPointRankingPostProcessor({
        isTabMode,
        runId: savedRun.run.id,
      });
      return true;
    } catch (saveError) {
      if (options.exitIfUnsavable && isUnsavableShortRunError(saveError)) {
        rgPerfMark('run save skipped as unsavable', {
          allowShortDistanceSave: Boolean(options.allowShortDistanceSave),
          reason: getApiErrorMessage(saveError, String(saveError ?? 'unknown')),
        });
        await discardCurrentTracking();
        return false;
      }

      setStatus('paused');
      setError(getApiErrorMessage(saveError, '러닝 기록 저장에 실패했어.'));
      return false;
    }
  };
}
