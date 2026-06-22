import assert from 'node:assert/strict';
import test from 'node:test';
import type { DuelMatchOpponent, RunningMatchRoom, RunningMatchRoomParticipant } from '@/lib/api/types';
import type { GroupLiveStanding } from '@/features/runs/viewModels/matchProgress';
import { buildLiveMatchRaceBoardViewModel, type LiveMatchRaceBoardViewModelInput } from './liveMatchRaceBoardViewModel';

function duelOpponent(overrides: Partial<DuelMatchOpponent> = {}): DuelMatchOpponent {
  return {
    id: 'opponent-user',
    name: '상대',
    tag: '#RIVAL',
    districtName: '일산서구',
    averagePace: '06:00/km',
    levelLabel: 'Lv.10',
    weeklyDistanceKm: 10,
    lifetimeDistanceKm: 100,
    compatibilitySummary: '비슷한 페이스',
    liveStatus: 'running',
    ...overrides,
  };
}

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

function groupStanding(overrides: Partial<GroupLiveStanding> = {}): GroupLiveStanding {
  return {
    id: 'group-runner',
    name: '그룹 러너',
    districtName: '일산서구',
    averagePace: '06:00/km',
    levelLabel: 'Lv.10',
    weeklyDistanceKm: 10,
    lifetimeDistanceKm: 100,
    seedRank: 1,
    seedSummary: '1번 시드',
    rank: 1,
    currentDistanceKm: 1,
    gapAheadKm: null,
    gapLeaderKm: 0,
    isForfeited: false,
    isCurrentUser: false,
    liveStatus: 'running',
    ...overrides,
  };
}

test('duel race board shows running opponent while current user is still running', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput());

  assert.equal(viewModel?.rows.length, 2);
  assert.equal(viewModel?.rows.filter((row) => row.isCurrentUser).length, 1);
  assert.equal(viewModel?.rows.filter((row) => !row.isCurrentUser).length, 1);
  assert.equal(viewModel?.rows.find((row) => !row.isCurrentUser)?.id, 'guest-user');
  assert.doesNotMatch(viewModel?.subtitle ?? '', /완주한 러너만/);
});

test('duel race board shows finished opponent while current user is still running', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    distanceKm: 0.42,
    opponentDuelResultLabel: 'WIN',
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
          liveStatus: 'finished',
        }),
      ],
    }),
  }));

  const opponentRow = viewModel?.rows.find((row) => !row.isCurrentUser);
  assert.equal(viewModel?.rows.length, 2);
  assert.equal(opponentRow?.id, 'guest-user');
  assert.equal(opponentRow?.distanceKm, 0);
  assert.equal(opponentRow?.resultLabel, 'WIN');
  assert.equal(viewModel?.rows.find((row) => row.isCurrentUser)?.resultLabel, null);
});

test('duel race board shows unfinished opponents as placeholders after current user finishes', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    currentUserDuelLiveStatus: 'finished',
    distanceKm: 5,
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
  assert.equal(viewModel?.rows.find((row) => row.id === 'host-user')?.distanceKm, 5);
  assert.equal(viewModel?.rows.find((row) => row.id === 'guest-user')?.distanceKm, 0.2);
  assert.equal(viewModel?.rows.find((row) => row.id === 'guest-user')?.isProgressivePlaceholder, true);
});

test('duel race board shows all finished participants without placeholders', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    currentUserDuelLiveStatus: 'finished',
    currentUserDuelResultLabel: 'WIN',
    opponentDuelResultLabel: 'LOSE',
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
          liveStatus: 'finished',
        }),
      ],
    }),
  }));

  assert.equal(viewModel?.rows.length, 2);
  assert.equal(viewModel?.rows.filter((row) => row.isCurrentUser).length, 1);
  assert.equal(viewModel?.rows.filter((row) => !row.isCurrentUser).length, 1);
  assert.equal(viewModel?.rows.some((row) => row.isProgressivePlaceholder), false);
  assert.equal(viewModel?.rows.find((row) => row.isCurrentUser)?.resultLabel, 'WIN');
  assert.equal(viewModel?.rows.find((row) => !row.isCurrentUser)?.resultLabel, 'LOSE');
});

test('duel race board shows forfeited opponent regardless of current user finish state', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
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
          liveStatus: 'forfeited',
        }),
      ],
    }),
  }));

  assert.equal(viewModel?.rows.length, 2);
  assert.equal(viewModel?.rows.find((row) => !row.isCurrentUser)?.liveStatus, 'forfeited');
});

test('duel race board keeps opponent label fallback when current user has finished', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    currentUserDuelLiveStatus: 'finished',
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

test('duel race board applies safe opponent label fallback without nickname or user tag after finish', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    currentUserDuelLiveStatus: 'finished',
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

test('matched-duel race board opponent row tracks the LIVE opponent distance, not the 30s-checkpoint synced value', () => {
  // Regression guard: my row is live (1.00km) and the opponent is really only ~10m behind
  // (liveDistanceKm 0.99). The 30s-checkpoint syncedDuelOpponentDistanceKm lags far behind
  // (0.92km). The board must show the live 0.99 so the displayed gap stays ~10m instead of
  // inflating to ~80m and snapping back at each 30s checkpoint.
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    visibleMatchRoom: null,
    effectiveDuelOpponent: duelOpponent({ liveDistanceKm: 0.99, liveElapsedSeconds: 360 }),
    distanceKm: 1.0,
    duelLiveGapKm: 0.08,
    syncedDuelDistanceKm: 1.0,
    syncedDuelOpponentDistanceKm: 0.92,
  }));

  const opponentRow = viewModel?.rows.find((row) => !row.isCurrentUser);
  const myRow = viewModel?.rows.find((row) => row.isCurrentUser);
  assert.equal(viewModel?.rows.length, 2);
  assert.equal(opponentRow?.distanceKm, 0.99);
  assert.notEqual(opponentRow?.distanceKm, 0.92);
  // The displayed gap tracks the live opponent distance (~10m), not the 30s-quantized 80m.
  assert.ok(myRow !== undefined && opponentRow !== undefined);
  assert.equal(Number((myRow!.distanceKm - opponentRow!.distanceKm).toFixed(2)), 0.01);
});

test('matched-duel race board opponent row falls back to the synced value when no live distance exists yet', () => {
  // Guard preserved: when the opponent has no live progress yet (liveDistanceKm absent),
  // keep the synced checkpoint so the opponent row stays populated instead of flickering to 0.
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    visibleMatchRoom: null,
    effectiveDuelOpponent: duelOpponent({ liveDistanceKm: undefined, liveElapsedSeconds: undefined }),
    distanceKm: 1.0,
    duelLiveGapKm: 0.4,
    syncedDuelDistanceKm: 1.0,
    syncedDuelOpponentDistanceKm: 0.6,
  }));

  const opponentRow = viewModel?.rows.find((row) => !row.isCurrentUser);
  assert.equal(viewModel?.rows.length, 2);
  assert.equal(opponentRow?.distanceKm, 0.6);
});

test('group race board keeps running rivals visible alongside finished runners', () => {
  // Same contract the duel board already has: rivals who are still running must stay
  // on the live rank page instead of collapsing to a finished-only list.
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    matchMode: 'group',
    groupLiveStandings: [
      groupStanding({ id: 'me', name: '나', isCurrentUser: true, liveStatus: 'running', rank: 2 }),
      groupStanding({ id: 'finished', name: '완주자', liveStatus: 'finished', rank: 1 }),
      groupStanding({ id: 'running', name: '진행자', liveStatus: 'running', rank: 3 }),
    ],
  }));

  assert.deepEqual(viewModel?.rows.map((row) => row.id), ['me', 'finished', 'running']);
});

test('group race board shows running rivals as placeholders after current user finishes', () => {
  const viewModel = buildLiveMatchRaceBoardViewModel(buildInput({
    matchMode: 'group',
    groupLiveStandings: [
      groupStanding({ id: 'me', name: '나', isCurrentUser: true, liveStatus: 'finished', rank: 1 }),
      groupStanding({ id: 'running', name: '진행자', liveStatus: 'running', rank: 2 }),
    ],
  }));

  assert.equal(viewModel?.rows.length, 2);
  assert.equal(viewModel?.rows.find((row) => row.id === 'running')?.isProgressivePlaceholder, true);
});
