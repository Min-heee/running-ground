import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import { canOpenPartyRunLinkedMatch } from './usePartyRunSync';

function room(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'room-1',
    inviteToken: 'ROOM1',
    inviteLink: 'runningground://room',
    mode: 'duel',
    state: 'countdown',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: '2026-05-12T00:00:30.000Z',
    slotLabel: '방장 시작',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: true,
    isHost: true,
    hostUserId: 'host',
    hostName: '방장',
    linkedMatchId: 'match-1',
    linkedMatchStatus: 'matched',
    linkedMatchSlotStartAt: '2026-05-12T00:00:30.000Z',
    linkedMatchDistanceKm: 5,
    participants: [
      {
        userId: 'host',
        name: '방장',
        tag: 'host',
        districtName: '고양시',
        averagePace: '06:20/km',
        levelLabel: 'Lv.1',
        isHost: true,
        isReady: true,
        isCountdownReady: true,
        invited: false,
        joinedAt: '2026-05-12T00:00:00.000Z',
      },
    ],
    invitedFriendIds: [],
    ...overrides,
  };
}

test('party run linked match opens from countdown and enters arena at handoff later', () => {
  assert.equal(canOpenPartyRunLinkedMatch({
    room: room(),
    currentUserId: 'host',
    nowMs: Date.parse('2026-05-11T23:59:59.000Z'),
  }), false);

  assert.equal(canOpenPartyRunLinkedMatch({
    room: room(),
    currentUserId: 'host',
    nowMs: Date.parse('2026-05-12T00:00:00.000Z'),
  }), true);

  assert.equal(canOpenPartyRunLinkedMatch({
    room: room(),
    currentUserId: 'host',
    nowMs: Date.parse('2026-05-12T00:00:10.000Z'),
  }), true);
});

test('party run linked match opens immediately once server marks it active', () => {
  assert.equal(canOpenPartyRunLinkedMatch({
    room: room({ state: 'active', linkedMatchStatus: 'active' }),
    currentUserId: 'host',
    nowMs: Date.parse('2026-05-12T00:00:00.000Z'),
  }), true);
});
