import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartyRunFlowSnapshot,
  buildMatchParticipantStatusLabel,
  buildMatchTransitionNotice,
  canAutoStartMatchTracking,
  canShowMatchCountdown,
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
  shouldOpenPartyRunCountdownArena,
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
  assert.equal(resolvePartyRunStartPhase('arming', { type: 'hostStartRequested' }), 'arming');
  assert.equal(resolvePartyRunStartPhase('readyAcked', { type: 'hostStartRequested' }), 'readyAcked');
  assert.equal(resolvePartyRunStartPhase('countdown', { type: 'hostStartRequested' }), 'countdown');
  assert.equal(resolvePartyRunStartPhase('arenaHandoff', { type: 'hostStartRequested' }), 'arenaHandoff');
  assert.equal(resolvePartyRunStartPhase('active', { type: 'hostStartRequested' }), 'active');
  assert.equal(resolvePartyRunStartPhase('arming', { type: 'countdownReadyAcked' }), 'readyAcked');
  assert.equal(resolvePartyRunStartPhase('countdown', { type: 'countdownReadyAcked' }), 'countdown');
  assert.equal(resolvePartyRunStartPhase('arenaHandoff', { type: 'countdownReadyAcked' }), 'arenaHandoff');
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
  assert.equal(shouldOpenPartyRunCountdownArena('waiting'), false);
  assert.equal(shouldOpenPartyRunCountdownArena('arming'), false);
  assert.equal(shouldOpenPartyRunCountdownArena('readyAcked'), false);
  assert.equal(shouldOpenPartyRunCountdownArena('countdown'), true);
  assert.equal(shouldOpenPartyRunCountdownArena('arenaHandoff'), true);
  assert.equal(shouldOpenPartyRunCountdownArena('active'), true);

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

  // Slot has just fired but the server's 'active' status push hasn't
  // landed yet. Within the grace window the phase stays 'active' so the
  // match arena doesn't unmount and drop the user back to the running tab.
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
  // Within the 120s grace window we keep inferring 'active' even when the
  // slot has been elapsed for a while (covers slow start API responses).
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: -90,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-11T23:58:30.000Z',
  }), 'active');
  // Outside the 120s grace window we stop inferring (treat it as stale).
  assert.equal(derivePartyRunStartPhase({
    roomState: 'arming',
    linkedMatchStatus: null,
    isCountdownReady: false,
    remainingSeconds: -180,
    linkedMatchId: 'room-match-1',
    linkedMatchSlotStartAt: '2026-05-11T23:57:00.000Z',
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
  assert.equal(countdown.shouldOpenCountdownArena, true);

  const handoff = buildPartyRunFlowSnapshot({
    room: { ...room, state: 'countdown' },
    isCountdownReady: true,
    remainingSeconds: 20,
  });
  assert.equal(handoff.phase, 'arenaHandoff');
  assert.equal(handoff.shouldOpenArena, true);
  assert.equal(handoff.shouldOpenCountdownArena, true);
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
  assert.equal(justBeforeHandoff.shouldOpenCountdownArena, true);

  const active = buildPartyRunFlowSnapshot({
    room: { ...room, state: 'active', linkedMatchStatus: 'active' },
    isCountdownReady: true,
    remainingSeconds: null,
  });
  assert.equal(active.phase, 'active');
  assert.equal(active.linkedMatchContext?.state, 'active');
});
