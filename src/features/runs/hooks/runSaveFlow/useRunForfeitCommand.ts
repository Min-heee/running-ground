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
import type { UseRunSaveFlowInput } from './types';

type UseRunForfeitCommandInput = Pick<
  UseRunSaveFlowInput,
  | 'duelMatchNotice'
  | 'duelMatchStatus'
  | 'groupMatchNotice'
  | 'groupMatchStatus'
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
> & {
  handleSaveTracking: (options?: SaveTrackingOptions) => Promise<boolean>;
  isSaving: boolean;
  setMatchLeaving: (source: MatchExitSource, isLeaving: boolean) => void;
};

export function useRunForfeitCommand({
  duelMatchNotice,
  duelMatchStatus,
  groupMatchNotice,
  groupMatchStatus,
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
}: UseRunForfeitCommandInput) {
  const forfeitMatchAndKeepRunning = async (source: MatchExitSource) => {
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

    if (pendingForfeitMatchRef.current === matchId) {
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

    try {
      if (source === 'duel') {
        setDuelMatchStatus((currentStatus) => markDuelStatusForfeited(currentStatus, matchId));
        setDuelMatchNotice('기권 처리됐어요. 결과를 확인한 뒤 기록을 저장할 수 있어요.');
        await leaveRunningMatch({ matchId });
        markMatchLocallyForfeited(matchId);
        forfeitApiTraceCompleted = true;
        endForfeitApiTrace({ success: true });
        matchProgressHeartbeatRef.current = Date.now();
      } else {
        setGroupMatchStatus((currentStatus) => markGroupStatusForfeited(currentStatus, matchId));
        setGroupMatchNotice('기권 처리됐어요. 결과를 확인한 뒤 기록을 저장할 수 있어요.');
        await leaveRunningMatch({ matchId });
        markMatchLocallyForfeited(matchId);
        forfeitApiTraceCompleted = true;
        endForfeitApiTrace({ success: true });
        matchProgressHeartbeatRef.current = Date.now();
      }

      void loadUpcomingMatches().catch(() => {});
      // Stay on the result view. Saving/resetting is now only triggered by the explicit result action.
    } catch (matchError) {
      if (source === 'duel') {
        setDuelMatchStatus(previousDuelStatus);
        setDuelMatchNotice(previousDuelNotice);
      } else {
        setGroupMatchStatus(previousGroupStatus);
        setGroupMatchNotice(previousGroupNotice);
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
    void forfeitMatchAndKeepRunning(source);
  };

  const handleShowResultAfterCounterpartForfeit = async (source: MatchExitSource) => {
    if (pendingCounterpartForfeitResultRef.current || isSaving || status !== 'running') {
      return;
    }

    rgPerfMark('counterpart forfeit result action dispatch', { source });
    pendingCounterpartForfeitResultRef.current = true;
    setMatchLeaving(source, true);
    let savedRunId: string | null = null;

    try {
      const didSave = await handleSaveTracking({
        // Forfeit can happen before 0.1km; require a real route, but don't block solely on short distance.
        allowShortDistanceSave: true,
        exitIfUnsavable: true,
        onSavedRun: (runId) => {
          savedRunId = runId;
        },
        resetAfterSave: true,
      });

      if (didSave && savedRunId) {
        const redirect = buildRunDetailRedirect({ runId: savedRunId, isTabMode });
        router.replace(redirect);
      } else {
        router.back();
      }
    } finally {
      pendingCounterpartForfeitResultRef.current = false;
      setMatchLeaving(source, false);
    }
  };

  return {
    forfeitMatchAndKeepRunning,
    handleForfeitMatch,
    handleShowResultAfterCounterpartForfeit,
  };
}
