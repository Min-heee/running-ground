import type {
  RunningMatchState,
} from '@/lib/api/types';
import type {
  ActiveMatchIdentityInput,
  CenteredCountdownVisibilityInput,
  CountdownVisibilityInput,
  MatchArenaEntryInput,
  MatchArenaForceInput,
  MatchLifecycleState,
  MatchParticipantLiveStatus,
  PartyRunFlowSnapshot,
  PartyRunFlowSnapshotInput,
  PartyRunStartEvent,
  PartyRunStartPhase,
  PartyRunStartPhaseInput,
  RunTrackingEvent,
  RunTrackingState,
} from '@/features/runs/types/matchStateMachine';
import {
  shouldAutoOpenMatchArena,
  shouldShowMatchStartOverlay,
} from '@/lib/matchCountdown';

export type {
  MatchLifecycleState,
  MatchParticipantLiveStatus,
  PartyRunFlowSnapshot,
  PartyRunLinkedMatchContext,
  PartyRunStartEvent,
  PartyRunStartPhase,
  RunTrackingEvent,
  RunTrackingState,
} from '@/features/runs/types/matchStateMachine';

const BLOCKING_MATCH_STATES = new Set<RunningMatchState>(['waiting', 'matched', 'active']);
const LIVE_MATCH_STATES = new Set<RunningMatchState>(['matched', 'active']);
const RUN_TRACKING_TRANSITIONS: Record<RunTrackingState, Partial<Record<RunTrackingEvent, RunTrackingState>>> = {
  idle: {
    requestStart: 'starting',
    start: 'running',
  },
  starting: {
    start: 'running',
    discard: 'idle',
  },
  running: {
    pause: 'paused',
    requestSave: 'saving',
    forfeit: 'saving',
  },
  paused: {
    resume: 'running',
    requestSave: 'saving',
    discard: 'idle',
  },
  saving: {
    saved: 'idle',
  },
};

export function isBlockingMatchState(state?: RunningMatchState | null) {
  return Boolean(state && BLOCKING_MATCH_STATES.has(state));
}

export function isLiveMatchState(state?: RunningMatchState | null) {
  return Boolean(state && LIVE_MATCH_STATES.has(state));
}

export function canShowMatchCountdown(state?: RunningMatchState | null) {
  return state === 'matched';
}

export function canAutoStartMatchTracking(state?: RunningMatchState | null) {
  return state === 'active';
}

export function isTerminalMatchLifecycleState(state?: MatchLifecycleState | null) {
  return state === 'idle' || state === 'forfeited';
}

export function resolveRunTrackingState(currentState: RunTrackingState, event: RunTrackingEvent) {
  return RUN_TRACKING_TRANSITIONS[currentState][event] ?? currentState;
}

// Once the slot has just elapsed and we still have a linkedMatchId on the
// room, assume the match is `active` until the server explicitly says
// otherwise. Without this grace window the phase flips back to 'arming'
// the moment `remainingSeconds` hits 0 because `shouldShowMatchStartOverlay`
// turns false there — which yanks users out of the match arena and back
// to the running tab while waiting for the server's 'active' push.
//
// 120s rather than 60s — two-phone tests on Wide 6 showed the host's start
// API response sometimes lags by tens of seconds, so a longer grace covers
// the realistic worst case without letting the inference rot indefinitely.
const ACTIVE_INFERENCE_GRACE_SECONDS = 120;

// We treat slot-time-derived state as "matched-equivalent" further out
// than the visible overlay window, because the host phone's start API
// response can land while remainingSeconds is still well above 30. Without
// extending here, the host stays on 'arming' (loading banner) for the
// first ~30s of the matched lifetime even though the slot is locked in.
const INFERRED_MATCHED_WINDOW_SECONDS = 60;
const PARTY_RUN_START_PHASE_ORDER: Record<PartyRunStartPhase, number> = {
  waiting: 0,
  arming: 1,
  readyAcked: 2,
  countdown: 3,
  arenaHandoff: 4,
  active: 5,
};

function maxPartyRunStartPhase(
  currentPhase: PartyRunStartPhase,
  minimumPhase: PartyRunStartPhase,
): PartyRunStartPhase {
  return PARTY_RUN_START_PHASE_ORDER[currentPhase] >= PARTY_RUN_START_PHASE_ORDER[minimumPhase]
    ? currentPhase
    : minimumPhase;
}

export function derivePartyRunStartPhase({
  roomState,
  linkedMatchStatus,
  isCountdownReady = false,
  remainingSeconds = null,
  linkedMatchId = null,
  linkedMatchSlotStartAt = null,
}: PartyRunStartPhaseInput): PartyRunStartPhase {
  if (roomState === 'active' || linkedMatchStatus === 'active') {
    return 'active';
  }

  // Two-phone testing showed host/guest divergence: the guest's polling
  // delivers `linkedMatchStatus = 'matched'` before the host's
  // /running/rooms/start response does. Result: one phone enters countdown
  // while the other is still on the loading banner.
  //
  // If the room already has a linked match scheduled and the slot is within
  // a generous matched-equivalent window, treat that as "matched". The slot
  // time is a server-authoritative absolute timestamp, so two clients
  // reaching this branch agree on the countdown second. Once the real
  // 'matched' status arrives we still take the same branch, so the
  // fallback doesn't introduce a separate transition path.
  const hasInferredMatchedFromSlot = Boolean(
    linkedMatchId
    && linkedMatchSlotStartAt
    && typeof remainingSeconds === 'number'
    && remainingSeconds > 0
    && remainingSeconds <= INFERRED_MATCHED_WINDOW_SECONDS,
  );

  // Just after the slot fires, `remainingSeconds` is 0 or slightly negative
  // and neither `shouldShowMatchStartOverlay` nor `shouldAutoOpenMatchArena`
  // returns true. If the room still has a linked match (i.e. nothing
  // cancelled it), infer 'active' for a short grace window so the match
  // arena stays mounted while the server's status push is in flight.
  const hasInferredActiveFromSlotElapsed = Boolean(
    linkedMatchId
    && linkedMatchSlotStartAt
    && typeof remainingSeconds === 'number'
    && remainingSeconds <= 0
    && remainingSeconds > -ACTIVE_INFERENCE_GRACE_SECONDS,
  );
  if (hasInferredActiveFromSlotElapsed) {
    return 'active';
  }

  if (
    linkedMatchStatus === 'matched'
    || roomState === 'countdown'
    || hasInferredMatchedFromSlot
  ) {
    if (shouldAutoOpenMatchArena(remainingSeconds)) {
      return 'arenaHandoff';
    }

    if (shouldShowMatchStartOverlay(remainingSeconds)) {
      return 'countdown';
    }

    return isCountdownReady ? 'readyAcked' : 'arming';
  }

  if (roomState === 'arming') {
    return isCountdownReady ? 'readyAcked' : 'arming';
  }

  return 'waiting';
}

export function resolvePartyRunStartPhase(
  currentPhase: PartyRunStartPhase,
  event: PartyRunStartEvent,
): PartyRunStartPhase {
  switch (event.type) {
    case 'hostStartRequested':
      return maxPartyRunStartPhase(currentPhase, 'arming');
    case 'countdownReadyAcked':
      return maxPartyRunStartPhase(currentPhase, 'readyAcked');
    case 'serverSnapshot':
      return derivePartyRunStartPhase(event.payload);
    case 'reset':
      return 'waiting';
    default:
      return currentPhase;
  }
}

export function shouldShowPartyRunLoading(phase: PartyRunStartPhase) {
  return phase === 'arming' || phase === 'readyAcked';
}

export function shouldOpenPartyRunArena(phase: PartyRunStartPhase) {
  return phase === 'arenaHandoff' || phase === 'active';
}

export function shouldOpenPartyRunCountdownArena(phase: PartyRunStartPhase) {
  return phase === 'countdown' || shouldOpenPartyRunArena(phase);
}

export function buildMatchParticipantStatusLabel(status?: MatchParticipantLiveStatus) {
  switch (status) {
    case 'running':
      return '러닝 중';
    case 'background':
      return '백그라운드';
    case 'paused':
      return '일시정지';
    case 'disconnected':
      return '연결 끊김';
    case 'forfeited':
      return '포기함';
    case 'finished':
      return '완료';
    case 'ready':
    default:
      return '준비됨';
  }
}

export function buildMatchTransitionNotice(
  mode: 'duel' | 'group',
  previousState: RunningMatchState,
  nextState: RunningMatchState,
) {
  if (previousState === nextState) {
    return null;
  }

  if (previousState === 'waiting' && nextState === 'idle') {
    return '대기 시간이 지나 자동으로 정리됐어요. 다시 찾으면 새 대기열로 들어가요.';
  }

  if ((previousState === 'matched' || previousState === 'active') && nextState === 'waiting') {
    return mode === 'duel'
      ? '상대가 빠져서 다시 비슷한 상대를 찾는 중이에요.'
      : '일부 참가자가 빠져서 다시 비슷한 그룹을 모으는 중이에요.';
  }

  if ((previousState === 'matched' || previousState === 'active') && nextState === 'idle') {
    return '매칭이 정리됐어요. 다시 찾으면 새 대기열로 들어가요.';
  }

  return null;
}

export function shouldUseFullscreenMatchCountdown({
  hasCountdownEntry,
  remainingSeconds,
}: CountdownVisibilityInput) {
  return (
    hasCountdownEntry
    && shouldShowMatchStartOverlay(remainingSeconds)
    && !shouldAutoOpenMatchArena(remainingSeconds)
  );
}

export function shouldUseCenteredMatchCountdown({
  hasCountdownEntry,
  remainingSeconds,
  showLiveArena,
  hasRoomCountdownEntry,
}: CenteredCountdownVisibilityInput) {
  return (
    hasCountdownEntry
    && shouldAutoOpenMatchArena(remainingSeconds)
    && (showLiveArena || hasRoomCountdownEntry)
  );
}

export function shouldAutoFocusMatchArena(isIdle: boolean, remainingSeconds: number | null) {
  return isIdle && shouldAutoOpenMatchArena(remainingSeconds);
}

export function shouldEnterMatchArenaForLifecycle({
  duelState,
  groupState,
  duelShouldOpenCountdownArena,
  groupShouldOpenCountdownArena,
}: MatchArenaEntryInput) {
  return (
    duelState === 'active'
    || groupState === 'active'
    || duelShouldOpenCountdownArena
    || groupShouldOpenCountdownArena
  );
}

export function shouldKeepMatchArenaForceOpen({
  isResolvingFocusedMatch,
  duelState,
  groupState,
  duelShouldOpenCountdownArena,
  groupShouldOpenCountdownArena,
  roomShouldOpenCountdownArena,
  forceOpenActiveMatch,
  shouldKeepRunningMatchArena,
}: MatchArenaForceInput) {
  if (isResolvingFocusedMatch) {
    return true;
  }

  return (
    duelState === 'active'
    || groupState === 'active'
    || duelShouldOpenCountdownArena
    || groupShouldOpenCountdownArena
    || roomShouldOpenCountdownArena
    || (forceOpenActiveMatch && (duelState === 'matched' || groupState === 'matched'))
    || shouldKeepRunningMatchArena
  );
}

export function shouldPreferRoomLinkedArena(
  linkedMatchStatus: 'matched' | 'active' | null | undefined,
  remainingSeconds: number | null,
) {
  return linkedMatchStatus === 'active' || shouldAutoOpenMatchArena(remainingSeconds);
}

export function buildPartyRunFlowSnapshot({
  room,
  isCountdownReady = false,
  remainingSeconds = null,
}: PartyRunFlowSnapshotInput): PartyRunFlowSnapshot {
  const linkedMatchSlotStartAt = room?.linkedMatchSlotStartAt ?? room?.slotStartAt;
  const linkedMatchDistanceKm = room?.linkedMatchDistanceKm ?? room?.distanceKm;
  const phase = derivePartyRunStartPhase({
    roomState: room?.state,
    linkedMatchStatus: room?.linkedMatchStatus,
    isCountdownReady,
    remainingSeconds,
    linkedMatchId: room?.linkedMatchId,
    linkedMatchSlotStartAt,
  });
  const hasLinkedMatch = Boolean(room?.linkedMatchId);
  const shouldOpenArena = hasLinkedMatch && shouldOpenPartyRunArena(phase);
  const shouldOpenCountdownArena = hasLinkedMatch && shouldOpenPartyRunCountdownArena(phase);
  const isLinkedRoomLifecycle = Boolean(
    hasLinkedMatch
    && room
    && ['arming', 'countdown', 'active'].includes(room.state ?? ''),
  );
  const hasReachedOfficialStart = typeof remainingSeconds !== 'number';
  const linkedMatchContext = (
    room?.linkedMatchId
    && linkedMatchSlotStartAt
    && typeof linkedMatchDistanceKm === 'number'
    && isLinkedRoomLifecycle
  )
    ? {
        mode: room.mode,
        matchId: room.linkedMatchId,
        slotStartAt: linkedMatchSlotStartAt,
        distanceKm: linkedMatchDistanceKm,
        state: room.linkedMatchStatus === 'active' || room.state === 'active' || hasReachedOfficialStart
          ? 'active' as const
          : 'matched' as const,
      }
    : null;

  return {
    phase,
    hasLinkedMatch,
    canAcknowledgeCountdownReady: Boolean(
      room?.linkedMatchId
      && room.state === 'arming'
      && !isCountdownReady,
    ),
    canOpenLinkedMatch: Boolean(
      hasLinkedMatch
      && (phase === 'countdown' || phase === 'arenaHandoff' || phase === 'active'),
    ),
    shouldShowLoading: hasLinkedMatch && shouldShowPartyRunLoading(phase),
    shouldShowCountdown: Boolean(
      hasLinkedMatch
      && phase === 'countdown'
      && typeof remainingSeconds === 'number',
    ),
    shouldOpenArena,
    shouldOpenCountdownArena,
    shouldPreferArena: hasLinkedMatch && shouldPreferRoomLinkedArena(room?.linkedMatchStatus, remainingSeconds),
    linkedMatchContext,
  };
}

export function resolveActiveMatchId({
  matchMode,
  duelMatchId,
  groupMatchId,
  roomLinkedMatchContext,
}: ActiveMatchIdentityInput) {
  const roomActiveMatchId =
    roomLinkedMatchContext?.state === 'active'
    && roomLinkedMatchContext.mode === matchMode
      ? roomLinkedMatchContext.matchId
      : null;

  if (matchMode === 'duel') {
    return duelMatchId ?? roomActiveMatchId;
  }

  if (matchMode === 'group') {
    return groupMatchId ?? roomActiveMatchId;
  }

  return roomActiveMatchId;
}
