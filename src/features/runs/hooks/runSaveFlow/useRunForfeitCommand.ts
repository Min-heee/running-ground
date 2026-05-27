import { Alert } from 'react-native';
import {
  markDuelStatusForfeited,
  markGroupStatusForfeited,
  resolveMatchExitId,
  type MatchExitSource,
} from '@/features/runs/lifecycle/matchExitFlow';
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
  | 'loadUpcomingMatches'
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

function showForfeitDiagnosticAlert(title: string, message: string) {
  Alert.alert(title, message);
}

export function useRunForfeitCommand({
  duelMatchNotice,
  duelMatchStatus,
  groupMatchNotice,
  groupMatchStatus,
  handleSaveTracking,
  isSaving,
  loadUpcomingMatches,
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
      showForfeitDiagnosticAlert(
        '진단: matchId 없음',
        [
          `source=${source}`,
          `duelMatchId=${duelMatchStatus?.matchId ?? 'null'}`,
          `groupMatchId=${groupMatchStatus?.matchId ?? 'null'}`,
          `roomLinkedMatchContext=${JSON.stringify(roomLinkedMatchContext)}`,
        ].join('\n'),
      );
      setError('기권 처리할 대결을 찾지 못했어.');
      return;
    }

    if (pendingForfeitMatchRef.current === matchId) {
      showForfeitDiagnosticAlert(
        '진단: 중복 기권 요청 차단',
        `matchId=${matchId}\nsource=${source}`,
      );
      return;
    }

    showForfeitDiagnosticAlert(
      '진단: forfeit 시작',
      [
        `matchId=${matchId}`,
        `source=${source}`,
        `duelMatchStatus.matchId=${duelMatchStatus?.matchId ?? 'null'}`,
        `groupMatchStatus.matchId=${groupMatchStatus?.matchId ?? 'null'}`,
        `roomLinkedMatchContext.matchId=${roomLinkedMatchContext?.matchId ?? 'null'}`,
        `roomLinkedMatchContext.mode=${roomLinkedMatchContext?.mode ?? 'null'}`,
        `roomLinkedMatchContext.state=${roomLinkedMatchContext?.state ?? 'null'}`,
      ].join('\n'),
    );

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
        setDuelMatchStatus((currentStatus) => {
          const nextStatus = markDuelStatusForfeited(currentStatus, matchId);
          showForfeitDiagnosticAlert(
            '진단: markDuelStatusForfeited',
            [
              `currentStatus.matchId=${currentStatus?.matchId ?? 'null'}`,
              `request matchId=${matchId}`,
              `updated=${nextStatus?.currentUserLiveStatus === 'forfeited'}`,
            ].join('\n'),
          );
          return nextStatus;
        });
        setDuelMatchNotice('기권 처리됐어요. 결과를 확인한 뒤 기록을 저장할 수 있어요.');
        await leaveRunningMatch({ matchId });
        showForfeitDiagnosticAlert('진단: leaveRunningMatch 성공', `matchId=${matchId}`);
        forfeitApiTraceCompleted = true;
        endForfeitApiTrace({ success: true });
        matchProgressHeartbeatRef.current = Date.now();
      } else {
        setGroupMatchStatus((currentStatus) => {
          const nextStatus = markGroupStatusForfeited(currentStatus, matchId);
          showForfeitDiagnosticAlert(
            '진단: markGroupStatusForfeited',
            [
              `currentStatus.matchId=${currentStatus?.matchId ?? 'null'}`,
              `request matchId=${matchId}`,
              `updated=${nextStatus?.currentUserLiveStatus === 'forfeited'}`,
            ].join('\n'),
          );
          return nextStatus;
        });
        setGroupMatchNotice('기권 처리됐어요. 결과를 확인한 뒤 기록을 저장할 수 있어요.');
        await leaveRunningMatch({ matchId });
        showForfeitDiagnosticAlert('진단: leaveRunningMatch 성공', `matchId=${matchId}`);
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
      const errorMessage = getApiErrorMessage(matchError, '기권 처리에 실패했어.');
      showForfeitDiagnosticAlert(
        '진단: forfeit API 실패',
        [
          `matchId=${matchId}`,
          `source=${source}`,
          `message=${matchError instanceof Error ? matchError.message : String(matchError)}`,
          `display=${errorMessage}`,
        ].join('\n'),
      );
      setError(errorMessage);
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

    try {
      await handleSaveTracking({ exitIfUnsavable: true });
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
