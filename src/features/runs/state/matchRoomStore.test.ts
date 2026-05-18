import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  getMatchRoom,
  resetMatchRoomStoreForTesting,
  setMatchRoom,
  subscribeMatchRoom,
} from '@/features/runs/state/matchRoomStore';

function room(roomId: string): RunningMatchRoom {
  return {
    canStart: false,
    distanceKm: 5,
    hostName: 'Host',
    hostUserId: 'host-user',
    inviteLink: 'runningground://running?roomInviteToken=ABC123',
    inviteToken: 'ABC123',
    invitedFriendIds: [],
    isHost: true,
    maxParticipants: 2,
    minParticipants: 2,
    mode: 'duel',
    participants: [],
    roomId,
    slotLabel: 'Now',
    slotStartAt: '2026-05-18T00:00:00.000Z',
    startMode: 'host',
    state: 'waiting',
  };
}

test('match room store persists the latest room across direct reads', () => {
  resetMatchRoomStoreForTesting();
  const nextRoom = {
    ...room('duel-room-persisted'),
    linkedMatchId: 'duel-match-persisted',
    linkedMatchStatus: 'matched' as const,
  };

  setMatchRoom(nextRoom);

  assert.equal(getMatchRoom(), nextRoom);
  assert.equal(getMatchRoom()?.linkedMatchId, 'duel-match-persisted');
});

test('match room store notifies subscribers when the room changes', () => {
  resetMatchRoomStoreForTesting();
  let calls = 0;
  const unsubscribe = subscribeMatchRoom(() => {
    calls += 1;
  });

  setMatchRoom(room('duel-room-notify'));

  unsubscribe();
  assert.equal(calls, 1);
});

test('match room store does not emit when setting the same room reference', () => {
  resetMatchRoomStoreForTesting();
  let calls = 0;
  const nextRoom = room('duel-room-same-ref');
  const unsubscribe = subscribeMatchRoom(() => {
    calls += 1;
  });

  setMatchRoom(nextRoom);
  setMatchRoom(nextRoom);

  unsubscribe();
  assert.equal(calls, 1);
});

test('match room store stops notifying after unsubscribe', () => {
  resetMatchRoomStoreForTesting();
  let calls = 0;
  const unsubscribe = subscribeMatchRoom(() => {
    calls += 1;
  });

  unsubscribe();
  setMatchRoom(room('duel-room-unsubscribed'));

  assert.equal(calls, 0);
});

test('match room store reset clears the room and subscribers', () => {
  resetMatchRoomStoreForTesting();
  let calls = 0;
  subscribeMatchRoom(() => {
    calls += 1;
  });
  setMatchRoom(room('duel-room-before-reset'));

  resetMatchRoomStoreForTesting();
  setMatchRoom(room('duel-room-after-reset'));

  assert.equal(getMatchRoom()?.roomId, 'duel-room-after-reset');
  assert.equal(calls, 1);
  resetMatchRoomStoreForTesting();
});
