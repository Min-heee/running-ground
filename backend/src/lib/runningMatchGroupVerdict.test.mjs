import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGroupVerdict,
  buildOfficialSessionStandings,
  isParticipantGroupSealedDnf,
  sealGroupFallbackResolutionIfElapsed,
} from './runningMatchSessionStoreHelpers.mjs';
import {
  resolveSavedGroupMatchResult,
  buildMatchResultByMatchId,
} from './matchResultBuilders.mjs';
import { updateRunningMatchProgress } from './matchActionHandlers.mjs';
import { MATCH_DUEL_FINISH_FALLBACK_MS, MATCH_SEAL_REVISION_WINDOW_MS } from './matchConstants.mjs';

// A frozen "now" well past every slot so sessions hydrate to 'active'.
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
    levelLabel: 'Lv.1',
    weeklyDistanceKm: 10,
    lifetimeDistanceKm: 100,
    districtName: '일산서구',
    provinceName: '경기도',
    cityName: '고양시',
  };
}

// A group session participant. Defaults to a finisher; override liveStatus/finishElapsedSeconds
// to model a running / forfeited / not-yet-finished runner.
function participant(userId, overrides = {}) {
  const finished = overrides.liveStatus === undefined || overrides.liveStatus === 'finished';
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
    finishedAt: finished ? (overrides.finishedAt ?? iso(-10 * 60 * 1000)) : null,
    finishElapsedSeconds: finished ? (overrides.finishElapsedSeconds ?? 1500) : null,
    ...overrides,
  };
}

function groupSession(participants, overrides = {}) {
  return {
    id: 'group-test-match',
    mode: 'group',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt: iso(-30 * 60 * 1000),
    startedAt: iso(-30 * 60 * 1000),
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    participants,
    ...overrides,
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
  };
}

test('group verdict orders finishers by measured finish elapsed and resolves when all finished', () => {
  const session = groupSession([
    participant('fast', { seedRank: 1, finishElapsedSeconds: 1500, finishedAt: iso(-10 * 60 * 1000) }),
    participant('mid', { seedRank: 2, finishElapsedSeconds: 1560, finishedAt: iso(-9 * 60 * 1000) }),
    participant('slow', { seedRank: 3, finishElapsedSeconds: 1620, finishedAt: iso(-8 * 60 * 1000) }),
  ]);
  const store = storeFor(session);
  const standings = buildOfficialSessionStandings(store, session, NOW);
  const verdict = buildGroupVerdict(session, standings, 'mid', NOW);

  assert.equal(verdict.resolved, true);
  assert.deepEqual(verdict.participants.map((p) => [p.userId, p.rank]), [
    ['fast', 1],
    ['mid', 2],
    ['slow', 3],
  ]);
  assert.equal(verdict.myRank, 2);
});

test('group verdict ranks DNF / forfeited participants after finishers', () => {
  const session = groupSession([
    participant('finisher', { seedRank: 1, finishElapsedSeconds: 1500, finishedAt: iso(-10 * 60 * 1000) }),
    participant('forfeiter', {
      seedRank: 2,
      liveStatus: 'forfeited',
      finishElapsedSeconds: undefined,
      finishedAt: null,
      forfeitedAt: iso(-9 * 60 * 1000),
      liveDistanceKm: 2,
    }),
    participant('runner', {
      seedRank: 3,
      liveStatus: 'finished',
      finishElapsedSeconds: 1620,
      finishedAt: iso(-8 * 60 * 1000),
    }),
  ]);
  const store = storeFor(session);
  const standings = buildOfficialSessionStandings(store, session, NOW);
  const verdict = buildGroupVerdict(session, standings, 'forfeiter', NOW);

  assert.equal(verdict.resolved, true);
  // Finishers (1500, then 1620) lead; the forfeiter is last.
  const order = verdict.participants.map((p) => p.userId);
  assert.equal(order[0], 'finisher');
  assert.equal(order[order.length - 1], 'forfeiter');
  const forfeiter = verdict.participants.find((p) => p.userId === 'forfeiter');
  assert.equal(forfeiter.forfeited, true);
  assert.equal(forfeiter.finished, false);
});

test('group verdict is UNRESOLVED while someone is still running and the fallback window is open', () => {
  const session = groupSession([
    participant('done', { seedRank: 1, finishElapsedSeconds: 1500, finishedAt: iso(-5 * 1000) }),
    participant('still-running', {
      seedRank: 2,
      liveStatus: 'running',
      finishElapsedSeconds: undefined,
      finishedAt: null,
      liveUpdatedAt: iso(-2 * 1000),
      liveDistanceKm: 3,
    }),
    participant('also-done', { seedRank: 3, finishElapsedSeconds: 1560, finishedAt: iso(-4 * 1000) }),
  ]);
  const store = storeFor(session);
  const standings = buildOfficialSessionStandings(store, session, NOW);
  const verdict = buildGroupVerdict(session, standings, 'done', NOW);

  // Earliest finish was only seconds ago → fallback window NOT elapsed → not yet sealed.
  assert.equal(verdict.resolved, false);
  assert.equal(verdict.myRank, null);
});

test('group verdict SEALS via the §B4 fallback once the window elapses with a missing finisher', () => {
  // The first finish landed long enough ago that the fallback window has elapsed; the
  // still-running runner is treated as DNF and ranked after the finishers.
  const session = groupSession([
    participant('done', {
      seedRank: 1,
      finishElapsedSeconds: 1500,
      finishedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
      liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
    }),
    participant('stuck', {
      seedRank: 2,
      liveStatus: 'running',
      finishElapsedSeconds: undefined,
      finishedAt: null,
      // No live update since long ago → treated as DNF by the projection.
      liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
      liveDistanceKm: 3,
    }),
  ]);
  const store = storeFor(session);
  const standings = buildOfficialSessionStandings(store, session, NOW);
  const verdict = buildGroupVerdict(session, standings, 'done', NOW);

  assert.equal(verdict.resolved, true);
  const order = verdict.participants.map((p) => p.userId);
  assert.equal(order[0], 'done');
  assert.equal(order[1], 'stuck');
  assert.equal(verdict.myRank, 1);
});

test('resolveSavedGroupMatchResult overwrites the client rank from the live session verdict', () => {
  const session = groupSession([
    participant('host', { seedRank: 1, finishElapsedSeconds: 1500, finishedAt: iso(-10 * 60 * 1000) }),
    participant('me', { seedRank: 2, finishElapsedSeconds: 1560, finishedAt: iso(-9 * 60 * 1000) }),
    participant('third', { seedRank: 3, finishElapsedSeconds: 1620, finishedAt: iso(-8 * 60 * 1000) }),
  ]);
  const store = storeFor(session);
  const currentUser = { id: 'me' };
  // A fabricated client claim of 1위 must be overridden to the real 2위.
  const clientResult = {
    mode: 'group',
    matchId: 'group-test-match',
    source: 'official',
    title: '1위로 마무리했어요',
    summary: '가장 먼저 들어왔어요.',
    badgeLabel: '1위',
    rank: 1,
    participantCount: 3,
    comparedDistanceKm: 5,
    myDurationSeconds: 1560,
    myPaceLabel: '05:12/km',
  };

  const resolved = resolveSavedGroupMatchResult(store, currentUser, clientResult, NOW);
  assert.equal(resolved.rank, 2);
  assert.equal(resolved.badgeLabel, '2위');
  assert.match(resolved.title, /2위/);
  assert.equal(resolved.participantCount, 3);
});

test('resolveSavedGroupMatchResult is PENDING when the group is not yet settled', () => {
  const session = groupSession([
    participant('host', { seedRank: 1, finishElapsedSeconds: 1500, finishedAt: iso(-5 * 1000) }),
    participant('me', { seedRank: 2, finishElapsedSeconds: 1560, finishedAt: iso(-4 * 1000) }),
    participant('still', {
      seedRank: 3,
      liveStatus: 'running',
      finishElapsedSeconds: undefined,
      finishedAt: null,
      liveUpdatedAt: iso(-2 * 1000),
      liveDistanceKm: 3,
    }),
  ]);
  const store = storeFor(session);
  const currentUser = { id: 'me' };
  const clientResult = {
    mode: 'group',
    matchId: 'group-test-match',
    source: 'official',
    title: '3명 중 1위로 마쳤어요',
    summary: '',
    badgeLabel: '1위',
    rank: 1,
    participantCount: 3,
    myDurationSeconds: 1560,
    myPaceLabel: '05:12/km',
  };

  const resolved = resolveSavedGroupMatchResult(store, currentUser, clientResult, NOW);
  // No rank persisted → no rank LP from a client claim; badge shows the pending state.
  assert.equal(resolved.rank, undefined);
  assert.equal(resolved.badgeLabel, '결과 집계 중');
  // The runner's own measured pace/time stay (they are real).
  assert.equal(resolved.myDurationSeconds, 1560);
  assert.equal(resolved.myPaceLabel, '05:12/km');
});

test('resolveSavedGroupMatchResult reconstructs the placement from saved runs after the session is pruned', () => {
  // No live session for this matchId — only durable saved runs. The other two participants'
  // runs are present; this device (me) saves last. The client's fabricated 1위 is overridden
  // to the real 2위 by ranking the three measured finishes.
  const matchId = 'pruned-group-match';
  const store = {
    users: [
      { id: 'host', name: '방장' },
      { id: 'me', name: '나' },
      { id: 'third', name: '세번째' },
    ],
    runs: [
      {
        userId: 'host',
        durationSeconds: 1500,
        createdAt: iso(-9 * 60 * 1000),
        matchResult: { mode: 'group', matchId, rank: 1, participantCount: 3, myDurationSeconds: 1500 },
      },
      {
        userId: 'third',
        durationSeconds: 1620,
        createdAt: iso(-8 * 60 * 1000),
        matchResult: { mode: 'group', matchId, rank: 3, participantCount: 3, myDurationSeconds: 1620 },
      },
    ],
    matchSessions: [],
  };
  const currentUser = { id: 'me' };
  const clientResult = {
    mode: 'group',
    matchId,
    source: 'official',
    title: '1위로 마무리했어요',
    summary: '',
    badgeLabel: '1위',
    rank: 1,
    participantCount: 3,
    myDurationSeconds: 1560,
    myPaceLabel: '05:12/km',
  };

  const resolved = resolveSavedGroupMatchResult(store, currentUser, clientResult, NOW);
  assert.equal(resolved.rank, 2);
  assert.equal(resolved.badgeLabel, '2위');
  assert.equal(resolved.participantCount, 3);
});

test('resolveSavedGroupMatchResult is PENDING from saved runs when not every participant has saved', () => {
  const matchId = 'partial-group-match';
  const store = {
    users: [
      { id: 'host', name: '방장' },
      { id: 'me', name: '나' },
      { id: 'third', name: '세번째' },
    ],
    runs: [
      {
        userId: 'host',
        durationSeconds: 1500,
        createdAt: iso(-9 * 60 * 1000),
        matchResult: { mode: 'group', matchId, rank: 1, participantCount: 3, myDurationSeconds: 1500 },
      },
      // 'third' has NOT saved yet → only 2 of 3 known → cannot seal.
    ],
    matchSessions: [],
  };
  const currentUser = { id: 'me' };
  const clientResult = {
    mode: 'group',
    matchId,
    source: 'official',
    badgeLabel: '1위',
    rank: 1,
    participantCount: 3,
    myDurationSeconds: 1560,
    myPaceLabel: '05:12/km',
    title: '',
    summary: '',
  };

  const resolved = resolveSavedGroupMatchResult(store, currentUser, clientResult, NOW);
  assert.equal(resolved.rank, undefined);
  assert.equal(resolved.badgeLabel, '결과 집계 중');
});

test('resolveSavedGroupMatchResult leaves a forfeit record and a no-matchId record untouched', () => {
  const forfeit = {
    mode: 'group',
    matchId: 'group-test-match',
    badgeLabel: '기권',
    rank: 3,
    participantCount: 3,
  };
  assert.equal(resolveSavedGroupMatchResult({ runs: [], users: [], matchSessions: [] }, { id: 'me' }, forfeit, NOW), forfeit);

  const noMatchId = { mode: 'group', badgeLabel: '2위', rank: 2 };
  assert.equal(resolveSavedGroupMatchResult({ runs: [], users: [], matchSessions: [] }, { id: 'me' }, noMatchId, NOW), noMatchId);

  // A duel record is not a group concern → returned unchanged.
  const duel = { mode: 'duel', matchId: 'x', resultTone: 'win' };
  assert.equal(resolveSavedGroupMatchResult({ runs: [], users: [], matchSessions: [] }, { id: 'me' }, duel, NOW), duel);
});

test('the GET /result group roster still resolves from a live session (verdict is additive, not replacing it)', () => {
  const session = groupSession([
    participant('host', { seedRank: 1, finishElapsedSeconds: 1500, finishedAt: iso(-10 * 60 * 1000) }),
    participant('me', { seedRank: 2, finishElapsedSeconds: 1560, finishedAt: iso(-9 * 60 * 1000) }),
  ]);
  const store = storeFor(session);
  const result = buildMatchResultByMatchId(store, { id: 'me' }, 'group-test-match', NOW);
  assert.equal(result.mode, 'group');
  assert.deepEqual(result.participants.map((p) => p.rank), [1, 2]);
});

// ──────────────────────────────────────────────────────────────────────────────
// Bundle C — the §B4 GROUP SEAL (the parity twin of the duel seal). A group that
// resolves via the fallback window must FREEZE the ordering: a stalled-then-resurrected
// runner who posts a faster finish AFTER the seal can never flip an already-sealed
// placement. Mirrors backend/src/lib/runningMatchRankSystem.test.mjs's duel seal tests.
// ──────────────────────────────────────────────────────────────────────────────

test('group SEALS at §B4 and a later FASTER finish from a sealed-DNF runner does NOT flip the order beyond the revision window', () => {
  // This test calls updateRunningMatchProgress, which goes through findMatchSessionById →
  // pruneMatchSessions. That prune path defaults its clock to `new Date()` (REAL now) end to end,
  // so it cannot see the frozen NOW the other tests use. Anchor THIS session's timestamps to real
  // now so: (1) the §B4 fallback window (90s) is elapsed relative to real now and the seal fires,
  // and (2) the session is well inside the 4h active TTL relative to real now so the prune KEEPS
  // it. The verdict helpers get this same `realNow` so the seal and the prune share one clock.
  // (The frozen-NOW tests stay untouched; only this one needs a real-now anchor.)
  const realNow = new Date();
  const realIso = (offsetMs) => new Date(realNow.getTime() + offsetMs).toISOString();
  const elapsedFallback = -(MATCH_DUEL_FINISH_FALLBACK_MS + 5000);
  // A finished as rank 1; B was still running when the §B4 window elapsed → B is sealed DNF.
  const session = groupSession([
    participant('A', {
      seedRank: 1,
      finishElapsedSeconds: 1500,
      finishedAt: realIso(elapsedFallback),
      liveUpdatedAt: realIso(elapsedFallback),
    }),
    participant('B', {
      seedRank: 2,
      liveStatus: 'running',
      finishElapsedSeconds: undefined,
      finishedAt: null,
      liveUpdatedAt: realIso(elapsedFallback),
      liveDistanceKm: 3,
    }),
  ], {
    slotStartAt: realIso(-30 * 60 * 1000),
    startedAt: realIso(-30 * 60 * 1000),
    createdAt: realIso(-31 * 60 * 1000),
    matchedAt: realIso(-31 * 60 * 1000),
  });
  const store = storeFor(session);

  // First poll seals: A is the lone finisher, B is sealed DNF below.
  const standings1 = buildOfficialSessionStandings(store, session, realNow);
  const verdict1 = buildGroupVerdict(session, standings1, 'A', realNow);
  assert.equal(verdict1.resolved, true);
  // A fresh group seal is PROVISIONAL — the revision window (10min from resolvedAt) is open.
  assert.equal(verdict1.provisional, true);
  assert.deepEqual(verdict1.participants.map((p) => [p.userId, p.rank]), [['A', 1], ['B', 2]]);
  assert.equal(verdict1.myRank, 1);
  // The seal is now persisted on the session.
  assert.ok(session.groupFallbackResolution);
  assert.deepEqual(session.groupFallbackResolution.finisherUserIds, ['A']);
  assert.deepEqual(session.groupFallbackResolution.dnfUserIds, ['B']);
  assert.equal(isParticipantGroupSealedDnf(session, 'B'), true);
  assert.equal(isParticipantGroupSealedDnf(session, 'A'), false);

  // Rewind the seal past the revision window (absolute timestamps make this equivalent to
  // waiting 11 minutes) so B's late finish below hits the CLOSED-window path. (INSIDE the
  // window a plausible late finish now un-DNFs B via annul + deterministic re-seal — pinned
  // in matchSealRevision.test.mjs.)
  session.groupFallbackResolution.resolvedAt = realIso(-(MATCH_SEAL_REVISION_WINDOW_MS + 60_000));

  // The sealed-DNF runner B now posts a LATER, FASTER finish (1200s < A's 1500s) BEYOND the
  // window. The handler must NOT promote B above A — B stays a non-finisher (no
  // finishElapsedSeconds, not finished).
  updateRunningMatchProgress(store, { id: 'B' }, {
    matchId: 'group-test-match',
    distanceKm: 5,
    elapsedSeconds: 1200,
    currentPace: '04:00/km',
    status: 'finished',
  });
  const bParticipant = session.participants.find((p) => p.userId === 'B');
  assert.equal(Number.isInteger(bParticipant.finishElapsedSeconds), false);
  assert.notEqual(bParticipant.liveStatus, 'finished');
  assert.equal(bParticipant.finishedAt, null);

  // Both perspectives still read the SEALED order — A rank 1, B DNF-below. No flip.
  const standings2 = buildOfficialSessionStandings(store, session, realNow);
  const verdictA = buildGroupVerdict(session, standings2, 'A', realNow);
  const verdictB = buildGroupVerdict(session, standings2, 'B', realNow);
  assert.deepEqual(verdictA.participants.map((p) => [p.userId, p.rank]), [['A', 1], ['B', 2]]);
  assert.equal(verdictA.myRank, 1);
  assert.deepEqual(verdictB.participants.map((p) => [p.userId, p.rank]), [['A', 1], ['B', 2]]);
  assert.equal(verdictB.myRank, 2);
  const sealedB = verdictB.participants.find((p) => p.userId === 'B');
  assert.equal(sealedB.finished, false);
  assert.equal(sealedB.finishElapsedSeconds, null);
});

test('group seal is STICKY — a later recompute returns the same order, never overwritten', () => {
  const session = groupSession([
    participant('A', {
      seedRank: 1,
      finishElapsedSeconds: 1500,
      finishedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
      liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
    }),
    participant('B', {
      seedRank: 2,
      liveStatus: 'running',
      finishElapsedSeconds: undefined,
      finishedAt: null,
      liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
      liveDistanceKm: 3,
    }),
    participant('C', {
      seedRank: 3,
      finishElapsedSeconds: 1560,
      finishedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 4000)),
      liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 4000)),
    }),
  ]);
  const store = storeFor(session);
  const standings = buildOfficialSessionStandings(store, session, NOW);

  const first = sealGroupFallbackResolutionIfElapsed(session, NOW);
  assert.ok(first);
  assert.deepEqual(first.finisherUserIds, ['A', 'C']);
  assert.deepEqual(first.dnfUserIds, ['B']);
  const firstResolvedAt = first.resolvedAt;

  // Mutate B onto a finish AFTER the seal (simulating a late durable resend that somehow set
  // fields); the sticky seal must NOT be recomputed/overwritten.
  const bParticipant = session.participants.find((p) => p.userId === 'B');
  bParticipant.finishElapsedSeconds = 1000;
  bParticipant.liveStatus = 'finished';
  bParticipant.finishedAt = iso(0);

  const second = sealGroupFallbackResolutionIfElapsed(session, new Date(NOW.getTime() + 60_000));
  assert.equal(second.resolvedAt, firstResolvedAt);
  assert.deepEqual(second.finisherUserIds, ['A', 'C']);
  assert.deepEqual(second.dnfUserIds, ['B']);

  // And the verdict reads the sealed order regardless of B's mutated finish — B stays DNF last.
  const verdict = buildGroupVerdict(session, standings, 'C', new Date(NOW.getTime() + 60_000));
  assert.deepEqual(verdict.participants.map((p) => [p.userId, p.rank]), [['A', 1], ['C', 2], ['B', 3]]);
  assert.equal(verdict.myRank, 2);
});

test('group that finishes BEFORE the window elapses is NOT prematurely sealed (live order honored)', () => {
  // All three finish; the earliest finish was only seconds ago → window NOT elapsed → no seal,
  // and the verdict resolves via the everyone-terminal path on the LIVE measured order.
  const session = groupSession([
    participant('A', { seedRank: 1, finishElapsedSeconds: 1500, finishedAt: iso(-3 * 1000) }),
    participant('B', { seedRank: 2, finishElapsedSeconds: 1560, finishedAt: iso(-2 * 1000) }),
    participant('C', { seedRank: 3, finishElapsedSeconds: 1620, finishedAt: iso(-1 * 1000) }),
  ]);
  const store = storeFor(session);
  const standings = buildOfficialSessionStandings(store, session, NOW);
  const verdict = buildGroupVerdict(session, standings, 'B', NOW);

  assert.equal(session.groupFallbackResolution, undefined);
  assert.equal(verdict.resolved, true);
  assert.deepEqual(verdict.participants.map((p) => [p.userId, p.rank]), [['A', 1], ['B', 2], ['C', 3]]);
  assert.equal(verdict.myRank, 2);
});

test('group seal preserves measured finisher order then ranks every non-finisher DNF below', () => {
  // Two finishers (C faster than A) + one stalled runner; after the window the sealed order is
  // C(1), A(2) by MEASURED elapsed, then the stalled runner DNF(3).
  const session = groupSession([
    participant('A', {
      seedRank: 1,
      finishElapsedSeconds: 1600,
      finishedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 3000)),
      liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 3000)),
    }),
    participant('C', {
      seedRank: 3,
      finishElapsedSeconds: 1400,
      finishedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
      liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
    }),
    participant('stalled', {
      seedRank: 2,
      liveStatus: 'running',
      finishElapsedSeconds: undefined,
      finishedAt: null,
      liveUpdatedAt: iso(-(MATCH_DUEL_FINISH_FALLBACK_MS + 5000)),
      liveDistanceKm: 2,
    }),
  ]);
  const store = storeFor(session);
  const standings = buildOfficialSessionStandings(store, session, NOW);
  const verdict = buildGroupVerdict(session, standings, 'stalled', NOW);

  assert.equal(verdict.resolved, true);
  assert.deepEqual(verdict.participants.map((p) => [p.userId, p.rank]), [['C', 1], ['A', 2], ['stalled', 3]]);
  assert.equal(verdict.myRank, 3);
  assert.deepEqual(session.groupFallbackResolution.finisherUserIds, ['C', 'A']);
  assert.deepEqual(session.groupFallbackResolution.dnfUserIds, ['stalled']);
});
