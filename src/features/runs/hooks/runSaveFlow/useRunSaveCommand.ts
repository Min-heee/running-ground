import { Alert, Platform } from 'react-native';
import { resolveSaveTotalSteps } from '@/features/runs/tracking/stepCountRecovery';
import { router } from 'expo-router';
import {
  clearActiveChaseArena,
  getActiveChaseArena,
} from '@/features/runs/chase/chaseRunContext';
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
import { createTrackedRun, forceResetRunningMatchState, getApiErrorMessage, leaveRunningMatch } from '@/services';
import { clearPendingRunSave, persistPendingRunSave } from '@/features/runs/save/pendingRunSaveQueue';
import { settlePendingScreenOffGapNow } from '@/features/runs/tracking/background/screenOffGapReconcile';
import type { SaveTrackingOptions } from '@/features/runs/hooks/useRunTracking';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { applyGoalFreezeToDisplayedSnapshot } from './goalFreezeClamp';
import {
  resolveMatchSaveLeavingSource,
  shouldSuppressPostSaveNavigation,
} from './matchSaveLeaving';
import { buildCurrentUserForfeitMatchResult, buildRunSaveResultSnapshot } from './runSaveResultMapper';
import {
  clearPendingMatchSaveContext,
  getPendingMatchSaveContext,
  resolvePendingMatchSaveFallbacks,
  setPendingMatchSaveContext,
} from './pendingMatchSaveContext';
import { isDecidedMatchResult, shouldConvertSaveToSubGoalForfeit } from './subGoalForfeitGate';
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

      // 화면꺼짐 갭이 정산을 기다리고 있으면 스냅샷을 읽기 전에 끝낸다. 깨어나자마자 종료를
      // 누르면 GPS 픽스도 12초 타이머도 오기 전에 여기 도착한다 — 이 한 줄이 없으면 잠든
      // 구간의 거리가 포획된 채로 저장에서 빠진다(회원F 사고의 마지막 조각).
      settlePendingScreenOffGapNow();

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
        resolvedMatchResult: fallbackResolvedMatchResult,
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

      // ── 완주 선언 거리 게이트, 클라 반쪽 (2026-08-23 실전 사고) ────────────────────
      // '대결종료'는 매치가 붙어 있으면 무조건 status='finished'를 보냈고, 서버는 그 말을
      // 그대로 믿어 4.93km에서 종료한 러너가 7km 그룹런 1위로 확정됐다. 목표 미달 종료는
      // 완주가 아니라 기권이다 — '기권하기'를 누른 러너와 같은 기록으로 남는다. 서버도
      // 같은 게이트를 갖지만(미달 선언은 'running' 강등 후 §B4 DNF), 클라가 먼저 기권을
      // 선언해야 상대 화면이 스톨 창을 기다리지 않고 즉시 정리되고 내 기록에도 '기권'
      // 카드가 남는다. 판정 거리는 실제로 전송할 값(프리즈 우선 finishIntent)과 동일하게
      // 잡는다: 프리즈가 있으면 목표를 밟았다는 증거라 게이트는 절대 안 걸린다. 목표
      // 거리를 모르거나(런타임 소실 저장) 이미 확정된 결과가 있으면(상대 기권 승, 기권
      // 커맨드 경로의 override) 건드리지 않는다 — 승자를 기권시키는 사고가 더 나쁘다.
      const goalFreeze = activeMatchId ? getLocalGoalFreeze(activeMatchId) : null;
      const matchProgress = activeMatchId ? buildDisplayedMatchProgress(trackingSnapshot) : null;
      const finishIntent = activeMatchId && matchProgress
        ? buildPendingFinishIntentFromFreeze(goalFreeze, {
            matchId: activeMatchId,
            elapsedSeconds: matchProgress.elapsedSeconds,
            distanceKm: matchProgress.distanceKm,
            pace: matchProgress.currentPace,
          })
        : null;
      const matchGoalDistanceKm = activeMatchId
        ? [duelMatchStatus, groupMatchStatus]
            .find((matchStatus) => matchStatus?.matchId === activeMatchId)?.distanceKm ?? null
        : null;
      const savingAsSubGoalForfeit = shouldConvertSaveToSubGoalForfeit({
        activeMatchId,
        declaredFinishDistanceKm: finishIntent?.distanceKm ?? null,
        matchGoalDistanceKm,
        resolvedMatchMode: resolvedMatchMode === 'duel' || resolvedMatchMode === 'group'
          ? resolvedMatchMode
          : null,
        // 존재 여부가 아니라 **확정** 여부다 — 라이브 매치는 스탠딩만 동기화돼도 항상
        // PENDING('결과 집계 중') 블롭을 들고 있어서, Boolean(블롭)으로 막으면 변환이
        // 정확히 사고 경로(미확정 매치에서 대결종료)에서 영영 안 걸린다.
        hasDecidedMatchResult: isDecidedMatchResult(fallbackResolvedMatchResult),
      });
      const resolvedMatchResult = savingAsSubGoalForfeit
        && matchProgress
        && (resolvedMatchMode === 'duel' || resolvedMatchMode === 'group')
        ? buildCurrentUserForfeitMatchResult({
            currentDistanceKm: matchProgress.distanceKm,
            mode: resolvedMatchMode,
            source: matchSource,
            trackedMatchResult: fallbackResolvedMatchResult,
          })
        : fallbackResolvedMatchResult;

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
      const clampedDisplayedSnapshot = applyGoalFreezeToDisplayedSnapshot(displayedSnapshot, goalFreeze);

      // iOS 케이던스 복원 (오너 2026-08-06 파티런 '--' 사고): 라이브 스텝 이벤트가
      // 끊겨 totalStepsRef 가 저평가돼도, 모션 코프로세서의 구간 재조회로 진짜 걸음
      // 수를 되찾는다. 실패/안드로이드는 기존 워치 카운트 그대로.
      const lastRoutePoint = clampedDisplayedSnapshot.route.length >= 2
        ? clampedDisplayedSnapshot.route[clampedDisplayedSnapshot.route.length - 1]
        : null;
      const resolvedTotalSteps = await resolveSaveTotalSteps({
        watchedTotalSteps: totalStepsRef.current,
        startIso: clampedDisplayedSnapshot.startedAt ?? clampedDisplayedSnapshot.route[0]?.timestamp ?? null,
        endIso: lastRoutePoint?.timestamp ?? null,
        platformOs: Platform.OS,
      });

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
        totalSteps: resolvedTotalSteps,
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
          if (savingAsSubGoalForfeit) {
            // 목표 미달 '대결종료' → 서버에 기권을 선언한다 (finished 선언 금지 — 예전엔
            // 이 자리에서 미달 거리로 finished를 보내 순위에 올랐다). 기권 커맨드와 같은
            // 계약: 로컬은 이미 기권으로 확정됐고(블롭이 기권 카드로 저장된다) 서버
            // leave는 최선-노력이라, 실패해도 저장은 계속되고 §B4가 서버 쪽을 정리한다.
            await leaveRunningMatch({ matchId: activeMatchId });
          } else if (finishIntent) {
            // HANDS-FREE FINISH (Stage 3d) — the save-time final push had the same drift leak
            // as the match-end delivery: it posted the LIVE progress with status 'finished'.
            // Prefer the at-crossing freeze when one exists for this match; without one this is
            // exactly the live progress as before. Server first-write-wins keeps re-pushes
            // idempotent — and the server now distance-verifies the declaration too.
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
          }
        } catch {
          setError('러닝 결과는 계산됐지만 경쟁 상태를 마지막으로 반영하지 못했어요.');
        }
      }

      // 경찰과 도둑런: 시작 시점에 잠근 경기장 태그를 저장 payload에 싣는다. 저장 실패 시
      // 컨텍스트가 남아 paused-shell 재시도도 같은 태그로 저장된다 (매치 컨텍스트와 동일 계약).
      const activeChaseArena = getActiveChaseArena();
      const createRunInput = activeChaseArena
        ? { ...saveSnapshot.createRunInput, chaseArenaId: activeChaseArena.arenaId }
        : saveSnapshot.createRunInput;
      // 저장 대기열 (2026-08-06 회원K 기록 실종): 전송 전에 페이로드를 디스크에
      // 먼저 써둔다 — 이 요청이 어떻게 죽든 다음 앱 실행 때 자동 재전송돼 기록이
      // 사라지지 않는다. 성공하면 바로 지운다. (서버가 같은 startedAt 재전송을 중복
      // 처리하므로 "성공했는데 응답만 유실" 재전송도 안전.)
      const pendingSaveUri = await persistPendingRunSave(createRunInput);
      const savedRun = await createTrackedRun(createRunInput);
      void clearPendingRunSave(pendingSaveUri);
      // 네이티브 기록 저장 배달 취소 (2026-08-07): JS 저장이 성공했으니 크로싱 때 맡긴
      // 네이티브 재시도는 불필요 — 놓쳐도 서버 dedupe가 이중 기록을 막는다 (동적 import:
      // 옛 바이너리·테스트 환경에선 조용히 no-op).
      void import('../../../../../modules/match-progress-uploader')
        .then((uploader) => uploader.cancelNativeRunSaveUpload())
        .catch(() => undefined);
      clearActiveChaseArena();
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
