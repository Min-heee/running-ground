import { useEffect, type MutableRefObject } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { PreservedLiveMatchShell } from '@/features/runs/lifecycle/liveMatchShellPreservation';
import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShells';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import type { TrackRunMode } from '@/features/runs/runtime/TrackRunExperienceRuntimeModel';

type LiveMatchRouteHydrationSnapshot = {
  matchId?: string;
  mode?: 'duel' | 'group';
  roomId?: string | null;
} | null;

type UseTrackRunRuntimeTraceInput = {
  currentTrackerStatus: string;
  duelMatchStatus: RunningMatchStatusResponse | null;
  duelMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  focusMatchId?: string;
  focusMatchMode?: 'duel' | 'group';
  focusRoomId?: string;
  groupMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  isMountedRef: MutableRefObject<boolean>;
  liveMatchRenderIdentity: string | null;
  liveMatchRenderMode: 'duel' | 'group' | null;
  liveMatchRouteHydration: LiveMatchRouteHydrationSnapshot;
  liveMatchShellPreservation: {
    key: string | null;
    preserved: boolean;
  };
  liveShareEnabled: boolean;
  liveShareEnabledRef: MutableRefObject<boolean>;
  liveShareLabel: string | null;
  liveShareLabelRef: MutableRefObject<string | null>;
  matchLifecycleStage: string;
  matchMode: RunMatchMode;
  matchModeRef: MutableRefObject<RunMatchMode>;
  mode: TrackRunMode;
  previousPreservedLiveMatchShell: PreservedLiveMatchShell | null;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  roomLinkedMatchContextRef: MutableRefObject<PartyRunLinkedMatchContext | null>;
  routeShellHint?: TrackRunShellKind;
  showLiveArena: boolean;
  trackerStatusRef: MutableRefObject<string | null>;
};

export function useTrackRunRuntimeTrace({
  currentTrackerStatus,
  duelMatchStatus,
  duelMatchStatusRef,
  focusMatchId,
  focusMatchMode,
  focusRoomId,
  groupMatchStatus,
  groupMatchStatusRef,
  isMountedRef,
  liveMatchRenderIdentity,
  liveMatchRenderMode,
  liveMatchRouteHydration,
  liveMatchShellPreservation,
  liveShareEnabled,
  liveShareEnabledRef,
  liveShareLabel,
  liveShareLabelRef,
  matchLifecycleStage,
  matchMode,
  matchModeRef,
  mode,
  previousPreservedLiveMatchShell,
  roomLinkedMatchContext,
  roomLinkedMatchContextRef,
  routeShellHint,
  showLiveArena,
  trackerStatusRef,
}: UseTrackRunRuntimeTraceInput) {
  useEffect(() => {
    rgPerfMark('TrackRunExperience mount', {
      hydratedMatchId: liveMatchRouteHydration?.matchId ?? null,
      hydratedRoomId: liveMatchRouteHydration?.roomId ?? null,
      focusMatchId: focusMatchId ?? null,
      focusMatchMode: focusMatchMode ?? null,
      focusRoomId: focusRoomId ?? null,
      mode,
      routeShellHint: routeShellHint ?? null,
    });

    return () => {
      rgPerfMark('TrackRunExperience unmount', {
        mode,
        routeShellHint: routeShellHint ?? null,
      });
    };
  }, [
    focusMatchId,
    focusMatchMode,
    focusRoomId,
    liveMatchRouteHydration?.matchId,
    liveMatchRouteHydration?.roomId,
    mode,
    routeShellHint,
  ]);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, [isMountedRef]);

  useEffect(() => {
    liveShareEnabledRef.current = liveShareEnabled;
  }, [liveShareEnabled, liveShareEnabledRef]);

  useEffect(() => {
    liveShareLabelRef.current = liveShareLabel;
  }, [liveShareLabel, liveShareLabelRef]);

  useEffect(() => {
    trackerStatusRef.current = currentTrackerStatus;
  }, [currentTrackerStatus, trackerStatusRef]);

  useEffect(() => {
    matchModeRef.current = matchMode;
  }, [matchMode, matchModeRef]);

  useEffect(() => {
    duelMatchStatusRef.current = duelMatchStatus;
  }, [duelMatchStatus, duelMatchStatusRef]);

  useEffect(() => {
    groupMatchStatusRef.current = groupMatchStatus;
  }, [groupMatchStatus, groupMatchStatusRef]);

  useEffect(() => {
    roomLinkedMatchContextRef.current = roomLinkedMatchContext;
  }, [roomLinkedMatchContext, roomLinkedMatchContextRef]);

  useEffect(() => {
    if (liveMatchShellPreservation.key) {
      rgPerfMark('live match key stable', {
        key: liveMatchShellPreservation.key,
        matchId: liveMatchRenderIdentity,
        mode: liveMatchRenderMode,
        source: 'track-run experience',
      });
    }

    if (liveMatchShellPreservation.preserved) {
      rgPerfMark('live match unmount prevented same match', {
        key: liveMatchShellPreservation.key,
        matchId: previousPreservedLiveMatchShell?.matchId ?? liveMatchRenderIdentity,
        mode: previousPreservedLiveMatchShell?.mode ?? liveMatchRenderMode,
        source: 'track-run experience',
        stage: matchLifecycleStage,
      });
      rgPerfMark('live match preserved through tracking transition', {
        key: liveMatchShellPreservation.key,
        matchId: previousPreservedLiveMatchShell?.matchId ?? liveMatchRenderIdentity,
        mode: previousPreservedLiveMatchShell?.mode ?? liveMatchRenderMode,
        requestedShowLiveArena: showLiveArena,
        source: 'track-run experience',
        stage: matchLifecycleStage,
      });
    }
  }, [
    liveMatchRenderIdentity,
    liveMatchRenderMode,
    liveMatchShellPreservation.key,
    liveMatchShellPreservation.preserved,
    matchLifecycleStage,
    previousPreservedLiveMatchShell?.matchId,
    previousPreservedLiveMatchShell?.mode,
    showLiveArena,
  ]);
}
