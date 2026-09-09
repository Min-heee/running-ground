import { Alert } from 'react-native';
import { router } from 'expo-router';
import {
  markDuelStatusForfeited,
  markGroupStatusForfeited,
  resolveMatchExitId,
  type MatchExitSource,
} from '@/features/runs/lifecycle/matchExitFlow';
import { pauseBackgroundRunTracking } from '@/features/runs/tracking/background';
import { unmarkLiveMatchMounted } from '@/features/runs/lifecycle/liveMatchMountedRegistry';
import { buildRunDetailRedirect } from '@/features/runs/lifecycle/runSaveNavigation';
import { getApiErrorMessage, leaveRunningMatch } from '@/services';
import type { SaveTrackingOptions } from '@/features/runs/hooks/useRunTracking';
import { beginRgInputTrace, waitForRgInputFeedbackFrame } from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { buildCurrentUserForfeitMatchResult } from './runSaveResultMapper';
import type { ForfeitMatchOptions, UseRunSaveFlowInput } from './types';

type UseRunForfeitCommandInput = Pick<
  UseRunSaveFlowInput,
  | 'duelMatchNotice'
  | 'duelMatchStatus'
  | 'groupMatchNotice'
  | 'groupMatchStatus'
  | 'clearLocalForfeitedMatchState'
  | 'getDisplayedTrackingSnapshot'
  | 'isTabMode'
  | 'loadUpcomingMatches'
  | 'markMatchLocallyForfeited'
  | 'matchProgressHeartbeatRef'
  | 'pendingCounterpartForfeitResultRef'
  | 'pendingForfeitMatchRef'
  | 'resetLiveMatchNavigationOwner'
  | 'resetMatchRuntimeAfterTrackingCleared'
  | 'roomLinkedMatchContext'
  | 'saveNavEpochRef'
  | 'setDuelMatchNotice'
  | 'setDuelMatchStatus'
  | 'setError'
  | 'setGroupMatchNotice'
  | 'setGroupMatchStatus'
  | 'setStatus'
  | 'status'
  | 'stopForegroundTrackingHelpers'
  | 'syncLiveSharing'
  | 'trackedMatchResult'
> & {
  handleSaveTracking: (options?: SaveTrackingOptions) => Promise<boolean>;
  isPartyRun: boolean;
  isSaving: boolean;
  setMatchLeaving: (source: MatchExitSource, isLeaving: boolean) => void;
};

export function useRunForfeitCommand({
  duelMatchNotice,
  duelMatchStatus,
  clearLocalForfeitedMatchState,
  groupMatchNotice,
  groupMatchStatus,
  getDisplayedTrackingSnapshot,
  handleSaveTracking,
  isPartyRun,
  isTabMode,
  isSaving,
  loadUpcomingMatches,
  markMatchLocallyForfeited,
  matchProgressHeartbeatRef,
  pendingCounterpartForfeitResultRef,
  pendingForfeitMatchRef,
  resetLiveMatchNavigationOwner,
  resetMatchRuntimeAfterTrackingCleared,
  roomLinkedMatchContext,
  saveNavEpochRef,
  setDuelMatchNotice,
  setDuelMatchStatus,
  setError,
  setGroupMatchNotice,
  setGroupMatchStatus,
  setMatchLeaving,
  setStatus,
  status,
  stopForegroundTrackingHelpers,
  syncLiveSharing,
  trackedMatchResult,
}: UseRunForfeitCommandInput) {
  const buildForfeitRunDetailRedirect = (
    source: MatchExitSource,
    runId: string,
    matchId: string | null,
  ) => {
    const statusContext = source === 'duel' ? duelMatchStatus : groupMatchStatus;
    const linkedContext = roomLinkedMatchContext?.mode === source
      && (!matchId || roomLinkedMatchContext.matchId === matchId)
      ? roomLinkedMatchContext
      : null;

    return buildRunDetailRedirect({
      runId,
      isTabMode,
      matchId,
      matchMode: source,
      matchDistanceKm: statusContext?.distanceKm ?? linkedContext?.distanceKm ?? null,
      matchSlotStartAt: statusContext?.slotStartAt ?? linkedContext?.slotStartAt ?? null,
    });
  };

  const buildLocalForfeitSnapshot = (matchId: string, disqualified: boolean) => {
    const snapshot = getDisplayedTrackingSnapshot();
    return {
      matchId,
      forfeitedAt: Date.now(),
      elapsedSeconds: snapshot.elapsedSeconds,
      distanceKm: snapshot.distanceKm,
      paceLabel: snapshot.currentPace,
      ...(disqualified ? { disqualified: true } : {}),
    };
  };

  const saveForfeitResultAndNavigate = async (
    source: MatchExitSource,
    matchId: string | null,
    options: { currentUserForfeited?: boolean; disqualified?: boolean } = {},
  ) => {
    // C-1 — capture the save-navigation epoch at entry. The overlay watchdog's abandon bumps
    // it; if it moved by the time this save settles, the user already left the wait and a
    // router.replace would yank them out of whatever they are doing now.
    const entrySaveNavEpoch = saveNavEpochRef.current;
    let savedRunId: string | null = null;
    // This command only runs once the duel/group is decisively over (self forfeit,
    // opponent forfeit, or a terminal match state), so a stationary 0.00km snapshot
    // must still save and flow on to the run detail. Gating this on
    // opponent.liveStatus === 'forfeited' raced the slow stationary status sync: the
    // 0km save was rejected ("이동한 러닝 경로가 필요해") and the user was dumped on the
    // manual save/restart/discard screen with "대결은 종료됐지만 저장에 실패했어".
    const displayedSnapshot = getDisplayedTrackingSnapshot();
    const didSave = await handleSaveTracking({
      // Duel-ending actions can happen before 0.1km or before GPS yields two points.
      allowShortDistanceSave: true,
      allowStationaryForfeitSave: true,
      exitIfUnsavable: true,
      matchResultOverride: options.currentUserForfeited && displayedSnapshot
        ? buildCurrentUserForfeitMatchResult({
            currentDistanceKm: displayedSnapshot.distanceKm,
            mode: source,
            source: isPartyRun ? 'party' : 'official',
            trackedMatchResult,
            disqualified: options.disqualified,
          })
        : undefined,
      onSavedRun: (runId) => {
        savedRunId = runId;
      },
      resetAfterSave: true,
      // C-1 — this command navigates to run-detail itself below (WITH matchId params), so the
      // save command's runPointRankingPostProcessor matchId-less first replace must not fire:
      // the double-replace mounted run-detail twice and doubled the reconcile fetches.
      skipPostProcessorNavigation: true,
    });

    if (didSave && matchId && !options.currentUserForfeited) {
      clearLocalForfeitedMatchState(source, matchId);
    } else if (didSave && matchId && options.currentUserForfeited) {
      // Self-forfeit save-success can't run the full clearLocalForfeitedMatchState
      // (that wipes the duel/group state + result this branch is about to navigate to),
      // but it must still evict the same mount-registry latch + reset the nav owner that
      // the leave/forfeit path drops — otherwise a back-to-back match #2 is blocked in the
      // loading shell (B2b). Scope the eviction to the ended matchId only; it's idempotent
      // and never revives the match (the save already terminated it).
      unmarkLiveMatchMounted({ matchId, mode: source });
      resetLiveMatchNavigationOwner();
    }

    if (didSave && savedRunId) {
      const redirect = buildForfeitRunDetailRedirect(source, savedRunId, matchId);
      if (saveNavEpochRef.current === entrySaveNavEpoch) {
        router.replace(redirect);
      } else {
        // C-1 late settle after an abandoned wait: the user already escaped the 결과 저장 중
        // overlay, so never yank the screen. Offer the finished record instead.
        Alert.alert('기록 저장 완료', '러닝 기록이 저장됐어요. 지금 확인할까요?', [
          { text: '나중에', style: 'cancel' },
          {
            text: '보기',
            onPress: () => {
              router.push(redirect);
            },
          },
        ]);
      }
    } else {
      resetMatchRuntimeAfterTrackingCleared('save-reset');
      setError(options.currentUserForfeited
        ? '기권 처리는 완료됐지만 러닝 기록 저장에 실패했어요.'
        : '대결은 종료됐지만 러닝 기록 저장에 실패했어요.');
    }
  };

  const saveSelfForfeitResultAndNavigate = async (
    source: MatchExitSource,
    matchId: string | null,
    options: { disqualified?: boolean } = {},
  ) => {
    if (pendingCounterpartForfeitResultRef.current) {
      return;
    }

    pendingCounterpartForfeitResultRef.current = true;
    try {
      await saveForfeitResultAndNavigate(source, matchId, {
        currentUserForfeited: true,
        disqualified: options.disqualified,
      });
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, '기권 결과 저장에 실패했어요. 잠시 후 결과보기를 다시 눌러주세요.'));
    } finally {
      pendingCounterpartForfeitResultRef.current = false;
    }
  };

  const stopForfeitedTracking = async () => {
    // Always tear down tracking on forfeit — never gate on status. A non-'running'
    // status (starting/paused/saving/idle) would otherwise skip stopLocationUpdatesAsync,
    // leaving the Android foreground service + "측정 중" notification alive and the
    // measuring session stuck (user cannot exit the live screen).
    await pauseBackgroundRunTracking().catch(() => {});
    stopForegroundTrackingHelpers();
    setStatus('paused');
    void syncLiveSharing({
      enabled: false,
      status: 'idle',
    }).catch(() => {});
  };

  const forfeitMatchAndEndRun = async (source: MatchExitSource, options: ForfeitMatchOptions = {}) => {
    setError(null);
    // 케이던스 워치독 실격 기권 (오너 규칙 2026-09-09): 서버 leave에 reason을 실어 forfeited +
    // disqualified 로 기록되게 하고, 로컬 기권 스냅샷/저장 블롭은 '실격패'로 만든다. 옵션이
    // 없으면 오늘의 기권 흐름 그대로.
    const disqualified = options.reason === 'disqualified';
    const previousDuelStatus = duelMatchStatus;
    const previousGroupStatus = groupMatchStatus;
    const previousDuelNotice = duelMatchNotice;
    const previousGroupNotice = groupMatchNotice;
    const matchId = resolveMatchExitId({
      source,
      duelMatchId: duelMatchStatus?.matchId,
      groupMatchId: groupMatchStatus?.matchId,
      roomLinkedMatchContext,
    });

    if (!matchId) {
      setError('기권 처리할 대결을 찾지 못했어요.');
      return;
    }

    if (pendingForfeitMatchRef.current === matchId || isSaving) {
      return;
    }

    const inputTrace = beginRgInputTrace('forfeit button press', {
      matchId,
      source,
    });

    pendingForfeitMatchRef.current = matchId;
    setMatchLeaving(source, true);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'match forfeit',
    });

    const endForfeitApiTrace = rgPerfMeasureStart('forfeit match API', {
      matchId,
      source,
    });
    let forfeitApiTraceCompleted = false;
    let didLeaveMatch = false;

    try {
      const forfeitNotice = disqualified
        ? '부정 러닝으로 실격 처리됐어요. 기록 상세로 이동할게요.'
        : '기권 처리됐어요. 기록 상세로 이동할게요.';
      if (source === 'duel') {
        setDuelMatchStatus((currentStatus) => markDuelStatusForfeited(currentStatus, matchId));
        setDuelMatchNotice(forfeitNotice);
      } else {
        setGroupMatchStatus((currentStatus) => markGroupStatusForfeited(currentStatus, matchId));
        setGroupMatchNotice(forfeitNotice);
      }

      // Arm the local-forfeit guard BEFORE the best-effort network leave. forfeitedMatchIdsRef
      // gates the background progress applier, so an in-flight background response that resolves
      // during the leave await can no longer resurrect the match into 'running'.
      markMatchLocallyForfeited(buildLocalForfeitSnapshot(matchId, disqualified));

      // Forfeit is local-first: the user committed to quitting, so the server "leave"
      // call is best-effort. On a flaky mobile network the response can time out even
      // though the server already recorded the forfeit — that must NOT roll back the
      // forfeit or block navigation to the record screen.
      try {
        await leaveRunningMatch({
          matchId,
          ...(disqualified ? { reason: 'disqualified' as const } : {}),
        });
      } catch {
        // Swallow: the forfeit still stands locally and we proceed to save + navigate.
      }
      didLeaveMatch = true;
      forfeitApiTraceCompleted = true;
      endForfeitApiTrace({ success: true });
      matchProgressHeartbeatRef.current = Date.now();

      await stopForfeitedTracking();
      void loadUpcomingMatches().catch(() => {});
      await saveSelfForfeitResultAndNavigate(source, matchId, { disqualified });
    } catch (matchError) {
      if (!didLeaveMatch) {
        if (source === 'duel') {
          setDuelMatchStatus(previousDuelStatus);
          setDuelMatchNotice(previousDuelNotice);
        } else {
          setGroupMatchStatus(previousGroupStatus);
          setGroupMatchNotice(previousGroupNotice);
        }
      }
      if (!forfeitApiTraceCompleted) {
        endForfeitApiTrace({ success: false });
      }
      setError(getApiErrorMessage(matchError, disqualified ? '실격 처리에 실패했어요.' : '기권 처리에 실패했어요.'));
    } finally {
      if (pendingForfeitMatchRef.current === matchId) {
        pendingForfeitMatchRef.current = null;
      }
      setMatchLeaving(source, false);
    }
  };

  const handleForfeitMatch = (source: MatchExitSource) => {
    rgPerfMark('forfeit action dispatch', { source });
    void forfeitMatchAndEndRun(source);
  };

  const handleShowResultAfterCounterpartForfeit = async (source: MatchExitSource) => {
    if (pendingCounterpartForfeitResultRef.current || isSaving) {
      return;
    }

    rgPerfMark('counterpart forfeit result action dispatch', { source });
    pendingCounterpartForfeitResultRef.current = true;
    setMatchLeaving(source, true);
    const matchId = resolveMatchExitId({
      source,
      duelMatchId: duelMatchStatus?.matchId,
      groupMatchId: groupMatchStatus?.matchId,
      roomLinkedMatchContext,
    });

    try {
      await saveForfeitResultAndNavigate(source, matchId);
    } finally {
      pendingCounterpartForfeitResultRef.current = false;
      setMatchLeaving(source, false);
    }
  };

  const handleShowResultAfterSelfForfeit = async (source: MatchExitSource) => {
    if (pendingCounterpartForfeitResultRef.current || isSaving) {
      return;
    }

    rgPerfMark('self forfeit result action dispatch', { source, status });
    setMatchLeaving(source, true);
    const matchId = resolveMatchExitId({
      source,
      duelMatchId: duelMatchStatus?.matchId,
      groupMatchId: groupMatchStatus?.matchId,
      roomLinkedMatchContext,
    });

    try {
      await saveSelfForfeitResultAndNavigate(source, matchId);
    } finally {
      setMatchLeaving(source, false);
    }
  };

  return {
    forfeitMatchAndEndRun,
    handleForfeitMatch,
    handleShowResultAfterCounterpartForfeit,
    handleShowResultAfterSelfForfeit,
  };
}
