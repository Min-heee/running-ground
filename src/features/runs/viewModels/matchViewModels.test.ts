import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDuelArenaParticipants,
  buildGroupArenaParticipants,
  buildRoomLinkedDuelPlaceholderParticipants,
} from './matchViewModels';
import type {
  DuelMatchOpponent,
  RunningMatchRoom,
} from '@/lib/api/types';

function opponent(overrides: Partial<DuelMatchOpponent> = {}): DuelMatchOpponent {
  return {
    id: 'opponent-1',
    name: '상대',
    tag: '#OP',
    districtName: '강남구',
    averagePace: '06:20/km',
    levelLabel: 'Lv.10',
    weeklyDistanceKm: 12,
    lifetimeDistanceKm: 100,
    compatibilitySummary: '테스트 상대',
    ...overrides,
  };
}

function room(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'room-1',
    inviteToken: 'ABC123',
    inviteLink: 'runningground://room',
    mode: 'duel',
    state: 'active',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: '2026-05-12T00:00:00.000Z',
    slotLabel: '방장 시작',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: true,
    isHost: true,
    hostUserId: 'me',
    hostName: '나',
    invitedFriendIds: [],
    participants: [
      {
        userId: 'me',
        name: '나',
        tag: 'me',
        districtName: '고양시',
        averagePace: '06:10/km',
        levelLabel: 'Lv.1',
        isHost: true,
        isReady: true,
        isCountdownReady: true,
        invited: false,
        joinedAt: '2026-05-12T00:00:00.000Z',
      },
      {
        userId: 'opponent-1',
        name: '상대',
        tag: '#OP',
        districtName: '강남구',
        averagePace: '06:20/km',
        levelLabel: 'Lv.10',
        isHost: false,
        isReady: true,
        isCountdownReady: true,
        invited: true,
        joinedAt: '2026-05-12T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

test('duel arena view model marks forfeited opponent and keeps current runner leader by gap', () => {
  const participants = buildDuelArenaParticipants({
    currentUserPaceLabel: '06:00/km',
    currentUserLiveStatus: 'running',
    currentDistanceKm: 1.2,
    opponent: opponent({ liveStatus: 'forfeited' }),
    opponentPaceLabel: '06:20/km',
    opponentDistanceKm: 0.8,
    liveGapKm: 0.4,
  });

  assert.equal(participants.length, 2);
  assert.equal(participants[0].isLeader, true);
  assert.equal(participants[1].paceLabel, '기권');
  assert.equal(participants[1].showPaceBubble, true);
});

test('duel arena view model labels current user as WIN after finishing before opponent', () => {
  const participants = buildDuelArenaParticipants({
    currentUserPaceLabel: '완주',
    currentUserLiveStatus: 'finished',
    currentUserFinishedAt: '2026-05-12T00:10:00.000Z',
    currentDistanceKm: 5,
    opponent: opponent({ liveStatus: 'running' }),
    opponentPaceLabel: '06:20/km',
    opponentDistanceKm: 4.2,
    liveGapKm: 0.8,
  });

  assert.equal(participants.find((participant) => participant.isCurrentUser)?.resultLabel, 'WIN');
  assert.equal(participants.find((participant) => !participant.isCurrentUser)?.resultLabel, null);
});

test('duel arena view model labels opponent as WIN when opponent finishes first', () => {
  const participants = buildDuelArenaParticipants({
    currentUserPaceLabel: '06:00/km',
    currentUserLiveStatus: 'running',
    currentDistanceKm: 4.2,
    opponent: opponent({
      liveStatus: 'finished',
      finishedAt: '2026-05-12T00:09:30.000Z',
    }),
    opponentPaceLabel: '완주',
    opponentDistanceKm: 5,
    liveGapKm: -0.8,
  });

  assert.equal(participants.find((participant) => participant.isCurrentUser)?.resultLabel, null);
  assert.equal(participants.find((participant) => !participant.isCurrentUser)?.resultLabel, 'WIN');
});

test('duel arena view model compares both finish times for WIN/LOSE labels', () => {
  const participants = buildDuelArenaParticipants({
    currentUserPaceLabel: '완주',
    currentUserLiveStatus: 'finished',
    currentUserFinishedAt: '2026-05-12T00:10:30.000Z',
    currentDistanceKm: 5,
    opponent: opponent({
      liveStatus: 'finished',
      finishedAt: '2026-05-12T00:10:00.000Z',
    }),
    opponentPaceLabel: '완주',
    opponentDistanceKm: 5,
    liveGapKm: 0,
  });

  assert.equal(participants.find((participant) => participant.isCurrentUser)?.resultLabel, 'LOSE');
  assert.equal(participants.find((participant) => !participant.isCurrentUser)?.resultLabel, 'WIN');
});

test('duel arena head-to-head dots sit on the caller-supplied synced (checkpoint) distances for both sides', () => {
  // The caller (RuntimeModel) passes syncedDuelDistanceKm as currentDistanceKm and
  // syncedDuelOpponentDistanceKm as opponentDistanceKm, so both dots are on the SAME
  // latest-common-checkpoint basis. This view model must surface exactly those values —
  // it never re-derives my dot from a live GPS number.
  const participants = buildDuelArenaParticipants({
    currentUserPaceLabel: '06:00/km',
    currentUserLiveStatus: 'running',
    // Checkpoint basis: my synced 1.20, opponent synced 1.05 (gap +0.15). If my dot ever
    // read live GPS it would be a different, larger number — this asserts it does not.
    currentDistanceKm: 1.2,
    opponent: opponent({ liveStatus: 'running' }),
    opponentPaceLabel: '06:20/km',
    opponentDistanceKm: 1.05,
    liveGapKm: 0.15,
  });

  const me = participants.find((participant) => participant.isCurrentUser);
  const rival = participants.find((participant) => !participant.isCurrentUser);
  assert.equal(me?.distanceKm, 1.2);
  assert.equal(rival?.distanceKm, 1.05);
  // isLeader is derived from the checkpoint-based gap, not from any live number.
  assert.equal(me?.isLeader, true);
  assert.equal(rival?.isLeader, false);
  // No verdict decoration mid-run (nobody finished) — WIN/LOSE never comes from distances.
  assert.equal(me?.resultLabel, null);
  assert.equal(rival?.resultLabel, null);
});

test('duel arena WIN/LOSE stays from finishedAt/resultLabel even when the checkpoint gap disagrees', () => {
  // Adversarial: my checkpoint distance is BEHIND the opponent's, but I finished FIRST.
  // The verdict must follow finish order (finishedAt), never the checkpoint distances.
  const participants = buildDuelArenaParticipants({
    currentUserPaceLabel: '완주',
    currentUserLiveStatus: 'finished',
    currentUserFinishedAt: '2026-05-12T00:09:00.000Z',
    currentDistanceKm: 4.8, // my last common-checkpoint distance is lower...
    opponent: opponent({
      liveStatus: 'finished',
      finishedAt: '2026-05-12T00:09:30.000Z', // ...but the opponent finished later
    }),
    opponentPaceLabel: '완주',
    opponentDistanceKm: 5, // opponent's checkpoint distance is higher
    liveGapKm: -0.2,
  });

  assert.equal(participants.find((participant) => participant.isCurrentUser)?.resultLabel, 'WIN');
  assert.equal(participants.find((participant) => !participant.isCurrentUser)?.resultLabel, 'LOSE');
});

test('room linked duel view model uses received remote distance and pace after active start', () => {
  const participants = buildRoomLinkedDuelPlaceholderParticipants({
    room: room(),
    hasRoomLinkedDuelContext: true,
    currentUserId: 'me',
    currentDistanceKm: 0.72,
    currentUserPaceLabel: '06:05/km',
    opponent: opponent({
      liveDistanceKm: 0.54,
      liveElapsedSeconds: 210,
      livePace: '06:28/km',
      liveUpdatedAt: '2026-05-12T00:03:30.000Z',
    }),
    roomLinkedMatchContext: { state: 'active' },
  });

  const me = participants.find((participant) => participant.isCurrentUser)!;
  const remote = participants.find((participant) => !participant.isCurrentUser)!;

  assert.equal(me.distanceKm, 0.72);
  assert.equal(remote.distanceKm, 0.54);
  assert.equal(remote.paceLabel, '06:29/km');
  assert.equal(me.isLeader, true);
});

test('room linked duel view model marks received remote forfeit status', () => {
  const participants = buildRoomLinkedDuelPlaceholderParticipants({
    room: room(),
    hasRoomLinkedDuelContext: true,
    currentUserId: 'me',
    currentDistanceKm: 0.72,
    currentUserPaceLabel: '06:05/km',
    opponent: opponent({
      liveDistanceKm: 0.54,
      liveElapsedSeconds: 210,
      livePace: '06:28/km',
      liveStatus: 'forfeited',
      liveUpdatedAt: '2026-05-12T00:03:30.000Z',
    }),
    roomLinkedMatchContext: { state: 'active' },
  });

  const remote = participants.find((participant) => !participant.isCurrentUser)!;

  assert.equal(remote.liveStatus, 'forfeited');
  assert.equal(remote.paceLabel, '기권');
  assert.equal(remote.resultLabel, 'LOSE');
  assert.equal(remote.showPaceBubble, true);
});

test('room linked duel view model keeps room terminal forfeit over stale running status', () => {
  const participants = buildRoomLinkedDuelPlaceholderParticipants({
    room: room({
      participants: [
        room().participants[0],
        {
          ...room().participants[1],
          liveDistanceKm: 0.5,
          liveElapsedSeconds: 180,
          livePace: '06:00/km',
          liveStatus: 'forfeited',
        },
      ],
    }),
    hasRoomLinkedDuelContext: true,
    currentUserId: 'me',
    currentDistanceKm: 0.72,
    currentUserPaceLabel: '06:05/km',
    opponent: opponent({
      liveDistanceKm: 0.54,
      liveElapsedSeconds: 210,
      livePace: '06:28/km',
      liveStatus: 'running',
    }),
    roomLinkedMatchContext: { state: 'active' },
  });

  const remote = participants.find((participant) => !participant.isCurrentUser)!;

  assert.equal(remote.liveStatus, 'forfeited');
  assert.equal(remote.paceLabel, '기권');
  assert.equal(remote.progressPaceLabel, '06:29/km');
});

test('group arena view model highlights current runner and featured rivals', () => {
  const participants = buildGroupArenaParticipants({
    standings: [
      {
        ...opponent({ id: 'me', name: '나' }),
        seedRank: 1,
        seedSummary: '1번 시드',
        rank: 1,
        currentDistanceKm: 1.1,
        gapAheadKm: null,
        gapLeaderKm: 0,
        isForfeited: false,
        isCurrentUser: true,
      },
      {
        ...opponent({ id: 'rival', name: '라이벌', liveStatus: 'running', liveDistanceKm: 0.9, liveElapsedSeconds: 360 }),
        seedRank: 2,
        seedSummary: '2번 시드',
        rank: 2,
        currentDistanceKm: 0.9,
        gapAheadKm: 0.2,
        gapLeaderKm: 0.2,
        isForfeited: false,
        isCurrentUser: false,
      },
    ],
    currentUserPaceLabel: '05:55/km',
    hasOfficialStart: true,
    featuredParticipantIds: new Set(['rival']),
  });

  assert.equal(participants[0].name, '나');
  assert.equal(participants[0].rankLabel, '1');
  assert.equal(participants[0].emphasis, 'compact');
  assert.equal(participants[1].emphasis, 'featured');
});
