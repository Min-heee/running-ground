import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom, RunningMatchRoomParticipant } from '@/lib/api/types';
import {
  buildLiveMatchRaceBoardViewModel,
  type LiveMatchRaceBoardViewModelInput,
} from './liveMatchRaceBoardViewModel';

function participant(overrides: Partial<RunningMatchRoomParticipant>): RunningMatchRoomParticipant {
  return {
    userId: 'runner',
    name: '러너',
    tag: '#RUNNER',
    districtName: '일산서구',
    averagePace: '06:00/km',
    levelLabel: 'Lv.10',
    isHost: false,
    invited: false,
    joinedAt: '2026-05-15T00:00:00.000Z',
    ...overrides,
  };
}

function duelRoom(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'duel-room-1',
    inviteToken: 'ABC123',
    inviteLink: 'runningground://running?roomInviteToken=ABC123',
    mode: 'duel',
    state: 'active',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: '2026-05-15T00:00:00.000Z',
    slotLabel: '방장 시작',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    joined: true,
    hostUserId: 'host-user',
    hostName: '호스트',
    participants: [
      participant({
        userId: 'host-user',
        name: '호스트',
        tag: '#HOST',
        isHost: true,
      }),
      participant({
        userId: 'guest-user',
        name: '게스트',
        tag: '#GUEST',
      }),
    ],
    invitedFriendIds: [],
    invitedFriends: [],
    linkedMatchId: 'duel-match-1',
    linkedMatchStatus: 'active',
    linkedMatchDistanceKm: 5,
    ...overrides,
  };
}

function buildInput(overrides: Partial<LiveMatchRaceBoardViewModelInput> = {}): LiveMatchRaceBoardViewModelInput {
  return {
    matchMode: 'duel',
    effectiveDuelOpponent: null,
    duelLiveGapKm: null,
    duelDistanceKm: 5,
    groupDistanceKm: 5,
    distanceKm: 0,
    syncedDuelDistanceKm: 0,
    syncedDuelOpponentDistanceKm: 0,
    currentUserDuelLiveStatus: null,
    currentUserGroupLiveStatus: null,
    roomLinkedDuelPlaceholderParticipants: [],
    roomLinkedGroupPlaceholderParticipants: [],
    visibleMatchRoom: duelRoom(),
    groupLiveStandings: [],
    currentUserArenaPace: '05:30/km',
    groupArenaUsesLivePace: false,
    ...overrides,
  };
}

test('duel race board keeps both room participants when both progress values are zero', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput());

  assert.equal(viewModel?.rows.length, 2);
  assert.equal(viewModel?.rows.filter((row) => row.isCurrentUser).length, 1);
  assert.equal(viewModel?.rows.filter((row) => !row.isCurrentUser).length, 1);
  assert.deepEqual(viewModel?.rows.map((row) => row.distanceKm), [0, 0]);
});

test('duel race board shows opponent row even when opponent progress is missing', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    distanceKm: 0.42,
    visibleMatchRoom: duelRoom({
      participants: [
        participant({
          userId: 'host-user',
          name: '호스트',
          tag: '#HOST',
          isHost: true,
        }),
        participant({
          userId: 'guest-user',
          name: '게스트',
          tag: '#GUEST',
        }),
      ],
    }),
  }));

  const opponentRow = viewModel?.rows.find((row) => !row.isCurrentUser);
  assert.equal(viewModel?.rows.length, 2);
  assert.equal(opponentRow?.id, 'guest-user');
  assert.equal(opponentRow?.distanceKm, 0);
});

test('duel race board merges participant progress after participant rows are created', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    visibleMatchRoom: duelRoom({
      participants: [
        participant({
          userId: 'host-user',
          name: '호스트',
          tag: '#HOST',
          isHost: true,
          liveDistanceKm: 0.4,
        }),
        participant({
          userId: 'guest-user',
          name: '게스트',
          tag: '#GUEST',
          liveDistanceKm: 0.2,
        }),
      ],
    }),
  }));

  assert.equal(viewModel?.rows.length, 2);
  assert.equal(viewModel?.rows.find((row) => row.id === 'host-user')?.distanceKm, 0.4);
  assert.equal(viewModel?.rows.find((row) => row.id === 'guest-user')?.distanceKm, 0.2);
});

test('duel race board builds participant rows before opponent progress arrives', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    effectiveDuelOpponent: {
      id: 'guest-user',
      name: '게스트',
      tag: '#GUEST',
      districtName: '일산서구',
      averagePace: '06:00/km',
      levelLabel: 'Lv.10',
      weeklyDistanceKm: 0,
      lifetimeDistanceKm: 0,
      compatibilitySummary: '',
    },
    visibleMatchRoom: duelRoom({
      participants: [
        participant({
          userId: 'host-user',
          name: '호스트',
          tag: '#HOST',
          isHost: true,
        }),
        participant({
          userId: 'guest-user',
          name: '게스트',
          tag: '#GUEST',
        }),
      ],
    }),
  }));

  assert.equal(viewModel?.rows.length, 2);
  assert.equal(viewModel?.rows.filter((row) => row.isCurrentUser).length, 1);
  assert.equal(viewModel?.rows.filter((row) => !row.isCurrentUser).length, 1);
  assert.equal(viewModel?.rows.find((row) => !row.isCurrentUser)?.id, 'guest-user');
  assert.equal(viewModel?.rows.find((row) => !row.isCurrentUser)?.distanceKm, 0);
});

test('duel race board does not filter room participant rows down to the current user', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    visibleMatchRoom: duelRoom({
      isHost: false,
      participants: [
        participant({
          userId: 'host-user',
          name: '',
          tag: '#HOST',
          isHost: true,
        }),
        participant({
          userId: 'guest-user',
          name: '게스트',
          tag: '#GUEST',
        }),
      ],
    }),
  }));

  assert.equal(viewModel?.rows.length, 2);
  assert.equal(viewModel?.rows.find((row) => row.isCurrentUser)?.id, 'guest-user');
  assert.equal(viewModel?.rows.find((row) => !row.isCurrentUser)?.name, '#HOST');
});

test('duel race board applies safe opponent label fallback without nickname or user tag', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    visibleMatchRoom: duelRoom({
      isHost: false,
      participants: [
        participant({
          userId: 'host-user',
          name: '',
          tag: undefined,
          isHost: true,
        }),
        participant({
          userId: 'guest-user',
          name: '게스트',
          tag: '#GUEST',
        }),
      ],
    }),
  }));

  assert.equal(viewModel?.rows.length, 2);
  assert.equal(viewModel?.rows.find((row) => !row.isCurrentUser)?.name, '상대');
});
