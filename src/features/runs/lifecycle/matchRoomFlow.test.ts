import assert from 'node:assert/strict';
import test from 'node:test';
import type { FriendRank } from '@/domain';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  areAllMatchRoomGuestsReady,
  buildMatchRoomInviteAcceptanceState,
  buildMatchRoomInviteUxState,
  buildMatchRoomParticipantUxRows,
  buildMatchRoomReadyActionState,
  buildMatchRoomHostStartActionState,
  buildMatchRoomUxModel,
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
    canStart: true,
    participants: room().participants.map((participant) => (
      participant.isHost ? participant : { ...participant, isReady: true }
    )),
  });

  assert.equal(areAllMatchRoomGuestsReady(readyRoom), true);
  assert.equal(canHostStartMatchRoom(readyRoom), true);
  assert.equal(canHostStartMatchRoom({ ...readyRoom, canStart: false }), false);
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

  assert.equal(buildMatchRoomInviteUxState(invitedRoom, 'guest').state, 'pending');
  assert.equal(buildMatchRoomInviteUxState(room({ joined: true }), 'guest').state, 'joined');
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

test('participant UX rows separate host, ready guests, and pending invitees', () => {
  const readyRoom = room({
    participants: room().participants.map((participant) => (
      participant.isHost ? participant : { ...participant, isReady: true }
    )),
  });
  const rows = buildMatchRoomParticipantUxRows(readyRoom, [{
    userId: 'pending-friend',
    name: '초대친구',
    districtName: '고양시',
    averagePace: '06:20/km',
    levelLabel: 'Lv.1',
    status: 'pending',
  }]);

  assert.deepEqual(rows.map((row) => row.status), ['host', 'ready', 'invite-pending']);
  assert.deepEqual(rows.map((row) => row.statusLabel), ['시작 권한', '준비 완료', '수락 대기중']);
  assert.equal(rows[2].badgeLabel, '초대됨');
});

test('participant UX rows show countdown loading readiness after linked match opens', () => {
  const rows = buildMatchRoomParticipantUxRows(room({
    linkedMatchId: 'match-1',
    state: 'arming',
    participants: room().participants.map((participant) => (
      participant.isHost
        ? { ...participant, isCountdownReady: true }
        : { ...participant, isCountdownReady: false }
    )),
  }));

  assert.deepEqual(rows.map((row) => row.status), ['countdown-ready', 'countdown-loading']);
  assert.deepEqual(rows.map((row) => row.statusLabel), ['로딩 완료', '로딩 중']);
});

test('ready action is explicit for guest ready, not-ready, and locked states', () => {
  const guestRoom = room({ isHost: false });
  const guest = guestRoom.participants.find((participant) => participant.userId === 'guest');

  assert.deepEqual(buildMatchRoomReadyActionState(guestRoom, guest), {
    state: 'not-ready',
    visible: true,
    label: '준비',
    canToggle: true,
    helperText: '',
  });

  assert.equal(
    buildMatchRoomReadyActionState(guestRoom, guest ? { ...guest, isReady: true } : null).state,
    'ready',
  );
  assert.equal(buildMatchRoomReadyActionState({ ...guestRoom, linkedMatchId: 'match-1' }, guest).state, 'locked');
  assert.equal(buildMatchRoomReadyActionState(room(), room().participants[0]).state, 'hidden');
});

test('host start action explains each room start blocker', () => {
  const readyParticipants = room().participants.map((participant) => (
    participant.isHost ? participant : { ...participant, isReady: true }
  ));

  assert.equal(buildMatchRoomHostStartActionState(room({
    participants: [room().participants[0]],
  })).state, 'needs-participants');
  assert.equal(buildMatchRoomHostStartActionState(room()).state, 'needs-ready');
  assert.equal(buildMatchRoomHostStartActionState(room({
    canStart: true,
    participants: readyParticipants,
  })).state, 'can-start');
  assert.equal(buildMatchRoomHostStartActionState(room({
    startMode: 'scheduled',
    participants: readyParticipants,
  })).state, 'scheduled');
  assert.equal(buildMatchRoomHostStartActionState(room({
    state: 'arming',
    linkedMatchId: 'match-1',
    participants: readyParticipants,
  })).state, 'arming');
});

test('room UX model collects invite, participant, ready, and start states together', () => {
  const model = buildMatchRoomUxModel({
    room: room({
      canStart: true,
      participants: room().participants.map((participant) => (
        participant.isHost ? participant : { ...participant, isReady: true }
      )),
    }),
    currentUserId: 'host',
    pendingInvitees: [],
  });

  assert.equal(model.invite.state, 'joined');
  assert.deepEqual(model.participants.map((participant) => participant.status), ['host', 'ready']);
  assert.equal(model.readyAction.state, 'hidden');
  assert.equal(model.startAction.state, 'can-start');
  assert.equal(model.startAction.canStart, true);
});
