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

test('host-start linked room routes the guest during the arming buffer (before the 10s window)', () => {
  // The host has started (linkedMatchId present, host-start) but roomState is still 'arming' and
  // the digit window hasn't opened — the guest must route to the running tab NOW so it shows
  // 로딩중 there before the synced 10s countdown, instead of routing mid-countdown at ~7s.
  const room = createLinkedRoom();
  const syncedNowMs = Date.parse('2026-06-08T11:59:05.000Z');
  const flow = buildPartyRunFlowSnapshot({
    room,
    remainingSeconds: 55,
    syncedNowMs,
  });

  assert.equal(flow.phase, 'arming');
  assert.equal(flow.canOpenLinkedMatch, false); // the ARENA gate is unchanged — routing != measuring
  assert.equal(hasRoomLinkedMatchSlotStarted(room, syncedNowMs), false);
  assert.equal(shouldRouteLinkedMatchRoomToRunning({ flow, room, syncedNowMs }), true);
});

test('non-host (scheduled) linked room does NOT route early on the arming buffer rule', () => {
  const room = createLinkedRoom({ startMode: 'scheduled' });
  const syncedNowMs = Date.parse('2026-06-08T11:59:05.000Z');
  const flow = buildPartyRunFlowSnapshot({
    room,
    remainingSeconds: 55,
    syncedNowMs,
  });

  assert.equal(flow.canOpenLinkedMatch, false);
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

  // STAGE 2 (clean core): a linked room whose slot has elapsed (synced clock past
  // the slot) is 'active' — the slot is the single gate, so a slot-reached room is
  // post-countdown regardless of how long ago it fired. The routing outcome is
  // UNCHANGED — the elapsed lobby still returns to the running tab — but now via the
  // slot-reached 'active' phase (canOpenLinkedMatch) instead of a stale-'arming' label.
  assert.equal(flow.phase, 'active');
  assert.equal(flow.canOpenLinkedMatch, true);
  assert.equal(hasRoomLinkedMatchSlotStarted(room, syncedNowMs), true);
  assert.equal(shouldRouteLinkedMatchRoomToRunning({ flow, room, syncedNowMs }), true);
});
