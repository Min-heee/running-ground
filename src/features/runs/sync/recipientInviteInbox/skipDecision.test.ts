import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  buildRecipientInviteInboxAlreadyBusyTraceEvent,
  buildRecipientInviteInboxBlockTraceEvents,
  buildRecipientInviteInboxFetchSkipTraceEvent,
} from './skipDecision';

function room(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'room-1',
    inviteToken: 'ABC123',
    inviteLink: 'runningground://running?roomInviteToken=ABC123',
    mode: 'duel',
    state: 'waiting',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: new Date().toISOString(),
    slotLabel: '방장 시작',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: false,
    joined: false,
    hostUserId: 'host-user',
    hostName: '방장',
    participants: [],
    invitedFriendIds: ['guest-user'],
    ...overrides,
  };
}

test('recipient invite inbox block trace separates live mounted and active room reasons', () => {
  const liveEvents = buildRecipientInviteInboxBlockTraceEvents({
    blockReason: 'live-match-mounted',
    currentUserId: 'guest-user',
    room: null,
    runtimeState: {
      activeRoomId: null,
      isLiveMatchMounted: true,
      linkedMatchId: 'match-1',
      liveMatchKey: 'duel:match-1',
    },
    source: 'focus',
  });

  assert.deepEqual(liveEvents.map((event) => event.name), [
    'invite inbox fetch skipped live match mounted',
    'invite inbox focus disabled while live once',
  ]);
  assert.equal(liveEvents[0].payload.matchId, 'match-1');

  const activeRoomEvents = buildRecipientInviteInboxBlockTraceEvents({
    blockReason: 'active-room',
    currentUserId: 'guest-user',
    room: null,
    runtimeState: {
      activeRoomId: 'room-1',
      isLiveMatchMounted: false,
      linkedMatchId: null,
      liveMatchKey: null,
    },
    source: 'focus',
  });

  assert.deepEqual(activeRoomEvents, [{
    name: 'invite inbox no-room key blocked by active room',
    payload: {
      activeRoomId: 'room-1',
      source: 'focus',
      userId: 'guest-user',
    },
  }]);
});

test('recipient invite inbox fetch skip trace preserves joined active and throttle payloads', () => {
  assert.deepEqual(buildRecipientInviteInboxFetchSkipTraceEvent({
    currentUserId: 'guest-user',
    lastCompletedAtMs: 9000,
    nowMs: 10_000,
    room: null,
    skipReason: 'throttled',
    source: 'focus',
  }), {
    name: 'invite inbox fetch throttled',
    payload: {
      elapsedMs: 1000,
      roomId: null,
      source: 'focus',
      userId: 'guest-user',
    },
  });

  assert.equal(buildRecipientInviteInboxFetchSkipTraceEvent({
    currentUserId: 'guest-user',
    lastCompletedAtMs: 0,
    nowMs: 10_000,
    room: room({ joined: true }),
    skipReason: 'joined-room',
    source: 'focus',
  }).name, 'invite inbox fetch skipped joined room');

  assert.equal(buildRecipientInviteInboxFetchSkipTraceEvent({
    currentUserId: 'guest-user',
    lastCompletedAtMs: 0,
    nowMs: 10_000,
    room: room({ linkedMatchId: 'match-1' }),
    skipReason: 'active-match',
    source: 'focus',
  }).payload.linkedMatchId, 'match-1');
});

test('recipient invite inbox busy trace keeps the existing begin label', () => {
  assert.deepEqual(buildRecipientInviteInboxAlreadyBusyTraceEvent({
    currentUserId: 'guest-user',
    reason: 'room-action-pending',
    source: 'focus',
  }), {
    name: 'invite inbox fetch for recipient begin',
    payload: {
      skipped: true,
      reason: 'room-action-pending',
      source: 'focus',
      userId: 'guest-user',
    },
  });
});
