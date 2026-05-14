import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import { resolvePartyRoomPollingPolicy } from './useRoomPolling';

function room(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    canStart: false,
    distanceKm: 5,
    hostName: '테스트',
    hostUserId: 'host',
    inviteLink: 'runningground://running?roomInviteToken=ABC123',
    inviteToken: 'ABC123',
    invitedFriendIds: [],
    isHost: true,
    maxParticipants: 2,
    minParticipants: 2,
    mode: 'duel',
    participants: [{
      averagePace: '06:00/km',
      districtName: '테스트구',
      invited: false,
      isCountdownReady: false,
      isHost: true,
      isReady: false,
      joinedAt: '2026-05-14T00:00:00.000Z',
      levelLabel: 'Lv.1',
      name: '방장',
      tag: 'host',
      userId: 'host',
    }],
    roomId: 'room-1',
    slotLabel: '지금',
    slotStartAt: '2026-05-14T00:00:00.000Z',
    startMode: 'host',
    state: 'waiting',
    ...overrides,
  };
}

test('party room polling defers waiting room sync to match-room snapshot owner', () => {
  const nextRoom = room();
  const policy = resolvePartyRoomPollingPolicy({
    fastRoomPollMs: 2500,
    idleRoomPollMs: 5000,
    linkedMatchId: nextRoom.linkedMatchId,
    roomId: nextRoom.roomId,
    state: nextRoom.state,
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.reason, 'match-room-snapshot-owner');
});

test('party room polling defers linked room sync to linked match status owner', () => {
  const nextRoom = room({
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'matched',
    state: 'countdown',
  });
  const policy = resolvePartyRoomPollingPolicy({
    fastRoomPollMs: 2500,
    idleRoomPollMs: 5000,
    linkedMatchId: nextRoom.linkedMatchId,
    roomId: nextRoom.roomId,
    state: nextRoom.state,
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.reason, 'linked-match-status-owner');
});
