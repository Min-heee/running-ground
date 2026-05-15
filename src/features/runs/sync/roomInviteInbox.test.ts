import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  buildRecipientRoomInviteInboxResult,
  buildRoomInviteInboxEvent,
  RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS,
  getRecipientInviteInboxFocusBlockReason,
  getRecipientInviteInboxFetchSkipReason,
  getRecipientInviteInboxStaleResultReason,
  getRecipientInviteInboxTimeoutRetryDelayMs,
  getRoomInviteInboxRecipientMatchType,
  resolveRoomInviteInboxRecipientMatch,
  shouldScheduleRecipientInviteInboxTimeoutRetry,
  shouldDisplayRoomInviteCard,
} from './roomInviteInbox';

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
    invitedFriends: [{
      averagePace: '06:20/km',
      districtName: '일산서구',
      inviteId: 'invite-1',
      invitedUserId: 'guest-user',
      inviteToken: 'ABC123',
      levelLabel: 'Lv.1',
      name: '초대친구',
      roomId: 'room-1',
      status: 'pending',
      tag: '#GUEST',
      userId: 'guest-user',
    }],
    ...overrides,
  };
}

test('invite inbox creates an event for a pending room invite', () => {
  const event = buildRoomInviteInboxEvent(room(), 'guest-user');

  assert.deepEqual(event && {
    inviteId: event.inviteId,
    inviteToken: event.inviteToken,
    invitedUserId: event.invitedUserId,
    roomId: event.roomId,
    roomState: event.roomState,
  }, {
    inviteId: 'invite-1',
    inviteToken: 'ABC123',
    invitedUserId: 'guest-user',
    roomId: 'room-1',
    roomState: 'waiting',
  });
});

test('invite inbox does not display duplicate cards for the same room snapshot', () => {
  const event = buildRoomInviteInboxEvent(room(), 'guest-user');

  assert.equal(shouldDisplayRoomInviteCard(null, event), true);
  assert.equal(shouldDisplayRoomInviteCard(event?.key ?? null, event), false);
});

test('invite inbox ignores rooms that are already joined', () => {
  const joinedRoom = room({ joined: true });
  const event = buildRoomInviteInboxEvent(joinedRoom, 'guest-user');
  const result = buildRecipientRoomInviteInboxResult({
    currentUserId: 'guest-user',
    previousInviteKey: null,
    room: joinedRoom,
  });

  assert.equal(event, null);
  assert.equal(result.skippedReason, 'already-joined');
});

test('recipient pending invite fetch result displays a pending invite card', () => {
  const result = buildRecipientRoomInviteInboxResult({
    currentUserId: 'guest-user',
    previousInviteKey: null,
    room: room(),
  });

  assert.equal(result.pendingCount, 1);
  assert.equal(result.shouldDisplay, true);
  assert.equal(result.skippedReason, null);
  assert.equal(result.event?.inviteId, 'invite-1');
});

test('recipient pending invite fetch matches the current user public tag when backend invite uses internal id', () => {
  const result = buildRecipientRoomInviteInboxResult({
    currentUserId: '#GUEST',
    currentUserTag: '#GUEST',
    previousInviteKey: null,
    room: room({
      invitedFriendIds: ['guest-user'],
      invitedFriends: [{
        averagePace: '06:20/km',
        districtName: '일산서구',
        inviteId: 'invite-1',
        invitedUserId: 'guest-user',
        inviteToken: 'ABC123',
        levelLabel: 'Lv.1',
        name: '초대친구',
        roomId: 'room-1',
        status: 'pending',
        tag: '#GUEST',
        userId: 'guest-user',
      }],
    }),
  });

  assert.equal(result.pendingCount, 1);
  assert.equal(result.shouldDisplay, true);
  assert.equal(result.skippedReason, null);
  assert.equal(result.event?.invitedUserId, 'guest-user');
});

test('recipient invite inbox reports public tag match type', () => {
  assert.equal(getRoomInviteInboxRecipientMatchType(room(), {
    currentUserId: '#GUEST',
    currentUserTag: '#GUEST',
  }), 'public-tag');
});

test('recipient matcher connects public tag alias to pending invite', () => {
  const match = resolveRoomInviteInboxRecipientMatch(room(), {
    currentUserId: '#GUEST',
    currentUserTag: '#GUEST',
  });

  assert.equal(match.matchType, 'public-tag');
  assert.equal(match.invitee?.invitedUserId, 'guest-user');
});

test('recipient matcher treats public tag aliases as case-insensitive', () => {
  const result = buildRecipientRoomInviteInboxResult({
    currentUserId: '#guest',
    currentUserTag: '#guest',
    previousInviteKey: null,
    room: room({
      invitedFriends: [{
        averagePace: '06:20/km',
        districtName: '일산서구',
        inviteId: 'invite-1',
        invitedUserId: 'guest-user',
        inviteToken: 'ABC123',
        levelLabel: 'Lv.1',
        name: '초대친구',
        roomId: 'room-1',
        status: 'pending',
        tag: '#GUEST',
        userId: 'guest-user',
      }],
    }),
  });

  assert.equal(result.pendingCount, 1);
  assert.equal(result.shouldDisplay, true);
  assert.equal(getRoomInviteInboxRecipientMatchType(room(), {
    currentUserId: '#guest',
    currentUserTag: '#guest',
  }), 'public-tag');
});

test('recipient invite inbox reports internal id match type', () => {
  assert.equal(getRoomInviteInboxRecipientMatchType(room(), {
    currentUserId: 'guest-user',
  }), 'internal-id');
});

test('recipient matcher reports internal user id and friend id fallback separately', () => {
  assert.equal(resolveRoomInviteInboxRecipientMatch(room(), {
    currentUserId: 'guest-user',
  }).matchType, 'internal-id');

  assert.equal(resolveRoomInviteInboxRecipientMatch(room({ invitedFriends: [] }), {
    currentUserId: 'guest-user',
  }).matchType, 'invited-friend-id');
});

test('recipient invite inbox reports invitedFriendIds fallback match type', () => {
  assert.equal(getRoomInviteInboxRecipientMatchType(room({ invitedFriends: [] }), {
    currentUserId: 'guest-user',
  }), 'invited-friend-id');
});

test('recipient pending invite fetch keeps duplicate pending invite without redisplaying', () => {
  const firstResult = buildRecipientRoomInviteInboxResult({
    currentUserId: 'guest-user',
    previousInviteKey: null,
    room: room(),
  });
  const duplicateResult = buildRecipientRoomInviteInboxResult({
    currentUserId: 'guest-user',
    previousInviteKey: firstResult.event?.key ?? null,
    room: room(),
  });

  assert.equal(duplicateResult.pendingCount, 1);
  assert.equal(duplicateResult.shouldDisplay, false);
  assert.equal(duplicateResult.skippedReason, 'duplicate-invite');
  assert.equal(duplicateResult.event?.inviteId, 'invite-1');
});

test('recipient pending invite fetch ignores invites for a different user', () => {
  const result = buildRecipientRoomInviteInboxResult({
    currentUserId: 'other-user',
    previousInviteKey: null,
    room: room(),
  });

  assert.equal(result.pendingCount, 0);
  assert.equal(result.shouldDisplay, false);
  assert.equal(result.skippedReason, 'no-pending-invite');
  assert.equal(result.event, null);
});

test('recipient pending invite fetch falls back to invitedFriendIds for current user', () => {
  const result = buildRecipientRoomInviteInboxResult({
    currentUserId: 'guest-user',
    previousInviteKey: null,
    room: room({ invitedFriends: [] }),
  });

  assert.equal(result.pendingCount, 1);
  assert.equal(result.shouldDisplay, true);
  assert.equal(result.event?.inviteId, 'room-1:guest-user');
  assert.equal(result.event?.invitedUserId, 'guest-user');
});

test('recipient invite inbox fetch skips joined rooms and active linked rooms', () => {
  assert.equal(getRecipientInviteInboxFetchSkipReason({
    currentRoom: room({ joined: true }),
    lastCompletedAtMs: 0,
    nowMs: 10_000,
  }), 'joined-room');

  assert.equal(getRecipientInviteInboxFetchSkipReason({
    currentRoom: room({ joined: false, linkedMatchId: 'duel-match-1' }),
    lastCompletedAtMs: 0,
    nowMs: 10_000,
  }), 'active-match');
});

test('recipient invite inbox focus blocks no-room key when room or live state is active', () => {
  assert.equal(getRecipientInviteInboxFocusBlockReason({
    currentRoom: null,
    isLiveMatchMounted: true,
  }), 'live-match-mounted');

  assert.equal(getRecipientInviteInboxFocusBlockReason({
    currentRoom: null,
    liveMatchKey: 'duel:match:duel-match-1',
  }), 'active-match');

  assert.equal(getRecipientInviteInboxFocusBlockReason({
    currentRoom: null,
    linkedMatchId: 'duel-match-1',
  }), 'active-match');

  assert.equal(getRecipientInviteInboxFocusBlockReason({
    activeRoomId: 'room-1',
    currentRoom: null,
  }), 'active-room');

  assert.equal(getRecipientInviteInboxFocusBlockReason({
    currentRoom: room({ joined: true }),
  }), 'joined-room');

  assert.equal(getRecipientInviteInboxFocusBlockReason({
    currentRoom: null,
  }), null);
});

test('recipient invite inbox fetch throttles repeated no-room checks', () => {
  assert.equal(getRecipientInviteInboxFetchSkipReason({
    currentRoom: null,
    lastCompletedAtMs: 9000,
    nowMs: 10_000,
    throttleMs: 5000,
  }), 'throttled');

  assert.equal(getRecipientInviteInboxFetchSkipReason({
    currentRoom: null,
    lastCompletedAtMs: 4000,
    nowMs: 10_000,
    throttleMs: 5000,
  }), null);
});

test('recipient invite inbox fetch retries promptly after timeout', () => {
  assert.equal(getRecipientInviteInboxFetchSkipReason({
    currentRoom: null,
    lastCompletedAtMs: 9000,
    lastTimedOutAtMs: 9500,
    nowMs: 10_000,
    throttleMs: 5000,
  }), null);
});

test('recipient invite inbox timeout retry is scheduled only before lobby/live join', () => {
  assert.equal(RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS, 1000);
  assert.equal(shouldScheduleRecipientInviteInboxTimeoutRetry({
    currentRoom: null,
  }), true);
  assert.equal(shouldScheduleRecipientInviteInboxTimeoutRetry({
    currentRoom: room({ joined: true }),
  }), false);
  assert.equal(shouldScheduleRecipientInviteInboxTimeoutRetry({
    currentRoom: room({ joined: false, linkedMatchId: 'duel-match-1' }),
  }), false);
  assert.equal(shouldScheduleRecipientInviteInboxTimeoutRetry({
    currentRoom: null,
    isLiveMatchMounted: true,
  }), false);
});

test('recipient invite inbox timeout retry delay is available only for idle or pre-lobby receiver state', () => {
  assert.equal(getRecipientInviteInboxTimeoutRetryDelayMs({
    currentRoom: null,
  }), RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS);
  assert.equal(getRecipientInviteInboxTimeoutRetryDelayMs({
    currentRoom: null,
    retryMs: 250,
  }), 250);
  assert.equal(getRecipientInviteInboxTimeoutRetryDelayMs({
    currentRoom: room({ joined: true }),
  }), null);
  assert.equal(getRecipientInviteInboxTimeoutRetryDelayMs({
    currentRoom: room({ joined: false, linkedMatchId: 'duel-match-1' }),
  }), null);
  assert.equal(getRecipientInviteInboxTimeoutRetryDelayMs({
    currentRoom: null,
    liveMatchKey: 'duel:match:duel-match-1',
  }), null);
});

test('recipient invite inbox stale result is ignored after joining or live handoff', () => {
  assert.equal(getRecipientInviteInboxStaleResultReason({
    currentRoom: room({ joined: true }),
    startedRoomId: null,
  }), 'joined-room');

  assert.equal(getRecipientInviteInboxStaleResultReason({
    currentRoom: room({ joined: false, linkedMatchId: 'duel-match-1' }),
    startedRoomId: 'room-1',
  }), 'active-match');

  assert.equal(getRecipientInviteInboxStaleResultReason({
    currentRoom: room({ roomId: 'room-2', joined: false }),
    startedRoomId: 'room-1',
  }), 'room-changed');
});
