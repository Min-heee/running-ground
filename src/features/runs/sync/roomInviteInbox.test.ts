import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
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
