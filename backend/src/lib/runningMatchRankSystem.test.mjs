import assert from 'node:assert/strict';

import { DUEL_LP, GROUP_LP, INITIAL_RANK } from './rankSystem.mjs';
import {
  leaveRunningMatch,
  updateRunningMatchProgress,
} from './runningMatchStoreHelpers.mjs';
import {
  buildOfficialSessionStandings,
  buildParticipantLiveSnapshot,
} from './runningMatchSessionStoreHelpers.mjs';

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createUser(id, rankState = { tier: '입문', lp: 50 }) {
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
  forfeitedAt = null,
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
    ...(forfeitedAt ? { forfeitedAt } : {}),
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

function createSession({ id = 'rank-match', mode = 'duel', participants, isPartyRun = false, lpApplied = false }) {
  return {
    id,
    mode,
    isTestMatch: false,
    isPartyRun,
    distanceKm: 1,
    slotStartAt: iso(-5 * 60 * 1000),
    startedAt: iso(-5 * 60 * 1000),
    createdAt: iso(-10 * 60 * 1000),
    matchedAt: iso(-10 * 60 * 1000),
    participants,
    ...(lpApplied ? { lpApplied: true } : {}),
  };
}

function createProfileSnapshot(id, averagePace = '08:00/km') {
  return {
    id,
    name: id,
    tag: id,
    districtName: '일산서구',
    averagePaceMinutes: Number(averagePace.slice(0, 2)),
    averagePace,
    distanceLevel: 1,
    levelLabel: '입문',
    weeklyDistanceKm: 0,
    lifetimeDistanceKm: 0,
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
  const winner = createUser('party-winner');
  const loser = createUser('party-loser');
  const session = createSession({
    isPartyRun: true,
    participants: [
      createParticipant('party-winner', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
      }),
      createParticipant('party-loser', 2, {
        liveDistanceKm: 0.8,
        liveElapsedSeconds: 290,
      }),
    ],
  });
  const store = createStore(
    [winner, loser],
    [createRun('party-winner', '06:00/km'), createRun('party-loser', '06:05/km')],
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

{
  const session = createSession({
    participants: [
      createParticipant('real-runner', 1, {
        liveDistanceKm: 0.72,
        liveElapsedSeconds: 280,
        livePace: '06:29/km',
        liveUpdatedAt: iso(-1000),
        profileSnapshot: createProfileSnapshot('real-runner', '08:00/km'),
      }),
    ],
  });

  const snapshot = buildParticipantLiveSnapshot(session, session.participants[0]);

  assert.equal(snapshot.liveDistanceKm, 0.72);
  assert.equal(snapshot.liveElapsedSeconds, 280);
  assert.equal(snapshot.livePace, '06:29/km');
  assert.equal(snapshot.liveStatus, 'running');
}

{
  const session = createSession({
    participants: [
      createParticipant('bot-runner', 1, {
        liveStatus: 'ready',
        liveDistanceKm: 0,
        liveElapsedSeconds: 0,
        livePace: '--:--/km',
        liveUpdatedAt: null,
        profileSnapshot: createProfileSnapshot('bot-runner', '08:00/km'),
      }),
    ],
  });

  const snapshot = buildParticipantLiveSnapshot(session, session.participants[0]);

  assert.equal(snapshot.livePace, '08:00/km');
  assert.equal(snapshot.liveStatus, 'running');
  assert.ok(snapshot.liveDistanceKm > 0);
}

{
  const survivor = createUser('survivor');
  const finisher = createUser('finisher');
  const session = createSession({
    participants: [
      createParticipant('survivor', 1, {
        liveStatus: 'running',
        liveDistanceKm: 4.2,
        liveElapsedSeconds: 1800,
        livePace: '07:08/km',
      }),
      createParticipant('finisher', 2, {
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1500,
        livePace: '05:00/km',
        finishedAt: iso(-1000),
      }),
    ],
  });
  session.distanceKm = 5;
  const store = createStore([survivor, finisher], [createRun('survivor'), createRun('finisher')], session);
  const standings = buildOfficialSessionStandings(store, session);
  const survivorStanding = standings.find((standing) => standing.userId === 'survivor');
  const finisherStanding = standings.find((standing) => standing.userId === 'finisher');

  assert.equal(survivorStanding.officialElapsedSeconds, 1800);
  assert.equal(survivorStanding.officialDistanceKm, 4.2);
  assert.equal(finisherStanding.officialDistanceKm, 5);
  assert.equal(finisherStanding.liveStatus, 'finished');
}

{
  const left = createUser('left');
  const right = createUser('right');
  const session = createSession({
    participants: [
      createParticipant('left', 1, {
        liveStatus: 'running',
        liveDistanceKm: 1.6,
        liveElapsedSeconds: 600,
        livePace: '06:15/km',
      }),
      createParticipant('right', 2, {
        liveStatus: 'running',
        liveDistanceKm: 1.5,
        liveElapsedSeconds: 500,
        livePace: '05:33/km',
      }),
    ],
  });
  session.distanceKm = 5;
  const store = createStore([left, right], [createRun('left'), createRun('right')], session);
  const standings = buildOfficialSessionStandings(store, session);
  const leftStanding = standings.find((standing) => standing.userId === 'left');

  assert.equal(leftStanding.officialElapsedSeconds, 500);
  assert.equal(leftStanding.officialDistanceKm, 1.33);
}

{
  const left = createUser('left-finished');
  const right = createUser('right-finished');
  const session = createSession({
    participants: [
      createParticipant('left-finished', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1600,
        livePace: '05:20/km',
        finishedAt: iso(-1000),
      }),
      createParticipant('right-finished', 2, {
        liveStatus: 'finished',
        liveDistanceKm: 4.9,
        liveElapsedSeconds: 1700,
        livePace: '05:47/km',
        finishedAt: iso(-500),
      }),
    ],
  });
  session.distanceKm = 5;
  const store = createStore([left, right], [createRun('left-finished'), createRun('right-finished')], session);
  const standings = buildOfficialSessionStandings(store, session);

  assert.equal(standings.find((standing) => standing.userId === 'left-finished').officialDistanceKm, 5);
  assert.equal(standings.find((standing) => standing.userId === 'right-finished').officialDistanceKm, 4.9);
}

// Two forfeiters in a group run must NOT tie: the runner who forfeited LATER ranks
// better (2nd), the EARLIER forfeit ranks worse (3rd/last).
{
  const survivor = createUser('group-survivor');
  const lateQuitter = createUser('late-quitter');
  const earlyQuitter = createUser('early-quitter');
  const session = createSession({
    mode: 'group',
    participants: [
      createParticipant('group-survivor', 1, {
        liveStatus: 'running',
        liveDistanceKm: 3.0,
        liveElapsedSeconds: 1200,
        livePace: '06:40/km',
      }),
      // Both forfeiters end up with officialDistanceKm 0 (forfeited => not officialReady),
      // so distance ties and forfeitedAt must break the tie (later forfeit = better).
      createParticipant('early-quitter', 2, {
        liveStatus: 'forfeited',
        liveDistanceKm: 1.2,
        liveElapsedSeconds: 400,
        livePace: '05:33/km',
        liveUpdatedAt: iso(-200000),
        forfeitedAt: iso(-200000),
      }),
      createParticipant('late-quitter', 3, {
        liveStatus: 'forfeited',
        liveDistanceKm: 1.2,
        liveElapsedSeconds: 600,
        livePace: '08:20/km',
        liveUpdatedAt: iso(-100000),
        forfeitedAt: iso(-100000),
      }),
    ],
  });
  session.distanceKm = 5;
  const store = createStore(
    [survivor, lateQuitter, earlyQuitter],
    [createRun('group-survivor'), createRun('late-quitter'), createRun('early-quitter')],
    session,
  );
  const standings = buildOfficialSessionStandings(store, session);

  const survivorStanding = standings.find((standing) => standing.userId === 'group-survivor');
  const lateStanding = standings.find((standing) => standing.userId === 'late-quitter');
  const earlyStanding = standings.find((standing) => standing.userId === 'early-quitter');

  // Active survivor ranks above both forfeiters.
  assert.equal(survivorStanding.officialRank, 1);
  // Later forfeit ranks better than earlier forfeit; ranks are DISTINCT (no tie).
  assert.equal(lateStanding.officialRank, 2);
  assert.equal(earlyStanding.officialRank, 3);
  assert.notEqual(lateStanding.officialRank, earlyStanding.officialRank);
}

// buildParticipantLiveSnapshot exposes forfeitedAt when the participant has forfeited.
{
  const forfeitedAtIso = iso(-50000);
  const session = createSession({
    mode: 'group',
    participants: [
      createParticipant('snap-quitter', 1, {
        liveStatus: 'forfeited',
        liveDistanceKm: 0.8,
        liveElapsedSeconds: 300,
        forfeitedAt: forfeitedAtIso,
      }),
    ],
  });
  session.distanceKm = 5;
  const snapshot = buildParticipantLiveSnapshot(session, session.participants[0]);
  assert.equal(snapshot.forfeitedAt, forfeitedAtIso);
}
