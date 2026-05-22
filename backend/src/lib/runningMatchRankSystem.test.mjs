import assert from 'node:assert/strict';

import { DUEL_LP, GROUP_LP, INITIAL_RANK } from './rankSystem.mjs';
import {
  leaveRunningMatch,
  updateRunningMatchProgress,
} from './runningMatchStoreHelpers.mjs';

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createUser(id, rankState = { tier: '아이언', division: 4, lp: 50 }) {
  return {
    id,
    username: id,
    name: id,
    realName: id,
    publicTag: id,
    provinceName: '경기도',
    cityName: '고양시',
    districtName: '일산서구',
    connectedSources: [],
    notificationSettings: {
      friendAlerts: true,
      districtAlerts: true,
      marketAlerts: true,
    },
    rankState: { ...rankState },
    createdAt: iso(-24 * 60 * 60 * 1000),
  };
}

function createRun(userId, pace = '06:00/km') {
  return {
    id: `${userId}-run`,
    userId,
    date: iso(-24 * 60 * 60 * 1000).slice(0, 10),
    distanceKm: 5,
    pace,
    source: 'RunningGround',
    sourceType: 'manual',
    startedAt: iso(-24 * 60 * 60 * 1000),
    endedAt: iso(-24 * 60 * 60 * 1000 + 30 * 60 * 1000),
    durationSeconds: 30 * 60,
    createdAt: iso(-24 * 60 * 60 * 1000),
  };
}

function createParticipant(userId, seedRank, {
  liveStatus = 'running',
  liveDistanceKm = 0,
  liveElapsedSeconds = 0,
  livePace = '06:00/km',
  liveUpdatedAt = iso(-1000),
  finishedAt = null,
  profileSnapshot = null,
} = {}) {
  return {
    userId,
    seedRank,
    ...(profileSnapshot ? { profileSnapshot } : {}),
    acceptedAt: null,
    liveStatus,
    liveDistanceKm,
    liveElapsedSeconds,
    livePace,
    liveUpdatedAt,
    finishedAt,
  };
}

function createStore(users, runs, session) {
  return {
    users,
    runs,
    matchSessions: [session],
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
  };
}

function createSession({ id = 'rank-match', mode = 'duel', participants, lpApplied = false }) {
  return {
    id,
    mode,
    isTestMatch: false,
    distanceKm: 1,
    slotStartAt: iso(-5 * 60 * 1000),
    startedAt: iso(-5 * 60 * 1000),
    createdAt: iso(-10 * 60 * 1000),
    matchedAt: iso(-10 * 60 * 1000),
    participants,
    ...(lpApplied ? { lpApplied: true } : {}),
  };
}

{
  const winner = createUser('winner');
  const loser = createUser('loser');
  const session = createSession({
    participants: [
      createParticipant('winner', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
      }),
      createParticipant('loser', 2, {
        liveDistanceKm: 0.8,
        liveElapsedSeconds: 290,
      }),
    ],
  });
  const store = createStore(
    [winner, loser],
    [createRun('winner', '06:00/km'), createRun('loser', '05:40/km')],
    session,
  );

  updateRunningMatchProgress(store, loser, {
    matchId: session.id,
    distanceKm: 0.8,
    elapsedSeconds: 310,
    currentPace: '06:20/km',
    status: 'finished',
  });

  assert.equal(winner.rankState.lp, 50 + DUEL_LP.winVsFaster);
  assert.equal(loser.rankState.lp, 50 + DUEL_LP.lossVsSlower);
  assert.equal(session.lpApplied, true);
}

{
  const winner = createUser('winner');
  const loser = createUser('loser');
  const session = createSession({
    participants: [
      createParticipant('winner', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
      }),
      createParticipant('loser', 2, {
        liveDistanceKm: 0.5,
        liveElapsedSeconds: 240,
      }),
    ],
  });
  const store = createStore(
    [winner, loser],
    [createRun('winner', '06:00/km'), createRun('loser', '06:05/km')],
    session,
  );

  leaveRunningMatch(store, loser, { matchId: session.id });

  assert.equal(winner.rankState.lp, 50 + DUEL_LP.winVsSimilar);
  assert.equal(loser.rankState.lp, 50 + DUEL_LP.lossVsSimilar);
  assert.equal(session.lpApplied, true);
}

{
  const users = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => createUser(id));
  const session = createSession({
    id: 'group-rank-match',
    mode: 'group',
    participants: [
      createParticipant('p1', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
      }),
      createParticipant('p2', 2, {
        liveStatus: 'finished',
        liveDistanceKm: 0.8,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
      }),
      createParticipant('p3', 3, {
        liveStatus: 'finished',
        liveDistanceKm: 0.6,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
      }),
      createParticipant('p4', 4, {
        liveStatus: 'finished',
        liveDistanceKm: 0.4,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
      }),
      createParticipant('p5', 5, {
        liveDistanceKm: 0.2,
        liveElapsedSeconds: 290,
      }),
    ],
  });
  const store = createStore(users, users.map((user) => createRun(user.id)), session);

  updateRunningMatchProgress(store, users[4], {
    matchId: session.id,
    distanceKm: 0.2,
    elapsedSeconds: 300,
    currentPace: '08:00/km',
    status: 'finished',
  });

  assert.equal(users[0].rankState.lp, 50 + GROUP_LP.top);
  assert.equal(users[1].rankState.lp, 50 + GROUP_LP.middle);
  assert.equal(users[2].rankState.lp, 50 + GROUP_LP.middle);
  assert.equal(users[3].rankState.lp, 50 + GROUP_LP.bottom);
  assert.equal(users[4].rankState.lp, 50 + GROUP_LP.bottom);
  assert.equal(session.lpApplied, true);
}

{
  const winner = createUser('winner');
  const loser = createUser('loser');
  const session = createSession({
    lpApplied: true,
    participants: [
      createParticipant('winner', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
      }),
      createParticipant('loser', 2, {
        liveDistanceKm: 0.8,
        liveElapsedSeconds: 290,
      }),
    ],
  });
  const store = createStore(
    [winner, loser],
    [createRun('winner', '06:00/km'), createRun('loser', '06:05/km')],
    session,
  );

  updateRunningMatchProgress(store, loser, {
    matchId: session.id,
    distanceKm: 0.8,
    elapsedSeconds: 300,
    currentPace: '06:20/km',
    status: 'finished',
  });

  assert.equal(winner.rankState.lp, 50);
  assert.equal(loser.rankState.lp, 50);
  assert.equal(session.lpApplied, true);
}

{
  const winner = createUser('winner', INITIAL_RANK);
  const runner = createUser('runner', INITIAL_RANK);
  const session = createSession({
    participants: [
      createParticipant('winner', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
      }),
      createParticipant('runner', 2, {
        liveDistanceKm: 0.5,
        liveElapsedSeconds: 200,
      }),
    ],
  });
  const store = createStore(
    [winner, runner],
    [createRun('winner'), createRun('runner')],
    session,
  );

  updateRunningMatchProgress(store, runner, {
    matchId: session.id,
    distanceKm: 0.6,
    elapsedSeconds: 260,
    currentPace: '07:00/km',
    status: 'running',
  });

  assert.deepEqual(winner.rankState, INITIAL_RANK);
  assert.deepEqual(runner.rankState, INITIAL_RANK);
  assert.equal(session.lpApplied, undefined);
}

{
  const winner = createUser('winner');
  const session = createSession({
    participants: [
      createParticipant('winner', 1, {
        liveDistanceKm: 0.9,
        liveElapsedSeconds: 290,
      }),
      createParticipant('missing-user', 2, {
        liveStatus: 'finished',
        liveDistanceKm: 0.8,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
        profileSnapshot: {
          id: 'missing-user',
          name: 'missing-user',
          tag: 'missing-user',
          districtName: '일산서구',
          averagePaceMinutes: 6,
          averagePace: '06:00/km',
          distanceLevel: 0,
          levelLabel: '입문',
          weeklyDistanceKm: 0,
          lifetimeDistanceKm: 0,
        },
      }),
    ],
  });
  const store = createStore(
    [winner],
    [createRun('winner')],
    session,
  );

  updateRunningMatchProgress(store, winner, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 300,
    currentPace: '06:00/km',
    status: 'finished',
  });

  assert.equal(winner.rankState.lp, 50);
  assert.equal(session.lpApplied, undefined);
}
