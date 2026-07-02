import assert from 'node:assert/strict';

import { DUEL_LP, GROUP_LP, INITIAL_RANK } from './rankSystem.mjs';
import {
  buildRunningMatchStatusResponse,
  leaveRunningMatch,
  updateRunningMatchProgress,
} from './runningMatchStoreHelpers.mjs';
import {
  buildDuelVerdict,
  buildOfficialSessionStandings,
  buildParticipantLiveSnapshot,
  isParticipantSealedDnf,
} from './runningMatchSessionStoreHelpers.mjs';
import { MATCH_DUEL_FINISH_FALLBACK_MS } from './matchConstants.mjs';

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
  finishElapsedSeconds = null,
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
    finishElapsedSeconds,
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

  // A snapshot-only opponent makes this a TEST match (isTestMatchSession): rank LP is
  // skipped entirely AND lpApplied is sealed, so a retry poll can never re-enter the
  // LP path. (Previously the bot lookup threw mid-application, leaving lpApplied unset
  // and risking repeated LP awards on retry.)
  assert.equal(winner.rankState.lp, 50);
  assert.equal(session.lpApplied, true);
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

// ===========================================================================
// Fairness fix: MEASURED finish time is authoritative, server returns a verdict.
// ===========================================================================

// B1 — finishElapsedSeconds is recorded ONCE (first-write-wins) from the runner's
// OWN client-reported elapsed at the finishing sample, and then FROZEN: a later
// heartbeat must NOT change it, and the server-clock projection must NOT push the
// finished runner's recorded elapsed upward.
{
  const winner = createUser('record-winner');
  const loser = createUser('record-loser');
  const session = createSession({
    participants: [
      createParticipant('record-winner', 1, {
        liveStatus: 'running',
        liveDistanceKm: 0.9,
        liveElapsedSeconds: 280,
      }),
      createParticipant('record-loser', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0.9,
        liveElapsedSeconds: 280,
      }),
    ],
  });
  // Make the session very young so the server-backed projection cannot inflate the
  // recorded elapsed past the client-reported finishing sample.
  session.distanceKm = 1;
  session.slotStartAt = iso(-1000);
  session.startedAt = iso(-1000);
  const store = createStore(
    [winner, loser],
    [createRun('record-winner'), createRun('record-loser')],
    session,
  );

  updateRunningMatchProgress(store, winner, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 305,
    currentPace: '05:05/km',
    status: 'finished',
  });

  const winnerParticipant = session.participants.find((p) => p.userId === 'record-winner');
  assert.equal(winnerParticipant.finishElapsedSeconds, 305);
  assert.equal(typeof winnerParticipant.finishedAt, 'string');

  // A later heartbeat with a LARGER elapsed must NOT move the frozen finish time,
  // and the recorded live elapsed must stay frozen at the finishing value.
  updateRunningMatchProgress(store, winner, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 900,
    currentPace: '05:05/km',
    status: 'finished',
  });
  assert.equal(winnerParticipant.finishElapsedSeconds, 305);
  assert.equal(winnerParticipant.liveElapsedSeconds, 305);
}

// B3 — duel rank is decided by MEASURED finishElapsedSeconds (ascending), NOT by
// server receive time. The runner who measured a faster finish wins even when their
// finish was RECEIVED later.
{
  const faster = createUser('measured-faster');
  const slower = createUser('measured-slower');
  const session = createSession({
    participants: [
      // Slower measured finish (320s) but RECEIVED earlier.
      createParticipant('measured-slower', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 320,
        finishedAt: iso(-5000),
        finishElapsedSeconds: 320,
      }),
      // Faster measured finish (300s) but RECEIVED later.
      createParticipant('measured-faster', 2, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
        finishElapsedSeconds: 300,
      }),
    ],
  });
  session.distanceKm = 1;
  const store = createStore(
    [faster, slower],
    [createRun('measured-faster'), createRun('measured-slower')],
    session,
  );

  const standings = buildOfficialSessionStandings(store, session);
  assert.equal(standings.find((s) => s.userId === 'measured-faster').officialRank, 1);
  assert.equal(standings.find((s) => s.userId === 'measured-slower').officialRank, 2);
}

// B2 — duelVerdict resolves win/lose from the REQUESTING user's perspective once
// BOTH finishes have landed, and BOTH paces derive from the SAME official elapsed.
{
  const me = createUser('verdict-me');
  const rival = createUser('verdict-rival');
  const session = createSession({
    participants: [
      createParticipant('verdict-me', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-2000),
        finishElapsedSeconds: 300,
      }),
      createParticipant('verdict-rival', 2, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 360,
        finishedAt: iso(-1000),
        finishElapsedSeconds: 360,
      }),
    ],
  });
  session.distanceKm = 1;
  const store = createStore(
    [me, rival],
    [createRun('verdict-me'), createRun('verdict-rival')],
    session,
  );
  const standings = buildOfficialSessionStandings(store, session);

  const myVerdict = buildDuelVerdict(session, standings, 'verdict-me');
  assert.equal(myVerdict.resolved, true);
  assert.equal(myVerdict.outcome, 'win');
  assert.equal(myVerdict.winnerUserId, 'verdict-me');
  assert.equal(myVerdict.myFinishElapsedSeconds, 300);
  assert.equal(myVerdict.opponentFinishElapsedSeconds, 360);
  // 1km in 300s = 5:00/km, in 360s = 6:00/km — both from the official numbers.
  assert.equal(myVerdict.myPaceLabel, '5:00/km');
  assert.equal(myVerdict.opponentPaceLabel, '6:00/km');

  // The SAME verdict from the rival's perspective must flip to 'lose' with an
  // unchanged winner — both phones agree.
  const rivalVerdict = buildDuelVerdict(session, standings, 'verdict-rival');
  assert.equal(rivalVerdict.outcome, 'lose');
  assert.equal(rivalVerdict.winnerUserId, 'verdict-me');
  assert.equal(rivalVerdict.myFinishElapsedSeconds, 360);
  assert.equal(rivalVerdict.opponentFinishElapsedSeconds, 300);
}

// B2 — duelVerdict stays 'pending' (unresolved) while only one runner has finished
// and the fallback window has NOT yet elapsed.
{
  const me = createUser('pending-me');
  const rival = createUser('pending-rival');
  const session = createSession({
    participants: [
      createParticipant('pending-me', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
        finishElapsedSeconds: 300,
      }),
      createParticipant('pending-rival', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0.7,
        liveElapsedSeconds: 250,
      }),
    ],
  });
  session.distanceKm = 1;
  const store = createStore(
    [me, rival],
    [createRun('pending-me'), createRun('pending-rival')],
    session,
  );
  const standings = buildOfficialSessionStandings(store, session);
  const verdict = buildDuelVerdict(session, standings, 'pending-me');

  assert.equal(verdict.resolved, false);
  assert.equal(verdict.outcome, 'pending');
  assert.equal(verdict.winnerUserId, null);
  assert.equal(verdict.myFinishElapsedSeconds, 300);
  assert.equal(verdict.opponentFinishElapsedSeconds, null);
}

// B4 — server-side fallback: once the bounded window elapses after the first finish
// and the opponent's finish never lands, the verdict resolves (missing runner = DNF)
// so neither client is stranded on 'pending'.
{
  const me = createUser('fallback-me');
  const rival = createUser('fallback-rival');
  const session = createSession({
    participants: [
      createParticipant('fallback-me', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
        finishElapsedSeconds: 300,
      }),
      createParticipant('fallback-rival', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0.6,
        liveElapsedSeconds: 240,
        liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
      }),
    ],
  });
  session.distanceKm = 1;
  const store = createStore(
    [me, rival],
    [createRun('fallback-me'), createRun('fallback-rival')],
    session,
  );
  const standings = buildOfficialSessionStandings(store, session);
  const verdict = buildDuelVerdict(session, standings, 'fallback-me');

  assert.equal(verdict.resolved, true);
  assert.equal(verdict.outcome, 'win');
  assert.equal(verdict.winnerUserId, 'fallback-me');
  assert.equal(verdict.opponentFinishElapsedSeconds, null);
}

// B2 — an exact dead-heat on MEASURED finish elapsed resolves to a deterministic
// 'draw' with a null winner.
{
  const a = createUser('draw-a');
  const b = createUser('draw-b');
  const session = createSession({
    participants: [
      createParticipant('draw-a', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-2000),
        finishElapsedSeconds: 300,
      }),
      createParticipant('draw-b', 2, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-1000),
        finishElapsedSeconds: 300,
      }),
    ],
  });
  session.distanceKm = 1;
  const store = createStore([a, b], [createRun('draw-a'), createRun('draw-b')], session);
  const standings = buildOfficialSessionStandings(store, session);

  const verdictA = buildDuelVerdict(session, standings, 'draw-a');
  const verdictB = buildDuelVerdict(session, standings, 'draw-b');
  assert.equal(verdictA.resolved, true);
  assert.equal(verdictA.outcome, 'draw');
  assert.equal(verdictA.winnerUserId, null);
  assert.equal(verdictB.outcome, 'draw');
  assert.equal(verdictB.winnerUserId, null);
}

// B2 — a forfeit resolves the verdict immediately: the survivor wins, the forfeiter
// loses, and finishElapsedSeconds stays null for the forfeiter.
{
  const survivor = createUser('forfeit-survivor');
  const quitter = createUser('forfeit-quitter');
  const session = createSession({
    participants: [
      createParticipant('forfeit-survivor', 1, {
        liveStatus: 'running',
        liveDistanceKm: 0.9,
        liveElapsedSeconds: 280,
      }),
      createParticipant('forfeit-quitter', 2, {
        liveStatus: 'forfeited',
        liveDistanceKm: 0.5,
        liveElapsedSeconds: 200,
        forfeitedAt: iso(-1000),
      }),
    ],
  });
  session.distanceKm = 1;
  const store = createStore(
    [survivor, quitter],
    [createRun('forfeit-survivor'), createRun('forfeit-quitter')],
    session,
  );
  const quitterParticipant = session.participants.find((p) => p.userId === 'forfeit-quitter');
  assert.equal(quitterParticipant.finishElapsedSeconds, null);

  const standings = buildOfficialSessionStandings(store, session);
  const survivorVerdict = buildDuelVerdict(session, standings, 'forfeit-survivor');
  assert.equal(survivorVerdict.resolved, true);
  assert.equal(survivorVerdict.outcome, 'win');
  assert.equal(survivorVerdict.winnerUserId, 'forfeit-survivor');

  const quitterVerdict = buildDuelVerdict(session, standings, 'forfeit-quitter');
  assert.equal(quitterVerdict.outcome, 'lose');
  assert.equal(quitterVerdict.winnerUserId, 'forfeit-survivor');
}

// B2 — the duel status response surfaces the requesting user's OWN authoritative
// finish (currentUserFinishElapsedSeconds) and the duelVerdict object.
{
  const me = createUser('self-me');
  const rival = createUser('self-rival');
  const session = createSession({
    participants: [
      createParticipant('self-me', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 312,
        finishedAt: iso(-2000),
        finishElapsedSeconds: 312,
      }),
      createParticipant('self-rival', 2, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 333,
        finishedAt: iso(-1000),
        finishElapsedSeconds: 333,
      }),
    ],
  });
  session.distanceKm = 1;
  const store = createStore(
    [me, rival],
    [createRun('self-me'), createRun('self-rival')],
    session,
  );

  const response = buildRunningMatchStatusResponse(store, me, {
    mode: 'duel',
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    matchId: session.id,
    sessionOverride: session,
  });

  assert.equal(response.currentUserFinishElapsedSeconds, 312);
  assert.ok(response.duelVerdict);
  assert.equal(response.duelVerdict.resolved, true);
  assert.equal(response.duelVerdict.outcome, 'win');
  assert.equal(response.duelVerdict.winnerUserId, 'self-me');
  assert.equal(response.duelVerdict.myFinishElapsedSeconds, 312);
  assert.equal(response.duelVerdict.opponentFinishElapsedSeconds, 333);
}

// ===========================================================================
// F1-F5 fairness hardening (1 second decides the match).
// ===========================================================================

// F1 — a client-reported elapsedSeconds of 0, with NO prior progress and a brand-new
// session (server-backed projection ~0), must NEVER be frozen as the official finish.
// A 0-second "finish" cannot win: finishElapsedSeconds stays null even though the runner
// is marked finished. (Once any positive elapsed exists it is frozen — see the next F1
// case — but a literal 0 with nothing positive available is rejected outright.)
{
  const cheater = createUser('zero-cheater');
  const honest = createUser('zero-honest');
  const session = createSession({
    participants: [
      createParticipant('zero-cheater', 1, {
        liveStatus: 'running',
        liveDistanceKm: 0,
        liveElapsedSeconds: 0,
        liveUpdatedAt: null,
      }),
      createParticipant('zero-honest', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0,
        liveElapsedSeconds: 0,
        liveUpdatedAt: null,
      }),
    ],
  });
  session.distanceKm = 1;
  // Session starts NOW so the server-backed elapsed projection is ~0 (no positive value
  // anywhere to fall back to).
  session.slotStartAt = iso(0);
  session.startedAt = iso(0);
  const store = createStore(
    [cheater, honest],
    [createRun('zero-cheater'), createRun('zero-honest')],
    session,
  );

  updateRunningMatchProgress(store, cheater, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 0,
    currentPace: '00:00/km',
    status: 'finished',
  });

  const cheaterParticipant = session.participants.find((p) => p.userId === 'zero-cheater');
  // The 0 finish is rejected as the frozen rank key — no fraudulent 0-second win.
  assert.equal(cheaterParticipant.liveStatus, 'finished');
  assert.equal(cheaterParticipant.finishElapsedSeconds, null);
}

// F1 — a non-integer / invalid elapsedSeconds is likewise never frozen; the positive
// normalized elapsed is used instead (first-write-wins still positive-only).
{
  const a = createUser('invalid-a');
  const b = createUser('invalid-b');
  const session = createSession({
    participants: [
      createParticipant('invalid-a', 1, {
        liveStatus: 'running',
        liveDistanceKm: 0.9,
        liveElapsedSeconds: 250,
      }),
      createParticipant('invalid-b', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0.9,
        liveElapsedSeconds: 250,
      }),
    ],
  });
  session.distanceKm = 1;
  session.slotStartAt = iso(-1000);
  session.startedAt = iso(-1000);
  const store = createStore([a, b], [createRun('invalid-a'), createRun('invalid-b')], session);

  updateRunningMatchProgress(store, a, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 12.7,
    currentPace: '05:00/km',
    status: 'finished',
  });

  const aParticipant = session.participants.find((p) => p.userId === 'invalid-a');
  // 12.7 is not an integer → rejected. The previous frozen elapsed (250) carries forward.
  assert.equal(aParticipant.finishElapsedSeconds, 250);
  assert.ok(Number.isInteger(aParticipant.finishElapsedSeconds) && aParticipant.finishElapsedSeconds > 0);
}

// F2 — at the finish transition the displayed self-time (liveElapsedSeconds) equals the
// authoritative rank key (finishElapsedSeconds) so the shown time and the ranked time
// can never diverge on the finishing push, and BOTH stay frozen on later pushes.
{
  const me = createUser('f2-me');
  const rival = createUser('f2-rival');
  const session = createSession({
    participants: [
      createParticipant('f2-me', 1, {
        liveStatus: 'running',
        liveDistanceKm: 0.9,
        liveElapsedSeconds: 300,
      }),
      createParticipant('f2-rival', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0.9,
        liveElapsedSeconds: 300,
      }),
    ],
  });
  session.distanceKm = 1;
  session.slotStartAt = iso(-1000);
  session.startedAt = iso(-1000);
  const store = createStore([me, rival], [createRun('f2-me'), createRun('f2-rival')], session);

  updateRunningMatchProgress(store, me, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 318,
    currentPace: '05:18/km',
    status: 'finished',
  });

  const meParticipant = session.participants.find((p) => p.userId === 'f2-me');
  assert.equal(meParticipant.finishElapsedSeconds, 318);
  // F2: displayed self-time == frozen rank key on the finishing push.
  assert.equal(meParticipant.liveElapsedSeconds, meParticipant.finishElapsedSeconds);

  // A later push keeps BOTH frozen.
  updateRunningMatchProgress(store, me, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 999,
    currentPace: '05:18/km',
    status: 'finished',
  });
  assert.equal(meParticipant.finishElapsedSeconds, 318);
  assert.equal(meParticipant.liveElapsedSeconds, 318);
}

// F3 — the standings projection (buildOfficialStandingFields, via the response builder)
// surfaces finishElapsedSeconds onto the opponent standing of the duel response.
{
  const me = createUser('f3-me');
  const rival = createUser('f3-rival');
  const session = createSession({
    participants: [
      createParticipant('f3-me', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 305,
        finishedAt: iso(-2000),
        finishElapsedSeconds: 305,
      }),
      createParticipant('f3-rival', 2, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 322,
        finishedAt: iso(-1000),
        finishElapsedSeconds: 322,
      }),
    ],
  });
  session.distanceKm = 1;
  const store = createStore([me, rival], [createRun('f3-me'), createRun('f3-rival')], session);

  const response = buildRunningMatchStatusResponse(store, me, {
    mode: 'duel',
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    matchId: session.id,
    sessionOverride: session,
  });

  assert.ok(response.opponent);
  // F3: the opponent standing now carries its frozen finishElapsedSeconds.
  assert.equal(response.opponent.finishElapsedSeconds, 322);
}

// F4 — once the §B4 fallback window elapses with the rival's finish missing, the verdict
// is SEALED. A subsequent late finish push from the (now DNF) rival can NOT flip it, and
// both phones read the IDENTICAL sealed verdict.
{
  const finisher = createUser('seal-finisher');
  const laggard = createUser('seal-laggard');
  const session = createSession({
    participants: [
      createParticipant('seal-finisher', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
        finishElapsedSeconds: 300,
      }),
      createParticipant('seal-laggard', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0.6,
        liveElapsedSeconds: 240,
        liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
      }),
    ],
  });
  session.distanceKm = 1;
  const store = createStore(
    [finisher, laggard],
    [createRun('seal-finisher'), createRun('seal-laggard')],
    session,
  );

  // First poll seals the fallback resolution.
  const standings1 = buildOfficialSessionStandings(store, session);
  const finisherVerdict1 = buildDuelVerdict(session, standings1, 'seal-finisher');
  assert.equal(finisherVerdict1.resolved, true);
  assert.equal(finisherVerdict1.outcome, 'win');
  assert.equal(finisherVerdict1.winnerUserId, 'seal-finisher');
  // The seal is now persisted on the session.
  assert.ok(session.duelFallbackResolution);
  assert.equal(session.duelFallbackResolution.winnerUserId, 'seal-finisher');
  assert.equal(session.duelFallbackResolution.dnfUserId, 'seal-laggard');
  assert.equal(isParticipantSealedDnf(session, 'seal-laggard'), true);

  // The DNF runner now sends a LATE finish (durable resend). It must be IGNORED — the
  // server must not freeze a finishElapsedSeconds for them, so the verdict can't flip.
  updateRunningMatchProgress(store, laggard, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 250,
    currentPace: '04:10/km',
    status: 'finished',
  });
  const laggardParticipant = session.participants.find((p) => p.userId === 'seal-laggard');
  assert.equal(laggardParticipant.finishElapsedSeconds, null);
  assert.notEqual(laggardParticipant.liveStatus, 'finished');
  assert.equal(laggardParticipant.finishedAt, null);

  // Both perspectives still agree on the sealed verdict — winner unchanged.
  const standings2 = buildOfficialSessionStandings(store, session);
  const finisherVerdict2 = buildDuelVerdict(session, standings2, 'seal-finisher');
  const laggardVerdict2 = buildDuelVerdict(session, standings2, 'seal-laggard');
  assert.equal(finisherVerdict2.resolved, true);
  assert.equal(finisherVerdict2.outcome, 'win');
  assert.equal(finisherVerdict2.winnerUserId, 'seal-finisher');
  assert.equal(laggardVerdict2.resolved, true);
  assert.equal(laggardVerdict2.outcome, 'lose');
  assert.equal(laggardVerdict2.winnerUserId, 'seal-finisher');
}

// F4 — race: the DNF runner's LATE finish push is the VERY FIRST request after the
// window elapsed (no poll sealed it yet). The finish handler must seal first, then
// reject the finish freeze, so the verdict still resolves to the finisher's win.
{
  const finisher = createUser('race-finisher');
  const laggard = createUser('race-laggard');
  const session = createSession({
    participants: [
      createParticipant('race-finisher', 1, {
        liveStatus: 'finished',
        liveDistanceKm: 1,
        liveElapsedSeconds: 300,
        finishedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
        finishElapsedSeconds: 300,
      }),
      createParticipant('race-laggard', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0.6,
        liveElapsedSeconds: 240,
        liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
      }),
    ],
  });
  session.distanceKm = 1;
  const store = createStore(
    [finisher, laggard],
    [createRun('race-finisher'), createRun('race-laggard')],
    session,
  );
  // No prior poll — the seal does not exist yet.
  assert.equal(session.duelFallbackResolution, undefined);

  updateRunningMatchProgress(store, laggard, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 250,
    currentPace: '04:10/km',
    status: 'finished',
  });

  // The handler sealed first, so the late finish was rejected for ranking AND the runner
  // was NOT marked finished (no finishElapsedSeconds, no finishedAt, status not finished) —
  // otherwise their late finish would re-enter the standings and flip the sealed verdict.
  assert.ok(session.duelFallbackResolution);
  assert.equal(session.duelFallbackResolution.winnerUserId, 'race-finisher');
  const laggardParticipant = session.participants.find((p) => p.userId === 'race-laggard');
  assert.equal(laggardParticipant.finishElapsedSeconds, null);
  assert.notEqual(laggardParticipant.liveStatus, 'finished');
  assert.equal(laggardParticipant.finishedAt, null);

  const standings = buildOfficialSessionStandings(store, session);
  assert.equal(buildDuelVerdict(session, standings, 'race-finisher').winnerUserId, 'race-finisher');
  assert.equal(buildDuelVerdict(session, standings, 'race-laggard').winnerUserId, 'race-finisher');
}

// F5 — a finished runner ALWAYS carries a positive-integer finishElapsedSeconds when a
// genuine measured finish landed (the sort + buildDuelVerdict gate on Number.isInteger).
{
  const a = createUser('f5-a');
  const b = createUser('f5-b');
  const session = createSession({
    participants: [
      createParticipant('f5-a', 1, {
        liveStatus: 'running',
        liveDistanceKm: 0.9,
        liveElapsedSeconds: 300,
      }),
      createParticipant('f5-b', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0.9,
        liveElapsedSeconds: 300,
      }),
    ],
  });
  session.distanceKm = 1;
  session.slotStartAt = iso(-1000);
  session.startedAt = iso(-1000);
  const store = createStore([a, b], [createRun('f5-a'), createRun('f5-b')], session);

  updateRunningMatchProgress(store, a, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 311,
    currentPace: '05:11/km',
    status: 'finished',
  });

  const aParticipant = session.participants.find((p) => p.userId === 'f5-a');
  assert.equal(aParticipant.liveStatus, 'finished');
  assert.ok(
    Number.isInteger(aParticipant.finishElapsedSeconds) && aParticipant.finishElapsedSeconds > 0,
    'a finished runner must carry a positive-integer finishElapsedSeconds',
  );
}

// ===========================================================================
// STAGE 2 (clean core) — the DIRECT matched-duel/group status endpoint SLOT-GATES
// the reported state (mirrors the room gate, 52a9a17). The SHARED session hydrates
// 'active' from the host's pre-start warm-up (live progress) BEFORE this match's
// slot; the endpoint must report 'matched' (+ countdownRemainingSeconds) until the
// slot passes, then 'active' — so a guest keyed off the reported state can never be
// skipped past their countdown.
// ===========================================================================

// A future-slot duel whose shared session is warm-up-'active' (a participant is
// pushing live progress before the slot) reports 'matched' with the countdown, NOT
// 'active'. hydrateMatchSessionState itself returns 'active' here (live progress on a
// future slot), so this proves the response-builder gate, not the hydration.
{
  const host = createUser('gate-host');
  const guest = createUser('gate-guest');
  const session = createSession({
    participants: [
      // The guest is "me"; seedRank 1 so the self lookup resolves.
      createParticipant('gate-guest', 1, {
        liveStatus: 'ready',
        liveDistanceKm: 0,
        liveElapsedSeconds: 0,
        liveUpdatedAt: null,
      }),
      // The host has already started measuring (warm-up) before the slot.
      createParticipant('gate-host', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0.2,
        liveElapsedSeconds: 30,
        liveUpdatedAt: iso(-1000),
      }),
    ],
  });
  session.distanceKm = 1;
  // Slot is 40s in the FUTURE; no startedAt yet, so hydrateMatchSessionState takes the
  // hasLiveProgress branch and returns 'active' (and stamps startedAt) even pre-slot.
  session.slotStartAt = iso(40 * 1000);
  session.startedAt = null;

  const store = createStore([host, guest], [createRun('gate-host'), createRun('gate-guest')], session);

  const response = buildRunningMatchStatusResponse(store, guest, {
    mode: 'duel',
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    matchId: session.id,
    sessionOverride: session,
  });

  assert.equal(response.state, 'matched', 'pre-slot warm-up-active must report matched, not active');
  assert.equal(typeof response.countdownRemainingSeconds, 'number');
  assert.ok(
    response.countdownRemainingSeconds > 0 && response.countdownRemainingSeconds <= 40,
    'countdownRemainingSeconds reflects the seconds to the slot',
  );
  assert.equal(response.readyToStart, false);
}

// At/after the slot the SAME endpoint reports 'active' (the gate releases exactly at
// the slot) with no countdown.
{
  const host = createUser('gate2-host');
  const guest = createUser('gate2-guest');
  const session = createSession({
    participants: [
      createParticipant('gate2-guest', 1, {
        liveStatus: 'running',
        liveDistanceKm: 0.1,
        liveElapsedSeconds: 5,
        liveUpdatedAt: iso(-1000),
      }),
      createParticipant('gate2-host', 2, {
        liveStatus: 'running',
        liveDistanceKm: 0.3,
        liveElapsedSeconds: 40,
        liveUpdatedAt: iso(-1000),
      }),
    ],
  });
  session.distanceKm = 1;
  // Slot already passed.
  session.slotStartAt = iso(-1000);
  session.startedAt = iso(-1000);

  const store = createStore([host, guest], [createRun('gate2-host'), createRun('gate2-guest')], session);

  const response = buildRunningMatchStatusResponse(store, guest, {
    mode: 'duel',
    distanceKm: session.distanceKm,
    slotStartAt: session.slotStartAt,
    matchId: session.id,
    sessionOverride: session,
  });

  assert.equal(response.state, 'active', 'at/after the slot the endpoint reports active');
  assert.equal(response.countdownRemainingSeconds, undefined);
  assert.equal(response.readyToStart, true);
}
