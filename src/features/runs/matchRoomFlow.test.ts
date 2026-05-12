import assert from 'node:assert/strict';
import test from 'node:test';
import type { FriendRank } from '@/domain/types';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  areAllMatchRoomGuestsReady,
  buildMatchRoomInviteAcceptanceState,
  buildPendingMatchRoomInvitees,
  canHostStartMatchRoom,
} from './matchRoomFlow';

function room(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'room-1',
    inviteToken: 'ROOM1',
    inviteLink: 'runningground://room',
    mode: 'duel',
    state: 'waiting',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: '2026-05-12T00:00:00.000Z',
    slotLabel: '방장 시작',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    hostUserId: 'host',
    hostName: '방장',
    participants: [
      {
        userId: 'host',
        name: '방장',
        tag: 'host',
        districtName: '고양시',
        averagePace: '06:20/km',
        levelLabel: 'Lv.1',
        isHost: true,
        isReady: false,
        isCountdownReady: false,
        invited: false,
        joinedAt: '2026-05-12T00:00:00.000Z',
      },
      {
        userId: 'guest',
        name: '참가자',
        tag: 'guest',
        districtName: '고양시',
        averagePace: '06:20/km',
        levelLabel: 'Lv.1',
        isHost: false,
        isReady: false,
        isCountdownReady: false,
        invited: true,
        joinedAt: '2026-05-12T00:00:00.000Z',
      },
    ],
    invitedFriendIds: [],
    ...overrides,
  };
}

test('host can start only after every guest is ready', () => {
  const waitingRoom = room();
  assert.equal(areAllMatchRoomGuestsReady(waitingRoom), false);
  assert.equal(canHostStartMatchRoom(waitingRoom), false);

  const readyRoom = room({
    participants: room().participants.map((participant) => (
      participant.isHost ? participant : { ...participant, isReady: true }
    )),
  });

  assert.equal(areAllMatchRoomGuestsReady(readyRoom), true);
  assert.equal(canHostStartMatchRoom(readyRoom), true);
});

test('invite acceptance state only shows accept and decline before the invited runner joins', () => {
  const invitedRoom = room({
    joined: false,
    participants: room().participants.filter((participant) => participant.userId !== 'guest'),
  });

  assert.deepEqual(buildMatchRoomInviteAcceptanceState(invitedRoom, 'guest'), {
    isInvitedOnly: true,
    isAlreadyJoined: false,
    canAccept: true,
    canDecline: true,
  });

  assert.deepEqual(buildMatchRoomInviteAcceptanceState(room({ joined: true }), 'guest'), {
    isInvitedOnly: false,
    isAlreadyJoined: true,
    canAccept: false,
    canDecline: false,
  });
});

test('pending invitees exclude joined runners and preserve server invite status', () => {
  const friends: FriendRank[] = [
    { id: 'pending-friend', rank: 1, name: '초대친구', tag: 'F1', distanceKm: 0, points: 0, liveLocationLabel: '일산서구' },
    { id: 'guest', rank: 2, name: '이미참가', tag: 'G1', distanceKm: 0, points: 0 },
  ];
  const invitees = buildPendingMatchRoomInvitees(
    room({
      invitedFriendIds: ['pending-friend', 'guest'],
      invitedFriends: [{
        userId: 'server-pending',
        name: '서버친구',
        districtName: '고양시',
        averagePace: '06:20/km',
        levelLabel: 'Lv.1',
        status: 'pending',
      }],
    }),
    friends,
  );

  assert.deepEqual(invitees.map((invitee) => invitee.userId), ['server-pending', 'pending-friend']);
  assert.equal(invitees[1].name, '초대친구');
  assert.equal(invitees[1].status, 'pending');
});
