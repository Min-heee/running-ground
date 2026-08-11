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

// ---- Grid saturation fallback (2026-08-11, group-match-73eb939d) ----
//
// The grid holds MATCH_CHECKPOINT_MAX indices (20 min). A 33-minute 6km race filled every
// runner's last slot, the common index could never advance again, and the whole race board —
// every runner's row, including one's own — froze at the 20-minute distances for the rest of
// the race. The fix: at the last index the compare degrades to the continuous projection
// (min live elapsed over the same active set), which keeps moving for arbitrarily long races.
// Reverting the saturation guard makes officialElapsedSeconds read 1200 and every distance
// read its frozen grid value — both assertions below then fail deterministically.

import { MATCH_CHECKPOINT_MAX } from './matchConstants.mjs';
import { projectOfficialDistanceKm } from './matchPureHelpers.mjs';

// Monotone ramp whose LAST slot is exactly finalKm — the shape a real 20-min grid ends with.
function saturatedGrid(finalKm, length = MATCH_CHECKPOINT_MAX) {
  const grid = [];
  for (let index = 0; index < length; index += 1) {
    grid.push(Number((finalKm * ((index + 1) / length)).toFixed(2)));
  }
  return grid;
}

function stillRunning(userId, seedRank, { gridFinalKm, liveKm, liveElapsed, gridLength }) {
  return participant(userId, {
    seedRank,
    liveStatus: 'running',
    finishedAt: null,
    finishElapsedSeconds: null,
    liveDistanceKm: liveKm,
    liveElapsedSeconds: liveElapsed,
    liveUpdatedAt: iso(0),
    checkpoints: saturatedGrid(gridFinalKm, gridLength ?? MATCH_CHECKPOINT_MAX),
  });
}

test('SATURATION: a race past the 20-min grid degrades to the MOVING projection, never freezes', () => {
  // The incident shape at ~33 min: all four still running, grids full, live distances far past
  // the frozen 20-min values (3.51 / 3.51 / 3.49 / 1.89 were the real frozen board rows).
  const session = sessionFor('group', [
    stillRunning('r1', 1, { gridFinalKm: 3.51, liveKm: 5.52, liveElapsed: 2005 }),
    stillRunning('r2', 2, { gridFinalKm: 3.51, liveKm: 5.5, liveElapsed: 2003 }),
    stillRunning('r3', 3, { gridFinalKm: 3.49, liveKm: 5.45, liveElapsed: 2001 }),
    stillRunning('r4', 4, { gridFinalKm: 1.89, liveKm: 2.96, liveElapsed: 2000 }),
  ]);
  session.distanceKm = 6;
  const standings = buildOfficialSessionStandings(storeFor(session), session, NOW);
  const byId = new Map(standings.map((standing) => [standing.userId, standing]));

  // Compared time = min LIVE elapsed over active runners (2000s) — NOT the frozen grid end (1200s).
  for (const standing of standings) {
    assert.equal(standing.officialElapsedSeconds, 2000);
  }

  // Every compared distance is the projection at 2000s and has moved PAST its frozen grid value.
  const expectations = [
    ['r1', 5.52, 2005, 3.51],
    ['r2', 5.5, 2003, 3.51],
    ['r3', 5.45, 2001, 3.49],
    ['r4', 2.96, 2000, 1.89],
  ];
  for (const [userId, liveKm, liveElapsed, frozenKm] of expectations) {
    const standing = byId.get(userId);
    assert.equal(
      standing.officialDistanceKm,
      projectOfficialDistanceKm(liveKm, liveElapsed, 2000, 6),
      `${userId} must be projection-compared past saturation`,
    );
    assert.ok(
      standing.officialDistanceKm > frozenKm + 1,
      `${userId} must have moved well past its frozen 20-min grid value`,
    );
  }
});

test('PRE-HORIZON: everyone still inside the grid keeps the fair checkpoint compare', () => {
  // 적대 검증 2026-08-11: the saturation judgment must be PER RUNNER (grid-terminal), never
  // "common index reached the last slot". Here nobody is terminal (elapsed < horizon, last slot
  // unfilled) — the fair compare stays in force at the common index.
  const session = sessionFor('group', [
    stillRunning('r1', 1, { gridFinalKm: 3.45, liveKm: 3.47, liveElapsed: 1188, gridLength: MATCH_CHECKPOINT_MAX - 2 }),
    stillRunning('r2', 2, { gridFinalKm: 3.44, liveKm: 3.46, liveElapsed: 1186, gridLength: MATCH_CHECKPOINT_MAX - 2 }),
    stillRunning('r3', 3, { gridFinalKm: 3.42, liveKm: 3.44, liveElapsed: 1185, gridLength: MATCH_CHECKPOINT_MAX - 3 }),
    stillRunning('r4', 4, { gridFinalKm: 1.85, liveKm: 1.87, liveElapsed: 1183, gridLength: MATCH_CHECKPOINT_MAX - 2 }),
  ]);
  session.distanceKm = 6;
  const standings = buildOfficialSessionStandings(storeFor(session), session, NOW);
  const byId = new Map(standings.map((standing) => [standing.userId, standing]));

  const commonIndex = MATCH_CHECKPOINT_MAX - 4; // min highest index (r3's grid ends there)
  const commonT = (commonIndex + 1) * 10;
  for (const standing of standings) {
    assert.equal(standing.officialElapsedSeconds, commonT);
  }
  assert.equal(byId.get('r1').officialDistanceKm, saturatedGrid(3.45, MATCH_CHECKPOINT_MAX - 2)[commonIndex]);
  assert.equal(byId.get('r3').officialDistanceKm, saturatedGrid(3.42, MATCH_CHECKPOINT_MAX - 3)[commonIndex]);
});

// 적대 검증 2026-08-11이 잡은 1차 수술의 구멍 재현: 한 러너가 마지막 10초 버킷([1190,1200))을
// 놓치면 그리드가 118 이하에서 영원히 굳는다(appendCheckpointSample는 cap 밖에서 hard no-op,
// elapsed는 단조). "공통 인덱스 == 119"만 보던 1차 가드는 이때 영원히 안 켜져서 동결이 그대로
// 재발했다. grid-terminal 판정(마지막 칸 OR 지평선 초과)은 이 러너도 terminal로 본다.
test('SATURATION despite a stuck grid: a runner who missed the final bucket cannot pin the board frozen', () => {
  const session = sessionFor('group', [
    stillRunning('r1', 1, { gridFinalKm: 3.51, liveKm: 5.52, liveElapsed: 2005 }),
    stillRunning('r2', 2, { gridFinalKm: 3.51, liveKm: 5.5, liveElapsed: 2003 }),
    stillRunning('r3', 3, { gridFinalKm: 3.49, liveKm: 5.45, liveElapsed: 2001 }),
    // The stuck runner: grid tops out at index 118, but elapsed is far past the horizon.
    stillRunning('r4', 4, { gridFinalKm: 1.89, liveKm: 2.96, liveElapsed: 2000, gridLength: MATCH_CHECKPOINT_MAX - 1 }),
  ]);
  session.distanceKm = 6;
  const standings = buildOfficialSessionStandings(storeFor(session), session, NOW);
  const byId = new Map(standings.map((standing) => [standing.userId, standing]));

  // The compare must be the MOVING projection at min live elapsed — never the frozen grid.
  for (const standing of standings) {
    assert.equal(standing.officialElapsedSeconds, 2000);
  }
  assert.equal(byId.get('r1').officialDistanceKm, projectOfficialDistanceKm(5.52, 2005, 2000, 6));
  assert.ok(byId.get('r1').officialDistanceKm > 3.51 + 1, 'stuck grid must not freeze the board');
});

// 적대 검증 2026-08-11 시나리오 B: 화면꺼짐으로 disconnected였던 러너(그리드가 저 뒤에서 굳음)가
// 재접속해 active로 복귀하면, 1차 가드에서는 공통 인덱스가 그 굳은 인덱스로 곤두박질쳐 보드가
// 뒤로 점프한 채 재동결했다. grid-terminal 판정에서는 재접속 러너도 terminal이라 투영이 유지된다.
test('SATURATION survives a reconnecting runner with a stale grid — no backward jump', () => {
  const session = sessionFor('group', [
    stillRunning('r1', 1, { gridFinalKm: 3.51, liveKm: 4.2, liveElapsed: 1505 }),
    stillRunning('r2', 2, { gridFinalKm: 3.51, liveKm: 4.15, liveElapsed: 1503 }),
    stillRunning('r3', 3, { gridFinalKm: 3.49, liveKm: 4.1, liveElapsed: 1501 }),
    // Reconnected after a long screen-off gap: grid stuck at index 101, elapsed past horizon.
    stillRunning('r4', 4, { gridFinalKm: 1.6, liveKm: 2.2, liveElapsed: 1500, gridLength: 102 }),
  ]);
  session.distanceKm = 6;
  const standings = buildOfficialSessionStandings(storeFor(session), session, NOW);
  const byId = new Map(standings.map((standing) => [standing.userId, standing]));

  for (const standing of standings) {
    assert.equal(standing.officialElapsedSeconds, 1500, 'must not rewind to the stale grid time (1020s)');
  }
  assert.equal(byId.get('r4').officialDistanceKm, projectOfficialDistanceKm(2.2, 1500, 1500, 6));
  assert.ok(byId.get('r1').officialDistanceKm > 3.51, 'board must stay ahead of the stale grid values');
});
