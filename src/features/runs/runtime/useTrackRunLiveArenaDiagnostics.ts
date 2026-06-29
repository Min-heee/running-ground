import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { AppStateStatus } from 'react-native';
import { isLiveMatchState } from '@/features/runs/lifecycle/matchStateMachine';
import type {
  MatchLifecycleController,
  MatchLifecycleStage,
} from '@/features/runs/lifecycle/matchLifecycleController';
import { rgDiagLog } from '@/utils/rgPerfTrace';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { RunningMatchState, RunningMatchStatusResponse } from '@/lib/api/types';

type UseTrackRunLiveArenaDiagnosticsInput = {
  appStateRef: MutableRefObject<AppStateStatus>;
  currentUserHasForfeitedActiveMatch: boolean;
  currentUserFinishedForResultPage: boolean;
  duelArenaParticipantCount: number;
  duelMatchState: RunningMatchState;
  duelMatchStatus: RunningMatchStatusResponse | null;
  effectiveShowLiveArena: boolean;
  forceOpenActiveMatch: boolean;
  hasMatchResultPage: boolean;
  hasTrackedMatchResult: boolean;
  isPaused: boolean;
  isRunning: boolean;
  liveMatchShellPreservationShouldRenderLiveArena: boolean;
  matchLifecycleStage: MatchLifecycleStage;
  matchLifecycleSource: MatchLifecycleController['source'];
  matchMode: RunMatchMode;
  roomCountdownRemainingSeconds: number | null;
  roomLinkedSlotElapsedMsForDiagnostics: number | null;
  roomLinkedSlotStartAtForDiagnostics: string | null;
  shouldForceLiveArenaFromRoute: boolean;
  shouldRenderLiveArena: boolean;
  showLiveArena: boolean;
  syncedNowMs: number;
};

export function useTrackRunLiveArenaDiagnostics({
  appStateRef,
  currentUserHasForfeitedActiveMatch,
  currentUserFinishedForResultPage,
  duelArenaParticipantCount,
  duelMatchState,
  duelMatchStatus,
  effectiveShowLiveArena,
  forceOpenActiveMatch,
  hasMatchResultPage,
  hasTrackedMatchResult,
  isPaused,
  isRunning,
  liveMatchShellPreservationShouldRenderLiveArena,
  matchLifecycleStage,
  matchLifecycleSource,
  matchMode,
  roomCountdownRemainingSeconds,
  roomLinkedSlotElapsedMsForDiagnostics,
  roomLinkedSlotStartAtForDiagnostics,
  shouldForceLiveArenaFromRoute,
  shouldRenderLiveArena,
  showLiveArena,
  syncedNowMs,
}: UseTrackRunLiveArenaDiagnosticsInput) {
  const previousLiveArenaShellVisibleRef = useRef<boolean | null>(null);
  const previousHasMatchResultPageRef = useRef<boolean | null>(null);
  const previousMatchLifecycleStageRef = useRef<string | null>(null);

  useEffect(() => {
    const previousShouldRenderLiveArena = previousLiveArenaShellVisibleRef.current;
    if (previousShouldRenderLiveArena !== null && previousShouldRenderLiveArena !== shouldRenderLiveArena) {
      rgDiagLog(shouldRenderLiveArena ? 'live arena shell restored' : 'live arena shell dropped', {
        appState: appStateRef.current,
        duelArenaParticipantCount,
        duelMatchId: duelMatchStatus?.matchId ?? null,
        duelMatchStateKind: duelMatchState,
        duelMatchStatusState: duelMatchStatus?.state ?? null,
        effectiveShowLiveArena,
        forceOpenActiveMatch,
        hasMatchResultPage,
        isCurrentUserForfeited: currentUserHasForfeitedActiveMatch,
        isLiveMatchState: isLiveMatchState(duelMatchState),
        isRunning,
        preservationRendered: liveMatchShellPreservationShouldRenderLiveArena,
        shouldForceLiveArenaFromRoute,
        shouldRenderLiveArena,
        showLiveArena,
        stage: matchLifecycleStage,
      });
    }
    previousLiveArenaShellVisibleRef.current = shouldRenderLiveArena;
  }, [
    appStateRef,
    currentUserHasForfeitedActiveMatch,
    duelArenaParticipantCount,
    duelMatchState,
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    effectiveShowLiveArena,
    forceOpenActiveMatch,
    hasMatchResultPage,
    isRunning,
    liveMatchShellPreservationShouldRenderLiveArena,
    matchLifecycleStage,
    shouldForceLiveArenaFromRoute,
    shouldRenderLiveArena,
    showLiveArena,
  ]);

  useEffect(() => {
    const previousHasMatchResultPage = previousHasMatchResultPageRef.current;
    if (previousHasMatchResultPage !== null && previousHasMatchResultPage !== hasMatchResultPage) {
      rgDiagLog('has match result page changed', {
        currentUserFinished: currentUserFinishedForResultPage,
        duelMatchId: duelMatchStatus?.matchId ?? null,
        duelMatchStateKind: duelMatchState,
        duelMatchStatusState: duelMatchStatus?.state ?? null,
        hasMatchResultPage,
        hasTrackedMatchResult,
        isPaused,
        matchMode,
      });
    }
    previousHasMatchResultPageRef.current = hasMatchResultPage;
  }, [
    currentUserFinishedForResultPage,
    duelMatchState,
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    hasMatchResultPage,
    hasTrackedMatchResult,
    isPaused,
    matchMode,
  ]);

  useEffect(() => {
    const previousMatchLifecycleStage = previousMatchLifecycleStageRef.current;
    if (
      previousMatchLifecycleStage !== null
      && previousMatchLifecycleStage !== matchLifecycleStage
    ) {
      rgDiagLog('match lifecycle stage changed', {
        duelArenaParticipantCount,
        duelMatchId: duelMatchStatus?.matchId ?? null,
        duelMatchStateKind: duelMatchState,
        duelMatchStatusState: duelMatchStatus?.state ?? null,
        effectiveShowLiveArena,
        forceOpenActiveMatch,
        fromStage: previousMatchLifecycleStage,
        hasMatchResultPage,
        isRunning,
        roomCountdownRemainingSeconds,
        roomLinkedSlotElapsedMs: roomLinkedSlotElapsedMsForDiagnostics,
        roomLinkedSlotStartAt: roomLinkedSlotStartAtForDiagnostics,
        shouldRenderLiveArena,
        showLiveArena,
        source: matchLifecycleSource,
        syncedNowMs,
        toStage: matchLifecycleStage,
      });
    }
    previousMatchLifecycleStageRef.current = matchLifecycleStage;
  }, [
    duelArenaParticipantCount,
    duelMatchState,
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    effectiveShowLiveArena,
    forceOpenActiveMatch,
    hasMatchResultPage,
    isRunning,
    matchLifecycleStage,
    matchLifecycleSource,
    roomCountdownRemainingSeconds,
    roomLinkedSlotElapsedMsForDiagnostics,
    roomLinkedSlotStartAtForDiagnostics,
    shouldRenderLiveArena,
    showLiveArena,
    syncedNowMs,
  ]);
}
