import { router } from 'expo-router';
import {
  markDuelStatusForfeited,
  markGroupStatusForfeited,
  resolveMatchExitId,
  type MatchExitSource,
} from '@/features/runs/lifecycle/matchExitFlow';
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
  | 'status'
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
  status,
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
      // Forfeit can happen before 0.1km; require a real route, but don't block solely on short distance.
      allowShortDistanceSave: true,
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
    } else {
      router.back();
    }
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
        setDuelMatchNotice('기권 처리됐어요. 지금까지 기록을 저장하고 결과 화면으로 이동해요.');
        await leaveRunningMatch({ matchId });
        didLeaveMatch = true;
        markMatchLocallyForfeited(buildLocalForfeitSnapshot(matchId));
        forfeitApiTraceCompleted = true;
        endForfeitApiTrace({ success: true });
        matchProgressHeartbeatRef.current = Date.now();
      } else {
        setGroupMatchStatus((currentStatus) => markGroupStatusForfeited(currentStatus, matchId));
        setGroupMatchNotice('기권 처리됐어요. 지금까지 기록을 저장하고 결과 화면으로 이동해요.');
        await leaveRunningMatch({ matchId });
        didLeaveMatch = true;
        markMatchLocallyForfeited(buildLocalForfeitSnapshot(matchId));
        forfeitApiTraceCompleted = true;
        endForfeitApiTrace({ success: true });
        matchProgressHeartbeatRef.current = Date.now();
      }

      void loadUpcomingMatches().catch(() => {});
      await saveForfeitResultAndNavigate(source, matchId, { currentUserForfeited: true });
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

  return {
    forfeitMatchAndEndRun,
    handleForfeitMatch,
    handleShowResultAfterCounterpartForfeit,
  };
}
