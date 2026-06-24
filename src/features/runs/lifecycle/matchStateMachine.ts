import type {
  RunningMatchState,
  RunningMatchStatusResponse,
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
  getMatchStartRemainingSeconds,
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

function getLinkedMatchSlotElapsedMs(
  linkedMatchSlotStartAt: string | null,
  syncedNowMs: number | null | undefined,
) {
  if (
    !linkedMatchSlotStartAt
    || typeof syncedNowMs !== 'number'
    || !Number.isFinite(syncedNowMs)
  ) {
    return null;
  }

  const slotStartMs = Date.parse(linkedMatchSlotStartAt);
  return Number.isFinite(slotStartMs) ? syncedNowMs - slotStartMs : null;
}

export function derivePartyRunStartPhase({
  roomState,
  linkedMatchStatus,
  isCountdownReady = false,
  remainingSeconds = null,
  linkedMatchId = null,
  linkedMatchSlotStartAt = null,
  syncedNowMs = null,
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
  // returns true. Some production devices also report `null` immediately
  // after the slot elapses; fall back to the absolute slot timestamp in that
  // gap. If the room still has a linked match (i.e. nothing cancelled it),
  // infer 'active' for a short grace window so the match arena stays mounted
  // while the server's status push is in flight.
  const linkedMatchSlotElapsedMs = getLinkedMatchSlotElapsedMs(linkedMatchSlotStartAt, syncedNowMs);
  const hasInferredActiveFromSlotElapsed = Boolean(
    linkedMatchId
    && linkedMatchSlotStartAt
    && (
      (
        typeof remainingSeconds === 'number'
        && remainingSeconds <= 0
        && remainingSeconds > -ACTIVE_INFERENCE_GRACE_SECONDS
      )
      || (
        linkedMatchSlotElapsedMs !== null
        && linkedMatchSlotElapsedMs >= 0
        && linkedMatchSlotElapsedMs < ACTIVE_INFERENCE_GRACE_SECONDS * 1000
      )
    ),
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
      return currentPhase === 'active' ? 'active' : 'arming';
    case 'countdownReadyAcked':
      return currentPhase === 'active' ? 'active' : 'readyAcked';
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
  syncedNowMs = null,
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
    syncedNowMs,
  });
  const hasLinkedMatch = Boolean(room?.linkedMatchId);
  const shouldOpenArena = hasLinkedMatch && shouldOpenPartyRunArena(phase);
  const shouldBuildLinkedMatchContext = Boolean(
    hasLinkedMatch
    && room
    && phase !== 'waiting',
  );
  const hasReachedOfficialStart = typeof remainingSeconds !== 'number';
  const linkedMatchContext = (
    room?.linkedMatchId
    && linkedMatchSlotStartAt
    && typeof linkedMatchDistanceKm === 'number'
    && shouldBuildLinkedMatchContext
  )
    ? {
        mode: room.mode,
        matchId: room.linkedMatchId,
        slotStartAt: linkedMatchSlotStartAt,
        distanceKm: linkedMatchDistanceKm,
        state: phase === 'active' || room.linkedMatchStatus === 'active' || room.state === 'active' || hasReachedOfficialStart
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
    shouldPreferArena: hasLinkedMatch && shouldPreferRoomLinkedArena(room?.linkedMatchStatus, remainingSeconds),
    linkedMatchContext,
  };
}

// ---------------------------------------------------------------------------
// Duel reservation waiting room (S4). When a 1:1 duel is `matched`, the running
// tab shows a "예약 대기실" view that simply waits for the slot start time. This
// pure helper derives everything that view needs from the slot time + synced
// clock, reusing the same party-run phase deriver so the duel reservation and
// the party-run waiting room agree on the start phase. It has NO host-start /
// ready / join machinery — a duel reservation auto-opens the arena at start.
// ---------------------------------------------------------------------------
export type DuelReservationView = {
  // Stable phase from derivePartyRunStartPhase: 'arming' (still far out),
  // 'countdown' (≤30s, show the centered overlay), 'arenaHandoff'/'active'
  // (let the existing arena auto-open take over).
  phase: PartyRunStartPhase;
  // Live seconds until slot start (null once the slot has fired).
  remainingSeconds: number | null;
  // '곧 시작' once we're inside the overlay window or the slot has fired, else 'N분 남음'.
  statusLabel: string;
  // True only inside the ≤30s overlay window — gates MatchStartCountdownOverlay.
  // The existing arena auto-open (duelShouldOpenCountdownArena, ≤20s) takes over after.
  shouldShowStartOverlay: boolean;
};

function buildDuelReservationStatusLabel(remainingSeconds: number | null): string {
  if (remainingSeconds === null) {
    return '곧 시작';
  }

  if (shouldShowMatchStartOverlay(remainingSeconds)) {
    return '곧 시작';
  }

  const remainingMinutes = Math.ceil(remainingSeconds / 60);
  return `${remainingMinutes}분 남음`;
}

export function deriveDuelReservationView({
  slotStartAt,
  syncedNowMs,
}: {
  slotStartAt: string | null | undefined;
  syncedNowMs: number;
}): DuelReservationView {
  const remainingSeconds = slotStartAt
    ? getMatchStartRemainingSeconds(slotStartAt, syncedNowMs)
    : null;
  const phase = derivePartyRunStartPhase({
    linkedMatchStatus: 'matched',
    remainingSeconds,
    linkedMatchId: slotStartAt ?? null,
    linkedMatchSlotStartAt: slotStartAt ?? null,
    syncedNowMs,
  });

  return {
    phase,
    remainingSeconds,
    statusLabel: buildDuelReservationStatusLabel(remainingSeconds),
    shouldShowStartOverlay: shouldShowMatchStartOverlay(remainingSeconds),
  };
}

// ---------------------------------------------------------------------------
// Duel reservation ROOM view (full-screen waiting room, modeled on the party
// room). Builds everything the screen renders from the live duel match status
// (fetched by matchId) plus the route params it was opened with as a fallback,
// and the synced clock. Pure + display-only: a matchmade duel has a FIXED
// opponent + distance and auto-starts at the slot, so there is no ready toggle,
// host start, invite, or distance editing — only the live countdown + cancel.
// ---------------------------------------------------------------------------
export type DuelReservationParticipant = {
  id: string;
  name: string;
  // 'host'-styled brand badge for "나", subtle badge for the opponent.
  badgeLabel: string | null;
  isSelf: boolean;
  statusLabel: string;
};

export type DuelReservationRoomViewInput = {
  // Live status fetched by matchId; null while loading or if it could not be read.
  matchStatus: RunningMatchStatusResponse | null;
  // Route-param fallbacks so the room still renders sensible copy before/without
  // a fresh status fetch (the upcoming card already knows these).
  fallbackSlotStartAt: string | null;
  fallbackDistanceKm: number | null;
  fallbackIsTestMatch: boolean;
  syncedNowMs: number;
};

export type DuelReservationRoomView = {
  // Shared start-phase + countdown derivation (same deriver as the party room).
  reservation: DuelReservationView;
  // Whether the reservation can still be cancelled (server `canCancel`, defaulting
  // to true only when the status hasn't loaded yet so the button isn't hidden
  // prematurely; the cancel handler re-checks the rule before calling the API).
  canCancel: boolean;
  // True once we positively know cancellation is locked (server said canCancel:false).
  cancelLocked: boolean;
  isTestMatch: boolean;
  distanceKm: number | null;
  distanceLabel: string;
  // "6.24 (수) 11:00 시작" (display-only).
  startTimeLabel: string | null;
  // The 나 + 상대 rows for the participant list.
  participants: DuelReservationParticipant[];
  // The footer copy under the summary.
  autoStartNotice: string;
};

function buildDuelReservationParticipants(
  matchStatus: RunningMatchStatusResponse | null,
): DuelReservationParticipant[] {
  const selfRow: DuelReservationParticipant = {
    id: 'self',
    name: '나',
    badgeLabel: '나',
    isSelf: true,
    statusLabel: '예약 완료',
  };

  const opponent = matchStatus?.opponent;
  const opponentRow: DuelReservationParticipant = {
    id: opponent?.id ?? 'opponent',
    name: opponent?.name ?? '상대',
    badgeLabel: '상대',
    isSelf: false,
    statusLabel: opponent?.name ? '예약 완료' : '상대 확인 중',
  };

  return [selfRow, opponentRow];
}

export function buildDuelReservationRoomView({
  matchStatus,
  fallbackSlotStartAt,
  fallbackDistanceKm,
  fallbackIsTestMatch,
  syncedNowMs,
}: DuelReservationRoomViewInput): DuelReservationRoomView {
  const slotStartAt = matchStatus?.slotStartAt ?? fallbackSlotStartAt;
  const distanceKm = matchStatus?.distanceKm ?? fallbackDistanceKm;
  const isTestMatch = Boolean(matchStatus?.isTestMatch ?? fallbackIsTestMatch);

  const reservation = deriveDuelReservationView({
    slotStartAt,
    syncedNowMs,
  });

  // Default to cancelable while the status is still loading so we don't flash the
  // locked copy; the cancel handler enforces the real rule before the API call.
  const canCancel = matchStatus?.canCancel ?? true;

  return {
    reservation,
    canCancel,
    cancelLocked: matchStatus?.canCancel === false,
    isTestMatch,
    distanceKm,
    distanceLabel: typeof distanceKm === 'number' ? `${distanceKm.toFixed(1)}km` : '거리 미정',
    startTimeLabel: slotStartAt ?? null,
    participants: buildDuelReservationParticipants(matchStatus),
    autoStartNotice: isTestMatch
      ? '테스트 카운트다운이 끝나면 자동으로 대결이 시작돼요.'
      : '시작 시간이 되면 자동으로 대결이 시작돼요.',
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
