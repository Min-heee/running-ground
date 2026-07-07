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
import {
  clearPendingMatchSaveContext,
  getPendingMatchSaveContext,
  resolvePendingMatchSaveFallbacks,
  setPendingMatchSaveContext,
} from './pendingMatchSaveContext';
import { runCleanupAfterSave } from './runCleanupAfterSave';
import { runPointRankingPostProcessor } from './runPointRankingPostProcessor';
import type { UseRunSaveFlowInput } from './types';

// FIX-1 — one save command in flight per app, period. Module-level (not closure/render
// state) so a double-tap in the same frame can't slip past a not-yet-rendered 'saving'.
let saveCommandInFlight = false;

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
    // FIX-1 — single-flight for the whole save command. A double-tap during the awaited
    // finish push (up to 5s) or the tracked-run POST used to start a SECOND save; until
    // backend B-5 (dedupe-as-upgrade) is deployed that duplicates the match run row. A
    // module-level flag (not closure state) so the guard holds even before the 'saving'
    // status render lands.
    if (saveCommandInFlight) {
      rgPerfMark('run save re-entry suppressed', { status });
      return false;
    }
    saveCommandInFlight = true;
    try {
      setError(null);

      if (status === 'running') {
        await pauseBackgroundRunTracking();
        stopForegroundTrackingHelpers();
      }

      const trackingSnapshot = getBackgroundRunTrackingSnapshot();
      const displayedSnapshot = getDisplayedTrackingSnapshot(trackingSnapshot);
      syncFromBackgroundTracking(trackingSnapshot);
      // C-2 — a FAILED match save leaves the tracker 'paused' but wipes the match runtime, so
      // the paused-shell retry would resolve neither a matchId nor a matchResult and degrade to
      // a solo save (no 대결 카드, freeze clamp never reapplied → freeze immortal). The pending
      // context recorded by the previous attempt backfills all three; the live runtime always
      // wins while it still knows the match.
      const pendingSaveContext = getPendingMatchSaveContext();
      const { activeMatchId, resolvedMatchResult, matchSource } = resolvePendingMatchSaveFallbacks({
        liveMatchId: resolveActiveMatchId({
          matchMode,
          duelMatchId: duelMatchStatus?.matchId,
          groupMatchId: groupMatchStatus?.matchId,
          roomLinkedMatchContext,
        }),
        liveMatchResult: options.matchResultOverride ?? trackedMatchResult,
        liveMatchSource: isPartyRun ? 'party' : 'official',
        pendingContext: pendingSaveContext,
      });

      if (activeMatchId) {
        // Set BEFORE createTrackedRun: the context must survive a mid-save failure so the
        // retry can re-thread it. Cleared only in runCleanupAfterSave (success) and on the
        // discard paths — exactly mirroring the goal-freeze contract.
        setPendingMatchSaveContext({
          matchId: activeMatchId,
          mode: matchMode === 'duel' || matchMode === 'group'
            ? matchMode
            : pendingSaveContext?.mode ?? roomLinkedMatchContext?.mode ?? null,
          matchSource,
          matchResult: resolvedMatchResult ?? null,
        });
      }

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
        matchSource,
        totalSteps: totalStepsRef.current,
        trackedMatchResult: resolvedMatchResult,
      });
      syncElapsedSeconds(saveSnapshot.finalElapsedSeconds);

      // FIX-1 (belt half) — flip the UI into 'saving' BEFORE the awaited finish push so the
      // paused-shell save buttons disappear for the whole in-flight window, not only after
      // the push settles.
      setStatus('saving');

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

      // C-1 — when the caller navigates itself (saveForfeitResultAndNavigate replaces with
      // matchId params), skip the matchId-less first replace: it double-mounted run-detail
      // and doubled the reconcile fetches.
      if (!options.skipPostProcessorNavigation) {
        runPointRankingPostProcessor({
          isTabMode,
          runId: savedRun.run.id,
        });
      }
      return true;
    } catch (saveError) {
      if (options.exitIfUnsavable && isUnsavableShortRunError(saveError)) {
        rgPerfMark('run save skipped as unsavable', {
          allowShortDistanceSave: Boolean(options.allowShortDistanceSave),
          reason: getApiErrorMessage(saveError, String(saveError ?? 'unknown')),
        });
        // C-2 — the record is being discarded, so the pending match-save context must go with
        // it (discardCurrentTracking clears it too; kept here so THIS discard path is safe on
        // its own).
        clearPendingMatchSaveContext();
        await discardCurrentTracking();
        return false;
      }

      setStatus('paused');
      // C-2 — the paused shell right below this error carries the retry: point at it so the
      // failure is a recoverable pause, not a dead end.
      setError(`${getApiErrorMessage(saveError, '러닝 기록 저장에 실패했어.')} 아래 '이 기록 저장하기'를 누르면 같은 기록으로 다시 저장을 시도해요.`);
      return false;
    } finally {
      saveCommandInFlight = false;
    }
  };
}
