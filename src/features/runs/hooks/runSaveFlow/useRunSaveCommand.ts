import { Alert } from 'react-native';
import { router } from 'expo-router';
import {
  getBackgroundRunTrackingSnapshot,
  pauseBackgroundRunTracking,
  resetBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import { isUnsavableShortRunError } from '@/features/runs/utils/matchScheduling';
import type { MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';
import { buildRunDetailRedirect } from '@/features/runs/lifecycle/runSaveNavigation';
import { resolveActiveMatchId } from '@/features/runs/lifecycle/matchStateMachine';
import {
  buildPendingFinishIntentFromFreeze,
  getLocalGoalFreeze,
  listLocalGoalFreezes,
} from '@/features/runs/sync/localGoalFreezeStore';
import { createTrackedRun, forceResetRunningMatchState, getApiErrorMessage } from '@/services';
import type { SaveTrackingOptions } from '@/features/runs/hooks/useRunTracking';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { applyGoalFreezeToDisplayedSnapshot } from './goalFreezeClamp';
import {
  resolveMatchSaveLeavingSource,
  shouldSuppressPostSaveNavigation,
} from './matchSaveLeaving';
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

// FIX-D2 — cap for the save-time finished push. It is delivery INSURANCE, not the delivery
// path: the synthesized PENDING matchResult blob rides the tracked-run POST and the server
// heals the verdict via resolveMatchResult/backfill, so this push must never hold the
// tap→run-detail transition for the full 5s live-match timeout. (When an older push for the
// same match is already in flight, the single-flight returns that promise and its own 5s cap
// applies instead — see pushRunningMatchProgress in useMatchProgressSync.)
const SAVE_TIME_FINISH_PUSH_TIMEOUT_MS = 2500;

// FIX-C (2026-07-09) — expose FIX-1's single-flight to the hoisted auto-exit hook
// (useMatchSelfEndAutoExit) so an auto-dispatch can never race a save that is already in
// flight. Read-only; the flag itself is still owned exclusively by the save command.
export function isSaveCommandInFlight() {
  return saveCommandInFlight;
}

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
  saveNavEpochRef,
  setError,
  setMatchLeaving,
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
  | 'saveNavEpochRef'
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
  // FIX-D1 — the same flag writer the forfeit-command family uses. Raised by THIS command for
  // match-attached saves (matchId or matchResult resolved) so MatchEndTransitionOverlay and
  // its 12s/20s/40s watchdog bound the manual-save wait too; cleared in the finally block.
  setMatchLeaving: (source: MatchExitSource, isLeaving: boolean) => void;
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
    // FIX-D1 — non-null while THIS command owns the isLeaving flag (match-attached save whose
    // navigation the command runs itself). Declared outside try so the finally can clear it.
    let matchLeavingSource: MatchExitSource | null = null;
    // C-1 abandon composition — captured when the flag is raised; a bump while the save is in
    // flight means the overlay watchdog's abandon fired and navigation must not yank.
    let entrySaveNavEpoch = saveNavEpochRef.current;
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
      const liveMatchId = resolveActiveMatchId({
        matchMode,
        duelMatchId: duelMatchStatus?.matchId,
        groupMatchId: groupMatchStatus?.matchId,
        roomLinkedMatchContext,
      });
      const {
        activeMatchId,
        resolvedMatchResult,
        matchSource,
        matchModeFallback,
      } = resolvePendingMatchSaveFallbacks({
        liveMatchId,
        liveMatchResult: options.matchResultOverride ?? trackedMatchResult,
        liveMatchSource: isPartyRun ? 'party' : 'official',
        pendingContext: pendingSaveContext,
        // FIX-A third tier — a live un-cleared goal freeze proves a crossed-but-unsaved match
        // even after a full runtime wipe (mid-run vanish demotion, cold restart): its matchId
        // keeps the save match-sticky instead of degrading to a plain solo run.
        goalFreezes: listLocalGoalFreezes(),
        // ZOMBIE GATE — only crossings inside THIS run's window may claim the save; an
        // orphaned freeze from an old killed run must never hijack a future solo save.
        runStartedAtIso: displayedSnapshot.startedAt ?? displayedSnapshot.route?.[0]?.timestamp ?? null,
      });
      if (activeMatchId && !liveMatchId && !pendingSaveContext?.matchId) {
        rgPerfMark('run save matchId restored from goal freeze', {
          matchId: activeMatchId,
          matchSource,
        });
      }
      // The mode used both for the pending context and for synthesizing a matchId-carrying
      // PENDING matchResult blob when no live/pending result exists (FIX-A). Chain order keeps
      // today's resolution and only APPENDS the freeze-recorded mode as the last resort.
      const resolvedMatchMode = matchMode === 'duel' || matchMode === 'group'
        ? matchMode
        : pendingSaveContext?.mode ?? roomLinkedMatchContext?.mode ?? matchModeFallback ?? null;

      if (activeMatchId) {
        // Set BEFORE createTrackedRun: the context must survive a mid-save failure so the
        // retry can re-thread it. Cleared only in runCleanupAfterSave (success) and on the
        // discard paths — exactly mirroring the goal-freeze contract.
        setPendingMatchSaveContext({
          matchId: activeMatchId,
          mode: resolvedMatchMode,
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
        // FIX-A — lets the mapper synthesize a minimal PENDING matchResult blob when the save
        // carries a matchId but no verdict, so the matchId (which persists only inside the
        // blob) is never silently dropped again.
        fallbackMatchMode: resolvedMatchMode,
        // Persist the originating matchId onto the saved matchResult so '결과 보기' is
        // reachable from 내 러닝 기록 too — not only right after the match (which threads
        // matchId via nav params). The backend stores whatever the blob carries.
        matchId: activeMatchId,
        matchSource,
        totalSteps: totalStepsRef.current,
        trackedMatchResult: resolvedMatchResult,
      });
      syncElapsedSeconds(saveSnapshot.finalElapsedSeconds);

      // FIX-D1 — a match-attached save (matchId or matchResult resolved, including the
      // goal-freeze fallback of a demoted runtime) raises the SAME isLeaving flag the forfeit
      // commands use, so MatchEndTransitionOverlay (with its 12s honest-copy / 20s escape /
      // 40s auto-abandon watchdog) bounds this wait instead of the bare small spinner. Pure
      // solo saves resolve null and keep today's spinner. Forfeit-family callers (marked by
      // skipPostProcessorNavigation) already own the flag — raising/clearing it here too would
      // hide their overlay before their own navigation lands.
      matchLeavingSource = resolveMatchSaveLeavingSource({
        activeMatchId,
        hasResolvedMatchResult: Boolean(resolvedMatchResult),
        resolvedMatchMode,
        callerManagesMatchLeaving: Boolean(options.skipPostProcessorNavigation),
      });
      if (matchLeavingSource) {
        entrySaveNavEpoch = saveNavEpochRef.current;
        setMatchLeaving(matchLeavingSource, true);
        rgPerfMark('run save match leaving overlay raised', {
          matchId: activeMatchId,
          source: matchLeavingSource,
        });
      }

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
          }, {
            // FIX-D2 — see SAVE_TIME_FINISH_PUSH_TIMEOUT_MS: this push is redundant insurance
            // for the finish delivery, so it self-aborts fast instead of adding a full 5s RTT
            // to the tap→run-detail path.
            timeoutMs: SAVE_TIME_FINISH_PUSH_TIMEOUT_MS,
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
        if (shouldSuppressPostSaveNavigation({
          matchLeavingSource,
          entrySaveNavEpoch,
          currentSaveNavEpoch: saveNavEpochRef.current,
        })) {
          // C-1 late settle after an abandoned wait (overlay watchdog escape/auto-abandon
          // bumped the epoch): the user already left the 결과 저장 중 overlay, so a
          // router.replace would yank them out of wherever they are now. Mirror the forfeit
          // path: offer the finished record instead.
          const redirect = buildRunDetailRedirect({
            runId: savedRun.run.id,
            isTabMode,
          });
          rgPerfMark('run save navigation suppressed after abandon', {
            matchId: activeMatchId,
            runId: savedRun.run.id,
          });
          // Review LOW fix — without the navigation there is nothing left to dismantle the
          // 'saving' shell (the plain path relies on run-detail replacing it), so a '나중에'
          // tap stranded a spinner with no buttons. The record is safely saved: reset the
          // tracker exactly as the forfeit family's resetAfterSave does.
          await resetBackgroundRunTracking();
          resetForegroundTrackingState();
          setStatus('idle');
          resetMatchRuntimeAfterTrackingCleared('save-reset');
          Alert.alert('기록 저장 완료', '러닝 기록이 저장됐어요. 지금 확인할까요?', [
            { text: '나중에', style: 'cancel' },
            {
              text: '보기',
              onPress: () => {
                router.push(redirect);
              },
            },
          ]);
        } else {
          runPointRankingPostProcessor({
            isTabMode,
            runId: savedRun.run.id,
          });
        }
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
      setError(`${getApiErrorMessage(saveError, '러닝 기록 저장에 실패했어요.')} 아래 '이 기록 저장하기'를 누르면 같은 기록으로 다시 저장을 시도해요.`);
      return false;
    } finally {
      // FIX-D1 — always release the overlay flag this command raised, on every exit branch
      // (success, unsavable-discard, failure→paused retry shell). Idempotent with the abandon
      // handler, which may have already set it false to escape the wait.
      if (matchLeavingSource) {
        setMatchLeaving(matchLeavingSource, false);
      }
      saveCommandInFlight = false;
    }
  };
}
