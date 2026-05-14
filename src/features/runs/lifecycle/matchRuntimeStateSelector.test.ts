import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom, UpcomingRunningMatchItem } from '@/lib/api/types';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import {
  filterUpcomingMatchesForRuntime,
  isLinkedRoomRuntimeState,
  selectLinkedRuntimeRoom,
  selectPartyRunRuntimeSource,
} from '@/features/runs/lifecycle/matchRuntimeStateSelector';
import {
  clearLiveMatchRouteHydration,
  getLiveMatchRouteHydration,
  hydrateLiveMatchRouteState,
} from '@/features/runs/lifecycle/liveMatchRouteHydration';
import { buildTrackRunRuntimeRouteKey } from '@/features/runs/lifecycle/trackRunRouteState';

function room(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
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

function upcoming(overrides: Partial<UpcomingRunningMatchItem> = {}): UpcomingRunningMatchItem {
  return {
    matchId: 'match-1',
    mode: 'duel',
    status: 'matched',
    distanceKm: 5,
    slotStartAt: '2026-05-14T12:00:00.000Z',
    slotLabel: '테스트',
    summary: '5.0km',
    counterpartLabel: '상대',
    participantCount: 2,
    canCancel: true,
    cancelableUntilAt: '2026-05-14T11:00:00.000Z',
    isTestMatch: false,
    ...overrides,
  };
}

test('linked runtime state identifies arming, countdown, and active linked rooms', () => {
  assert.equal(isLinkedRoomRuntimeState(room({ linkedMatchId: 'match-1', state: 'waiting' })), false);
  assert.equal(isLinkedRoomRuntimeState(room({ linkedMatchId: 'match-1', state: 'arming' })), true);
  assert.equal(isLinkedRoomRuntimeState(room({ linkedMatchId: 'match-1', state: 'countdown' })), true);
  assert.equal(isLinkedRoomRuntimeState(room({ linkedMatchId: 'match-1', state: 'active' })), true);
});

test('runtime selector prefers linked matchRoom flow when visible room snapshot is missing linked state', () => {
  const visibleRoom = room({ state: 'waiting' });
  const linkedRoom = room({
    state: 'countdown',
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'matched',
    linkedMatchSlotStartAt: '2026-05-14T12:00:20.000Z',
  });
  const visibleFlow = buildPartyRunFlowSnapshot({ room: visibleRoom });
  const linkedFlow = buildPartyRunFlowSnapshot({
    room: linkedRoom,
    isCountdownReady: true,
    remainingSeconds: 20,
  });

  const runtime = selectPartyRunRuntimeSource({
    matchRoom: linkedRoom,
    matchRoomFlow: linkedFlow,
    visibleMatchRoom: visibleRoom,
    visiblePartyRunFlow: visibleFlow,
  });

  assert.equal(runtime.room?.roomId, 'room-1');
  assert.equal(runtime.flow.phase, 'arenaHandoff');
  assert.equal(runtime.linkedMatchContext?.matchId, 'match-1');
});

test('runtime selector prefers the highest linked room lifecycle state', () => {
  const visibleRoom = room({
    state: 'countdown',
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'matched',
  });
  const activeRoom = room({
    state: 'active',
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'active',
  });
  const visibleFlow = buildPartyRunFlowSnapshot({
    room: visibleRoom,
    isCountdownReady: true,
    remainingSeconds: 20,
  });
  const activeFlow = buildPartyRunFlowSnapshot({
    room: activeRoom,
    isCountdownReady: true,
    remainingSeconds: null,
  });

  assert.equal(selectLinkedRuntimeRoom({ matchRoom: activeRoom, visibleMatchRoom: visibleRoom })?.state, 'active');

  const runtime = selectPartyRunRuntimeSource({
    matchRoom: activeRoom,
    matchRoomFlow: activeFlow,
    visibleMatchRoom: visibleRoom,
    visiblePartyRunFlow: visibleFlow,
  });

  assert.equal(runtime.room?.state, 'active');
  assert.equal(runtime.flow.phase, 'active');
  assert.equal(runtime.linkedMatchContext?.state, 'active');
});

test('upcoming reserved list hides the active linked room match', () => {
  const linkedRoom = room({
    state: 'countdown',
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'matched',
  });
  const visible = filterUpcomingMatchesForRuntime([
    upcoming({ matchId: 'match-1', status: 'matched' }),
    upcoming({ matchId: 'match-2', status: 'matched' }),
  ], linkedRoom);

  assert.deepEqual(visible.map((match) => match.matchId), ['match-2']);
});

test('countdown linked match is not shown as an upcoming reserved match', () => {
  const runtimeRoom = selectLinkedRuntimeRoom({
    matchRoom: room({
      state: 'countdown',
      linkedMatchId: 'match-1',
      linkedMatchStatus: 'matched',
    }),
    visibleMatchRoom: room({ state: 'waiting' }),
  });
  const visible = filterUpcomingMatchesForRuntime([
    upcoming({ matchId: 'match-1', status: 'matched' }),
    upcoming({ matchId: 'match-2', status: 'matched' }),
  ], runtimeRoom);

  assert.deepEqual(visible.map((match) => match.matchId), ['match-2']);
});

test('track-run route key includes room and match ids immediately after route hydration', () => {
  const routeState = buildTrackRunRuntimeRouteKey({
    focusMatchId: 'duel-match-a973c5ed',
    focusRoomId: 'room-a973c5ed',
    forceOpenActiveMatch: true,
    liveArenaPage: 0,
    matchMode: 'duel',
  });

  assert.equal(routeState.routeKey, 'track-run:duel:room-a973c5ed:duel-match-a973c5ed:arena');
  assert.equal(routeState.routeKey.includes('no-room'), false);
  assert.equal(routeState.routeKey.includes('no-match'), false);
  assert.equal(routeState.correctedByRouteParams, true);
});

test('track-run route key falls back to hydrated linked match route state', () => {
  clearLiveMatchRouteHydration();
  const hydrated = hydrateLiveMatchRouteState({
    distanceKm: 5,
    matchId: 'duel-match-a973c5ed',
    mode: 'duel',
    preferArena: true,
    roomId: 'room-a973c5ed',
    slotStartAt: '2026-05-14T12:00:00.000Z',
    source: 'room start API',
  });
  assert.equal(hydrated?.matchId, 'duel-match-a973c5ed');

  const stored = getLiveMatchRouteHydration();
  const routeState = buildTrackRunRuntimeRouteKey({
    forceOpenActiveMatch: Boolean(stored?.preferArena),
    hydratedMatchId: stored?.matchId,
    hydratedMatchMode: stored?.mode,
    hydratedRoomId: stored?.roomId,
    liveArenaPage: 0,
    matchMode: 'solo',
  });

  assert.equal(routeState.routeKey, 'track-run:duel:room-a973c5ed:duel-match-a973c5ed:arena');
  assert.equal(routeState.matchMode, 'duel');
  assert.equal(routeState.routeKey.includes('no-room'), false);
  assert.equal(routeState.routeKey.includes('no-match'), false);
  assert.equal(routeState.correctedByRouteParams, true);
  clearLiveMatchRouteHydration();
});
