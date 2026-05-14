import { type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useMemo, useRef } from 'react';
import { Alert } from 'react-native';
import { type Href, router } from 'expo-router';
import { RunMatchResult, RunRoutePoint } from '@/domain';
import {
  getBackgroundRunTrackingSnapshot,
  pauseBackgroundRunTracking,
  resetBackgroundRunTracking,
  type BackgroundRunTrackingSnapshot,
} from '@/features/runs/tracking/background';
import {
  buildAveragePace,
  buildRunDateFromTimestamp,
  calculateCadenceSpm,
} from '@/features/runs/tracking';
import {
  isUnsavableShortRunError,
} from '@/features/runs/utils/matchScheduling';
import {
  markDuelStatusForfeited,
  markGroupStatusForfeited,
  resolveMatchExitId,
  type MatchExitSource,
} from '@/features/runs/lifecycle/matchExitFlow';
import { resolveActiveMatchId } from '@/features/runs/lifecycle/matchStateMachine';
import {
  createTrackedRun,
  getApiErrorMessage,
  leaveRunningMatch,
} from '@/services';
import { buildRunDetailRedirect } from '@/features/runs/lifecycle/runSaveNavigation';
import type {
  RequestDuelMatchResponse,
  RequestGroupMatchResponse,
  RunningMatchStatusResponse,
  UpdateRunningMatchProgressInput,
} from '@/lib/api/types';
import type {
  RunMatchMode,
} from '@/features/runs/hooks/useMatchLifecycle';
import type {
  SaveTrackingOptions,
  TrackerStatus,
} from '@/features/runs/hooks/useRunTracking';
import { beginRgInputTrace, waitForRgInputFeedbackFrame } from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type DisplayedTrackingSnapshot = {
  route: RunRoutePoint[];
  distanceKm: number;
  elevationGainM: number;
  currentPace: string;
  elapsedSeconds: number;
  startedAt?: string | null;
};

type DisplayedMatchProgress = Pick<UpdateRunningMatchProgressInput, 'distanceKm' | 'elapsedSeconds' | 'currentPace'>;

type SyncLiveSharingInput = {
  enabled: boolean;
  status: 'idle' | 'paused' | 'running';
  locationLabel?: string | null;
};

type ContinueSoloOptions = {
  duelNotice?: string;
  groupNotice?: string;
  errorMessage?: string;
};

type RoomLinkedMatchContext = {
  mode: MatchExitSource;
  matchId: string;
  state: 'matched' | 'active';
} | null;

type UseRunSaveFlowInput = {
  status: TrackerStatus;
  setStatus: Dispatch<SetStateAction<TrackerStatus>>;
  setError: Dispatch<SetStateAction<string | null>>;
  isTabMode: boolean;
  discardRedirectHref: Href | null;
  matchMode: RunMatchMode;
  setMatchMode: Dispatch<SetStateAction<RunMatchMode>>;
  duelMatchStatus: RunningMatchStatusResponse | null;
  setDuelMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  groupMatchStatus: RunningMatchStatusResponse | null;
  setGroupMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  duelMatchNotice: string | null;
  setDuelMatchNotice: Dispatch<SetStateAction<string | null>>;
  groupMatchNotice: string | null;
  setGroupMatchNotice: Dispatch<SetStateAction<string | null>>;
  setDuelMatchResult: Dispatch<SetStateAction<RequestDuelMatchResponse | null>>;
  setGroupMatchResult: Dispatch<SetStateAction<RequestGroupMatchResponse | null>>;
  setIsLeavingDuelMatch: Dispatch<SetStateAction<boolean>>;
  setIsLeavingGroupMatch: Dispatch<SetStateAction<boolean>>;
  setForceOpenActiveMatch: Dispatch<SetStateAction<boolean>>;
  roomLinkedMatchContext: RoomLinkedMatchContext;
  trackedMatchResult?: RunMatchResult | null;
  totalStepsRef: MutableRefObject<number>;
  pendingForfeitMatchRef: MutableRefObject<string | null>;
  pendingCounterpartForfeitResultRef: MutableRefObject<boolean>;
  matchProgressHeartbeatRef: MutableRefObject<number>;
  preStartWarmupMatchIdRef: MutableRefObject<string | null>;
  officialStartBaselineRef: MutableRefObject<unknown | null>;
  autoStartedMatchIdRef: MutableRefObject<string | null>;
  focusedDuelMatchIdRef: MutableRefObject<string | null>;
  focusedGroupMatchIdRef: MutableRefObject<string | null>;
  stopForegroundTrackingHelpers: () => void;
  resetForegroundTrackingState: () => void;
  syncFromBackgroundTracking: (snapshot?: BackgroundRunTrackingSnapshot) => void;
  syncElapsedSeconds: (elapsedSeconds: number) => void;
  getDisplayedTrackingSnapshot: (snapshot?: BackgroundRunTrackingSnapshot) => DisplayedTrackingSnapshot;
  buildDisplayedMatchProgress: (snapshot?: BackgroundRunTrackingSnapshot) => DisplayedMatchProgress;
  pushRunningMatchProgress: (input: UpdateRunningMatchProgressInput) => Promise<RunningMatchStatusResponse>;
  syncLiveSharing: (input: SyncLiveSharingInput) => Promise<unknown>;
  loadUpcomingMatches: () => Promise<unknown>;
  clearLocalForfeitedMatchState: (source: MatchExitSource, matchId: string) => void;
};

type RunSaveFlowActions = {
  discardCurrentTracking: () => Promise<void>;
  handleDiscardTracking: () => void;
  handleSaveTracking: (options?: SaveTrackingOptions) => Promise<boolean>;
  leaveMatchAndContinueSolo: (source: MatchExitSource, options?: ContinueSoloOptions) => Promise<void>;
  handleContinueSoloFromMatch: (source: MatchExitSource) => void;
  forfeitMatchAndKeepRunning: (source: MatchExitSource) => Promise<void>;
  handleForfeitMatch: (source: MatchExitSource) => void;
  handleShowResultAfterCounterpartForfeit: (source: MatchExitSource) => Promise<void>;
};

export function useRunSaveFlow({
  status,
  setStatus,
  setError,
  isTabMode,
  discardRedirectHref,
  matchMode,
  setMatchMode,
  duelMatchStatus,
  setDuelMatchStatus,
  groupMatchStatus,
  setGroupMatchStatus,
  duelMatchNotice,
  setDuelMatchNotice,
  groupMatchNotice,
  setGroupMatchNotice,
  setDuelMatchResult,
  setGroupMatchResult,
  setIsLeavingDuelMatch,
  setIsLeavingGroupMatch,
  setForceOpenActiveMatch,
  roomLinkedMatchContext,
  trackedMatchResult,
  totalStepsRef,
  pendingForfeitMatchRef,
  pendingCounterpartForfeitResultRef,
  matchProgressHeartbeatRef,
  preStartWarmupMatchIdRef,
  officialStartBaselineRef,
  autoStartedMatchIdRef,
  focusedDuelMatchIdRef,
  focusedGroupMatchIdRef,
  stopForegroundTrackingHelpers,
  resetForegroundTrackingState,
  syncFromBackgroundTracking,
  syncElapsedSeconds,
  getDisplayedTrackingSnapshot,
  buildDisplayedMatchProgress,
  pushRunningMatchProgress,
  syncLiveSharing,
  loadUpcomingMatches,
  clearLocalForfeitedMatchState,
}: UseRunSaveFlowInput) {
  const isSaving = status === 'saving';
  const continueSoloInFlightRef = useRef<Set<MatchExitSource>>(new Set());

  const setMatchLeaving = (source: MatchExitSource, isLeaving: boolean) => {
    if (source === 'duel') {
      setIsLeavingDuelMatch(isLeaving);
    } else {
      setIsLeavingGroupMatch(isLeaving);
    }
  };

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

  const handleSaveTracking = async (options: SaveTrackingOptions = {}) => {
    try {
      setError(null);

      if (status === 'running') {
        await pauseBackgroundRunTracking();
        stopForegroundTrackingHelpers();
      }

      const trackingSnapshot = getBackgroundRunTrackingSnapshot();
      const displayedSnapshot = getDisplayedTrackingSnapshot(trackingSnapshot);
      syncFromBackgroundTracking(trackingSnapshot);
      const finalElapsedSeconds = displayedSnapshot.elapsedSeconds;
      syncElapsedSeconds(finalElapsedSeconds);

      const startedAt = displayedSnapshot.startedAt ?? new Date().toISOString();
      const endedAt = displayedSnapshot.route.length
        ? displayedSnapshot.route[displayedSnapshot.route.length - 1].timestamp
        : new Date().toISOString();
      const finalDistanceKm = displayedSnapshot.distanceKm;
      const finalElevationGainM = displayedSnapshot.elevationGainM;
      const finalCadenceSpm = calculateCadenceSpm(totalStepsRef.current, finalElapsedSeconds);
      const averagePaceLabel = buildAveragePace(finalDistanceKm, finalElapsedSeconds);

      if (displayedSnapshot.route.length < 2 || finalDistanceKm < 0.1) {
        throw new Error('저장하려면 실제로 이동한 러닝 경로가 조금 더 필요해.');
      }

      if (averagePaceLabel === '--:--/km') {
        throw new Error('페이스 계산이 아직 부족해서 저장할 수 없어. 조금 더 측정한 뒤 다시 시도해줘.');
      }

      const activeMatchId = resolveActiveMatchId({
        matchMode,
        duelMatchId: duelMatchStatus?.matchId,
        groupMatchId: groupMatchStatus?.matchId,
        roomLinkedMatchContext,
      });

      if (activeMatchId) {
        try {
          const progress = buildDisplayedMatchProgress(trackingSnapshot);
          await pushRunningMatchProgress({
            matchId: activeMatchId,
            distanceKm: progress.distanceKm,
            elapsedSeconds: progress.elapsedSeconds,
            currentPace: progress.currentPace,
            status: 'finished',
          });
        } catch {
          setError('러닝 결과는 계산됐지만 경쟁 상태를 마지막으로 반영하지 못했어요.');
        }
      }

      setStatus('saving');
      const savedRun = await createTrackedRun({
        date: buildRunDateFromTimestamp(startedAt),
        distanceKm: finalDistanceKm,
        pace: averagePaceLabel,
        durationSeconds: finalElapsedSeconds,
        cadenceSpm: finalCadenceSpm,
        elevationGainM: finalElevationGainM,
        route: displayedSnapshot.route,
        startedAt,
        endedAt,
        ...(trackedMatchResult ? { matchResult: trackedMatchResult } : {}),
      });

      await syncLiveSharing({
        enabled: false,
        status: 'idle',
      }).catch(() => {});
      preStartWarmupMatchIdRef.current = null;
      officialStartBaselineRef.current = null;
      autoStartedMatchIdRef.current = null;

      if (options.resetAfterSave) {
        await resetBackgroundRunTracking();
        resetForegroundTrackingState();
        setStatus('idle');
      }

      router.replace(buildRunDetailRedirect({ runId: savedRun.run.id, isTabMode }));
      return true;
    } catch (saveError) {
      if (options.exitIfUnsavable && isUnsavableShortRunError(saveError)) {
        await discardCurrentTracking();
        return false;
      }

      setStatus('paused');
      setError(getApiErrorMessage(saveError, '러닝 기록 저장에 실패했어.'));
      return false;
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
        setDuelMatchNotice(options?.duelNotice ?? '매치에서는 빠졌고, 지금 러닝은 혼자 계속 이어가요.');
      } else {
        setGroupMatchResult(null);
        setGroupMatchStatus(null);
        setGroupMatchNotice(options?.groupNotice ?? '그룹전에서는 빠졌고, 지금 러닝은 혼자 계속 이어가요.');
      }

      await loadUpcomingMatches().catch(() => {});
      setMatchMode('solo');
    } catch (matchError) {
      setError(getApiErrorMessage(matchError, options?.errorMessage ?? '혼자 계속 달리기 전환에 실패했어.'));
    } finally {
      continueSoloInFlightRef.current.delete(source);
      setMatchLeaving(source, false);
    }
  };

  const handleContinueSoloFromMatch = (source: MatchExitSource) => {
    Alert.alert('혼자 계속 달릴까요?', '지금 매치 표시는 정리하고, 러닝 측정은 그대로 이어갈게요.', [
      { text: '계속 볼게요', style: 'cancel' },
      {
        text: '혼자 계속',
        style: 'destructive',
        onPress: () => {
          void leaveMatchAndContinueSolo(source);
        },
      },
    ]);
  };

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
        setDuelMatchNotice('기권 처리됐어요. 기록을 저장하고 대결 화면에서 나갈게요.');
        await leaveRunningMatch({ matchId });
        forfeitApiTraceCompleted = true;
        endForfeitApiTrace({ success: true });
        matchProgressHeartbeatRef.current = Date.now();
      } else {
        setGroupMatchStatus((currentStatus) => markGroupStatusForfeited(currentStatus, matchId));
        setGroupMatchNotice('기권 처리됐어요. 기록을 저장하고 대결 화면에서 나갈게요.');
        await leaveRunningMatch({ matchId });
        forfeitApiTraceCompleted = true;
        endForfeitApiTrace({ success: true });
        matchProgressHeartbeatRef.current = Date.now();
      }

      clearLocalForfeitedMatchState(source, matchId);
      void loadUpcomingMatches().catch(() => {});
      await handleSaveTracking({ exitIfUnsavable: true, resetAfterSave: true });
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

    try {
      await handleSaveTracking({ exitIfUnsavable: true });
    } finally {
      pendingCounterpartForfeitResultRef.current = false;
      setMatchLeaving(source, false);
    }
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

  const actions: RunSaveFlowActions = {
    discardCurrentTracking,
    handleDiscardTracking,
    handleSaveTracking,
    leaveMatchAndContinueSolo,
    handleContinueSoloFromMatch,
    forfeitMatchAndKeepRunning,
    handleForfeitMatch,
    handleShowResultAfterCounterpartForfeit,
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  return useMemo<RunSaveFlowActions>(() => ({
    discardCurrentTracking: () => actionsRef.current.discardCurrentTracking(),
    handleDiscardTracking: () => actionsRef.current.handleDiscardTracking(),
    handleSaveTracking: (options) => actionsRef.current.handleSaveTracking(options),
    leaveMatchAndContinueSolo: (source, options) => actionsRef.current.leaveMatchAndContinueSolo(source, options),
    handleContinueSoloFromMatch: (source) => actionsRef.current.handleContinueSoloFromMatch(source),
    forfeitMatchAndKeepRunning: (source) => actionsRef.current.forfeitMatchAndKeepRunning(source),
    handleForfeitMatch: (source) => actionsRef.current.handleForfeitMatch(source),
    handleShowResultAfterCounterpartForfeit: (source) => actionsRef.current.handleShowResultAfterCounterpartForfeit(source),
  }), []);
}
