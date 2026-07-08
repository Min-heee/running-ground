import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDuelVerdict,
  buildGroupVerdict,
  buildOfficialSessionStandings,
} from './runningMatchSessionStoreHelpers.mjs';
import {
  resetProgressPruneThrottle,
  updateRunningMatchProgress,
} from './matchActionHandlers.mjs';
import { clearVanishedMatchTombstones } from './vanishedMatchTombstones.mjs';
import { highestFilledCheckpointIndex } from './matchCheckpointHelpers.mjs';

// CHECKPOINT-FAIR LIVE COMPARE (2026-07-09) — the verdict INVARIANCE guard + the write-path
// integration test. The verdict is a pure function of finishElapsedSeconds; quantizing the LIVE
// compare onto a 10s grid must provably NEVER move win/lose. These tests pin that: the
// buildDuelVerdict/buildGroupVerdict result is byte-identical whether or not checkpoints are
// populated AND when the checkpoint distances are arbitrarily perturbed.

const NOW = new Date('2026-06-28T12:00:00.000Z');

function iso(offsetMs) {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

function profileSnapshot(name) {
  return {
    id: name,
    name,
    tag: name,
    averagePace: '05:00/km',
    averagePaceMinutes: 5,
    levelLabel: 'Lv.1',
    distanceLevel: 1,
    weeklyDistanceKm: 10,
    lifetimeDistanceKm: 100,
    districtName: '일산서구',
    provinceName: '경기도',
    cityName: '고양시',
  };
}

function participant(userId, overrides = {}) {
  return {
    userId,
    seedRank: overrides.seedRank ?? 1,
    profileSnapshot: profileSnapshot(userId),
    acceptedAt: null,
    liveStatus: 'finished',
    liveDistanceKm: 5,
    liveElapsedSeconds: overrides.finishElapsedSeconds ?? 1500,
    livePace: '05:00/km',
    liveUpdatedAt: iso(-10 * 60 * 1000),
    finishedAt: overrides.finishedAt ?? iso(-10 * 60 * 1000),
    finishElapsedSeconds: overrides.finishElapsedSeconds ?? 1500,
    checkpoints: [],
    ...overrides,
  };
}

function sessionFor(mode, participants) {
  return {
    id: `${mode}-invariance-match`,
    mode,
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt: iso(-30 * 60 * 1000),
    startedAt: iso(-30 * 60 * 1000),
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    participants,
  };
}

function storeFor(session) {
  return {
    users: session.participants.map((p) => ({
      id: p.userId,
      name: p.userId,
      districtName: '일산서구',
      provinceName: '경기도',
      cityName: '고양시',
    })),
    runs: [],
    matchSessions: [session],
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
  };
}

// A grid that would produce a WRONG ranking if the verdict ever read checkpoint distance:
// the faster finisher is given a SMALLER checkpoint distance than the slower finisher.
function perturbedGridFavoringSlower() {
  return [0.1, 0.2, 0.3]; // arbitrary; the point is the two runners get DIFFERENT arrays.
}

test('INVARIANCE (duel): verdict is byte-identical with/without checkpoints and when perturbed', () => {
  // fast finishes at 1500s, slow at 1560s → fast MUST win regardless of checkpoint distances.
  const baseParticipants = () => [
    participant('fast', { seedRank: 1, finishElapsedSeconds: 1500 }),
    participant('slow', { seedRank: 2, finishElapsedSeconds: 1560, finishedAt: iso(-9 * 60 * 1000) }),
  ];

  // 1) No checkpoints (empty arrays) — legacy path.
  const sessionEmpty = sessionFor('duel', baseParticipants());
  const standingsEmpty = buildOfficialSessionStandings(storeFor(sessionEmpty), sessionEmpty, NOW);
  const verdictEmpty = buildDuelVerdict(sessionEmpty, standingsEmpty, 'fast', NOW);

  // 2) Populated checkpoints where the SLOWER finisher has the LARGER distance (adversarial).
  const partsPerturbed = baseParticipants();
  partsPerturbed[0].checkpoints = [0.1, 0.15]; // fast: smaller distances
  partsPerturbed[1].checkpoints = perturbedGridFavoringSlower(); // slow: larger distances
  const sessionPerturbed = sessionFor('duel', partsPerturbed);
  const standingsPerturbed = buildOfficialSessionStandings(storeFor(sessionPerturbed), sessionPerturbed, NOW);
  const verdictPerturbed = buildDuelVerdict(sessionPerturbed, standingsPerturbed, 'fast', NOW);

  // 3) Different arbitrary perturbation.
  const partsPerturbed2 = baseParticipants();
  partsPerturbed2[0].checkpoints = [5, 5, 5, 5];
  partsPerturbed2[1].checkpoints = [0.01];
  const sessionPerturbed2 = sessionFor('duel', partsPerturbed2);
  const standingsPerturbed2 = buildOfficialSessionStandings(storeFor(sessionPerturbed2), sessionPerturbed2, NOW);
  const verdictPerturbed2 = buildDuelVerdict(sessionPerturbed2, standingsPerturbed2, 'fast', NOW);

  assert.equal(verdictEmpty.outcome, 'win');
  assert.equal(verdictEmpty.winnerUserId, 'fast');
  // BYTE-IDENTICAL verdicts across all three checkpoint populations.
  assert.deepEqual(verdictPerturbed, verdictEmpty);
  assert.deepEqual(verdictPerturbed2, verdictEmpty);
});

test('INVARIANCE (group): verdict ranking is byte-identical when checkpoints are perturbed', () => {
  const baseParticipants = () => [
    participant('g-fast', { seedRank: 1, finishElapsedSeconds: 1500, finishedAt: iso(-10 * 60 * 1000) }),
    participant('g-mid', { seedRank: 2, finishElapsedSeconds: 1560, finishedAt: iso(-9 * 60 * 1000) }),
    participant('g-slow', { seedRank: 3, finishElapsedSeconds: 1620, finishedAt: iso(-8 * 60 * 1000) }),
  ];

  const sessionEmpty = sessionFor('group', baseParticipants());
  const standingsEmpty = buildOfficialSessionStandings(storeFor(sessionEmpty), sessionEmpty, NOW);
  const verdictEmpty = buildGroupVerdict(sessionEmpty, standingsEmpty, 'g-mid', NOW);

  // Adversarial: give the SLOWEST finisher the LARGEST checkpoint distances.
  const parts = baseParticipants();
  parts[0].checkpoints = [0.05]; // fast → smallest
  parts[1].checkpoints = [0.5, 0.6];
  parts[2].checkpoints = [9, 9, 9, 9, 9]; // slow → largest
  const sessionPerturbed = sessionFor('group', parts);
  const standingsPerturbed = buildOfficialSessionStandings(storeFor(sessionPerturbed), sessionPerturbed, NOW);
  const verdictPerturbed = buildGroupVerdict(sessionPerturbed, standingsPerturbed, 'g-mid', NOW);

  // The finish-elapsed ranking (fast, mid, slow) is preserved and identical to the empty case.
  assert.deepEqual(
    verdictEmpty.participants.map((p) => [p.userId, p.rank]),
    [['g-fast', 1], ['g-mid', 2], ['g-slow', 3]],
  );
  assert.deepEqual(verdictPerturbed, verdictEmpty);
});

// ---- Integration via the real progress handler ----

function liveParticipant(userId, seedRank) {
  return {
    userId,
    seedRank,
    acceptedAt: null,
    liveStatus: 'ready',
    liveDistanceKm: 0,
    liveElapsedSeconds: 0,
    livePace: '--:--/km',
    liveUpdatedAt: null,
    finishedAt: null,
    finishElapsedSeconds: null,
    checkpoints: [],
  };
}

// The progress handler stamps with the REAL clock (new Date()), so the live-store timestamps
// must be anchored to real now — a fixed 2026 NOW would hydrate the session to 'expired'.
function realIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

let liveMatchSeq = 0;

function liveDuelStore() {
  liveMatchSeq += 1;
  const session = {
    id: `live-checkpoint-duel-${liveMatchSeq}`,
    mode: 'duel',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    // A start ~2 minutes in the past: the session hydrates to 'active', and the server-backed
    // elapsed floor (~120s) never exceeds the per-push elapsedSeconds we drive the grid with
    // beyond the buckets we assert on (we push elapsed up to 29s, but normalizeRunningMatchProgress
    // takes the MAX of input elapsed and server-backed — see note in each push below).
    slotStartAt: realIso(-3 * 1000),
    startedAt: realIso(-3 * 1000),
    createdAt: realIso(-60 * 1000),
    matchedAt: realIso(-60 * 1000),
    participants: [liveParticipant('me', 1), liveParticipant('rival', 2)],
  };
  return {
    users: [
      { id: 'me', name: 'me', districtName: '일산서구', provinceName: '경기도', cityName: '고양시' },
      { id: 'rival', name: 'rival', districtName: '일산서구', provinceName: '경기도', cityName: '고양시' },
    ],
    runs: [],
    matchSessions: [session],
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
    session,
  };
}

test('INTEGRATION: 2.5s-cadence pushes fill the checkpoint grid via the real progress handler', () => {
  clearVanishedMatchTombstones();
  const store = liveDuelStore();
  const { session } = store;

  // Drive ~4 pushes per 10s bucket (2.5s cadence) for one runner across 30s → k=0,1,2 filled.
  // Distances stay under the server's MAX_SPEED cap (0.012 km/s) so normalizeRunningMatchProgress
  // passes them through verbatim — the grid then reflects the ACTUAL reported per-bucket sample.
  // Pace is VARIABLE: a slow first bucket (0.01 by 9s) then a surge (0.10 by 19s) — the whole
  // point is that checkpoints[1] captures the surge's real 0.10, NOT the ~0.05 a linear
  // projection of total-distance/elapsed to T=20s would give.
  const pushes = [
    { elapsed: 3, distance: 0.003 },
    { elapsed: 6, distance: 0.006 },
    { elapsed: 9, distance: 0.01 }, // last of bucket k=0 → checkpoints[0] = 0.01
    { elapsed: 12, distance: 0.04 },
    { elapsed: 16, distance: 0.08 },
    { elapsed: 19, distance: 0.1 }, // SURGE inside bucket k=1 → checkpoints[1] = 0.1
    { elapsed: 24, distance: 0.14 },
    { elapsed: 29, distance: 0.17 }, // last of bucket k=2 → checkpoints[2] = 0.17
  ];

  for (const { elapsed, distance } of pushes) {
    resetProgressPruneThrottle();
    updateRunningMatchProgress(store, { id: 'me' }, {
      matchId: session.id,
      distanceKm: distance,
      elapsedSeconds: elapsed,
      currentPace: '05:00/km',
      status: 'running',
    });
  }

  const mine = session.participants.find((p) => p.userId === 'me');
  assert.equal(highestFilledCheckpointIndex(mine.checkpoints), 2);
  assert.equal(mine.checkpoints[0], 0.01, 'k=0 is the last reported distance in the 0-10s bucket');
  // The variable-pace assertion: the surge sample (0.1 at 19s) is stored VERBATIM at k=1. A naive
  // linear projection of the runner's total distance to T=20s would read only ~0.05 — the whole
  // reason for the discrete grid.
  assert.equal(mine.checkpoints[1], 0.1, 'k=1 equals the ACTUAL reported distance at that bucket');
  assert.equal(mine.checkpoints[2], 0.17);
});

test('INTEGRATION: a finished push does NOT sample into the grid', () => {
  clearVanishedMatchTombstones();
  const store = liveDuelStore();
  const { session } = store;

  resetProgressPruneThrottle();
  updateRunningMatchProgress(store, { id: 'me' }, {
    matchId: session.id,
    distanceKm: 1,
    elapsedSeconds: 12,
    currentPace: '05:00/km',
    status: 'running',
  });
  const mine = session.participants.find((p) => p.userId === 'me');
  const beforeFinish = mine.checkpoints.slice();

  // A finishing push (reaches goal distance) must NOT append a checkpoint — the verdict is the
  // authority for the finish, and a partial bucket must not be snapped into the grid.
  resetProgressPruneThrottle();
  updateRunningMatchProgress(store, { id: 'me' }, {
    matchId: session.id,
    distanceKm: 5,
    elapsedSeconds: 47,
    currentPace: '05:00/km',
    status: 'finished',
  });

  assert.deepEqual(mine.checkpoints, beforeFinish, 'the finish push left the grid unchanged');
  assert.equal(mine.finishElapsedSeconds, 47, 'the measured finish still freezes independently');
});

test('INTEGRATION: standings feed the common-checkpoint distance to LIVE runners', () => {
  clearVanishedMatchTombstones();
  const store = liveDuelStore();
  const { session } = store;

  // Both runners push to 25s (k=0,1,2). me is ahead on the real grid; rival trails.
  const drive = (userId, samples) => {
    for (const { elapsed, distance } of samples) {
      resetProgressPruneThrottle();
      updateRunningMatchProgress(store, { id: userId }, {
        matchId: session.id,
        distanceKm: distance,
        elapsedSeconds: elapsed,
        currentPace: '05:00/km',
        status: 'running',
      });
    }
  };
  // Distances stay under the 0.012 km/s speed cap so the grid stores them verbatim. me leads.
  drive('me', [
    { elapsed: 9, distance: 0.03 },
    { elapsed: 19, distance: 0.09 },
    { elapsed: 25, distance: 0.12 },
  ]);
  drive('rival', [
    { elapsed: 9, distance: 0.02 },
    { elapsed: 19, distance: 0.05 },
    { elapsed: 25, distance: 0.07 },
  ]);

  const standings = buildOfficialSessionStandings(store, session, new Date());
  const mine = standings.find((s) => s.userId === 'me');
  const rival = standings.find((s) => s.userId === 'rival');

  // Both compared at the SAME common checkpoint — min highest-filled index over the pair is 2,
  // so commonMaxIndex = 2 → commonT = officialElapsedSeconds = 30s. Each runner's official
  // distance is its checkpoints[2] verbatim, NOT a per-runner linear projection.
  assert.equal(mine.officialElapsedSeconds, 30);
  assert.equal(rival.officialElapsedSeconds, 30);
  assert.equal(mine.officialDistanceKm, 0.12, 'my official distance is my checkpoint[2] verbatim');
  assert.equal(rival.officialDistanceKm, 0.07, 'rival official distance is their checkpoint[2] verbatim');
  // The head-to-head ranks me ahead on the fair common checkpoint.
  assert.equal(mine.officialRank, 1);
  assert.equal(rival.officialRank, 2);
});
