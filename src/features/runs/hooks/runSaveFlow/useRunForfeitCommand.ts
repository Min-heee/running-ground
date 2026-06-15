import { router } from 'expo-router';
import {
  markDuelStatusForfeited,
  markGroupStatusForfeited,
  resolveMatchExitId,
  type MatchExitSource,
} from '@/features/runs/lifecycle/matchExitFlow';
import { pauseBackgroundRunTracking } from '@/features/runs/tracking/background';
import { buildRunDetailRedirect } from '@/features/runs/lifecycle/runSaveNavigation';
import { getApiErrorMessage, leaveRunningMatch } from '@/services';
import type { SaveTrackingOptions } from '@/features/runs/hooks/useRunTracking';
import { beginRgInputTrace, waitForRgInputFeedbackFrame } from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { buildCurrentUserForfeitMatchResult } from './runSaveResultMapper';
import type { UseRunSaveFlowInput } from './types';

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
  | 'resetMatchRuntimeAfterTrackingCleared'
  | 'roomLinkedMatchContext'
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
  resetMatchRuntimeAfterTrackingCleared,
  roomLinkedMatchContext,
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

  const buildLocalForfeitSnapshot = (matchId: string) => {
    const snapshot = getDisplayedTrackingSnapshot();
    return {
      matchId,
      forfeitedAt: Date.now(),
      elapsedSeconds: snapshot.elapsedSeconds,
      distanceKm: snapshot.distanceKm,
      paceLabel: snapshot.currentPace,
    };
  };

  const saveForfeitResultAndNavigate = async (
    source: MatchExitSource,
    matchId: string | null,
    options: { currentUserForfeited?: boolean } = {},
  ) => {
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
          })
        : undefined,
      onSavedRun: (runId) => {
        savedRunId = runId;
      },
      resetAfterSave: true,
    });

    if (didSave && matchId && !options.currentUserForfeited) {
      clearLocalForfeitedMatchState(source, matchId);
    }

    if (didSave && savedRunId) {
      const redirect = buildForfeitRunDetailRedirect(source, savedRunId, matchId);
      router.replace(redirect);
    } else {
      resetMatchRuntimeAfterTrackingCleared('save-reset');
      setError(options.currentUserForfeited
        ? '기권 처리는 완료됐지만 러닝 기록 저장에 실패했어.'
        : '대결은 종료됐지만 러닝 기록 저장에 실패했어.');
    }
  };

  const saveSelfForfeitResultAndNavigate = async (source: MatchExitSource, matchId: string | null) => {
    if (pendingCounterpartForfeitResultRef.current) {
      return;
    }

    pendingCounterpartForfeitResultRef.current = true;
    try {
      await saveForfeitResultAndNavigate(source, matchId, { currentUserForfeited: true });
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, '기권 결과 저장에 실패했어. 잠시 후 결과보기를 다시 눌러줘.'));
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

  const forfeitMatchAndEndRun = async (source: MatchExitSource) => {
    setError(null);
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
      setError('기권 처리할 대결을 찾지 못했어.');
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
      if (source === 'duel') {
        setDuelMatchStatus((currentStatus) => markDuelStatusForfeited(currentStatus, matchId));
        setDuelMatchNotice('기권 처리됐어요. 기록 상세로 이동할게요.');
      } else {
        setGroupMatchStatus((currentStatus) => markGroupStatusForfeited(currentStatus, matchId));
        setGroupMatchNotice('기권 처리됐어요. 기록 상세로 이동할게요.');
      }

      // Forfeit is local-first: the user committed to quitting, so the server "leave"
      // call is best-effort. On a flaky mobile network the response can time out even
      // though the server already recorded the forfeit — that must NOT roll back the
      // forfeit or block navigation to the record screen.
      try {
        await leaveRunningMatch({ matchId });
      } catch {
        // Swallow: the forfeit still stands locally and we proceed to save + navigate.
      }
      didLeaveMatch = true;
      markMatchLocallyForfeited(buildLocalForfeitSnapshot(matchId));
      forfeitApiTraceCompleted = true;
      endForfeitApiTrace({ success: true });
      matchProgressHeartbeatRef.current = Date.now();

      await stopForfeitedTracking();
      void loadUpcomingMatches().catch(() => {});
      await saveSelfForfeitResultAndNavigate(source, matchId);
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
      setError(getApiErrorMessage(matchError, '기권 처리에 실패했어.'));
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
