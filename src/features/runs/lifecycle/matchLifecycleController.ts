import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type {
  PartyRunFlowSnapshot,
  PartyRunLinkedMatchContext,
} from '@/features/runs/lifecycle/matchStateMachine';
import {
  shouldPreferRoomLinkedArena,
} from '@/features/runs/lifecycle/matchStateMachine';
import { selectPartyRunRuntimeSource } from '@/features/runs/lifecycle/matchRuntimeStateSelector';
import { shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import { rgDiagLog } from '@/utils/rgPerfTrace';
import type {
  RunningMatchRoom,
  RunningMatchState,
  RunningMatchStatusResponse,
} from '@/lib/api/types';

export type MatchLifecycleStage = 'waiting' | 'arming' | 'countdown' | 'active' | 'finished';

export type MatchLifecycleMode = Extract<RunMatchMode, 'duel' | 'group'>;

export type MatchLifecycleTrackingStatus = 'idle' | 'starting' | 'running' | 'paused' | 'saving';

export type MatchLifecycleControllerInput = {
  matchMode: RunMatchMode;
  trackingStatus: MatchLifecycleTrackingStatus;
  isRunning: boolean;
  isCurrentUserForfeited: boolean;
  liveMatchHeavyWorkReady: boolean;
  visiblePartyRunFlow: PartyRunFlowSnapshot;
  matchRoomFlow: PartyRunFlowSnapshot;
  matchRoom: RunningMatchRoom | null;
  visibleMatchRoom: RunningMatchRoom | null;
  roomLinkedMatchContext: PartyRunLinkedMatchContext | null;
  duelMatchState: RunningMatchState;
  groupMatchState: RunningMatchState;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  duelStartCountdownSeconds: number | null;
  groupStartCountdownSeconds: number | null;
  fallbackMatchId?: string | null;
};

export type MatchLifecycleMatchTarget = {
  matchId: string;
  slotStartAt: string;
  mode: MatchLifecycleMode;
};

export type MatchLifecycleController = {
  stage: MatchLifecycleStage;
  mode: MatchLifecycleMode | null;
  source: 'party-room' | 'duel-match' | 'group-match' | 'none';
  roomId: string | null;
  matchId: string | null;
  shouldPreferArena: boolean;
  effects: {
    shouldPollRoom: boolean;
    shouldPollDirectMatchStatus: boolean;
    shouldPollLinkedMatch: boolean;
    shouldRefreshUpcomingMatches: boolean;
    shouldAcknowledgeCountdownReady: boolean;
    shouldNavigateLinkedMatch: boolean;
    shouldStartGpsWarmup: boolean;
    shouldStartGpsActive: boolean;
    shouldRunHeartbeat: boolean;
  };
  gps: {
    warmupMatch: MatchLifecycleMatchTarget | null;
    activeMatch: MatchLifecycleMatchTarget | null;
  };
};

let lastLinkedMatchPollGatingKey: string | null = null;

function logLinkedMatchPollGating(detail: {
  isHost: boolean | null;
  linkedMatchId: string | null;
  roomLinkedContextState: PartyRunLinkedMatchContext['state'] | null;
  roomState: RunningMatchRoom['state'] | null;
  shouldPollLinkedMatch: boolean;
  shouldPollRoom: boolean;
  stage: MatchLifecycleStage;
}) {
  const nextKey = JSON.stringify(detail);
  if (lastLinkedMatchPollGatingKey === nextKey) {
    return;
  }

  lastLinkedMatchPollGatingKey = nextKey;
  rgDiagLog('linked match poll gating', detail);
}

function normalizeStageFromPartyRunPhase(phase: PartyRunFlowSnapshot['phase']): MatchLifecycleStage {
  switch (phase) {
    case 'active':
      return 'active';
    case 'countdown':
    case 'arenaHandoff':
      return 'countdown';
    case 'arming':
    case 'readyAcked':
      return 'arming';
    case 'waiting':
    default:
      return 'waiting';
  }
}

function normalizeStageFromMatchState(
  state: RunningMatchState,
  countdownSeconds: number | null,
  status?: RunningMatchStatusResponse | null,
): MatchLifecycleStage {
  if (status?.currentUserLiveStatus === 'finished' || status?.currentUserLiveStatus === 'forfeited') {
    return 'finished';
  }

  if (state === 'active') {
    return 'active';
  }

  if (state === 'matched') {
    return shouldAutoOpenMatchArena(countdownSeconds) ? 'countdown' : 'arming';
  }

  return 'waiting';
}

function buildRoomLinkedTarget(
  context: PartyRunLinkedMatchContext | null,
): MatchLifecycleMatchTarget | null {
  if (!context) {
    return null;
  }

  return {
    matchId: context.matchId,
    mode: context.mode,
    slotStartAt: context.slotStartAt,
  };
}

function buildStatusTarget(
  mode: MatchLifecycleMode,
  status: RunningMatchStatusResponse | null,
): MatchLifecycleMatchTarget | null {
  if (!status?.matchId) {
    return null;
  }

  return {
    matchId: status.matchId,
    mode,
    slotStartAt: status.slotStartAt,
  };
}

function promoteLinkedContextWithStatus(
  context: PartyRunLinkedMatchContext | null,
  duelMatchStatus: RunningMatchStatusResponse | null,
  groupMatchStatus: RunningMatchStatusResponse | null,
): PartyRunLinkedMatchContext | null {
  if (!context) {
    return null;
  }

  const linkedStatus = context.mode === 'duel' ? duelMatchStatus : groupMatchStatus;

  if (linkedStatus?.matchId !== context.matchId || linkedStatus.state !== 'active') {
    return context;
  }

  return {
    ...context,
    distanceKm: linkedStatus.distanceKm,
    slotStartAt: linkedStatus.slotStartAt,
    state: 'active',
  };
}

function resolveWarmupMatch(input: MatchLifecycleControllerInput): MatchLifecycleMatchTarget | null {
  const roomTarget = input.roomLinkedMatchContext?.state === 'matched' && input.visiblePartyRunFlow.shouldOpenArena
    ? buildRoomLinkedTarget(input.roomLinkedMatchContext)
    : null;

  if (roomTarget) {
    return roomTarget;
  }

  if (input.matchMode === 'duel') {
    if (input.duelMatchState === 'matched' && shouldAutoOpenMatchArena(input.duelStartCountdownSeconds)) {
      return buildStatusTarget('duel', input.duelMatchStatus) ?? roomTarget;
    }

    return null;
  }

  if (input.matchMode === 'group') {
    if (input.groupMatchState === 'matched' && shouldAutoOpenMatchArena(input.groupStartCountdownSeconds)) {
      return buildStatusTarget('group', input.groupMatchStatus) ?? roomTarget;
    }

    return null;
  }

  return null;
}

function resolveActiveMatch(input: MatchLifecycleControllerInput): MatchLifecycleMatchTarget | null {
  const roomTarget = input.roomLinkedMatchContext?.state === 'active'
    ? buildRoomLinkedTarget(input.roomLinkedMatchContext)
    : null;

  if (roomTarget) {
    return roomTarget;
  }

  if (input.matchMode === 'duel') {
    return input.duelMatchStatus?.state === 'active'
      ? buildStatusTarget('duel', input.duelMatchStatus)
      : null;
  }

  if (input.matchMode === 'group') {
    return input.groupMatchStatus?.state === 'active'
      ? buildStatusTarget('group', input.groupMatchStatus)
      : null;
  }

  return null;
}

export function buildMatchLifecycleController(input: MatchLifecycleControllerInput): MatchLifecycleController {
  const partyRuntime = selectPartyRunRuntimeSource({
    explicitLinkedMatchContext: input.roomLinkedMatchContext,
    matchRoom: input.matchRoom,
    matchRoomFlow: input.matchRoomFlow,
    visibleMatchRoom: input.visibleMatchRoom,
    visiblePartyRunFlow: input.visiblePartyRunFlow,
  });
  const partyRoom = partyRuntime.room;
  const partyFlow = partyRuntime.flow;
  const roomLinkedContext = promoteLinkedContextWithStatus(
    partyRuntime.linkedMatchContext,
    input.duelMatchStatus,
    input.groupMatchStatus,
  );
  const runtimeInput = {
    ...input,
    roomLinkedMatchContext: roomLinkedContext,
    visiblePartyRunFlow: partyFlow,
  };
  const warmupMatch = resolveWarmupMatch(runtimeInput);
  const activeMatch = resolveActiveMatch(runtimeInput);
  const roomId = partyRoom?.roomId ?? null;
  const partyStage = partyRoom?.linkedMatchId
    ? roomLinkedContext?.state === 'active'
      ? 'active'
      : normalizeStageFromPartyRunPhase(partyFlow.phase)
    : null;
  const directDuelStage = input.matchMode === 'duel'
    ? normalizeStageFromMatchState(input.duelMatchState, input.duelStartCountdownSeconds, input.duelMatchStatus)
    : null;
  const directGroupStage = input.matchMode === 'group'
    ? normalizeStageFromMatchState(input.groupMatchState, input.groupStartCountdownSeconds, input.groupMatchStatus)
    : null;
  const mode = roomLinkedContext?.mode
    ?? (input.matchMode === 'duel' || input.matchMode === 'group' ? input.matchMode : null);
  const source = roomLinkedContext
    ? 'party-room'
    : input.matchMode === 'duel'
      ? 'duel-match'
      : input.matchMode === 'group'
        ? 'group-match'
        : 'none';
  const stage = partyStage ?? directDuelStage ?? directGroupStage ?? 'waiting';
  const matchId =
    activeMatch?.matchId
    ?? warmupMatch?.matchId
    ?? roomLinkedContext?.matchId
    ?? (input.matchMode === 'duel' ? input.duelMatchStatus?.matchId : null)
    ?? (input.matchMode === 'group' ? input.groupMatchStatus?.matchId : null)
    ?? input.fallbackMatchId
    ?? null;
  const isCompetitiveMode = mode === 'duel' || mode === 'group';
  const shouldPollLinkedMatch = Boolean(
    roomLinkedContext
    && (
      stage === 'arming'
      || stage === 'countdown'
      || stage === 'active'
      || roomLinkedContext.state === 'matched'
      || roomLinkedContext.state === 'active'
    ),
  );
  const shouldPollRoom = Boolean(partyRoom && !partyRoom.linkedMatchId && stage !== 'waiting');
  const shouldNavigateLinkedMatch = Boolean(
    partyRoom
    && partyFlow.canOpenLinkedMatch
    && roomLinkedContext,
  );
  const shouldRunHeartbeat = Boolean(
    input.liveMatchHeavyWorkReady
    && input.isRunning
    && isCompetitiveMode
    && matchId
    && !input.isCurrentUserForfeited
    && stage === 'active',
  );
  logLinkedMatchPollGating({
    isHost: partyRoom?.isHost ?? null,
    linkedMatchId: partyRoom?.linkedMatchId ?? null,
    roomLinkedContextState: roomLinkedContext?.state ?? null,
    roomState: partyRoom?.state ?? null,
    shouldPollLinkedMatch,
    shouldPollRoom,
    stage,
  });

  return {
    stage,
    mode,
    source,
    roomId,
    matchId,
    shouldPreferArena: Boolean(
      partyFlow.shouldPreferArena
      || shouldPreferRoomLinkedArena(partyRoom?.linkedMatchStatus, null)
      || activeMatch
    ),
    effects: {
      shouldPollRoom,
      shouldPollDirectMatchStatus: Boolean(
        source !== 'party-room'
        && isCompetitiveMode
        && matchId
        && (stage === 'waiting' || stage === 'arming' || stage === 'countdown' || stage === 'active'),
      ),
      shouldPollLinkedMatch,
      shouldRefreshUpcomingMatches: Boolean(input.liveMatchHeavyWorkReady && matchId),
      shouldAcknowledgeCountdownReady: partyFlow.canAcknowledgeCountdownReady,
      shouldNavigateLinkedMatch,
      shouldStartGpsWarmup: Boolean(input.trackingStatus === 'idle' && warmupMatch),
      shouldStartGpsActive: Boolean(input.trackingStatus === 'idle' && activeMatch),
      shouldRunHeartbeat,
    },
    gps: {
      warmupMatch,
      activeMatch,
    },
  };
}
