import { useRef } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import {
  resetBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import {
  resolveMatchExitId,
  type MatchExitSource,
} from '@/features/runs/lifecycle/matchExitFlow';
import { getApiErrorMessage, leaveRunningMatch } from '@/services';
import { beginRgInputTrace, waitForRgInputFeedbackFrame } from '@/utils/rgInputTrace';
import type { ContinueSoloOptions, UseRunSaveFlowInput } from './types';

type UseRunFinishCommandInput = Pick<
  UseRunSaveFlowInput,
  | 'autoStartedMatchIdRef'
  | 'discardRedirectHref'
  | 'duelMatchStatus'
  | 'focusedDuelMatchIdRef'
  | 'focusedGroupMatchIdRef'
  | 'groupMatchStatus'
  | 'loadUpcomingMatches'
  | 'matchProgressHeartbeatRef'
  | 'officialStartBaselineRef'
  | 'preStartWarmupMatchIdRef'
  | 'resetForegroundTrackingState'
  | 'roomLinkedMatchContext'
  | 'setDuelMatchNotice'
  | 'setDuelMatchResult'
  | 'setDuelMatchStatus'
  | 'setError'
  | 'setForceOpenActiveMatch'
  | 'setGroupMatchNotice'
  | 'setGroupMatchResult'
  | 'setGroupMatchStatus'
  | 'setMatchMode'
  | 'setStatus'
  | 'syncLiveSharing'
> & {
  setMatchLeaving: (source: MatchExitSource, isLeaving: boolean) => void;
};

export function useRunFinishCommand({
  autoStartedMatchIdRef,
  discardRedirectHref,
  duelMatchStatus,
  focusedDuelMatchIdRef,
  focusedGroupMatchIdRef,
  groupMatchStatus,
  loadUpcomingMatches,
  matchProgressHeartbeatRef,
  officialStartBaselineRef,
  preStartWarmupMatchIdRef,
  resetForegroundTrackingState,
  roomLinkedMatchContext,
  setDuelMatchNotice,
  setDuelMatchResult,
  setDuelMatchStatus,
  setError,
  setForceOpenActiveMatch,
  setGroupMatchNotice,
  setGroupMatchResult,
  setGroupMatchStatus,
  setMatchLeaving,
  setMatchMode,
  setStatus,
  syncLiveSharing,
}: UseRunFinishCommandInput) {
  const continueSoloInFlightRef = useRef<Set<MatchExitSource>>(new Set());

  const discardCurrentTracking = async () => {
    await resetBackgroundRunTracking();
    await syncLiveSharing({
      enabled: false,
      status: 'idle',
    }).catch(() => {});
    preStartWarmupMatchIdRef.current = null;
    officialStartBaselineRef.current = null;
    autoStartedMatchIdRef.current = null;
    focusedDuelMatchIdRef.current = null;
    focusedGroupMatchIdRef.current = null;
    setForceOpenActiveMatch(false);
    resetForegroundTrackingState();
    setStatus('idle');
    setError(null);

    if (discardRedirectHref) {
      router.replace(discardRedirectHref);
    }
  };

  const leaveMatchAndContinueSolo = async (
    source: MatchExitSource,
    options?: ContinueSoloOptions,
  ) => {
    if (continueSoloInFlightRef.current.has(source)) {
      return;
    }

    setError(null);
    const matchId = resolveMatchExitId({
      source,
      duelMatchId: duelMatchStatus?.matchId,
      groupMatchId: groupMatchStatus?.matchId,
      roomLinkedMatchContext,
    });

    const inputTrace = beginRgInputTrace('match leave button press', {
      matchId: matchId ?? null,
      source,
    });

    continueSoloInFlightRef.current.add(source);
    setMatchLeaving(source, true);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'continue solo from match',
    });

    try {
      if (matchId) {
        await leaveRunningMatch({ matchId });
      }

      matchProgressHeartbeatRef.current = 0;

      if (source === 'duel') {
        setDuelMatchResult(null);
        setDuelMatchStatus(null);
        setDuelMatchNotice(options?.duelNotice ?? '매치 표시를 정리했어요. 현재 기록은 그대로 유지돼요.');
      } else {
        setGroupMatchResult(null);
        setGroupMatchStatus(null);
        setGroupMatchNotice(options?.groupNotice ?? '그룹전 표시를 정리했어요. 현재 기록은 그대로 유지돼요.');
      }

      await loadUpcomingMatches().catch(() => {});
      setMatchMode('solo');
    } catch (matchError) {
      setError(getApiErrorMessage(matchError, options?.errorMessage ?? '매치 표시 정리에 실패했어.'));
    } finally {
      continueSoloInFlightRef.current.delete(source);
      setMatchLeaving(source, false);
    }
  };

  const handleContinueSoloFromMatch = (source: MatchExitSource) => {
    Alert.alert('매치 표시를 정리할까요?', '지금 매치 표시는 정리하고, 현재 측정 기록은 그대로 유지할게요.', [
      { text: '계속 볼게요', style: 'cancel' },
      {
        text: '표시 정리',
        style: 'destructive',
        onPress: () => {
          void leaveMatchAndContinueSolo(source);
        },
      },
    ]);
  };

  const handleDiscardTracking = () => {
    Alert.alert('기록 버리기', '지금까지 측정한 경로와 기록을 지울까요?', [
      { text: '계속 측정할게요', style: 'cancel' },
      {
        text: '버릴게요',
        style: 'destructive',
        onPress: () => {
          void discardCurrentTracking();
        },
      },
    ]);
  };

  return {
    discardCurrentTracking,
    handleContinueSoloFromMatch,
    handleDiscardTracking,
    leaveMatchAndContinueSolo,
  };
}
