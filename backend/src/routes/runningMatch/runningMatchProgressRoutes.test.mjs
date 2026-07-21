import assert from 'node:assert/strict';
import test from 'node:test';

// B-1 (finish-flow relief 2026-07-07) — GET /api/running/matches/:matchId/result routing:
//   - steady state (finalized + back-filled, or plain both-finished — the sweep reports no
//     work): the payload is served from a lock-free loadStore snapshot and mutateStore is
//     NEVER called;
//   - heal due (unsealed §B4 window elapsed): the LOCKED path runs and the seal PERSISTS on
//     the authoritative store, exactly as before B-1;
//   - error semantics (401 auth, 404 unknown/malformed/oversized id) are identical on both
//     paths. (/result has no 410 tombstone branch — that terminal answer belongs to the
//     progress POST, which this change does not touch.)
//
// The sweep and the result builder are the REAL modules (importing matchResultBuilders also
// registers the saved-run back-fill into the sweep, exactly as the server wires it); only the
// store seam (loadStore/mutateStore) and requireUser are DI spies.
import { routeRunningMatchProgressRoutes } from './runningMatchProgressRoutes.mjs';
import { buildMatchResultByMatchId } from '../../lib/matchResultBuilders.mjs';
import { sweepStuckMatchSessionFallbacks } from '../../lib/runningMatchSessionStoreHelpers.mjs';
import { MATCH_SEAL_REVISION_WINDOW_MS } from '../../lib/matchConstants.mjs';

class TestApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details && typeof details === 'object' ? details : null;
  }
}

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

// One-finisher duel: winner finished `finishedAgoMs` ago, loser is a stale 'running'
// heartbeat. Optional seal/finalization state models the sweep's lifecycle stages.
function createOneFinisherDuelStore(matchId, {
  finishedAgoMs = 100 * 1000,
  sealedAgoMs = null,
  finalized = false,
  healedBlob = false,
} = {}) {
  const winner = createUser(`winner-${matchId}`);
  const loser = createUser(`loser-${matchId}`);
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
    ...(sealedAgoMs !== null
      ? {
          duelFallbackResolution: {
            resolvedAt: iso(-sealedAgoMs),
            winnerUserId: winner.id,
            dnfUserId: loser.id,
          },
        }
      : {}),
    ...(finalized ? { sealFinalizedAt: iso(-60 * 1000) } : {}),
    participants: [
      {
        userId: winner.id,
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1500,
        livePace: '05:00/km',
        liveUpdatedAt: iso(-finishedAgoMs),
        finishedAt: iso(-finishedAgoMs),
        finishElapsedSeconds: 1500,
      },
      {
        userId: loser.id,
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 3.2,
        liveElapsedSeconds: 1100,
        livePace: '05:40/km',
        liveUpdatedAt: iso(-finishedAgoMs),
        finishedAt: null,
        finishElapsedSeconds: null,
      },
    ],
  };
  const startedAt = iso(-40 * 60 * 1000);
  const savedRun = {
    id: `${winner.id}-saved-run`,
    userId: winner.id,
    date: startedAt.slice(0, 10),
    distanceKm: 5,
    pace: '05:00/km',
    source: 'RunningGround',
    sourceType: 'tracked',
    startedAt,
    endedAt: iso(-39 * 60 * 1000),
    durationSeconds: 1500,
    createdAt: iso(-39 * 60 * 1000),
    matchResult: healedBlob
      ? {
          mode: 'duel',
          matchId,
          source: 'official',
          title: `${loser.id}님을 이겼어요`,
          badgeLabel: '승리',
          resultTone: 'win',
          opponentName: loser.id,
          opponentId: loser.id,
          comparedDistanceKm: 5,
          myDurationSeconds: 1500,
          myPaceLabel: '05:00/km',
        }
      : {
          mode: 'duel',
          matchId,
          source: 'official',
          title: '대결 결과를 집계하고 있어요',
          summary: '상대가 완주하면 결과가 자동으로 업데이트돼요.',
          badgeLabel: '결과 집계 중',
          opponentName: loser.id,
          comparedDistanceKm: 5,
          myDurationSeconds: 1500,
          myPaceLabel: '05:00/km',
        },
  };
  const store = {
    users: [winner, loser],
    runs: [createProfileRun(winner.id), createProfileRun(loser.id), savedRun],
    matchSessions: [session],
    matchQueues: { duel: [], group: [] },
    matchRooms: [],
    notifications: [],
  };
  return { store, session, winner, loser };
}

function createMockResponse() {
  return {
    body: undefined,
    ended: false,
    statusCode: undefined,
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body) {
      this.body = body;
      this.ended = true;
    },
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode);
  response.end(JSON.stringify(payload));
}

// DI harness: `serverStore` is the authoritative store. loadStore hands out throwaway clones
// (exactly like both real adapters); mutateStore runs the mutator against the authoritative
// object and lets a thrown ApiError propagate (the adapters roll back on throw).
function createResultRouteHarness(serverStore, { requesterId } = {}) {
  const calls = { loadStore: 0, mutateStore: 0 };
  const response = createMockResponse();
  const deps = {
    ApiError: TestApiError,
    buildMatchResultByMatchId,
    sweepStuckMatchSessionFallbacks,
    loadStore: async () => {
      calls.loadStore += 1;
      return clone(serverStore);
    },
    mutateStore: async (mutator) => {
      calls.mutateStore += 1;
      return mutator(serverStore);
    },
    request: {},
    requireUser: (store, request) => {
      const user = store.users.find((entry) => entry.id === requesterId) ?? store.users[0];
      if (!user) {
        throw new TestApiError(401, '로그인이 필요해요.');
      }
      return user;
    },
    response,
    sendJson,
  };

  return {
    calls,
    response,
    fetchResult(matchId) {
      return routeRunningMatchProgressRoutes({
        ...deps,
        method: 'GET',
        pathname: `/api/running/matches/${matchId}/result`,
      });
    },
  };
}

test('steady state (finalized + back-filled): /result is served from the snapshot, mutateStore never called', async () => {
  const { store, winner } = createOneFinisherDuelStore('b1-fast-duel', {
    sealedAgoMs: MATCH_SEAL_REVISION_WINDOW_MS + 5 * 60 * 1000,
    finalized: true,
    healedBlob: true,
  });
  const harness = createResultRouteHarness(store, { requesterId: winner.id });
  const persistedBefore = JSON.stringify(store);

  const handled = await harness.fetchResult('b1-fast-duel');
  assert.equal(handled, true);
  assert.equal(harness.response.statusCode, 200);

  const payload = JSON.parse(harness.response.body);
  assert.equal(payload.matchId, 'b1-fast-duel');
  assert.equal(payload.participants.find((participant) => participant.userId === winner.id).resultTone, 'win');
  assert.equal(payload.provisional ?? undefined, undefined, 'finalized verdict is no longer provisional');

  assert.equal(harness.calls.loadStore, 1, 'exactly one lock-free snapshot read');
  assert.equal(harness.calls.mutateStore, 0, 'the fast path never takes the store lock');
  // The pure read left the authoritative store untouched.
  assert.equal(JSON.stringify(store), persistedBefore);
});

test('plain both-finished duel: /result stays on the fast path (nothing to sweep)', async () => {
  const { store, session, winner, loser } = createOneFinisherDuelStore('b1-bothdone-duel');
  const loserParticipant = session.participants.find((participant) => participant.userId === loser.id);
  loserParticipant.liveStatus = 'finished';
  loserParticipant.finishedAt = iso(-90 * 1000);
  loserParticipant.finishElapsedSeconds = 1620;
  loserParticipant.liveElapsedSeconds = 1620;
  const harness = createResultRouteHarness(store, { requesterId: winner.id });

  await harness.fetchResult('b1-bothdone-duel');
  assert.equal(harness.response.statusCode, 200);
  const payload = JSON.parse(harness.response.body);
  assert.equal(payload.participants.find((participant) => participant.userId === winner.id).resultTone, 'win');
  assert.equal(payload.participants.find((participant) => participant.userId === loser.id).resultTone, 'lose');
  assert.equal(harness.calls.mutateStore, 0);
});

test('seal due: /result takes the locked path and the seal persists on the authoritative store', async () => {
  // Finish 100s ago (> the 90s §B4 window), never sealed → the snapshot sweep reports work.
  const { store, session, winner } = createOneFinisherDuelStore('b1-locked-duel');
  assert.equal(session.duelFallbackResolution ?? undefined, undefined);
  const harness = createResultRouteHarness(store, { requesterId: winner.id });

  await harness.fetchResult('b1-locked-duel');
  assert.equal(harness.response.statusCode, 200);

  const payload = JSON.parse(harness.response.body);
  assert.equal(payload.provisional, true, 'fresh seal is provisional');
  assert.equal(payload.participants.find((participant) => participant.userId === winner.id).resultTone, 'win');

  assert.equal(harness.calls.mutateStore, 1, 'the heal runs under the store lock');
  // Persisted on the AUTHORITATIVE store (not the discarded snapshot clone).
  assert.equal(store.matchSessions[0].duelFallbackResolution.winnerUserId, winner.id);

  // The follow-up read finds nothing left to heal inside the revision window → fast path.
  const second = createResultRouteHarness(store, { requesterId: winner.id });
  await second.fetchResult('b1-locked-duel');
  assert.equal(second.response.statusCode, 200);
  assert.equal(second.calls.mutateStore, 0, 'once persisted, polls leave the lock alone');
  assert.equal(
    JSON.parse(second.response.body).participants.find((participant) => participant.userId === winner.id).resultTone,
    'win',
  );
});

test('404 for an unknown match id is identical on the fast path and the locked path', async () => {
  // Fast path: steady-state store, unknown id → 404 thrown before any lock.
  const fastStore = createOneFinisherDuelStore('b1-known-duel', {
    sealedAgoMs: MATCH_SEAL_REVISION_WINDOW_MS + 5 * 60 * 1000,
    finalized: true,
    healedBlob: true,
  });
  // (buildMatchResultByMatchId throws the backend's real ApiError — assert on the status/message
  // contract, which is what the HTTP layer serializes.)
  const fastHarness = createResultRouteHarness(fastStore.store, { requesterId: fastStore.winner.id });
  await assert.rejects(
    () => fastHarness.fetchResult('does-not-exist'),
    (error) => error.statusCode === 404 && error.message === '대결 결과를 찾을 수 없어요.',
  );
  assert.equal(fastHarness.calls.mutateStore, 0);

  // Locked path: a seal-due session forces the locked route; the unknown id still 404s and the
  // thrown error propagates out of mutateStore exactly like the adapters' rollback.
  const lockedStore = createOneFinisherDuelStore('b1-sealdue-duel');
  const lockedHarness = createResultRouteHarness(lockedStore.store, { requesterId: lockedStore.winner.id });
  await assert.rejects(
    () => lockedHarness.fetchResult('does-not-exist'),
    (error) => error.statusCode === 404 && error.message === '대결 결과를 찾을 수 없어요.',
  );
  assert.equal(lockedHarness.calls.mutateStore, 1, 'the due heal still routed through the lock');
});

test('malformed and oversized ids 404 before any store access', async () => {
  const { store, winner } = createOneFinisherDuelStore('b1-guard-duel');
  const harness = createResultRouteHarness(store, { requesterId: winner.id });

  await assert.rejects(
    () => harness.fetchResult('%zz'),
    (error) => error instanceof TestApiError && error.statusCode === 404,
  );
  await assert.rejects(
    () => harness.fetchResult('x'.repeat(129)),
    (error) => error instanceof TestApiError && error.statusCode === 404,
  );
  assert.equal(harness.calls.loadStore, 0, 'guards reject before touching the store');
  assert.equal(harness.calls.mutateStore, 0);
});

test('auth failures propagate from the fast path without ever taking the lock', async () => {
  const { store } = createOneFinisherDuelStore('b1-auth-duel', {
    sealedAgoMs: MATCH_SEAL_REVISION_WINDOW_MS + 5 * 60 * 1000,
    finalized: true,
    healedBlob: true,
  });
  let mutateStoreCalls = 0;
  const deps = {
    ApiError: TestApiError,
    buildMatchResultByMatchId,
    sweepStuckMatchSessionFallbacks,
    loadStore: async () => clone(store),
    mutateStore: async () => {
      mutateStoreCalls += 1;
      throw new Error('must not be called');
    },
    request: {},
    requireUser: () => {
      throw new TestApiError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
    },
    response: createMockResponse(),
    sendJson,
  };

  await assert.rejects(
    () => routeRunningMatchProgressRoutes({
      ...deps,
      method: 'GET',
      pathname: '/api/running/matches/b1-auth-duel/result',
    }),
    (error) => error instanceof TestApiError && error.statusCode === 401,
  );
  assert.equal(mutateStoreCalls, 0);
});
