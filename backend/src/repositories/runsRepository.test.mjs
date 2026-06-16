import assert from 'node:assert/strict';
import { buildUserRunMetrics, getRunPointValue } from '../points.mjs';
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

function createRepositoryHarness(initialStore = {}) {
  const storeHarness = createStoreHarness(initialStore);
  let idIndex = 0;

  const repository = createJsonRunsRepository({
    loadStore: storeHarness.loadStore,
    mutateStore: storeHarness.mutateStore,
    requireUserByToken: (store, token) => {
      const session = store.sessions.find((entry) => entry.token === token);

      if (!session) {
        throw new TestApiError(401, '세션이 만료됐어. 다시 로그인해줘.');
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
