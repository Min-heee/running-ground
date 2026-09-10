import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import {
  buildDuelReservationRoomView,
  buildGroupReservationRoomView,
  buildPartyRunFlowSnapshot,
  buildMatchParticipantStatusLabel,
  buildMatchTransitionNotice,
  canAutoStartMatchTracking,
  canShowMatchCountdown,
  deriveDuelReservationView,
  derivePartyRunStartPhase,
  isBlockingMatchState,
  isLiveMatchState,
  isTerminalMatchLifecycleState,
  resolveActiveMatchId,
  resolvePartyRunStartPhase,
  resolveRunTrackingState,
  shouldAutoFocusMatchArena,
  shouldEnterMatchArenaForLifecycle,
  shouldKeepMatchArenaForceOpen,
  shouldOpenPartyRunArena,
  shouldPreferRoomLinkedArena,
  shouldShowPartyRunLoading,
  shouldUseCenteredMatchCountdown,
  shouldUseFullscreenMatchCountdown,
} from './matchStateMachine';

test('match state guards centralize blocking and live states', () => {
  assert.equal(isBlockingMatchState('idle'), false);
  assert.equal(isBlockingMatchState('waiting'), true);
  assert.equal(isBlockingMatchState('matched'), true);
  assert.equal(isBlockingMatchState('active'), true);

  assert.equal(isLiveMatchState('waiting'), false);
  assert.equal(isLiveMatchState('matched'), true);
  assert.equal(isLiveMatchState('active'), true);
  assert.equal(canShowMatchCountdown('matched'), true);
  assert.equal(canAutoStartMatchTracking('active'), true);
});

test('run tracking state transitions ignore invalid jumps', () => {
  assert.equal(resolveRunTrackingState('idle', 'requestStart'), 'starting');
  assert.equal(resolveRunTrackingState('starting', 'start'), 'running');
  assert.equal(resolveRunTrackingState('running', 'pause'), 'paused');
  assert.equal(resolveRunTrackingState('paused', 'resume'), 'running');
  assert.equal(resolveRunTrackingState('running', 'requestSave'), 'saving');
  assert.equal(resolveRunTrackingState('running', 'forfeit'), 'saving');
  assert.equal(resolveRunTrackingState('saving', 'saved'), 'idle');
  assert.equal(resolveRunTrackingState('idle', 'pause'), 'idle');
});

test('terminal lifecycle states are explicit', () => {
  assert.equal(isTerminalMatchLifecycleState('idle'), true);
  assert.equal(isTerminalMatchLifecycleState('forfeited'), true);
  assert.equal(isTerminalMatchLifecycleState('active'), false);
  assert.equal(isTerminalMatchLifecycleState('saving'), false);
});

test('participant live status labels are stable Korean copy', () => {
  assert.equal(buildMatchParticipantStatusLabel('running'), '러닝 중');
  assert.equal(buildMatchParticipantStatusLabel('background'), '백그라운드');
  assert.equal(buildMatchParticipantStatusLabel('forfeited'), '포기함');
  assert.equal(buildMatchParticipantStatusLabel(undefined), '준비됨');
});

test('match transition notices cover cleanup and rematch cases', () => {
  assert.equal(buildMatchTransitionNotice('duel', 'waiting', 'idle'), '대기 시간이 지나 자동으로 정리됐어요. 다시 찾으면 새 대기열로 들어가요.');
  assert.equal(buildMatchTransitionNotice('duel', 'matched', 'waiting'), '상대가 빠져서 다시 비슷한 상대를 찾는 중이에요.');
  assert.equal(buildMatchTransitionNotice('group', 'active', 'waiting'), '일부 참가자가 빠져서 다시 비슷한 그룹을 모으는 중이에요.');
  assert.equal(buildMatchTransitionNotice('group', 'active', 'idle'), '매칭이 정리됐어요. 다시 찾으면 새 대기열로 들어가요.');
  assert.equal(buildMatchTransitionNotice('duel', 'active', 'active'), null);
});

test('countdown visibility separates fullscreen and arena handoff windows', () => {
  assert.equal(shouldUseFullscreenMatchCountdown({ hasCountdownEntry: true, remainingSeconds: 30 }), true);
  assert.equal(shouldUseFullscreenMatchCountdown({ hasCountdownEntry: true, remainingSeconds: 20 }), false);
  assert.equal(shouldUseCenteredMatchCountdown({
    hasCountdownEntry: true,
    remainingSeconds: 20,
    showLiveArena: true,
    hasRoomCountdownEntry: false,
  }), true);
  assert.equal(shouldUseCenteredMatchCountdown({
    hasCountdownEntry: true,
    remainingSeconds: 20,
    showLiveArena: false,
    hasRoomCountdownEntry: false,
  }), false);
});

test('arena state machine covers 20-second handoff and active pinning', () => {
  assert.equal(shouldAutoFocusMatchArena(true, 20), true);
  assert.equal(shouldAutoFocusMatchArena(true, 21), false);
  assert.equal(shouldAutoFocusMatchArena(false, 20), false);
  assert.equal(shouldPreferRoomLinkedArena('matched', 20), true);
  assert.equal(shouldPreferRoomLinkedArena('matched', 21), false);
  assert.equal(shouldPreferRoomLinkedArena('active', null), true);
  assert.equal(shouldEnterMatchArenaForLifecycle({
    duelState: 'matched',
    groupState: 'idle',
    duelShouldOpenCountdownArena: true,
    groupShouldOpenCountdownArena: false,
  }), true);
  assert.equal(shouldEnterMatchArenaForLifecycle({
    duelState: 'waiting',
    groupState: 'idle',
    duelShouldOpenCountdownArena: false,
    groupShouldOpenCountdownArena: false,
  }), false);
});

test('arena force-open guard keeps party run stable during focused transitions', () => {
  assert.equal(shouldKeepMatchArenaForceOpen({
    isResolvingFocusedMatch: true,
    duelState: 'idle',
    groupState: 'idle',
    duelShouldOpenCountdownArena: false,
    groupShouldOpenCountdownArena: false,
    roomShouldOpenCountdownArena: false,
    forceOpenActiveMatch: false,
    shouldKeepRunningMatchArena: false,
  }), true);
  assert.equal(shouldKeepMatchArenaForceOpen({
    isResolvingFocusedMatch: false,
    duelState: 'matched',
    groupState: 'idle',
    duelShouldOpenCountdownArena: false,
    groupShouldOpenCountdownArena: false,
    roomShouldOpenCountdownArena: false,
    forceOpenActiveMatch: true,
    shouldKeepRunningMatchArena: false,
  }), true);
  assert.equal(shouldKeepMatchArenaForceOpen({
    isResolvingFocusedMatch: false,
    duelState: 'idle',
    groupState: 'idle',
    duelShouldOpenCountdownArena: false,
    groupShouldOpenCountdownArena: false,
    roomShouldOpenCountdownArena: false,
    forceOpenActiveMatch: false,
    shouldKeepRunningMatchArena: false,
  }), false);
});

test('active match identity prefers explicit match status and falls back to active room link', () => {
  assert.equal(resolveActiveMatchId({
    matchMode: 'duel',
    duelMatchId: 'duel-status-match',
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-match', state: 'active' },
  }), 'duel-status-match');
  assert.equal(resolveActiveMatchId({
    matchMode: 'duel',
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-match', state: 'active' },
  }), 'room-match');
  assert.equal(resolveActiveMatchId({
    matchMode: 'group',
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-match', state: 'active' },
  }), null);
  assert.equal(resolveActiveMatchId({
    matchMode: 'room',
    roomLinkedMatchContext: { mode: 'duel', matchId: 'room-match', state: 'active' },
  }), null);
});

test('party run start phase normalizes host loading, countdown, arena handoff, and active states', () => {
  assert.equal(resolvePartyRunStartPhase('waiting', { type: 'hostStartRequested' }), 'arming');
  assert.equal(resolvePartyRunStartPhase('arming', { type: 'countdownReadyAcked' }), 'readyAcked');
  assert.equal(resolvePartyRunStartPhase('readyAcked', {
    type: 'serverSnapshot',
    payload: { roomState: 'arming', isCountdownReady: true },
  }), 'readyAcked');
  assert.equal(derivePartyRunStartPhase({
    roomState: 'countdown',
    linkedMatchStatus: 'matched',
    isCountdownReady: true,
    remainingSeconds: 30,
  }), 'countdown');
  assert.equal(derivePartyRunStartPhase({
    roomState: 'countdown',
    linkedMatchStatus: 'matched',
    isCountdownReady: true,
    remainingSeconds: 20,
  }), 'arenaHandoff');
  assert.equal(derivePartyRunStartPhase({
    roomState: 'active',
    linkedMatchStatus: 'active',
    remainingSeconds: 0,
  }), 'active');
  assert.equal(shouldShowPartyRunLoading('arming'), true);
  assert.equal(shouldShowPartyRunLoading('countdown'), false);
  assert.equal(shouldOpenPartyRunArena('arenaHandoff'), true);
  assert.equal(shouldOpenPartyRunArena('countdown'), false);

  // Host/guest sync fallback: server 'matched' hasn't arrived yet but the
  // linked match identity is known and the slot is inside the overlay
  // window. Both clients should reach 'countdown' / 'arenaHandoff' off the
  // slot alone, so neither sits on the loading banner while the other
  // counts down (two-phone bug from the perf review).
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: 25,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-12T00:00:25.000Z',
  }), 'countdown');
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: 15,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-12T00:00:15.000Z',
  }), 'arenaHandoff');
  // Without a linked match the fallback must NOT trigger — pre-match lobbies
  // should still show the waiting state.
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: 25,
    linkedMatchId: null,
    linkedMatchSlotStartAt: null,
  }), 'arming');
  // Inside the inferred matched window (60s) but outside the visible
  // overlay window (30s) — phase should still infer 'arming' / 'readyAcked',
  // not 'waiting', so the host phone gets out of the 'no linked match'
  // branch and is ready to flip into 'countdown' the moment overlay opens.
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: 55,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-12T00:00:55.000Z',
  }), 'arming');
  // Outside the 60s matched window the fallback also must NOT trigger.
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: 180,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-12T00:03:00.000Z',
  }), 'arming');

  // STAGE 2 (clean core): the SLOT is the single gate. remaining≤0 → 'active' the
  // instant the slot is reached, with NO inference-grace cap. The match arena stays
  // mounted because 'active' is reported as soon as the slot fires (not deferred to a
  // server status push), and stays 'active' however long the slot has been past.
  assert.equal(derivePartyRunStartPhase({
    roomState: 'countdown',
    linkedMatchStatus: 'matched',
    isCountdownReady: true,
    remainingSeconds: 0,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-12T00:00:00.000Z',
  }), 'active');
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: -15,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-11T23:59:45.000Z',
  }), 'active');
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: -90,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-11T23:58:30.000Z',
  }), 'active');
  // No grace cap: a slot elapsed long ago is STILL 'active' on remaining≤0 alone —
  // there is no upper bound that re-falls-back to 'arming' (the old 120s ceiling is gone).
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: -180,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-11T23:57:00.000Z',
  }), 'active');
  // remaining=null but the SYNCED clock is past the slot → 'active' (slot reached by clock).
  assert.equal(derivePartyRunStartPhase({
    roomState: 'countdown',
    linkedMatchStatus: 'matched',
    isCountdownReady: true,
    remainingSeconds: null,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-12T00:00:00.000Z',
    syncedNowMs: Date.parse('2026-05-12T00:00:15.000Z'),
  }), 'active');
  // remaining=null and the synced clock is well past the slot → still 'active' (no grace cap).
  assert.equal(derivePartyRunStartPhase({
    roomState: 'countdown',
    linkedMatchStatus: 'matched',
    isCountdownReady: false,
    remainingSeconds: null,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-12T00:00:00.000Z',
    syncedNowMs: Date.parse('2026-05-12T00:03:00.000Z'),
  }), 'active');
  // remaining=null, syncedNow=null, slot far in the FUTURE → pre-slot, no countdown yet → arming.
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: null,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-12T00:03:00.000Z',
    syncedNowMs: null,
  }), 'arming');
});

test('party run flow snapshot centralizes loading, countdown, arena, and ack decisions', () => {
  const room = {
    mode: 'duel' as const,
    state: 'arming' as const,
    distanceKm: 5,
    slotStartAt: '2026-05-12T00:00:30.000Z',
    linkedMatchId: 'room-match-1',
    linkedMatchStatus: 'matched' as const,
    linkedMatchSlotStartAt: '2026-05-12T00:00:30.000Z',
    linkedMatchDistanceKm: 5,
  };

  const loading = buildPartyRunFlowSnapshot({
    room,
    isCountdownReady: false,
    remainingSeconds: 45,
  });
  assert.equal(loading.phase, 'arming');
  assert.equal(loading.canAcknowledgeCountdownReady, true);
  assert.equal(loading.shouldShowLoading, true);
  assert.equal(loading.canOpenLinkedMatch, false);

  const countdown = buildPartyRunFlowSnapshot({
    room: { ...room, state: 'countdown' },
    isCountdownReady: true,
    remainingSeconds: 30,
  });
  assert.equal(countdown.phase, 'countdown');
  assert.equal(countdown.canAcknowledgeCountdownReady, false);
  assert.equal(countdown.shouldShowCountdown, true);
  assert.equal(countdown.canOpenLinkedMatch, true);
  assert.equal(countdown.shouldOpenArena, false);

  const handoff = buildPartyRunFlowSnapshot({
    room: { ...room, state: 'countdown' },
    isCountdownReady: true,
    remainingSeconds: 20,
  });
  assert.equal(handoff.phase, 'arenaHandoff');
  assert.equal(handoff.shouldOpenArena, true);
  assert.equal(handoff.shouldPreferArena, true);
  assert.deepEqual(handoff.linkedMatchContext, {
    mode: 'duel',
    matchId: 'room-match-1',
    slotStartAt: '2026-05-12T00:00:30.000Z',
    distanceKm: 5,
    state: 'matched',
  });

  const justBeforeHandoff = buildPartyRunFlowSnapshot({
    room: { ...room, state: 'countdown' },
    isCountdownReady: true,
    remainingSeconds: 21,
  });
  assert.equal(justBeforeHandoff.phase, 'countdown');
  assert.equal(justBeforeHandoff.shouldShowCountdown, true);
  assert.equal(justBeforeHandoff.shouldOpenArena, false);

  const active = buildPartyRunFlowSnapshot({
    room: { ...room, state: 'active', linkedMatchStatus: 'active' },
    isCountdownReady: true,
    remainingSeconds: null,
  });
  assert.equal(active.phase, 'active');
  assert.equal(active.linkedMatchContext?.state, 'active');
});

test('party run flow snapshot builds linked context when room state lags behind match phase', () => {
  const waitingRoom = {
    mode: 'duel' as const,
    state: 'waiting' as const,
    distanceKm: 5,
    slotStartAt: '2026-05-12T00:00:30.000Z',
    linkedMatchId: 'room-match-1',
    linkedMatchStatus: 'matched' as const,
  };

  const handoff = buildPartyRunFlowSnapshot({
    room: waitingRoom,
    isCountdownReady: true,
    remainingSeconds: 20,
  });
  assert.equal(handoff.phase, 'arenaHandoff');
  assert.equal(handoff.shouldOpenArena, true);
  assert.deepEqual(handoff.linkedMatchContext, {
    mode: 'duel',
    matchId: 'room-match-1',
    slotStartAt: '2026-05-12T00:00:30.000Z',
    distanceKm: 5,
    state: 'matched',
  });

  const active = buildPartyRunFlowSnapshot({
    room: {
      ...waitingRoom,
      linkedMatchStatus: undefined,
      slotStartAt: '2026-05-12T00:00:00.000Z',
    },
    isCountdownReady: false,
    remainingSeconds: -15,
    syncedNowMs: Date.parse('2026-05-12T00:00:15.000Z'),
  });
  assert.equal(active.phase, 'active');
  assert.deepEqual(active.linkedMatchContext, {
    mode: 'duel',
    matchId: 'room-match-1',
    slotStartAt: '2026-05-12T00:00:00.000Z',
    distanceKm: 5,
    state: 'active',
  });
});

test('duel reservation view shows minutes-remaining far out and 곧 시작 inside overlay/start', () => {
  const slotStartAt = '2026-06-24T18:00:00.000Z';
  const slotStartMs = Date.parse(slotStartAt);

  // 5 minutes out: still 'arming', shows "5분 남음", no start overlay.
  const farOut = deriveDuelReservationView({
    slotStartAt,
    syncedNowMs: slotStartMs - 5 * 60 * 1000,
  });
  assert.equal(farOut.phase, 'arming');
  assert.equal(farOut.remainingSeconds, 300);
  assert.equal(farOut.statusLabel, '5분 남음');
  assert.equal(farOut.shouldShowStartOverlay, false);

  // 25 seconds out: inside the ≤30s overlay window -> 'countdown', "곧 시작", overlay on.
  const insideOverlay = deriveDuelReservationView({
    slotStartAt,
    syncedNowMs: slotStartMs - 25 * 1000,
  });
  assert.equal(insideOverlay.phase, 'countdown');
  assert.equal(insideOverlay.remainingSeconds, 25);
  assert.equal(insideOverlay.statusLabel, '곧 시작');
  assert.equal(insideOverlay.shouldShowStartOverlay, true);

  // 15 seconds out: inside the ≤20s arena-handoff window -> 'arenaHandoff' (arena auto-opens),
  // overlay no longer the gate (the centered arena countdown takes over).
  const arenaHandoff = deriveDuelReservationView({
    slotStartAt,
    syncedNowMs: slotStartMs - 15 * 1000,
  });
  assert.equal(arenaHandoff.phase, 'arenaHandoff');

  // At/after slot start: remaining is null, status is "곧 시작", overlay off (arena owns it).
  const atStart = deriveDuelReservationView({
    slotStartAt,
    syncedNowMs: slotStartMs,
  });
  assert.equal(atStart.remainingSeconds, null);
  assert.equal(atStart.statusLabel, '곧 시작');
  assert.equal(atStart.shouldShowStartOverlay, false);
});

test('duel reservation view tolerates a missing slot start time', () => {
  const view = deriveDuelReservationView({ slotStartAt: null, syncedNowMs: Date.now() });
  assert.equal(view.remainingSeconds, null);
  assert.equal(view.shouldShowStartOverlay, false);
  assert.equal(view.statusLabel, '곧 시작');
});

function buildDuelStatus(
  overrides: Partial<RunningMatchStatusResponse> = {},
): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'duel',
    state: 'matched',
    distanceKm: 5,
    slotStartAt: '2026-06-24T02:00:00.000Z',
    slotLabel: '11:00',
    paceBandLabel: '',
    levelBandLabel: '',
    criteriaSummary: '',
    estimatedWaitMinutes: 0,
    participantCount: 2,
    acceptedCount: 2,
    capacity: 2,
    userAccepted: true,
    readyToStart: false,
    canCancel: true,
    opponent: {
      id: 'opp-1',
      name: '김러너',
      districtName: '강남구',
      averagePace: "5'30\"",
      levelLabel: '러너',
      weeklyDistanceKm: 12,
      lifetimeDistanceKm: 200,
      compatibilitySummary: '',
    },
    ...overrides,
  };
}

test('duel reservation room view prefers live status, builds 나+상대 rows', () => {
  const status = buildDuelStatus();
  const slotStartMs = Date.parse(status.slotStartAt);

  const view = buildDuelReservationRoomView({
    matchStatus: status,
    fallbackSlotStartAt: null,
    fallbackDistanceKm: null,
    fallbackIsTestMatch: false,
    syncedNowMs: slotStartMs - 5 * 60 * 1000,
  });

  assert.equal(view.distanceLabel, '5.0km');
  assert.equal(view.isTestMatch, false);
  assert.equal(view.canCancel, true);
  assert.equal(view.cancelLocked, false);
  assert.equal(view.startTimeLabel, status.slotStartAt);
  assert.equal(view.reservation.statusLabel, '5분 남음');
  assert.equal(view.autoStartNotice, '시작 시간이 되면 자동으로 대결이 시작돼요.');
  assert.equal(view.participants.length, 2);
  assert.deepEqual(
    view.participants.map((participant) => participant.name),
    ['나', '김러너'],
  );
  assert.equal(view.participants[0].isSelf, true);
  assert.equal(view.participants[1].isSelf, false);
});

test('duel reservation room view falls back to route params before status loads', () => {
  const slotStartAt = '2026-06-24T02:00:00.000Z';
  const slotStartMs = Date.parse(slotStartAt);

  const view = buildDuelReservationRoomView({
    matchStatus: null,
    fallbackSlotStartAt: slotStartAt,
    fallbackDistanceKm: 7,
    fallbackIsTestMatch: true,
    syncedNowMs: slotStartMs - 60 * 1000,
  });

  assert.equal(view.distanceLabel, '7.0km');
  assert.equal(view.isTestMatch, true);
  // Defaults to cancelable while status hasn't loaded so the button isn't hidden early.
  assert.equal(view.canCancel, true);
  assert.equal(view.cancelLocked, false);
  assert.equal(view.startTimeLabel, slotStartAt);
  assert.equal(view.autoStartNotice, '테스트 카운트다운이 끝나면 자동으로 대결이 시작돼요.');
  // Opponent unknown without a status -> placeholder name + "확인 중" status.
  assert.equal(view.participants[1].name, '상대');
  assert.equal(view.participants[1].statusLabel, '상대 확인 중');
});

test('duel reservation room view locks cancel when the server says canCancel:false', () => {
  const status = buildDuelStatus({ canCancel: false });

  const view = buildDuelReservationRoomView({
    matchStatus: status,
    fallbackSlotStartAt: null,
    fallbackDistanceKm: null,
    fallbackIsTestMatch: false,
    syncedNowMs: Date.parse(status.slotStartAt) - 30 * 60 * 1000,
  });

  assert.equal(view.canCancel, false);
  assert.equal(view.cancelLocked, true);
});

function buildGroupParticipant(
  seedRank: number,
  name: string,
): NonNullable<RunningMatchStatusResponse['participants']>[number] {
  return {
    id: `g-${seedRank}`,
    name,
    districtName: '강남구',
    averagePace: "5'30\"",
    levelLabel: '러너',
    weeklyDistanceKm: 12,
    lifetimeDistanceKm: 200,
    seedRank,
    seedSummary: '',
  };
}

function buildGroupStatus(
  overrides: Partial<RunningMatchStatusResponse> = {},
): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'group',
    state: 'matched',
    distanceKm: 5,
    slotStartAt: '2026-06-24T02:00:00.000Z',
    slotLabel: '11:00',
    paceBandLabel: '',
    levelBandLabel: '',
    criteriaSummary: '',
    estimatedWaitMinutes: 0,
    participantCount: 3,
    acceptedCount: 3,
    capacity: 3,
    userAccepted: true,
    readyToStart: false,
    canCancel: true,
    mySeedRank: 2,
    // Deliberately out of order to prove the view sorts by seedRank.
    participants: [
      buildGroupParticipant(3, '박러너'),
      buildGroupParticipant(1, '김러너'),
      buildGroupParticipant(2, '이러너'),
    ],
    ...overrides,
  };
}

test('group reservation room view lists the whole roster ordered by seedRank, marks 나', () => {
  const status = buildGroupStatus();
  const slotStartMs = Date.parse(status.slotStartAt);

  const view = buildGroupReservationRoomView({
    matchStatus: status,
    fallbackSlotStartAt: null,
    fallbackDistanceKm: null,
    fallbackIsTestMatch: false,
    fallbackParticipantCount: null,
    syncedNowMs: slotStartMs - 5 * 60 * 1000,
  });

  assert.equal(view.distanceLabel, '5.0km');
  assert.equal(view.participantCountLabel, '3명');
  assert.equal(view.isTestMatch, false);
  assert.equal(view.canCancel, true);
  assert.equal(view.cancelLocked, false);
  assert.equal(view.startTimeLabel, status.slotStartAt);
  assert.equal(view.reservation.statusLabel, '5분 남음');
  assert.equal(view.autoStartNotice, '시작 시간이 되면 자동으로 대결이 시작돼요.');
  // Sorted by seedRank 1,2,3. 내 행도 로스터의 실제 닉네임 (오너 2026-08-28) —
  // '나'는 이름이 아니라 뱃지 마커로만 남는다.
  assert.deepEqual(
    view.participants.map((participant) => participant.name),
    ['김러너', '이러너', '박러너'],
  );
  // mySeedRank === 2 -> the seedRank-2 member is 나.
  assert.equal(view.participants[1].isSelf, true);
  assert.equal(view.participants[1].badgeLabel, '나');
  assert.equal(view.participants[0].isSelf, false);
  assert.equal(view.participants[0].badgeLabel, '순서 1');
});

test('group reservation room view falls back to route params before status loads', () => {
  const slotStartAt = '2026-06-24T02:00:00.000Z';
  const slotStartMs = Date.parse(slotStartAt);

  const view = buildGroupReservationRoomView({
    matchStatus: null,
    fallbackSlotStartAt: slotStartAt,
    fallbackDistanceKm: 7,
    fallbackIsTestMatch: true,
    fallbackParticipantCount: 4,
    syncedNowMs: slotStartMs - 60 * 1000,
  });

  assert.equal(view.distanceLabel, '7.0km');
  assert.equal(view.isTestMatch, true);
  assert.equal(view.participantCountLabel, '4명');
  assert.equal(view.canCancel, true);
  assert.equal(view.cancelLocked, false);
  assert.equal(view.startTimeLabel, slotStartAt);
  assert.equal(view.autoStartNotice, '테스트 카운트다운이 끝나면 자동으로 대결이 시작돼요.');
  // No roster yet -> empty list (the screen shows a loading line).
  assert.equal(view.participants.length, 0);
});

test('group reservation room view locks cancel when the server says canCancel:false', () => {
  const status = buildGroupStatus({ canCancel: false });

  const view = buildGroupReservationRoomView({
    matchStatus: status,
    fallbackSlotStartAt: null,
    fallbackDistanceKm: null,
    fallbackIsTestMatch: false,
    fallbackParticipantCount: null,
    syncedNowMs: Date.parse(status.slotStartAt) - 30 * 60 * 1000,
  });

  assert.equal(view.canCancel, false);
  assert.equal(view.cancelLocked, true);
});

// 예약 파티런 (오너 2026-09-09): 수락 순간 링크된 예약 방은 카운트다운 창(30초) 밖에서는 'waiting'.
// 로딩 오버레이·ACK 워치독·arming 폴링이 며칠간 돌면 안 된다. 방장 시작 방은 그대로 'arming'.
test('linked scheduled room far from its slot derives waiting (reserved), host-start still arms', () => {
  const slotStartAt = '2026-06-08T12:00:00.000Z';
  const reservedRoom = {
    roomId: 'room-1',
    inviteToken: 'ABC123',
    inviteLink: 'https://example.com/ABC123',
    mode: 'duel' as const,
    state: 'arming' as const,
    startMode: 'scheduled' as const,
    distanceKm: 5,
    slotStartAt,
    slotLabel: '12:00',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    hostUserId: 'host',
    hostName: 'Host',
    participants: [],
    invitedFriendIds: [],
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'matched' as const,
    linkedMatchSlotStartAt: slotStartAt,
    linkedMatchDistanceKm: 5,
  };

  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: 'matched',
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: slotStartAt,
    remainingSeconds: 3 * 3600,
    startMode: 'scheduled',
  }), 'waiting');
  // 같은 입력이 방장 시작 방이면 예전 그대로 arming.
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: 'matched',
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: slotStartAt,
    remainingSeconds: 3 * 3600,
    startMode: 'host',
  }), 'arming');
  // 카운트다운 창에 들어오면 예약 방도 countdown → arenaHandoff.
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: 'matched',
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: slotStartAt,
    remainingSeconds: 28,
    startMode: 'scheduled',
  }), 'countdown');
  assert.equal(derivePartyRunStartPhase({
    roomState: 'countdown',
    linkedMatchStatus: 'matched',
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: slotStartAt,
    remainingSeconds: 15,
    startMode: 'scheduled',
  }), 'arenaHandoff');

  const farFlow = buildPartyRunFlowSnapshot({
    room: reservedRoom,
    isCountdownReady: false,
    remainingSeconds: 3 * 3600,
    syncedNowMs: Date.parse(slotStartAt) - 3 * 3600 * 1000,
  });
  assert.equal(farFlow.phase, 'waiting');
  assert.equal(farFlow.shouldShowLoading, false);
  assert.equal(farFlow.canAcknowledgeCountdownReady, false);
  assert.equal(farFlow.canOpenLinkedMatch, false);
  assert.equal(farFlow.shouldOpenArena, false);
  assert.equal(farFlow.linkedMatchContext, null);

  const nearFlow = buildPartyRunFlowSnapshot({
    room: reservedRoom,
    isCountdownReady: false,
    remainingSeconds: 25,
    syncedNowMs: Date.parse(slotStartAt) - 25 * 1000,
  });
  assert.equal(nearFlow.phase, 'countdown');
  assert.equal(nearFlow.canOpenLinkedMatch, true);
  assert.equal(nearFlow.shouldShowCountdown, true);
});
