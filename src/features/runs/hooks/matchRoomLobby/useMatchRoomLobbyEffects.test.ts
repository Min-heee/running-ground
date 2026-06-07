import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import {
  hasRoomLinkedMatchSlotStarted,
  shouldRouteLinkedMatchRoomToRunning,
} from '@/features/runs/hooks/matchRoomLobby/linkedMatchRoomRouting';

function createLinkedRoom(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'room-1',
    inviteToken: 'ABC123',
    inviteLink: 'https://example.com/ABC123',
    mode: 'duel',
    state: 'arming',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: '2026-06-08T12:00:00.000Z',
    slotLabel: '오늘 12:00',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    hostUserId: 'host',
    hostName: 'Host',
    participants: [],
    invitedFriendIds: [],
    linkedMatchId: 'match-1',
    linkedMatchSlotStartAt: '2026-06-08T12:00:00.000Z',
    linkedMatchDistanceKm: 5,
    ...overrides,
  };
}

test('linked room routing stays off before the handoff window', () => {
  const room = createLinkedRoom();
  const syncedNowMs = Date.parse('2026-06-08T11:59:05.000Z');
  const flow = buildPartyRunFlowSnapshot({
    room,
    remainingSeconds: 55,
    syncedNowMs,
  });

  assert.equal(flow.phase, 'arming');
  assert.equal(flow.canOpenLinkedMatch, false);
  assert.equal(hasRoomLinkedMatchSlotStarted(room, syncedNowMs), false);
  assert.equal(shouldRouteLinkedMatchRoomToRunning({ flow, room, syncedNowMs }), false);
});

test('linked room routing preserves the existing countdown handoff path', () => {
  const room = createLinkedRoom({ state: 'countdown', linkedMatchStatus: 'matched' });
  const syncedNowMs = Date.parse('2026-06-08T11:59:35.000Z');
  const flow = buildPartyRunFlowSnapshot({
    room,
    isCountdownReady: true,
    remainingSeconds: 25,
    syncedNowMs,
  });

  assert.equal(flow.phase, 'countdown');
  assert.equal(flow.canOpenLinkedMatch, true);
  assert.equal(shouldRouteLinkedMatchRoomToRunning({ flow, room, syncedNowMs }), true);
});

test('linked room routing returns stale elapsed lobbies to the running tab', () => {
  const room = createLinkedRoom();
  const syncedNowMs = Date.parse('2026-06-08T12:03:00.000Z');
  const flow = buildPartyRunFlowSnapshot({
    room,
    remainingSeconds: null,
    syncedNowMs,
  });

  assert.equal(flow.phase, 'arming');
  assert.equal(flow.canOpenLinkedMatch, false);
  assert.equal(hasRoomLinkedMatchSlotStarted(room, syncedNowMs), true);
  assert.equal(shouldRouteLinkedMatchRoomToRunning({ flow, room, syncedNowMs }), true);
});
