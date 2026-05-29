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
  isTabMode,
  isSaving,
  loadUpcomingMatches,
  markMatchLocallyForfeited,
  matchProgressHeartbeatRef,
  pendingCounterpartForfeitResultRef,
  pendingForfeitMatchRef,
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
    const displayedSnapshot = options.currentUserForfeited ? getDisplayedTrackingSnapshot() : null;
    const didSave = await handleSaveTracking({
      // Forfeit can happen before 0.1km or before GPS yields two points.
      allowShortDistanceSave: true,
      allowStationaryForfeitSave: Boolean(options.currentUserForfeited),
      exitIfUnsavable: true,
      matchResultOverride: options.currentUserForfeited && displayedSnapshot
        ? buildCurrentUserForfeitMatchResult({
            currentDistanceKm: displayedSnapshot.distanceKm,
            mode: source,
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
    } else if (!options.currentUserForfeited) {
      router.replace('/(tabs)/running');
    } else {
      setError('기권 결과 저장에 실패했어. 잠시 후 결과보기를 다시 눌러줘.');
    }
  };

  const stopForfeitedTracking = async () => {
    if (status !== 'running') {
      return;
    }

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
        setDuelMatchNotice('기권 처리됐어요. 결과보기를 누르면 기록 상세로 이동해요.');
        await leaveRunningMatch({ matchId });
        didLeaveMatch = true;
        markMatchLocallyForfeited(buildLocalForfeitSnapshot(matchId));
        forfeitApiTraceCompleted = true;
        endForfeitApiTrace({ success: true });
        matchProgressHeartbeatRef.current = Date.now();
      } else {
        setGroupMatchStatus((currentStatus) => markGroupStatusForfeited(currentStatus, matchId));
        setGroupMatchNotice('기권 처리됐어요. 결과보기를 누르면 기록 상세로 이동해요.');
        await leaveRunningMatch({ matchId });
        didLeaveMatch = true;
        markMatchLocallyForfeited(buildLocalForfeitSnapshot(matchId));
        forfeitApiTraceCompleted = true;
        endForfeitApiTrace({ success: true });
        matchProgressHeartbeatRef.current = Date.now();
      }

      await stopForfeitedTracking();
      void loadUpcomingMatches().catch(() => {});
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
    if (pendingCounterpartForfeitResultRef.current || isSaving || status !== 'running') {
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
    pendingCounterpartForfeitResultRef.current = true;
    setMatchLeaving(source, true);
    const matchId = resolveMatchExitId({
      source,
      duelMatchId: duelMatchStatus?.matchId,
      groupMatchId: groupMatchStatus?.matchId,
      roomLinkedMatchContext,
    });

    try {
      await saveForfeitResultAndNavigate(source, matchId, { currentUserForfeited: true });
    } finally {
      pendingCounterpartForfeitResultRef.current = false;
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
