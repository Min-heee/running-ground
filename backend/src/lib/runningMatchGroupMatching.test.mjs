import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GROUP_MATCH_MAX_PARTICIPANTS,
  GROUP_PACE_MATCH_TOLERANCE_SECONDS,
} from './matchConstants.mjs';
import { buildGroupMatchResponse } from './matchResponseBuilders.mjs';
import {
  buildDuelSlotCountKey,
  countDuelQueueBySlot,
  getMatchQueueEntries,
} from './matchQueueStoreHelpers.mjs';
import { findJoinableGroupSession } from './runningMatchSession/matchSessionLifecycle.mjs';

// Average pace is derived from the user's last (up to 3) runs' parsed paces, so a
// single run at a known pace pins each runner's averagePaceMinutes deterministically.
function paceLabelFromSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}/km`;
}

function createRunner(id) {
  return {
    id,
    username: id,
    name: id,
    realName: id,
    publicTag: id.toUpperCase(),
    provinceName: '경기도',
    cityName: '고양시',
    districtName: '일산서구',
    connectedSources: [],
    notificationSettings: {
      friendAlerts: true,
      districtAlerts: true,
      marketAlerts: true,
    },
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  };
}

// One run per user at the given pace (in seconds/km) so averagePaceMinutes is exact.
function createRun(userId, paceSeconds) {
  return {
    id: `${userId}-run`,
    userId,
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    distanceKm: 5,
    pace: paceLabelFromSeconds(paceSeconds),
    source: 'RunningGround',
    sourceType: 'manual',
  };
}

// Build a fresh store seeded with the given runners {id, paceSeconds}. Each store is
// independent so the per-store metrics WeakMap never leaks between tests.
function createStore(runners) {
  return {
    users: runners.map((runner) => createRunner(runner.id)),
    runs: runners.map((runner) => createRun(runner.id, runner.paceSeconds)),
    sessions: [],
    matchSessions: [],
    matchRooms: [],
    matchQueues: { duel: [], group: [] },
    notifications: [],
  };
}

// A slot on an exact hour boundary, comfortably inside the booking window (well beyond
// the 30-min cutoff and within the 7-day window). validateMatchSlotStartAt rejects any
// non-:00:00.000 timestamp.
function futureSlotStartAt() {
  const slot = new Date(Date.now() + 3 * 60 * 60 * 1000);
  slot.setMinutes(0, 0, 0);
  return slot.toISOString();
}

function requestGroup(store, userId, slotStartAt, distanceKm = 5) {
  const user = store.users.find((entry) => entry.id === userId);
  return buildGroupMatchResponse(store, user, { distanceKm, slotStartAt });
}

test('a 3-runner ±15s group forms with anchor=avg and closest-first seedRank', () => {
  // Paces 6:10 / 6:20 / 6:25 — full spread 15s, all within ±15s of each other.
  // Anchor = avg of (370, 380, 385) = 378.33s/km. Closest to anchor is 380 (6:20),
  // then 385 (6:25, gap 6.67), then 370 (6:10, gap 8.33).
  const store = createStore([
    { id: 'r-fast', paceSeconds: 370 },
    { id: 'r-mid', paceSeconds: 380 },
    { id: 'r-slow', paceSeconds: 385 },
  ]);
  const slotStartAt = futureSlotStartAt();

  const first = requestGroup(store, 'r-fast', slotStartAt);
  assert.equal(first.matched, false, 'one runner cannot form a group');

  const second = requestGroup(store, 'r-mid', slotStartAt);
  assert.equal(second.matched, false, 'two runners still short of the minimum of 3');

  const third = requestGroup(store, 'r-slow', slotStartAt);
  assert.equal(third.matched, true, 'the third in-band runner forms the group');
  assert.equal(third.participants.length, 3);

  // The session persisted the anchor as the average pace of the founding 3.
  const session = store.matchSessions.find((entry) => entry.mode === 'group');
  assert.ok(session, 'a group session was created');
  const expectedAnchorMinutes = (370 + 380 + 385) / 3 / 60;
  assert.ok(
    Math.abs(session.anchorPaceMinutes - expectedAnchorMinutes) < 1e-9,
    `anchor ${session.anchorPaceMinutes} should equal the avg pace ${expectedAnchorMinutes}`,
  );

  // seedRank is assigned by closeness to the anchor: r-mid (1) closest, then r-slow (2),
  // then r-fast (3).
  const seedById = new Map(session.participants.map((p) => [p.userId, p.seedRank]));
  assert.equal(seedById.get('r-mid'), 1);
  assert.equal(seedById.get('r-slow'), 2);
  assert.equal(seedById.get('r-fast'), 3);
});

test('a 4th runner within ±15s of the anchor joins the existing group (one per call)', () => {
  // Founding 3 at 6:10/6:20/6:25 → anchor 378.33s. A 4th at 6:24 (384s) is 5.67s from
  // the anchor, within ±15s, so it joins the already-formed group.
  const store = createStore([
    { id: 'r-fast', paceSeconds: 370 },
    { id: 'r-mid', paceSeconds: 380 },
    { id: 'r-slow', paceSeconds: 385 },
    { id: 'r-joiner', paceSeconds: 384 },
  ]);
  const slotStartAt = futureSlotStartAt();

  requestGroup(store, 'r-fast', slotStartAt);
  requestGroup(store, 'r-mid', slotStartAt);
  const formed = requestGroup(store, 'r-slow', slotStartAt);
  assert.equal(formed.matched, true);
  assert.equal(formed.participants.length, 3);

  const sessionId = store.matchSessions.find((entry) => entry.mode === 'group').id;

  const joined = requestGroup(store, 'r-joiner', slotStartAt);
  assert.equal(joined.matched, true, 'a within-band 4th runner joins immediately');
  assert.equal(joined.participants.length, 4, 'group grows to 4');

  // It joined the SAME session (no second session was spun up).
  const groupSessions = store.matchSessions.filter((entry) => entry.mode === 'group');
  assert.equal(groupSessions.length, 1, 'no new session created for the joiner');
  assert.equal(groupSessions[0].id, sessionId);
  assert.equal(groupSessions[0].participants.length, 4);

  // The joiner was removed from the queue (admitted one-at-a-time per HTTP call).
  assert.equal(
    store.matchQueues.group.some((entry) => entry.userId === 'r-joiner'),
    false,
    'joiner is dequeued after admission',
  );

  // The joiner took the next open seat.
  const joinerSeed = groupSessions[0].participants.find((p) => p.userId === 'r-joiner').seedRank;
  assert.equal(joinerSeed, 4);
});

test('a runner outside ±15s does NOT join or form a group', () => {
  // Founding 3 at 6:10/6:20/6:25 → anchor 378.33s. A 4th at 7:00 (420s) is 41.67s from
  // the anchor — outside ±15s — so it neither joins the formed group nor forms its own.
  const store = createStore([
    { id: 'r-fast', paceSeconds: 370 },
    { id: 'r-mid', paceSeconds: 380 },
    { id: 'r-slow', paceSeconds: 385 },
    { id: 'r-outlier', paceSeconds: 420 },
  ]);
  const slotStartAt = futureSlotStartAt();

  requestGroup(store, 'r-fast', slotStartAt);
  requestGroup(store, 'r-mid', slotStartAt);
  requestGroup(store, 'r-slow', slotStartAt);

  const outlier = requestGroup(store, 'r-outlier', slotStartAt);
  assert.equal(outlier.matched, false, 'the out-of-band runner does not join');

  const groupSessions = store.matchSessions.filter((entry) => entry.mode === 'group');
  assert.equal(groupSessions.length, 1, 'no extra session formed for the outlier');
  assert.equal(groupSessions[0].participants.length, 3, 'the formed group stays at 3');
  assert.equal(
    store.matchQueues.group.some((entry) => entry.userId === 'r-outlier'),
    true,
    'the outlier stays queued, waiting for its own in-band cluster',
  );
  // Sanity: the gap exceeds the tolerance constant.
  const anchorMinutes = groupSessions[0].anchorPaceMinutes;
  assert.ok(Math.abs(420 / 60 - anchorMinutes) * 60 > GROUP_PACE_MATCH_TOLERANCE_SECONDS);
});

test('two outliers >15s apart from the cluster cannot form a group together either', () => {
  // r-fast/r-mid/r-slow cluster forms (3). Then two runners 7:00 and 7:30 are within
  // ±15s of each OTHER? 420 vs 450 = 30s apart, so even together they cannot cluster.
  const store = createStore([
    { id: 'r-fast', paceSeconds: 370 },
    { id: 'r-mid', paceSeconds: 380 },
    { id: 'r-slow', paceSeconds: 385 },
    { id: 'r-out1', paceSeconds: 420 },
    { id: 'r-out2', paceSeconds: 450 },
  ]);
  const slotStartAt = futureSlotStartAt();

  requestGroup(store, 'r-fast', slotStartAt);
  requestGroup(store, 'r-mid', slotStartAt);
  requestGroup(store, 'r-slow', slotStartAt);
  const o1 = requestGroup(store, 'r-out1', slotStartAt);
  const o2 = requestGroup(store, 'r-out2', slotStartAt);

  assert.equal(o1.matched, false);
  assert.equal(o2.matched, false);
  assert.equal(store.matchSessions.filter((e) => e.mode === 'group').length, 1);
});

test('GROUP_MATCH_MAX_PARTICIPANTS caps the group size', () => {
  // The chosen cap is documented at 30, mirroring the response builder maxGroupSize.
  assert.equal(GROUP_MATCH_MAX_PARTICIPANTS, 30);
});

test('countDuelQueueBySlot tallies duel entries per slot+distance excluding testMode', () => {
  const now = new Date();
  const slotA = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const slotB = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  const requestedAt = new Date(now.getTime() - 1000).toISOString();

  const store = createStore([]);
  store.matchQueues.duel = [
    { id: 'd1', userId: 'u1', distanceKm: 5, slotStartAt: slotA, requestedAt, testMode: false },
    { id: 'd2', userId: 'u2', distanceKm: 5, slotStartAt: slotA, requestedAt, testMode: false },
    // SAME time as slotA but a DIFFERENT distance must land in a separate bucket — these
    // two can never pair with the 5km waiters, so they must not inflate the 5km count.
    { id: 'd2b', userId: 'u2b', distanceKm: 10, slotStartAt: slotA, requestedAt, testMode: false },
    { id: 'd3', userId: 'u3', distanceKm: 5, slotStartAt: slotB, requestedAt, testMode: false },
    // testMode entry must be skipped even though it is on slotA.
    { id: 'd4', userId: 'u4', distanceKm: 5, slotStartAt: slotA, requestedAt, testMode: true, expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString() },
  ];
  // group-queue entries must never leak into the duel tally.
  store.matchQueues.group = [
    { id: 'g1', userId: 'u5', distanceKm: 5, slotStartAt: slotA, requestedAt, testMode: false },
  ];
  // pruneMatchQueues drops entries whose userId is not an active user, so register them.
  store.users = ['u1', 'u2', 'u2b', 'u3', 'u4', 'u5'].map((id) => createRunner(id));

  const counts = countDuelQueueBySlot(store, { now });

  assert.equal(counts[buildDuelSlotCountKey(slotA, 5)], 2, 'two 5km duel searchers on slot A');
  assert.equal(counts[buildDuelSlotCountKey(slotA, 10)], 1, 'one 10km duel searcher on slot A');
  assert.equal(counts[buildDuelSlotCountKey(slotB, 5)], 1, 'one 5km duel searcher on slot B');
  assert.equal(Object.keys(counts).length, 3, 'no testMode/group/empty buckets present');
});

test('countDuelQueueBySlot excludes the viewing user so a lone searcher never counts themselves', () => {
  const now = new Date();
  const slotA = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const requestedAt = new Date(now.getTime() - 1000).toISOString();

  const store = createStore([]);
  store.matchQueues.duel = [
    { id: 'd1', userId: 'viewer', distanceKm: 5, slotStartAt: slotA, requestedAt, testMode: false },
    { id: 'd2', userId: 'other', distanceKm: 5, slotStartAt: slotA, requestedAt, testMode: false },
  ];
  store.users = ['viewer', 'other'].map((id) => createRunner(id));

  // The viewer is alone on a slot they themselves queued — count must be absent (0), not 1.
  const loneStore = createStore([]);
  loneStore.matchQueues.duel = [
    { id: 'd1', userId: 'viewer', distanceKm: 5, slotStartAt: slotA, requestedAt, testMode: false },
  ];
  loneStore.users = [createRunner('viewer')];
  const loneCounts = countDuelQueueBySlot(loneStore, { now, currentUserId: 'viewer' });
  assert.equal(loneCounts[buildDuelSlotCountKey(slotA, 5)], undefined, 'lone searcher sees no badge for their own entry');

  // With one OTHER waiter present, the viewer sees exactly that one matchable runner.
  const counts = countDuelQueueBySlot(store, { now, currentUserId: 'viewer' });
  assert.equal(counts[buildDuelSlotCountKey(slotA, 5)], 1, 'viewer counts the one OTHER 5km waiter, not themselves');
});

// ---- Same-distance-only matching (5km races with 5km, never 5.1km) --------------------
// The old ±0.15km band let adjacent 0.1km custom inputs (5.0 vs 5.1) pair into ONE race —
// a 5.1km requester would silently run a 5.0km match. isSameMatchDistance pins exact
// (normalized) distance identity while still absorbing float noise (42.195 ≡ 42.2).
test('queue filter: 5.0km and 5.1km requesters never see each other; 42.195 matches its 42.2-normalized twin', () => {
  const store = createStore([
    { id: 'five-oh', paceSeconds: 330 },
    { id: 'five-one', paceSeconds: 330 },
    { id: 'marathon-raw', paceSeconds: 330 },
  ]);
  const slotStartAt = futureSlotStartAt();
  const requestedAt = new Date(Date.now() - 1000).toISOString();

  store.matchQueues.group = [
    { id: 'g1', userId: 'five-oh', distanceKm: 5, slotStartAt, requestedAt, testMode: false },
    { id: 'g2', userId: 'five-one', distanceKm: 5.1, slotStartAt, requestedAt, testMode: false },
    { id: 'g3', userId: 'marathon-raw', distanceKm: 42.195, slotStartAt, requestedAt, testMode: false },
  ];

  const fiveEntries = getMatchQueueEntries(store, 'group', 5, slotStartAt);
  assert.deepEqual(fiveEntries.map((entry) => entry.userId), ['five-oh'], '5.0km sees ONLY 5.0km — never the 5.1km neighbor');

  const fiveOneEntries = getMatchQueueEntries(store, 'group', 5.1, slotStartAt);
  assert.deepEqual(fiveOneEntries.map((entry) => entry.userId), ['five-one'], '5.1km sees ONLY 5.1km');

  // Float-noise identity: a raw 42.195 entry and a 42.2 request are the SAME distance
  // after one-decimal normalization — must still pair (marathon requesters are not split
  // by representation noise).
  const marathonEntries = getMatchQueueEntries(store, 'group', 42.2, slotStartAt);
  assert.deepEqual(marathonEntries.map((entry) => entry.userId), ['marathon-raw'], '42.195 ≡ 42.2 after normalization');
});

test('late-join: a same-pace 5.1km requester never joins a formed 5.0km group', () => {
  // Found a REAL 5.0km group of 3 through the actual API, then probe the late-join
  // seam directly: identical pace/slot, distance one 0.1km custom-input step apart.
  const store = createStore([
    { id: 'r-fast', paceSeconds: 370 },
    { id: 'r-mid', paceSeconds: 380 },
    { id: 'r-slow', paceSeconds: 385 },
  ]);
  const slotStartAt = futureSlotStartAt();

  requestGroup(store, 'r-fast', slotStartAt);
  requestGroup(store, 'r-mid', slotStartAt);
  const formed = requestGroup(store, 'r-slow', slotStartAt);
  assert.equal(formed.matched, true, 'the 5.0km founding trio forms');

  const session = store.matchSessions.find((entry) => entry.mode === 'group');
  assert.ok(session, 'group session exists');

  const mismatch = findJoinableGroupSession(store, {
    distanceKm: 5.1,
    slotStartAt,
    joinerPaceMinutes: session.anchorPaceMinutes,
  });
  assert.equal(mismatch, null, '5.1km requester must NOT be slotted into the 5.0km group');

  const exact = findJoinableGroupSession(store, {
    distanceKm: 5,
    slotStartAt,
    joinerPaceMinutes: session.anchorPaceMinutes,
  });
  assert.equal(exact?.id, session.id, 'the exact-distance joiner still slots in');
});
