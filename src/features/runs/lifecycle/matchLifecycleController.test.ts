import { strict as assert } from 'node:assert';
import test from 'node:test';
import type {
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import {
  buildMatchLifecycleController,
  type MatchLifecycleControllerInput,
} from '@/features/runs/lifecycle/matchLifecycleController';

function status(overrides: Partial<RunningMatchStatusResponse>): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'duel',
    state: 'idle',
    distanceKm: 5,
    slotStartAt: '2026-05-14T12:00:00.000Z',
    slotLabel: '테스트',
    paceBandLabel: '테스트',
    levelBandLabel: '테스트',
    criteriaSummary: '테스트',
    estimatedWaitMinutes: 0,
    participantCount: 1,
    acceptedCount: 1,
    capacity: 2,
    userAccepted: true,
    readyToStart: false,
    ...overrides,
  };
}

function room(overrides: Partial<RunningMatchRoom>): RunningMatchRoom {
  return {
    roomId: 'room-1',
    inviteToken: 'ABC123',
    inviteLink: 'https://example.com/ABC123',
    mode: 'duel',
    state: 'waiting',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: '2026-05-14T12:00:00.000Z',
    slotLabel: '테스트',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    hostUserId: 'user-1',
    hostName: '나',
    participants: [],
    invitedFriendIds: [],
    ...overrides,
  };
}

function duelOpponent(
  overrides: Partial<NonNullable<RunningMatchStatusResponse['opponent']>> = {},
): NonNullable<RunningMatchStatusResponse['opponent']> {
  return {
    id: 'opponent',
    name: '상대',
    districtName: '일산동구',
    averagePace: '06:20/km',
    levelLabel: 'Lv.4',
    weeklyDistanceKm: 20,
    lifetimeDistanceKm: 120,
    compatibilitySummary: '비슷한 러너',
    ...overrides,
  };
}

function baseInput(overrides: Partial<MatchLifecycleControllerInput> = {}): MatchLifecycleControllerInput {
  const matchRoom = overrides.matchRoom ?? null;
  const visibleMatchRoom = overrides.visibleMatchRoom ?? matchRoom;
  const visiblePartyRunFlow = overrides.visiblePartyRunFlow
    ?? buildPartyRunFlowSnapshot({ room: visibleMatchRoom });
  const matchRoomFlow = overrides.matchRoomFlow
    ?? buildPartyRunFlowSnapshot({ room: matchRoom });

  return {
    matchMode: 'solo',
    trackingStatus: 'idle',
    isRunning: false,
    isCurrentUserForfeited: false,
    liveMatchHeavyWorkReady: true,
    visiblePartyRunFlow,
    matchRoomFlow,
    matchRoom,
    visibleMatchRoom,
    roomLinkedMatchContext: visiblePartyRunFlow.linkedMatchContext,
    duelMatchState: 'idle',
    groupMatchState: 'idle',
    duelMatchStatus: null,
    groupMatchStatus: null,
    duelStartCountdownSeconds: null,
    groupStartCountdownSeconds: null,
    syncedNowMs: Date.parse('2026-05-14T12:05:00.000Z'),
    ...overrides,
  };
}

test('lifecycle controller keeps waiting party room passive for side effects', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'room',
    matchRoom: room({ state: 'waiting' }),
  }));

  assert.equal(controller.stage, 'waiting');
  assert.equal(controller.source, 'none');
  assert.equal(controller.effects.shouldPollRoom, false);
  assert.equal(controller.effects.shouldNavigateLinkedMatch, false);
  assert.equal(controller.effects.shouldRunHeartbeat, false);
});

test('waiting direct match does not start GPS or heartbeat', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'idle',
    isRunning: false,
    duelMatchState: 'idle',
    duelMatchStatus: status({
      state: 'idle',
      matchId: 'duel-waiting',
    }),
  }));

  assert.equal(controller.stage, 'waiting');
  assert.equal(controller.effects.shouldStartGpsWarmup, false);
  assert.equal(controller.effects.shouldStartGpsActive, false);
  assert.equal(controller.effects.shouldRunHeartbeat, false);
});

test('focused route match id keeps recovery polling active before status arrives', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'idle',
    isRunning: false,
    duelMatchState: 'idle',
    duelMatchStatus: null,
    fallbackMatchId: 'duel-route-match',
  }));

  assert.equal(controller.stage, 'waiting');
  assert.equal(controller.matchId, 'duel-route-match');
  assert.equal(controller.effects.shouldPollDirectMatchStatus, true);
  assert.equal(controller.effects.shouldPollLinkedMatch, false);
  assert.equal(controller.effects.shouldStartGpsWarmup, false);
  assert.equal(controller.effects.shouldStartGpsActive, false);
  assert.equal(controller.effects.shouldRunHeartbeat, false);
});

test('arming direct match polls status without starting GPS or heartbeat', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'idle',
    isRunning: false,
    duelMatchState: 'matched',
    duelStartCountdownSeconds: 45,
    duelMatchStatus: status({
      state: 'matched',
      matchId: 'duel-arming',
      slotStartAt: '2026-05-14T12:00:45.000Z',
    }),
  }));

  assert.equal(controller.stage, 'arming');
  assert.equal(controller.effects.shouldPollDirectMatchStatus, true);
  assert.equal(controller.effects.shouldPollLinkedMatch, false);
  assert.equal(controller.effects.shouldStartGpsWarmup, false);
  assert.equal(controller.effects.shouldStartGpsActive, false);
  assert.equal(controller.effects.shouldRunHeartbeat, false);
});

test('countdown warmup starts GPS warmup but not active heartbeat', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'idle',
    isRunning: false,
    duelMatchState: 'matched',
    duelStartCountdownSeconds: 20,
    duelMatchStatus: status({
      state: 'matched',
      matchId: 'duel-countdown',
      slotStartAt: '2026-05-14T12:00:20.000Z',
    }),
  }));

  assert.equal(controller.stage, 'countdown');
  assert.deepEqual(controller.gps.warmupMatch, {
    matchId: 'duel-countdown',
    mode: 'duel',
    slotStartAt: '2026-05-14T12:00:20.000Z',
  });
  assert.equal(controller.effects.shouldStartGpsWarmup, true);
  assert.equal(controller.effects.shouldStartGpsActive, false);
  assert.equal(controller.effects.shouldRunHeartbeat, false);
});

test('lifecycle controller centralizes party run countdown navigation and polling decisions', () => {
  const linkedRoom = room({
    state: 'countdown',
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'matched',
    linkedMatchSlotStartAt: '2026-05-14T12:00:20.000Z',
  });
  const flow = buildPartyRunFlowSnapshot({
    room: linkedRoom,
    isCountdownReady: true,
    remainingSeconds: 20,
  });
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    matchRoom: linkedRoom,
    visibleMatchRoom: linkedRoom,
    visiblePartyRunFlow: flow,
    matchRoomFlow: flow,
    roomLinkedMatchContext: flow.linkedMatchContext,
  }));

  assert.equal(controller.stage, 'countdown');
  assert.equal(controller.source, 'party-room');
  assert.equal(controller.matchId, 'match-1');
  assert.equal(controller.effects.shouldNavigateLinkedMatch, true);
  assert.equal(controller.effects.shouldPollLinkedMatch, true);
  assert.equal(controller.effects.shouldStartGpsWarmup, true);
});

test('linked party room countdown uses linked polling owner and suppresses direct room polling', () => {
  const linkedRoom = room({
    state: 'countdown',
    linkedMatchId: 'match-linked',
    linkedMatchStatus: 'matched',
    linkedMatchSlotStartAt: '2026-05-14T12:00:20.000Z',
  });
  const flow = buildPartyRunFlowSnapshot({
    room: linkedRoom,
    isCountdownReady: true,
    remainingSeconds: 20,
  });
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    matchRoom: linkedRoom,
    visibleMatchRoom: linkedRoom,
    visiblePartyRunFlow: flow,
    matchRoomFlow: flow,
    roomLinkedMatchContext: flow.linkedMatchContext,
  }));

  assert.equal(controller.source, 'party-room');
  assert.equal(controller.effects.shouldPollRoom, false);
  assert.equal(controller.effects.shouldPollDirectMatchStatus, false);
  assert.equal(controller.effects.shouldPollLinkedMatch, true);
});

test('linked party room arming keeps linked recovery polling instead of falling back to upcoming', () => {
  const linkedRoom = room({
    state: 'arming',
    linkedMatchId: 'match-linked',
    linkedMatchStatus: 'matched',
    linkedMatchSlotStartAt: '2026-05-14T12:00:20.000Z',
  });
  const flow = buildPartyRunFlowSnapshot({
    room: linkedRoom,
    isCountdownReady: false,
    remainingSeconds: 45,
  });
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    matchRoom: linkedRoom,
    visibleMatchRoom: null,
    visiblePartyRunFlow: buildPartyRunFlowSnapshot({ room: null }),
    matchRoomFlow: flow,
    roomLinkedMatchContext: null,
  }));

  assert.equal(controller.stage, 'arming');
  assert.equal(controller.source, 'party-room');
  assert.equal(controller.matchId, 'match-linked');
  assert.equal(controller.effects.shouldPollRoom, false);
  assert.equal(controller.effects.shouldPollDirectMatchStatus, false);
  assert.equal(controller.effects.shouldPollLinkedMatch, true);
  assert.equal(controller.effects.shouldNavigateLinkedMatch, false);
});

test('linked match active status promotes party runtime after navigation fallback', () => {
  const linkedRoom = room({
    state: 'arming',
    linkedMatchId: 'match-linked',
    linkedMatchStatus: 'matched',
    linkedMatchSlotStartAt: '2026-05-14T12:00:20.000Z',
  });
  const flow = buildPartyRunFlowSnapshot({
    room: linkedRoom,
    isCountdownReady: false,
    remainingSeconds: 45,
  });
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'idle',
    matchRoom: linkedRoom,
    visibleMatchRoom: linkedRoom,
    visiblePartyRunFlow: flow,
    matchRoomFlow: flow,
    roomLinkedMatchContext: flow.linkedMatchContext,
    duelMatchState: 'active',
    duelMatchStatus: status({
      state: 'active',
      matchId: 'match-linked',
      slotStartAt: '2026-05-14T12:00:20.000Z',
    }),
    fallbackMatchId: 'match-linked',
  }));

  assert.equal(controller.stage, 'active');
  assert.equal(controller.source, 'party-room');
  assert.equal(controller.matchId, 'match-linked');
  assert.equal(controller.effects.shouldPollLinkedMatch, true);
  assert.equal(controller.effects.shouldPollDirectMatchStatus, false);
  assert.deepEqual(controller.gps.activeMatch, {
    matchId: 'match-linked',
    mode: 'duel',
    slotStartAt: '2026-05-14T12:00:20.000Z',
  });
});

test('active linked context keeps polling even when lifecycle stage is still waiting', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    matchRoom: room({ state: 'waiting' }),
    visibleMatchRoom: null,
    visiblePartyRunFlow: buildPartyRunFlowSnapshot({ room: null }),
    matchRoomFlow: buildPartyRunFlowSnapshot({ room: null }),
    roomLinkedMatchContext: {
      mode: 'duel',
      matchId: 'match-linked',
      slotStartAt: '2026-05-14T12:00:20.000Z',
      distanceKm: 5,
      state: 'active',
    },
  }));

  assert.equal(controller.stage, 'waiting');
  assert.equal(controller.source, 'party-room');
  assert.equal(controller.matchId, 'match-linked');
  assert.equal(controller.effects.shouldPollLinkedMatch, true);
  assert.equal(controller.effects.shouldPollDirectMatchStatus, false);
});

test('lifecycle controller starts heartbeat only for active running match', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'running',
    isRunning: true,
    duelMatchState: 'active',
    duelMatchStatus: status({
      state: 'active',
      matchId: 'duel-active',
      readyToStart: true,
    }),
  }));

  assert.equal(controller.stage, 'active');
  assert.equal(controller.effects.shouldStartGpsActive, false);
  assert.equal(controller.effects.shouldRunHeartbeat, true);
});

test('active match suppresses heartbeat after current user forfeits', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'running',
    isRunning: true,
    isCurrentUserForfeited: true,
    duelMatchState: 'active',
    duelMatchStatus: status({
      state: 'active',
      matchId: 'duel-active',
      readyToStart: true,
    }),
  }));

  assert.equal(controller.stage, 'active');
  assert.equal(controller.effects.shouldRunHeartbeat, false);
});

test('lifecycle controller starts active GPS from idle before heartbeat', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'idle',
    isRunning: false,
    duelMatchState: 'active',
    duelMatchStatus: status({
      state: 'active',
      matchId: 'duel-active',
      readyToStart: true,
    }),
  }));

  assert.equal(controller.stage, 'active');
  assert.deepEqual(controller.gps.activeMatch, {
    matchId: 'duel-active',
    mode: 'duel',
    slotStartAt: '2026-05-14T12:00:00.000Z',
  });
  assert.equal(controller.effects.shouldStartGpsActive, true);
  assert.equal(controller.effects.shouldRunHeartbeat, false);
});

test('active direct match waits for the shared slot time before starting GPS', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'idle',
    isRunning: false,
    syncedNowMs: Date.parse('2026-05-14T12:00:17.000Z'),
    duelMatchState: 'active',
    duelMatchStatus: status({
      state: 'active',
      matchId: 'duel-active-early',
      readyToStart: true,
      slotStartAt: '2026-05-14T12:00:20.000Z',
    }),
  }));

  assert.equal(controller.stage, 'active');
  assert.equal(controller.effects.shouldPollDirectMatchStatus, true);
  assert.equal(controller.effects.shouldStartGpsActive, false);
  assert.equal(controller.effects.shouldRunHeartbeat, false);
  assert.equal(controller.gps.activeMatch, null);
});

test('active direct match starts GPS once the shared slot time has elapsed', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'idle',
    isRunning: false,
    syncedNowMs: Date.parse('2026-05-14T12:00:20.000Z'),
    duelMatchState: 'active',
    duelMatchStatus: status({
      state: 'active',
      matchId: 'duel-active-on-time',
      readyToStart: true,
      slotStartAt: '2026-05-14T12:00:20.000Z',
    }),
  }));

  assert.equal(controller.stage, 'active');
  assert.deepEqual(controller.gps.activeMatch, {
    matchId: 'duel-active-on-time',
    mode: 'duel',
    slotStartAt: '2026-05-14T12:00:20.000Z',
  });
  assert.equal(controller.effects.shouldStartGpsActive, true);
});

test('finished direct match stops polling, GPS, and heartbeat side effects', () => {
  const controller = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'running',
    isRunning: true,
    duelMatchState: 'active',
    duelMatchStatus: status({
      currentUserLiveStatus: 'finished',
      state: 'active',
      matchId: 'duel-finished',
      readyToStart: true,
    }),
  }));

  assert.equal(controller.stage, 'finished');
  assert.equal(controller.effects.shouldPollDirectMatchStatus, false);
  assert.equal(controller.effects.shouldStartGpsWarmup, false);
  assert.equal(controller.effects.shouldStartGpsActive, false);
  assert.equal(controller.effects.shouldRunHeartbeat, false);
});

test('finished direct match keeps polling until the opponent resolves', () => {
  const opponentRunning = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'running',
    isRunning: true,
    duelMatchState: 'active',
    duelMatchStatus: status({
      currentUserLiveStatus: 'finished',
      state: 'active',
      matchId: 'duel-finished',
      readyToStart: true,
      opponent: duelOpponent({ liveStatus: 'running' }),
    }),
  }));

  assert.equal(opponentRunning.stage, 'finished');
  assert.equal(opponentRunning.effects.shouldPollDirectMatchStatus, true);
  assert.equal(opponentRunning.effects.shouldPollLinkedMatch, false);
  assert.equal(opponentRunning.effects.shouldRunHeartbeat, false);

  const opponentFinished = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'running',
    isRunning: true,
    duelMatchState: 'active',
    duelMatchStatus: status({
      currentUserLiveStatus: 'finished',
      state: 'active',
      matchId: 'duel-finished',
      readyToStart: true,
      opponent: duelOpponent({ liveStatus: 'finished' }),
    }),
  }));

  assert.equal(opponentFinished.stage, 'finished');
  assert.equal(opponentFinished.effects.shouldPollDirectMatchStatus, false);
  assert.equal(opponentFinished.effects.shouldPollLinkedMatch, false);
  assert.equal(opponentFinished.effects.shouldRunHeartbeat, false);
});

test('active linked party room starts active GPS only before running heartbeat', () => {
  const linkedRoom = room({
    state: 'active',
    linkedMatchId: 'room-active-match',
    linkedMatchStatus: 'active',
    linkedMatchSlotStartAt: '2026-05-14T12:00:00.000Z',
  });
  const flow = buildPartyRunFlowSnapshot({
    room: linkedRoom,
    isCountdownReady: true,
    remainingSeconds: 0,
  });
  const beforeRunning = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'idle',
    isRunning: false,
    matchRoom: linkedRoom,
    visibleMatchRoom: linkedRoom,
    visiblePartyRunFlow: flow,
    matchRoomFlow: flow,
    roomLinkedMatchContext: flow.linkedMatchContext,
  }));

  assert.equal(beforeRunning.stage, 'active');
  assert.equal(beforeRunning.source, 'party-room');
  assert.equal(beforeRunning.effects.shouldPollRoom, false);
  assert.equal(beforeRunning.effects.shouldPollLinkedMatch, true);
  assert.deepEqual(beforeRunning.gps.activeMatch, {
    matchId: 'room-active-match',
    mode: 'duel',
    slotStartAt: '2026-05-14T12:00:00.000Z',
  });
  assert.equal(beforeRunning.effects.shouldStartGpsActive, true);
  assert.equal(beforeRunning.effects.shouldRunHeartbeat, false);

  const running = buildMatchLifecycleController(baseInput({
    matchMode: 'duel',
    trackingStatus: 'running',
    isRunning: true,
    matchRoom: linkedRoom,
    visibleMatchRoom: linkedRoom,
    visiblePartyRunFlow: flow,
    matchRoomFlow: flow,
    roomLinkedMatchContext: flow.linkedMatchContext,
  }));

  assert.equal(running.effects.shouldStartGpsActive, false);
  assert.equal(running.effects.shouldRunHeartbeat, true);
});

test('finished linked party match keeps polling only until the opponent resolves', () => {
  const linkedRoom = room({
    state: 'active',
    linkedMatchId: 'room-active-match',
    linkedMatchStatus: 'active',
    linkedMatchSlotStartAt: '2026-05-14T12:00:00.000Z',
  });
  const flow = buildPartyRunFlowSnapshot({
    room: linkedRoom,
    isCountdownReady: true,
    remainingSeconds: 0,
  });
  const commonInput = {
    matchMode: 'duel' as const,
    trackingStatus: 'running' as const,
    isRunning: true,
    matchRoom: linkedRoom,
    visibleMatchRoom: linkedRoom,
    visiblePartyRunFlow: flow,
    matchRoomFlow: flow,
    roomLinkedMatchContext: flow.linkedMatchContext,
  };

  const opponentRunning = buildMatchLifecycleController(baseInput({
    ...commonInput,
    duelMatchState: 'active',
    duelMatchStatus: status({
      currentUserLiveStatus: 'finished',
      state: 'active',
      matchId: 'room-active-match',
      readyToStart: true,
      opponent: duelOpponent({ liveStatus: 'running' }),
    }),
  }));

  assert.equal(opponentRunning.stage, 'active');
  assert.equal(opponentRunning.source, 'party-room');
  assert.equal(opponentRunning.effects.shouldPollLinkedMatch, true);
  assert.equal(opponentRunning.effects.shouldPollDirectMatchStatus, false);
  assert.equal(opponentRunning.effects.shouldRunHeartbeat, false);

  const opponentFinished = buildMatchLifecycleController(baseInput({
    ...commonInput,
    duelMatchState: 'active',
    duelMatchStatus: status({
      currentUserLiveStatus: 'finished',
      state: 'active',
      matchId: 'room-active-match',
      readyToStart: true,
      opponent: duelOpponent({ liveStatus: 'finished' }),
    }),
  }));

  assert.equal(opponentFinished.stage, 'active');
  assert.equal(opponentFinished.source, 'party-room');
  assert.equal(opponentFinished.effects.shouldPollLinkedMatch, false);
  assert.equal(opponentFinished.effects.shouldPollDirectMatchStatus, false);
  assert.equal(opponentFinished.effects.shouldRunHeartbeat, false);
});
