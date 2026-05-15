import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  buildRecipientRoomInviteInboxResult,
  buildRoomInviteInboxEvent,
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
  const event = buildRoomInviteInboxEvent(room({ joined: true }), 'guest-user');

  assert.equal(event, null);
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
