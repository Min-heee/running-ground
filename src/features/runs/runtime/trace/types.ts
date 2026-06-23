import type { MutableRefObject } from 'react';

import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShells';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PreservedLiveMatchShell } from '@/features/runs/lifecycle/liveMatchShellPreservation';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import type { RunningMatchStatusResponse } from '@/lib/api/types';

export type TrackRunRuntimeMode = 'tab' | 'stack';

export type LiveMatchRouteHydrationSnapshot = {
  matchId?: string;
  mode?: 'duel' | 'group';
  roomId?: string | null;
} | null;

export type TrackRunMountTraceInput = {
  focusMatchId?: string;
  focusMatchMode?: 'duel' | 'group';
  focusRoomId?: string;
  isMountedRef: MutableRefObject<boolean>;
  liveMatchRouteHydration: LiveMatchRouteHydrationSnapshot;
  mode: TrackRunRuntimeMode;
  routeShellHint?: TrackRunShellKind;
};

export type TrackRunShellTraceInput = {
  currentTrackerStatus: string;
  liveShareEnabled: boolean;
  liveShareEnabledRef: MutableRefObject<boolean>;
  liveShareLabel: string | null;
  liveShareLabelRef: MutableRefObject<string | null>;
  matchMode: RunMatchMode;
  matchModeRef: MutableRefObject<RunMatchMode>;
  trackerStatusRef: MutableRefObject<string | null>;
};

export type TrackRunRoomTraceInput = {
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  roomLinkedMatchContextRef: MutableRefObject<PartyRunLinkedMatchContext | null>;
  // Durable party-run latch. Once the current run is known to have come from a party room
  // (roomLinkedMatchContext became truthy), this stays true for the rest of the run so an
  // early forfeit — which tears the room down before the save reads the ephemeral context —
  // still classifies as 'party'. Reset to false on the post-run runtime reset.
  wasPartyRunRef: MutableRefObject<boolean>;
};

export type TrackRunLiveMatchTraceInput = {
  liveMatchRenderIdentity: string | null;
  liveMatchRenderMode: 'duel' | 'group' | null;
  liveMatchShellPreservation: {
    key: string | null;
    preserved: boolean;
  };
  matchLifecycleStage: string;
  previousPreservedLiveMatchShell: PreservedLiveMatchShell | null;
  showLiveArena: boolean;
};

export type TrackRunRenderTraceInput = {
  duelMatchStatus: RunningMatchStatusResponse | null;
  duelMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  groupMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
};
