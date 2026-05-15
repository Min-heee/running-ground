import type { MutableRefObject } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { PreservedLiveMatchShell } from '@/features/runs/lifecycle/liveMatchShellPreservation';
import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShells';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import type { TrackRunMode } from '@/features/runs/runtime/TrackRunExperienceRuntimeModel';
import { useTrackRunLiveMatchTrace } from '@/features/runs/runtime/trace/useTrackRunLiveMatchTrace';
import { useTrackRunMountTrace } from '@/features/runs/runtime/trace/useTrackRunMountTrace';
import { useTrackRunRenderTrace } from '@/features/runs/runtime/trace/useTrackRunRenderTrace';
import { useTrackRunRoomTrace } from '@/features/runs/runtime/trace/useTrackRunRoomTrace';
import { useTrackRunShellTrace } from '@/features/runs/runtime/trace/useTrackRunShellTrace';

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
  useTrackRunMountTrace({
    focusMatchId,
    focusMatchMode,
    focusRoomId,
    isMountedRef,
    liveMatchRouteHydration,
    mode,
    routeShellHint,
  });

  useTrackRunShellTrace({
    currentTrackerStatus,
    liveShareEnabled,
    liveShareEnabledRef,
    liveShareLabel,
    liveShareLabelRef,
    matchMode,
    matchModeRef,
    trackerStatusRef,
  });

  useTrackRunRoomTrace({
    roomLinkedMatchContext,
    roomLinkedMatchContextRef,
  });

  useTrackRunLiveMatchTrace({
    liveMatchRenderIdentity,
    liveMatchRenderMode,
    liveMatchShellPreservation,
    matchLifecycleStage,
    previousPreservedLiveMatchShell,
    showLiveArena,
  });

  useTrackRunRenderTrace({
    duelMatchStatus,
    duelMatchStatusRef,
    groupMatchStatus,
    groupMatchStatusRef,
  });
}
