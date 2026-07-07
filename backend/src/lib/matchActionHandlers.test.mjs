import assert from 'node:assert/strict';
import test from 'node:test';

// B-3 (finish-flow relief 2026-07-07) — the progress-POST epilogue prunes
// (pruneMatchSessions + pruneMatchRooms, each re-running the seal/heal sweep) are throttled
// to at most once per PROGRESS_PRUNE_MIN_INTERVAL_MS server-wide, because every ~2.5s
// heartbeat used to run both while holding the whole-store row lock. Pinned here:
//   1. two finishing pushes within the interval → only the FIRST push's epilogue prune runs
//      (the second all-done session survives the push that completed it);
//   2. the throttle gate itself, with an injectable `now`, opens exactly at the interval;
//   3. the throttled skip changes ONLY housekeeping timing — the push's match semantics
//      (finish freeze, LP) are untouched.
import {
  PROGRESS_PRUNE_MIN_INTERVAL_MS,
  resetProgressPruneThrottle,
  runProgressPollPrunesIfDue,
  updateRunningMatchProgress,
} from './matchActionHandlers.mjs';

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createUser(id) {
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
    rankState: { tier: '입문', lp: 50 },
    createdAt: iso(-24 * 60 * 60 * 1000),
  };
}

function createProfileRun(userId) {
  return {
    id: `${userId}-profile-run`,
    userId,
    date: iso(-24 * 60 * 60 * 1000).slice(0, 10),
    distanceKm: 5,
    pace: '06:00/km',
    source: 'RunningGround',
    sourceType: 'manual',
    startedAt: iso(-24 * 60 * 60 * 1000),
    endedAt: iso(-24 * 60 * 60 * 1000 + 30 * 60 * 1000),
    durationSeconds: 30 * 60,
    createdAt: iso(-24 * 60 * 60 * 1000),
  };
}

// A duel where the OTHER runner finished seconds ago (inside the §B4 window — nothing seals)
// and the pushing runner's finish push completes the match. The all-done session becomes a
// prune candidate ONLY once this push lands, so its survival tells exactly whether the push's
// EPILOGUE prune ran (the unthrottled entry prune sees a not-yet-done session and keeps it).
function createFinishingDuelFixture(matchId) {
  const finished = createUser(`finished-${matchId}`);
  const pusher = createUser(`pusher-${matchId}`);
  const session = {
    id: matchId,
    mode: 'duel',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt: iso(-30 * 60 * 1000),
    startedAt: iso(-30 * 60 * 1000),
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    participants: [
      {
        userId: finished.id,
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1622,
        livePace: '05:24/km',
        liveUpdatedAt: iso(-10 * 1000),
        finishedAt: iso(-10 * 1000),
        finishElapsedSeconds: 1622,
      },
      {
        userId: pusher.id,
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 4.9,
        liveElapsedSeconds: 1590,
        livePace: '05:28/km',
        liveUpdatedAt: iso(-5 * 1000),
        finishedAt: null,
        finishElapsedSeconds: null,
      },
    ],
  };
  const store = {
    users: [finished, pusher],
    runs: [createProfileRun(finished.id), createProfileRun(pusher.id)],
    matchSessions: [session],
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
  };
  return { store, session, finished, pusher };
}

function pushFinish(store, userId, matchId, elapsedSeconds) {
  return updateRunningMatchProgress(store, { id: userId }, {
    matchId,
    distanceKm: 5,
    elapsedSeconds,
    currentPace: '05:21/km',
    status: 'finished',
  });
}

test('two finishing pushes within the interval: only the first push runs the epilogue prune', () => {
  resetProgressPruneThrottle();

  // Push 1 — throttle armed at 0 → the epilogue prune runs and drops the now-all-done session.
  const first = createFinishingDuelFixture('prune-throttle-m1');
  pushFinish(first.store, first.pusher.id, 'prune-throttle-m1', 1606);
  assert.equal(first.store.matchSessions.length, 0, 'first push prunes the completed session');

  // Push 2, milliseconds later on a fresh store — server-wide throttle still hot → the
  // epilogue prune is skipped and the completed session SURVIVES this push.
  const second = createFinishingDuelFixture('prune-throttle-m2');
  pushFinish(second.store, second.pusher.id, 'prune-throttle-m2', 1606);
  assert.equal(second.store.matchSessions.length, 1, 'second push within the interval skips the prune');

  // Only housekeeping was skipped — the finish itself landed with full semantics.
  const pusherParticipant = second.store.matchSessions[0].participants
    .find((participant) => participant.userId === second.pusher.id);
  assert.equal(pusherParticipant.liveStatus, 'finished');
  assert.equal(pusherParticipant.finishElapsedSeconds, 1606);
  assert.equal(second.store.matchSessions[0].lpApplied, true, 'the every-done LP path is not throttled');

  // Re-armed throttle → the next push prunes again (the deferred drop catches up).
  resetProgressPruneThrottle();
  const third = createFinishingDuelFixture('prune-throttle-m3');
  pushFinish(third.store, third.pusher.id, 'prune-throttle-m3', 1606);
  assert.equal(third.store.matchSessions.length, 0);
});

test('runProgressPollPrunesIfDue gates on the injectable now at exactly the interval', () => {
  resetProgressPruneThrottle();
  const t0 = Date.parse('2026-07-07T00:00:00.000Z');

  // An already-all-done stale session is the observable prune target.
  const doneParticipant = (userId) => ({
    userId,
    seedRank: 1,
    acceptedAt: null,
    liveStatus: 'finished',
    liveDistanceKm: 5,
    liveElapsedSeconds: 1500,
    livePace: '05:00/km',
    liveUpdatedAt: iso(-60 * 1000),
    finishedAt: iso(-60 * 1000),
    finishElapsedSeconds: 1500,
  });
  const buildStore = () => ({
    users: [createUser('gate-a'), createUser('gate-b')],
    runs: [],
    matchSessions: [{
      id: 'gate-done-match',
      mode: 'duel',
      isTestMatch: false,
      isPartyRun: true,
      lpApplied: true,
      resultNotificationApplied: true,
      distanceKm: 5,
      slotStartAt: iso(-30 * 60 * 1000),
      startedAt: iso(-30 * 60 * 1000),
      createdAt: iso(-31 * 60 * 1000),
      matchedAt: iso(-31 * 60 * 1000),
      participants: [doneParticipant('gate-a'), doneParticipant('gate-b')],
    }],
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
  });

  const storeAtT0 = buildStore();
  assert.equal(runProgressPollPrunesIfDue(storeAtT0, new Date(t0), new Date(t0)), true);
  assert.equal(storeAtT0.matchSessions.length, 0, 'a due call physically prunes');

  const storeInsideInterval = buildStore();
  assert.equal(
    runProgressPollPrunesIfDue(storeInsideInterval, new Date(t0), new Date(t0 + PROGRESS_PRUNE_MIN_INTERVAL_MS - 1)),
    false,
  );
  assert.equal(storeInsideInterval.matchSessions.length, 1, 'inside the interval nothing is touched');

  const storeAtBoundary = buildStore();
  assert.equal(
    runProgressPollPrunesIfDue(storeAtBoundary, new Date(t0), new Date(t0 + PROGRESS_PRUNE_MIN_INTERVAL_MS)),
    true,
  );
  assert.equal(storeAtBoundary.matchSessions.length, 0, 'the gate reopens exactly at the interval');

  resetProgressPruneThrottle();
  const storeAfterReset = buildStore();
  assert.equal(runProgressPollPrunesIfDue(storeAfterReset, new Date(t0), new Date(t0 + 1)), true, 'reset re-arms');
});
