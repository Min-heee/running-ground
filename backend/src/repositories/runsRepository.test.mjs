import assert from 'node:assert/strict';
import { buildUserRunMetrics, getRunPointBreakdown, getRunPointValue } from '../lib/points.mjs';
import { createJsonRunsRepository, getPendingImportCount } from './runsRepository.mjs';

const SOURCE_LABELS = {
  apple_health: 'Apple Health',
  health_connect: 'Health Connect',
  manual: 'Manual',
  nrc: 'Nike Run Club',
  mynb: 'MyNB',
  runningground: 'RunningGround',
};

class TestApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStoreHarness(initialStore = {}) {
  let store = {
    users: [
      {
        id: 'user-1',
        name: '러너',
        connectedSources: [
          {
            sourceType: 'manual',
            displayName: 'Manual',
            connected: false,
            connectionStatus: 'planned',
          },
          {
            sourceType: 'health_connect',
            displayName: 'Health Connect',
            connected: true,
            connectionStatus: 'connected',
          },
        ],
      },
    ],
    sessions: [
      {
        token: 'token-1',
        userId: 'user-1',
      },
    ],
    runs: [],
    integrationImports: [],
    ...clone(initialStore),
  };

  return {
    loadStore() {
      return clone(store);
    },
    mutateStore(mutator) {
      const nextStore = clone(store);
      const result = mutator(nextStore);
      store = nextStore;
      return result;
    },
    getStore() {
      return clone(store);
    },
  };
}

function createRepositoryHarness(initialStore = {}, repositoryOverrides = {}) {
  const storeHarness = createStoreHarness(initialStore);
  let idIndex = 0;

  const repository = createJsonRunsRepository({
    loadStore: storeHarness.loadStore,
    mutateStore: storeHarness.mutateStore,
    requireUserByToken: (store, token) => {
      const session = store.sessions.find((entry) => entry.token === token);

      if (!session) {
        throw new TestApiError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
      }

      return store.users.find((entry) => entry.id === session.userId);
    },
    nextId: (prefix) => {
      idIndex += 1;
      return `${prefix}-test-${idIndex}`;
    },
    buildRunDetail: (run, weeklyDistanceKm, sourceOverride, metrics) => ({
      run: {
        ...run,
        source: sourceOverride ?? run.source,
      },
      weeklyDistanceKm,
      earnedPoint: getRunPointValue(metrics, run.id),
    }),
    getUserMetrics: (store, userId) => buildUserRunMetrics(store.runs.filter((run) => run.userId === userId)),
    decorateIntegrationSource: (store, user, source) => ({
      ...source,
      pendingImportCount: getPendingImportCount(store, user.id, source.sourceType),
    }),
    sourceLabels: SOURCE_LABELS,
    nowIso: () => '2026-04-23T12:00:00.000Z',
    formatTimestamp: () => '2026-04-23 21:30',
    createError: (statusCode, message) => new TestApiError(statusCode, message),
    ...repositoryOverrides,
  });

  return {
    repository,
    storeHarness,
  };
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[runsRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[runsRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('creates manual runs and marks manual source connected', async () => {
  const { repository, storeHarness } = createRepositoryHarness();
  const result = await repository.createManualRun({
    token: 'token-1',
    input: {
      date: '2026-04-23',
      distanceKm: 5,
      pace: '05:30/km',
    },
  });
  const store = storeHarness.getStore();
  const manualSource = store.users[0].connectedSources.find((source) => source.sourceType === 'manual');

  assert.equal(result.run.id, 'run-test-1');
  assert.equal(result.run.sourceType, 'manual');
  assert.equal(store.runs.length, 1);
  assert.equal(manualSource.connected, true);
  assert.equal(manualSource.connectionStatus, 'connected');
  assert.equal(manualSource.lastSyncedAt, '2026-04-23 21:30');
});

await runTest('queues integration imports and syncs only new runs', async () => {
  const { repository, storeHarness } = createRepositoryHarness();
  const normalizedRuns = [
    {
      sourceType: 'health_connect',
      externalId: 'external-1',
      date: '2026-04-22',
      distanceKm: 6.2,
      pace: '05:20/km',
      sourceLabel: 'Health Connect',
    },
    {
      sourceType: 'health_connect',
      externalId: '',
      date: '2026-04-23',
      distanceKm: 4,
      pace: '05:40/km',
      sourceLabel: 'Health Connect',
    },
  ];

  const queueResult = await repository.queueIntegrationImports({
    token: 'token-1',
    sourceType: 'health_connect',
    normalizedRuns,
  });

  assert.equal(queueResult.queuedRuns, 2);
  assert.equal(queueResult.pendingRuns, 2);
  assert.equal(storeHarness.getStore().integrationImports.length, 2);

  const syncResult = await repository.syncIntegrationImports({
    token: 'token-1',
  });

  assert.equal(syncResult.scannedRuns, 2);
  assert.equal(syncResult.importedRuns, 2);
  assert.equal(syncResult.duplicateRuns, 0);
  assert.deepEqual(syncResult.importedRunIds, ['run-test-3', 'run-test-4']);
  assert.equal(storeHarness.getStore().integrationImports.length, 0);
  assert.equal(storeHarness.getStore().runs.length, 2);

  await repository.queueIntegrationImports({
    token: 'token-1',
    sourceType: 'health_connect',
    normalizedRuns,
  });
  const duplicateSyncResult = await repository.syncIntegrationImports({
    token: 'token-1',
  });

  assert.equal(duplicateSyncResult.scannedRuns, 2);
  assert.equal(duplicateSyncResult.importedRuns, 0);
  assert.equal(duplicateSyncResult.duplicateRuns, 2);
  assert.equal(storeHarness.getStore().integrationImports.length, 0);
  assert.equal(storeHarness.getStore().runs.length, 2);
});

await runTest('deduplicates overlapping runs imported from different sources', async () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [
      {
        id: 'user-1',
        name: '러너',
        connectedSources: [
          {
            sourceType: 'manual',
            displayName: 'Manual',
            connected: false,
            connectionStatus: 'planned',
          },
          {
            sourceType: 'health_connect',
            displayName: 'Health Connect',
            connected: true,
            connectionStatus: 'connected',
          },
          {
            sourceType: 'nrc',
            displayName: 'Nike Run Club',
            connected: true,
            connectionStatus: 'connected',
          },
        ],
      },
    ],
    sessions: [
      {
        token: 'token-1',
        userId: 'user-1',
      },
    ],
    runs: [],
    integrationImports: [],
  });

  await repository.queueIntegrationImports({
    token: 'token-1',
    sourceType: 'health_connect',
    normalizedRuns: [
      {
        sourceType: 'health_connect',
        externalId: 'health-1',
        date: '2026-04-24',
        distanceKm: 6.0,
        pace: '05:31/km',
        sourceLabel: 'Apple Health',
        startedAt: '2026-04-24T10:00:00.000Z',
        endedAt: '2026-04-24T10:33:00.000Z',
        durationSeconds: 1980,
      },
    ],
  });

  await repository.queueIntegrationImports({
    token: 'token-1',
    sourceType: 'nrc',
    normalizedRuns: [
      {
        sourceType: 'nrc',
        externalId: 'nrc-1',
        date: '2026-04-24',
        distanceKm: 6.1,
        pace: '05:29/km',
        sourceLabel: 'NRC',
        startedAt: '2026-04-24T10:03:00.000Z',
        endedAt: '2026-04-24T10:34:00.000Z',
        durationSeconds: 1860,
      },
    ],
  });

  const syncResult = await repository.syncIntegrationImports({
    token: 'token-1',
  });

  assert.equal(syncResult.scannedRuns, 2);
  assert.equal(syncResult.importedRuns, 1);
  assert.equal(syncResult.duplicateRuns, 1);
  assert.equal(storeHarness.getStore().runs.length, 1);
  assert.equal(storeHarness.getStore().integrationImports.length, 0);
});

await runTest('returns latest and specific run details', async () => {
  const { repository } = createRepositoryHarness({
    runs: [
      {
        id: 'run-old',
        userId: 'user-1',
        date: '2026-04-21',
        distanceKm: 3,
        pace: '06:00/km',
        source: 'Manual',
        sourceType: 'manual',
      },
      {
        id: 'run-new',
        userId: 'user-1',
        date: '2026-04-23',
        distanceKm: 5,
        pace: '05:30/km',
        source: 'RunningGround',
        sourceType: 'runningground',
      },
    ],
  });

  assert.equal((await repository.getRun({ token: 'token-1' })).run.id, 'run-new');
  assert.equal((await repository.getRun({ token: 'token-1', runId: 'run-old' })).run.id, 'run-old');
});

await runTest('createTrackedRun is idempotent per (userId, startedAt) — a retry does not double-count', async () => {
  const { repository, storeHarness } = createRepositoryHarness();

  const trackedInput = {
    date: '2026-04-24',
    distanceKm: 5,
    pace: '05:30/km',
    durationSeconds: 1650,
    route: [{ latitude: 37.5, longitude: 127.0 }],
    startedAt: '2026-04-24T10:00:00.000Z',
    endedAt: '2026-04-24T10:27:30.000Z',
  };

  const first = await repository.createTrackedRun({ token: 'token-1', input: trackedInput });
  assert.equal(storeHarness.getStore().runs.length, 1);

  // A retried submit with the SAME startedAt returns the already-saved run instead of inserting a
  // second one (no duplicate points / weekly distance / record).
  const retry = await repository.createTrackedRun({ token: 'token-1', input: trackedInput });

  assert.equal(retry.run.id, first.run.id);
  assert.equal(storeHarness.getStore().runs.length, 1);

  // A genuinely different run (distinct startedAt) still inserts.
  const second = await repository.createTrackedRun({
    token: 'token-1',
    input: { ...trackedInput, startedAt: '2026-04-24T12:00:00.000Z', endedAt: '2026-04-24T12:27:30.000Z' },
  });

  assert.notEqual(second.run.id, first.run.id);
  assert.equal(storeHarness.getStore().runs.length, 2);
});

await runTest('B5: a retried match save (same userId+startedAt+matchId) upgrades the existing run instead of duplicating', async () => {
  const matchId = 'duel-b5-match';
  const clientClaim = {
    mode: 'duel',
    matchId,
    source: 'party',
    title: '대결 결과',
    summary: '대결 요약',
    badgeLabel: '승리',
    opponentName: '아이폰14',
    resultTone: 'win',
    comparedDistanceKm: 5,
    myDurationSeconds: 1500,
    myPaceLabel: '05:30/km',
  };
  const pendingResult = { ...clientClaim, title: '대결 결과를 집계하고 있어요', badgeLabel: '결과 집계 중', opponentName: '상대' };
  delete pendingResult.resultTone;
  const resolvedResult = { ...clientClaim, opponentName: '상대러너', opponentId: 'user-2', opponentDurationSeconds: 1620 };

  // First save: verdict unresolvable (opponent not landed) → PENDING. Retry: resolvable →
  // definite win. Third call: degraded re-resolve (e.g. session pruned, opponent run missing)
  // → PENDING again, which must NEVER downgrade the stored definite verdict.
  let resolverCalls = 0;
  const { repository, storeHarness } = createRepositoryHarness({}, {
    resolveMatchResult: (store, user, matchResult) => {
      if (matchResult.matchId !== matchId) {
        return matchResult;
      }
      resolverCalls += 1;
      return resolverCalls === 2 ? resolvedResult : pendingResult;
    },
  });

  const input = {
    date: '2026-07-07',
    distanceKm: 5,
    pace: '05:30/km',
    durationSeconds: 1500,
    route: [{ latitude: 37.5, longitude: 127.0 }],
    startedAt: '2026-07-07T10:00:00.000Z',
    endedAt: '2026-07-07T10:27:30.000Z',
    matchResult: clientClaim,
  };

  const first = await repository.createTrackedRun({ token: 'token-1', input });
  assert.equal(first.run.matchResult.badgeLabel, '결과 집계 중');
  assert.equal(first.run.matchResult.resultTone, undefined);
  assert.equal(storeHarness.getStore().runs.length, 1);

  // The retry does NOT insert a second row — it re-runs the resolver and upgrades the
  // EXISTING run's matchResult PENDING→resolved in place, returning the existing detail.
  const retry = await repository.createTrackedRun({ token: 'token-1', input });
  assert.equal(retry.run.id, first.run.id);
  assert.equal(retry.run.matchResult.resultTone, 'win');
  assert.equal(retry.run.matchResult.badgeLabel, '승리');
  assert.equal(resolverCalls, 2, 'the retry re-runs the server resolver');

  const runsAfterRetry = storeHarness.getStore().runs;
  assert.equal(runsAfterRetry.length, 1, 'no duplicate run row');
  assert.equal(runsAfterRetry[0].matchResult.resultTone, 'win');

  // Points not doubled: metrics recompute off the single stored row → exactly one point
  // entry, carrying the win bonus exactly once.
  const metrics = buildUserRunMetrics(runsAfterRetry);
  assert.equal(metrics.runPointsById.size, 1);
  assert.equal(getRunPointBreakdown(metrics, first.run.id).matchBonusPoints, 20);

  // Never-downgrade: a later degraded re-resolve keeps the definite verdict.
  const degraded = await repository.createTrackedRun({ token: 'token-1', input });
  assert.equal(degraded.run.id, first.run.id);
  assert.equal(degraded.run.matchResult.resultTone, 'win');
  assert.equal(storeHarness.getStore().runs.length, 1);

  // A save for a DIFFERENT match at the same startedAt still inserts (no false dedupe).
  const otherMatch = await repository.createTrackedRun({
    token: 'token-1',
    input: { ...input, matchResult: { ...clientClaim, matchId: 'duel-b5-other' } },
  });
  assert.notEqual(otherMatch.run.id, first.run.id);
  assert.equal(storeHarness.getStore().runs.length, 2);
});

await runTest('#209: getRun re-attaches a side-table route for routeStored runs (postgres driver)', async () => {
  const sideRoutes = new Map([
    ['run-stored', [{ latitude: 37.5, longitude: 127.0, timestamp: '2026-04-21T10:00:00.000Z' }]],
  ]);
  const { repository } = createRepositoryHarness({
    runs: [
      {
        id: 'run-stored',
        userId: 'user-1',
        date: '2026-04-21',
        distanceKm: 3,
        pace: '06:00/km',
        source: 'RunningGround',
        sourceType: 'runningground',
        routeStored: true,
      },
    ],
  }, {
    getStoredRunRoute: async (runId) => sideRoutes.get(runId) ?? null,
  });

  const detail = await repository.getRun({ token: 'token-1', runId: 'run-stored' });
  assert.deepEqual(detail.run.route, sideRoutes.get('run-stored'));
});

await runTest('#209: json-driver getRun (no side table wired) keeps embedded routes untouched', async () => {
  const embeddedRoute = [{ latitude: 37.5, longitude: 127.0 }];
  const { repository } = createRepositoryHarness({
    runs: [
      {
        id: 'run-embedded',
        userId: 'user-1',
        date: '2026-04-21',
        distanceKm: 3,
        pace: '06:00/km',
        source: 'RunningGround',
        sourceType: 'runningground',
        route: embeddedRoute,
      },
    ],
  });

  const detail = await repository.getRun({ token: 'token-1', runId: 'run-embedded' });
  assert.deepEqual(detail.run.route, embeddedRoute);
});

await runTest('#209: a retried tracked save re-attaches the side-table route to its dedupe payload', async () => {
  const storedRoute = [
    { latitude: 37.5, longitude: 127.0, timestamp: '2026-04-24T10:00:00.000Z' },
    { latitude: 37.51, longitude: 127.01, timestamp: '2026-04-24T10:10:00.000Z' },
  ];
  const routeFetches = [];
  const { repository, storeHarness } = createRepositoryHarness({
    runs: [
      {
        id: 'run-original',
        userId: 'user-1',
        date: '2026-04-24',
        distanceKm: 5,
        pace: '05:30/km',
        durationSeconds: 1650,
        routeStored: true,
        startedAt: '2026-04-24T10:00:00.000Z',
        endedAt: '2026-04-24T10:27:30.000Z',
        source: 'RunningGround',
        sourceType: 'runningground',
        createdAt: '2026-04-24T10:27:40.000Z',
      },
    ],
  }, {
    getStoredRunRoute: async (runId) => {
      routeFetches.push(runId);
      return runId === 'run-original' ? storedRoute : null;
    },
  });

  // The client retries the SAME save after a timeout: dedupe returns the stored run — and the
  // response must still carry the route exactly like the original 201 did.
  const retry = await repository.createTrackedRun({
    token: 'token-1',
    input: {
      date: '2026-04-24',
      distanceKm: 5,
      pace: '05:30/km',
      durationSeconds: 1650,
      route: storedRoute,
      startedAt: '2026-04-24T10:00:00.000Z',
      endedAt: '2026-04-24T10:27:30.000Z',
    },
  });

  assert.equal(retry.run.id, 'run-original');
  assert.deepEqual(retry.run.route, storedRoute);
  assert.deepEqual(routeFetches, ['run-original']);
  assert.equal(storeHarness.getStore().runs.length, 1, 'no duplicate run row');
});

await runTest('#209: a fresh tracked save answers with its own input route without a side-table fetch', async () => {
  const inputRoute = [{ latitude: 37.5, longitude: 127.0, timestamp: '2026-04-24T10:00:00.000Z' }];
  const routeFetches = [];
  const { repository } = createRepositoryHarness({}, {
    getStoredRunRoute: async (runId) => {
      routeFetches.push(runId);
      return null;
    },
  });

  const created = await repository.createTrackedRun({
    token: 'token-1',
    input: {
      date: '2026-04-24',
      distanceKm: 5,
      pace: '05:30/km',
      durationSeconds: 1650,
      route: inputRoute,
      startedAt: '2026-04-24T10:00:00.000Z',
      endedAt: '2026-04-24T10:27:30.000Z',
    },
  });

  assert.deepEqual(created.run.route, inputRoute);
  assert.deepEqual(routeFetches, [], 'the embedded input route makes the side-table fetch unnecessary');
});

await runTest('#209: a re-attached route reproduces the embedded-route run detail BYTE-identically (real buildRunDetail)', async () => {
  const { buildRunDetail, attachRouteToRunPayload } = await import('../lib/runHelpers.mjs');
  const route = [
    { latitude: 37.5665, longitude: 126.978, timestamp: '2026-04-24T10:00:00.000Z' },
    { latitude: 37.5671, longitude: 126.9792, timestamp: '2026-04-24T10:10:00.000Z' },
  ];
  const baseRun = {
    id: 'run-shape',
    userId: 'user-1',
    date: '2026-04-24',
    distanceKm: 5.2,
    pace: '05:30/km',
    durationSeconds: 1650,
    cadenceSpm: 172,
    elevationGainM: 34,
    startedAt: '2026-04-24T10:00:00.000Z',
    endedAt: '2026-04-24T10:27:30.000Z',
    matchResult: { mode: 'duel', matchId: 'duel-shape', resultTone: 'win', badgeLabel: '승리' },
    source: 'RunningGround',
    sourceType: 'runningground',
    createdAt: '2026-04-24T10:27:40.000Z',
  };
  const metrics = buildUserRunMetrics([{ ...baseRun, route }]);

  // Today's shape: the route embedded in the run object.
  const embedded = buildRunDetail({ ...baseRun, route }, 12.3, undefined, metrics);
  // #209 shape: slim routeStored run detail + post-hoc side-table re-attach.
  const slim = buildRunDetail({ ...baseRun, routeStored: true }, 12.3, undefined, metrics);
  const reattached = { ...slim, run: attachRouteToRunPayload(slim.run, route) };

  assert.equal(JSON.stringify(reattached), JSON.stringify(embedded));
});

// --- 네이티브 배달 적대 리뷰 회귀 (2026-08-07) ---

await runTest('매치 dedupe는 startedAt이 달라도 matchId로 같은 런을 알아본다 (네이티브 배달 ↔ JS 저장)', async () => {
  const { repository, storeHarness } = createRepositoryHarness();

  const matchResult = {
    mode: 'duel',
    source: 'party',
    matchId: 'duel-native-dedupe',
    title: '대결 결과 집계 중',
    summary: '상대 기록을 기다리는 중이에요.',
    badgeLabel: '집계 중',
  };
  const baseInput = {
    date: '2026-08-07',
    distanceKm: 5,
    pace: '06:00/km',
    durationSeconds: 1800,
    route: [{ latitude: 37.5, longitude: 127.0 }],
    endedAt: '2026-08-07T10:30:00.000Z',
    matchResult,
  };

  // 1) 화면 꺼짐 네이티브 배달 — 원시 트래킹 시작시각.
  const native = await repository.createTrackedRun({
    token: 'token-1',
    input: { ...baseInput, startedAt: '2026-08-07T10:00:03.000Z' },
  });
  assert.equal(storeHarness.getStore().runs.length, 1);

  // 2) 앱을 연 뒤의 JS 저장 — 슬롯 앵커 startedAt(다른 문자열!) + 같은 matchId.
  const jsSave = await repository.createTrackedRun({
    token: 'token-1',
    input: { ...baseInput, startedAt: '2026-08-07T10:00:00.000Z' },
  });

  // startedAt이 달라도 같은 매치 = 한 행 (이중 기록/포인트 이중 적립 없음).
  assert.equal(jsSave.run.id, native.run.id);
  assert.equal(storeHarness.getStore().runs.length, 1);
});

// --- 저장 대기열 적대 리뷰 회귀 (2026-08-06) ---

await runTest('preserveMatchGoalStamp: 재전송 블롭에 스탬프가 없으면 기존 값을 이월', async () => {
  const { preserveMatchGoalStamp } = await import('./runsRepository.mjs');

  const existing = { mode: 'duel', source: 'party', matchGoalDistanceKm: 5 };
  const retry = { mode: 'duel', source: 'party', badgeLabel: '기권 패배' };
  assert.equal(preserveMatchGoalStamp(existing, retry).matchGoalDistanceKm, 5);

  // 재전송이 스탬프를 들고 오면(세션 생존 재저장) 그 값을 존중.
  const stamped = { mode: 'duel', source: 'party', matchGoalDistanceKm: 3 };
  assert.equal(preserveMatchGoalStamp(existing, stamped).matchGoalDistanceKm, 3);

  // 기존에도 없으면 그대로.
  assert.equal(preserveMatchGoalStamp({ mode: 'duel' }, retry).matchGoalDistanceKm, undefined);
});

// --- 케이던스 워치독 감사 원장 (오너 2026-09-09) ---

await runTest('cadenceAudit rides the tracked-run record; a malformed ledger is dropped, not saved', async () => {
  const { repository, storeHarness } = createRepositoryHarness();
  const cadenceAudit = { sensorAvailable: true, foregroundMovingSeconds: 900, foregroundSteps: 2400, strikes: 0, disqualified: false };
  const baseInput = {
    date: '2026-09-09',
    distanceKm: 5,
    pace: '06:00/km',
    durationSeconds: 1800,
    cadenceSpm: 160,
    route: [{ latitude: 37.5, longitude: 127.0 }, { latitude: 37.51, longitude: 127.01 }],
    endedAt: '2026-09-09T10:30:00.000Z',
  };

  const saved = await repository.createTrackedRun({
    token: 'token-1',
    input: { ...baseInput, startedAt: '2026-09-09T10:00:00.000Z', cadenceAudit },
  });
  assert.deepEqual(saved.run.cadenceAudit, cadenceAudit);
  assert.deepEqual(storeHarness.getStore().runs.find((run) => run.id === saved.run.id).cadenceAudit, cadenceAudit);

  const withoutAudit = await repository.createTrackedRun({
    token: 'token-1',
    input: { ...baseInput, startedAt: '2026-09-09T11:00:00.000Z', cadenceAudit: { sensorAvailable: 'yes' } },
  });
  assert.equal('cadenceAudit' in storeHarness.getStore().runs.find((run) => run.id === withoutAudit.run.id), false);
});
