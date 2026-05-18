import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom } from '@/lib/api/types';
import { buildActiveRoomSnapshotKey } from './activeRoomResult';

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
    participants: [
      {
        averagePace: '06:00/km',
        districtName: '테스트구',
        invited: false,
        isCountdownReady: false,
        isHost: false,
        isReady: false,
        joinedAt: '2026-05-14T00:00:00.000Z',
        levelLabel: 'Lv.1',
        name: '러너',
        tag: 'runner',
        userId: 'runner',
      },
    ],
    roomId: 'room-1',
    slotLabel: '지금',
    slotStartAt: '2026-05-14T00:00:00.000Z',
    startMode: 'host',
    state: 'waiting',
    ...overrides,
  };
}

test('active room snapshot key is stable for identical room snapshots', () => {
  const first = buildActiveRoomSnapshotKey({ room: room(), userId: 'runner' });
  const second = buildActiveRoomSnapshotKey({ room: room(), userId: 'runner' });
  assert.equal(first, second);
});

test('active room snapshot key changes for state and linked match transitions', () => {
  const waiting = buildActiveRoomSnapshotKey({ room: room(), userId: 'runner' });
  const active = buildActiveRoomSnapshotKey({
    room: room({ linkedMatchId: 'match-1', linkedMatchStatus: 'active', state: 'active' }),
    userId: 'runner',
  });
  assert.notEqual(waiting, active);
});

test('active room snapshot key changes for readiness updates inside the same state', () => {
  const waiting = buildActiveRoomSnapshotKey({ room: room(), userId: 'runner' });
  const ready = buildActiveRoomSnapshotKey({
    room: room({
      participants: [
        {
          averagePace: '06:00/km',
          districtName: '테스트구',
          invited: false,
          isCountdownReady: false,
          isHost: false,
          isReady: true,
          joinedAt: '2026-05-14T00:00:00.000Z',
          levelLabel: 'Lv.1',
          name: '러너',
          tag: 'runner',
          userId: 'runner',
        },
      ],
    }),
    userId: 'runner',
  });
  assert.notEqual(waiting, ready);
});

test('active room snapshot key changes for host transfer updates inside the same room', () => {
  const beforeTransfer = buildActiveRoomSnapshotKey({ room: room(), userId: 'runner' });
  const afterTransfer = buildActiveRoomSnapshotKey({
    room: room({
      hostUserId: 'runner',
      isHost: true,
      participants: [
        {
          averagePace: '06:00/km',
          districtName: '테스트구',
          invited: false,
          isCountdownReady: false,
          isHost: true,
          isReady: false,
          joinedAt: '2026-05-14T00:00:00.000Z',
          levelLabel: 'Lv.1',
          name: '러너',
          tag: 'runner',
          userId: 'runner',
        },
      ],
    }),
    userId: 'runner',
  });

  assert.notEqual(beforeTransfer, afterTransfer);
});

test('active room snapshot key ignores live distance-only updates', () => {
  const base = buildActiveRoomSnapshotKey({
    room: room({
      linkedMatchId: 'match-1',
      linkedMatchStatus: 'active',
      participants: [
        {
          averagePace: '06:00/km',
          districtName: '테스트구',
          invited: false,
          isCountdownReady: true,
          isHost: false,
          isReady: true,
          joinedAt: '2026-05-14T00:00:00.000Z',
          levelLabel: 'Lv.1',
          liveDistanceKm: 0.1,
          liveElapsedSeconds: 30,
          livePace: '05:00/km',
          name: '러너',
          tag: 'runner',
          userId: 'runner',
        },
      ],
      state: 'active',
    }),
    userId: 'runner',
  });
  const nextDistanceTick = buildActiveRoomSnapshotKey({
    room: room({
      linkedMatchId: 'match-1',
      linkedMatchStatus: 'active',
      participants: [
        {
          averagePace: '06:00/km',
          districtName: '테스트구',
          invited: false,
          isCountdownReady: true,
          isHost: false,
          isReady: true,
          joinedAt: '2026-05-14T00:00:00.000Z',
          levelLabel: 'Lv.1',
          liveDistanceKm: 0.2,
          liveElapsedSeconds: 35,
          livePace: '05:10/km',
          name: '러너',
          tag: 'runner',
          userId: 'runner',
        },
      ],
      state: 'active',
    }),
    userId: 'runner',
  });
  assert.equal(base, nextDistanceTick);
});
