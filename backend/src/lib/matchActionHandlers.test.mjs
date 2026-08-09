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
    // Match surfaces read the COMPETITIVE-only runner profile — fixture runs must
    // be app-tracked or the pace falls back to the neutral 5.5.
    sourceType: 'runningground',
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

function buildStore(matchSessions) {
  return {
    users: [createUser('store-a'), createUser('store-b')],
    runs: [],
    matchSessions,
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
  };
}

// A stale, already-all-done session whose retention window has expired — the observable a
// due epilogue prune physically drops. POST-FINISH RETENTION (2026-07-09) means a
// JUST-completed session now survives the epilogue prune (kept for the echo window), so the
// old "the completing session disappears" observable no longer distinguishes throttled from
// due. This decoy is instead consumed by whichever prune actually executes.
function buildStaleDoneDecoySession(id) {
  const doneAgoMs = 30 * 60 * 1000; // well past MATCH_SESSION_ALL_DONE_RETENTION_MS (10min)
  const doneParticipant = (userId) => ({
    userId,
    seedRank: 1,
    acceptedAt: null,
    liveStatus: 'finished',
    liveDistanceKm: 5,
    liveElapsedSeconds: 1500,
    livePace: '05:00/km',
    liveUpdatedAt: iso(-doneAgoMs),
    finishedAt: iso(-doneAgoMs),
    finishElapsedSeconds: 1500,
    profileSnapshot: { name: userId },
  });
  return {
    id,
    mode: 'duel',
    isTestMatch: false,
    isPartyRun: true,
    lpApplied: true,
    resultNotificationApplied: true,
    distanceKm: 5,
    slotStartAt: iso(-40 * 60 * 1000),
    startedAt: iso(-40 * 60 * 1000),
    createdAt: iso(-41 * 60 * 1000),
    matchedAt: iso(-41 * 60 * 1000),
    participants: [doneParticipant(`${id}-a`), doneParticipant(`${id}-b`)],
  };
}

test('two finishing pushes within the interval: only the first push runs the epilogue prune', () => {
  resetProgressPruneThrottle();

  // Push 1 — throttle armed at 0 → the finished push consumes the shared throttle window and
  // its full match semantics land. (The JUST-completed session is retained for the echo
  // window now, so it is not the observable — the throttle-consumption below is.)
  const first = createFinishingDuelFixture('prune-throttle-m1');
  pushFinish(first.store, first.pusher.id, 'prune-throttle-m1', 1606);
  const firstSession = first.store.matchSessions.find((session) => session.id === 'prune-throttle-m1');
  assert.equal(firstSession.lpApplied, true, 'the every-done LP path is not throttled');

  // The first push consumed the server-wide throttle: a due-prune check within the interval is
  // now gated off (returns false, physically prunes nothing) — proving the second ~2.5s push
  // in the finish convoy skips its epilogue prune+sweep. The decoy would be dropped by a real
  // prune, so its survival confirms the skip.
  const throttledStore = { ...buildStore([buildStaleDoneDecoySession('prune-decoy-throttled')]) };
  assert.equal(runProgressPollPrunesIfDue(throttledStore, new Date(), new Date()), false, 'throttle consumed by push 1');
  assert.equal(throttledStore.matchSessions.length, 1, 'the throttled epilogue prune drops nothing');

  // Re-armed throttle → a due prune runs and the stale decoy is physically dropped.
  resetProgressPruneThrottle();
  const dueStore = { ...buildStore([buildStaleDoneDecoySession('prune-decoy-due')]) };
  assert.equal(runProgressPollPrunesIfDue(dueStore, new Date(), new Date()), true, 're-armed throttle prunes');
  assert.equal(dueStore.matchSessions.length, 0, 'a due epilogue prune drops the stale decoy');
});

test('runProgressPollPrunesIfDue gates on the injectable now at exactly the interval', () => {
  resetProgressPruneThrottle();
  const t0 = Date.parse('2026-07-07T00:00:00.000Z');

  // An already-all-done stale session is the observable prune target. Done stamps sit t0-15min
  // — past the POST-FINISH RETENTION window relative to the injectable t0-based nows AND to
  // real time, so the prune's drop stays observable under retention.
  const isoAtT0 = (offsetMs) => new Date(t0 + offsetMs).toISOString();
  const doneParticipant = (userId) => ({
    userId,
    seedRank: 1,
    acceptedAt: null,
    liveStatus: 'finished',
    liveDistanceKm: 5,
    liveElapsedSeconds: 1500,
    livePace: '05:00/km',
    liveUpdatedAt: isoAtT0(-15 * 60 * 1000),
    finishedAt: isoAtT0(-15 * 60 * 1000),
    finishElapsedSeconds: 1500,
    profileSnapshot: { name: userId },
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
      slotStartAt: isoAtT0(-30 * 60 * 1000),
      startedAt: isoAtT0(-30 * 60 * 1000),
      createdAt: isoAtT0(-31 * 60 * 1000),
      matchedAt: isoAtT0(-31 * 60 * 1000),
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

// 오너 실기기 대결 2026-08-09. The Android native uploader re-POSTs the last JS-built payload
// byte-for-byte every ~3s and never recomputes anything, so a frozen JS thread produced an endless
// stream of IDENTICAL pushes. Restamping liveUpdatedAt on those kept the runner "연결됨" forever:
// the stall detector could never fire and the opponent's phone confidently rendered a stuck 3.05km.
function createRunningDuelFixture(matchId) {
  const a = createUser(`live-a-${matchId}`);
  const b = createUser(`live-b-${matchId}`);
  const session = {
    id: matchId,
    mode: 'duel',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 6,
    slotStartAt: iso(-30 * 60 * 1000),
    startedAt: iso(-30 * 60 * 1000),
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    participants: [a, b].map((user, index) => ({
      userId: user.id,
      seedRank: index + 1,
      acceptedAt: null,
      liveStatus: 'running',
      liveDistanceKm: 3.05,
      liveElapsedSeconds: 1200,
      livePace: '06:33/km',
      // Two minutes stale: any restamp is unmistakable.
      liveUpdatedAt: iso(-120 * 1000),
      finishedAt: null,
      finishElapsedSeconds: null,
    })),
  };

  return {
    store: {
      users: [a, b],
      runs: [createProfileRun(a.id), createProfileRun(b.id)],
      matchSessions: [session],
      matchQueues: { duel: [], group: [] },
      matchRooms: [],
      notifications: [],
    },
    session,
    pusher: a,
  };
}

test('an identical re-push does NOT refresh liveUpdatedAt (a frozen device cannot fake liveness)', () => {
  const { store, session, pusher } = createRunningDuelFixture('frozen-repush-duel');
  const push = () => updateRunningMatchProgress(store, { id: pusher.id }, {
    matchId: 'frozen-repush-duel',
    distanceKm: 3.05,
    elapsedSeconds: 1200,
    currentPace: '06:33/km',
    status: 'running',
  });
  const readParticipant = () => session.participants.find((participant) => participant.userId === pusher.id);

  // The FIRST arrival is legitimately new information (the server has never seen this payload), so
  // it stamps. It is every REPLAY after it that must not.
  push();
  const afterFirst = readParticipant().liveUpdatedAt;
  assert.notEqual(afterFirst, iso(-120 * 1000), 'the first push is genuine and does stamp');

  // Exactly what the native uploader does for the rest of a frozen run: the same cached body,
  // every ~3s, forever.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    push();
  }

  const after = readParticipant();
  assert.equal(after.liveUpdatedAt, afterFirst, 'a repeated identical payload must leave the liveness clock alone');
  assert.equal(after.liveDistanceKm, 3.05);
});

test('a standing-still runner still refreshes liveUpdatedAt (elapsed advances on a live JS thread)', () => {
  const { store, session, pusher } = createRunningDuelFixture('stationary-duel');
  const before = session.participants.find((participant) => participant.userId === pusher.id).liveUpdatedAt;

  // Waiting at a crossing: distance does not move, but the app is alive so elapsed does. This must
  // NOT be mistaken for the frozen case — the discriminator is "new information", not "moved".
  updateRunningMatchProgress(store, { id: pusher.id }, {
    matchId: 'stationary-duel',
    distanceKm: 3.05,
    elapsedSeconds: 1230,
    currentPace: '06:40/km',
    status: 'running',
  });

  const after = session.participants.find((participant) => participant.userId === pusher.id);
  assert.notEqual(after.liveUpdatedAt, before, 'a live push with fresh elapsed must restamp');
  assert.equal(after.liveDistanceKm, 3.05, 'distance genuinely did not move');
});
