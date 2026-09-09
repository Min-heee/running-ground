import assert from 'node:assert/strict';
import { buildUserRunMetrics, getRunPointValue } from '../lib/points.mjs';
import { createPostgresRunsRepository } from './postgresRunsRepository.mjs';

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

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createUniqueViolation(constraint) {
  const error = new Error(`duplicate key value violates unique constraint "${constraint}"`);
  error.code = '23505';
  error.constraint = constraint;
  return error;
}

class FakePostgresDatabase {
  constructor(initialStore = {}) {
    this.users = clone(initialStore.users ?? [
      {
        id: 'user-1',
        username: 'runner',
        nickname: '러너',
        public_tag: '#RUN01',
        connected_sources: [
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
        notification_settings: {
          friendAlerts: true,
          districtAlerts: true,
          marketAlerts: false,
        },
      },
    ]);
    this.sessions = clone(initialStore.sessions ?? [
      {
        token: 'token-1',
        user_id: 'user-1',
        expires_at: '2099-01-01T00:00:00.000Z',
      },
    ]);
    this.runs = clone(initialStore.runs ?? []);
    this.integrationImports = clone(initialStore.integrationImports ?? []);
    this.transactions = 0;
  }

  async transaction(callback) {
    this.transactions += 1;
    return callback(this);
  }

  async query(sql, params = []) {
    const normalizedSql = normalizeSql(sql);

    if (normalizedSql.startsWith('select u.* from sessions s join users u on u.id = s.user_id where s.token = $1')) {
      const session = this.sessions.find((entry) => entry.token === params[0]);

      if (!session) {
        return { rows: [] };
      }

      const user = this.users.find((entry) => entry.id === session.user_id);
      return {
        rows: user ? [clone(user)] : [],
      };
    }

    if (normalizedSql.startsWith('select id, user_id, run_date, distance_km, pace, source_label, source_type, external_id,')) {
      return {
        rows: this.runs
          .filter((run) => run.user_id === params[0])
          .sort((left, right) => {
            const dateOrder = String(right.run_date).localeCompare(String(left.run_date));
            if (dateOrder !== 0) {
              return dateOrder;
            }

            return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
          })
          .map((row) => clone(row)),
      };
    }

    if (normalizedSql.startsWith('select id, user_id, source_type, source_label, external_id, run_date, distance_km, pace,')) {
      return {
        rows: this.integrationImports
          .filter((entry) => entry.user_id === params[0] && entry.import_status === 'pending')
          .sort((left, right) => {
            const dateOrder = String(left.run_date ?? '').localeCompare(String(right.run_date ?? ''));
            if (dateOrder !== 0) {
              return dateOrder;
            }

            return String(left.received_at ?? '').localeCompare(String(right.received_at ?? ''));
          })
          .map((row) => clone(row)),
      };
    }

    if (normalizedSql.startsWith('update users set connected_sources = $2,')) {
      this.users = this.users.map((user) => (
        user.id === params[0]
          ? {
            ...user,
            connected_sources: typeof params[1] === 'string' ? JSON.parse(params[1]) : clone(params[1]),
            updated_at: params[2],
          }
          : user
      ));
      return { rows: [] };
    }

    if (normalizedSql.startsWith('insert into runs (')) {
      const externalId = params[7];

      if (externalId) {
        const duplicate = this.runs.find((run) => (
          run.user_id === params[1]
          && run.source_type === params[6]
          && run.external_id === externalId
        ));

        if (duplicate) {
          throw createUniqueViolation('runs_user_source_external_unique_idx');
        }
      }

      this.runs.push({
        id: params[0],
        user_id: params[1],
        run_date: params[2],
        distance_km: params[3],
        pace: params[4],
        source_label: params[5],
        source_type: params[6],
        external_id: params[7],
        route: typeof params[8] === 'string' ? JSON.parse(params[8]) : clone(params[8]),
        match_result: typeof params[9] === 'string' ? JSON.parse(params[9]) : clone(params[9]),
        duration_seconds: params[10],
        cadence_spm: params[11],
        elevation_gain_m: params[12],
        started_at: params[13],
        ended_at: params[14],
        imported_at: params[15],
        created_at: params[16],
        updated_at: params[17],
        cadence_audit: typeof params[18] === 'string' ? JSON.parse(params[18]) : (params[18] ?? null),
      });
      return { rows: [] };
    }

    if (normalizedSql.startsWith('insert into integration_imports (')) {
      const externalId = params[4];

      if (externalId) {
        const duplicate = this.integrationImports.find((entry) => (
          entry.user_id === params[1]
          && entry.source_type === params[2]
          && entry.external_id === externalId
        ));

        if (duplicate) {
          throw createUniqueViolation('integration_imports_user_source_external_unique_idx');
        }
      }

      this.integrationImports.push({
        id: params[0],
        user_id: params[1],
        source_type: params[2],
        source_label: params[3],
        external_id: params[4],
        run_date: params[5],
        distance_km: params[6],
        pace: params[7],
        import_status: params[8],
        raw_payload: typeof params[9] === 'string' ? JSON.parse(params[9]) : clone(params[9]),
        received_at: params[10],
        processed_at: params[11],
      });
      return { rows: [] };
    }

    if (normalizedSql.startsWith('update runs set match_result = $2,')) {
      this.runs = this.runs.map((run) => (
        run.id === params[0]
          ? {
            ...run,
            match_result: typeof params[1] === 'string' ? JSON.parse(params[1]) : clone(params[1]),
            updated_at: params[2],
          }
          : run
      ));
      return { rows: [] };
    }

    if (normalizedSql.startsWith('delete from integration_imports where id = any($1::text[])')) {
      const ids = new Set(params[0]);
      this.integrationImports = this.integrationImports.filter((entry) => !ids.has(entry.id));
      return { rows: [] };
    }

    throw new Error(`Unhandled fake SQL: ${normalizedSql}`);
  }
}

function createRepositoryHarness(initialStore = {}, repositoryOverrides = {}) {
  const database = new FakePostgresDatabase(initialStore);
  let idIndex = 0;

  const repository = createPostgresRunsRepository({
    database,
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
    buildUserMetrics: (runs) => buildUserRunMetrics(runs),
    sourceLabels: SOURCE_LABELS,
    nowIso: () => '2026-04-23T12:00:00.000Z',
    formatTimestamp: () => '2026-04-23 21:30',
    createError: (statusCode, message) => new TestApiError(statusCode, message),
    ...repositoryOverrides,
  });

  return {
    repository,
    database,
  };
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[postgresRunsRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[postgresRunsRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('creates manual runs and marks manual source connected', async () => {
  const { repository, database } = createRepositoryHarness();
  const result = await repository.createManualRun({
    token: 'token-1',
    input: {
      date: '2026-04-23',
      distanceKm: 5,
      pace: '05:30/km',
    },
  });
  const manualSource = database.users[0].connected_sources.find((source) => source.sourceType === 'manual');

  assert.equal(result.run.id, 'run-test-1');
  assert.equal(result.run.sourceType, 'manual');
  assert.equal(database.runs.length, 1);
  assert.equal(manualSource.connected, true);
  assert.equal(manualSource.connectionStatus, 'connected');
  assert.equal(manualSource.lastSyncedAt, '2026-04-23 21:30');
  assert.equal(database.transactions, 1);
});

await runTest('creates tracked runs with route metrics', async () => {
  const { repository, database } = createRepositoryHarness();
  const result = await repository.createTrackedRun({
    token: 'token-1',
    input: {
      date: '2026-04-23',
      distanceKm: 8.4,
      pace: '05:10/km',
      durationSeconds: 2604,
      cadenceSpm: 176,
      elevationGainM: 32,
      route: [
        { latitude: 37.1, longitude: 127.1 },
        { latitude: 37.2, longitude: 127.2 },
      ],
      startedAt: '2026-04-23T11:00:00.000Z',
      endedAt: '2026-04-23T11:43:24.000Z',
      matchResult: {
        mode: 'duel',
        resultTone: 'win',
        opponentName: '상대러너',
      },
    },
  });

  assert.equal(result.run.id, 'run-test-1');
  assert.equal(result.run.sourceType, 'runningground');
  assert.equal(result.run.durationSeconds, 2604);
  assert.equal(result.run.cadenceSpm, 176);
  assert.equal(result.run.elevationGainM, 32);
  assert.equal(Array.isArray(result.run.route), true);
  assert.deepEqual(result.run.matchResult, {
    mode: 'duel',
    resultTone: 'win',
    opponentName: '상대러너',
  });
  assert.equal(database.runs[0].source_type, 'runningground');
  // match_result lands in the stored row as parsed jsonb and reads back intact.
  assert.deepEqual(database.runs[0].match_result, {
    mode: 'duel',
    resultTone: 'win',
    opponentName: '상대러너',
  });
});

await runTest('createTrackedRun is idempotent per (userId, startedAt) — a retry does not double-count', async () => {
  const { repository, database } = createRepositoryHarness();

  const trackedInput = {
    date: '2026-04-23',
    distanceKm: 5,
    pace: '05:30/km',
    durationSeconds: 1650,
    route: [{ latitude: 37.5, longitude: 127.0 }],
    startedAt: '2026-04-23T11:00:00.000Z',
    endedAt: '2026-04-23T11:27:30.000Z',
  };

  const first = await repository.createTrackedRun({ token: 'token-1', input: trackedInput });
  assert.equal(database.runs.length, 1);

  // A retried submit with the SAME startedAt returns the already-saved run instead of inserting a
  // second one (no duplicate points / weekly distance / record).
  const retry = await repository.createTrackedRun({ token: 'token-1', input: trackedInput });

  assert.equal(retry.run.id, first.run.id);
  assert.equal(database.runs.length, 1);

  // A genuinely different run (distinct startedAt) still inserts.
  const second = await repository.createTrackedRun({
    token: 'token-1',
    input: { ...trackedInput, startedAt: '2026-04-23T13:00:00.000Z', endedAt: '2026-04-23T13:27:30.000Z' },
  });

  assert.notEqual(second.run.id, first.run.id);
  assert.equal(database.runs.length, 2);
});

await runTest('B5: a retried match save (same userId+startedAt+matchId) upgrades the existing row instead of duplicating', async () => {
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

  // First save: unresolvable → PENDING. Retry: resolvable → definite win. Third: degraded
  // re-resolve → PENDING again, which must never downgrade the stored definite verdict.
  let resolverCalls = 0;
  const { repository, database } = createRepositoryHarness({}, {
    resolveMatchResult: async (user, matchResult) => {
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
  assert.equal(database.runs.length, 1);

  // The retry does NOT insert a second row — it re-runs the resolver and rewrites the
  // EXISTING row's match_result in place, returning the existing (upgraded) detail.
  const retry = await repository.createTrackedRun({ token: 'token-1', input });
  assert.equal(retry.run.id, first.run.id);
  assert.equal(retry.run.matchResult.resultTone, 'win');
  assert.equal(resolverCalls, 2, 'the retry re-runs the server resolver');
  assert.equal(database.runs.length, 1, 'no duplicate run row');
  assert.deepEqual(database.runs[0].match_result, resolvedResult);
  assert.equal(database.runs[0].updated_at, '2026-04-23T12:00:00.000Z');

  // Never-downgrade: a later degraded re-resolve keeps the definite verdict.
  const degraded = await repository.createTrackedRun({ token: 'token-1', input });
  assert.equal(degraded.run.id, first.run.id);
  assert.equal(degraded.run.matchResult.resultTone, 'win');
  assert.equal(database.runs.length, 1);
  assert.deepEqual(database.runs[0].match_result, resolvedResult);

  // A save for a DIFFERENT match at the same startedAt still inserts (no false dedupe).
  const otherMatch = await repository.createTrackedRun({
    token: 'token-1',
    input: { ...input, matchResult: { ...clientClaim, matchId: 'duel-b5-other' } },
  });
  assert.notEqual(otherMatch.run.id, first.run.id);
  assert.equal(database.runs.length, 2);
});

await runTest('queues integration imports and syncs only new runs', async () => {
  const { repository, database } = createRepositoryHarness();
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
  assert.equal(database.integrationImports.length, 2);

  const syncResult = await repository.syncIntegrationImports({
    token: 'token-1',
  });

  assert.equal(syncResult.scannedRuns, 2);
  assert.equal(syncResult.importedRuns, 2);
  assert.equal(syncResult.duplicateRuns, 0);
  assert.deepEqual(syncResult.importedRunIds, ['run-test-3', 'run-test-4']);
  assert.equal(database.integrationImports.length, 0);
  assert.equal(database.runs.length, 2);
  assert.equal(database.users[0].connected_sources[1].lastSyncedAt, '2026-04-23 21:30');

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
  assert.equal(database.integrationImports.length, 0);
  assert.equal(database.runs.length, 2);
});

await runTest('deduplicates overlapping runs imported from different sources', async () => {
  const { repository, database } = createRepositoryHarness({
    users: [
      {
        id: 'user-1',
        username: 'runner',
        nickname: '러너',
        public_tag: '#RUN01',
        connected_sources: [
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
        notification_settings: {
          friendAlerts: true,
          districtAlerts: true,
          marketAlerts: false,
        },
      },
    ],
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
  assert.equal(database.integrationImports.length, 0);
  assert.equal(database.runs.length, 1);
});

await runTest('ignores duplicate pending imports with the same external id before sync', async () => {
  const { repository, database } = createRepositoryHarness();
  const queueResult = await repository.queueIntegrationImports({
    token: 'token-1',
    sourceType: 'health_connect',
    normalizedRuns: [
      {
        sourceType: 'health_connect',
        externalId: 'external-dup',
        date: '2026-04-23',
        distanceKm: 5,
        pace: '05:30/km',
        sourceLabel: 'Health Connect',
      },
      {
        sourceType: 'health_connect',
        externalId: 'external-dup',
        date: '2026-04-23',
        distanceKm: 5,
        pace: '05:30/km',
        sourceLabel: 'Health Connect',
      },
    ],
  });

  assert.equal(queueResult.queuedRuns, 1);
  assert.equal(queueResult.pendingRuns, 1);
  assert.equal(database.integrationImports.length, 1);
});

await runTest('returns latest and specific run details', async () => {
  const { repository } = createRepositoryHarness({
    runs: [
      {
        id: 'run-old',
        user_id: 'user-1',
        run_date: '2026-04-21',
        distance_km: 3,
        pace: '06:00/km',
        source_label: 'Manual',
        source_type: 'manual',
        created_at: '2026-04-21T00:00:00.000Z',
      },
      {
        id: 'run-new',
        user_id: 'user-1',
        run_date: '2026-04-23',
        distance_km: 5,
        pace: '05:30/km',
        source_label: 'RunningGround',
        source_type: 'runningground',
        created_at: '2026-04-23T00:00:00.000Z',
      },
    ],
  });

  assert.equal((await repository.getRun({ token: 'token-1' })).run.id, 'run-new');
  assert.equal((await repository.getRun({ token: 'token-1', runId: 'run-old' })).run.id, 'run-old');
});

// --- 케이던스 워치독 감사 원장 (오너 2026-09-09): cadence_audit jsonb 왕복 ---

await runTest('cadenceAudit lands in the cadence_audit column and reads back through mapRunRow', async () => {
  const { repository, database } = createRepositoryHarness();
  const cadenceAudit = { sensorAvailable: true, foregroundMovingSeconds: 900, foregroundSteps: 2400, strikes: 1, disqualified: false };

  const result = await repository.createTrackedRun({
    token: 'token-1',
    input: {
      date: '2026-09-09',
      distanceKm: 5,
      pace: '06:00/km',
      durationSeconds: 1800,
      cadenceSpm: 160,
      cadenceAudit,
      route: [
        { latitude: 37.1, longitude: 127.1 },
        { latitude: 37.2, longitude: 127.2 },
      ],
      startedAt: '2026-09-09T10:00:00.000Z',
      endedAt: '2026-09-09T10:30:00.000Z',
    },
  });

  assert.deepEqual(result.run.cadenceAudit, cadenceAudit);
  assert.deepEqual(database.runs[0].cadence_audit, cadenceAudit);

  // A run without a ledger stores NULL and maps to no key at all (older clients).
  await repository.createTrackedRun({
    token: 'token-1',
    input: {
      date: '2026-09-09',
      distanceKm: 3,
      pace: '06:00/km',
      durationSeconds: 1080,
      route: [
        { latitude: 37.1, longitude: 127.1 },
        { latitude: 37.2, longitude: 127.2 },
      ],
      startedAt: '2026-09-09T12:00:00.000Z',
      endedAt: '2026-09-09T12:18:00.000Z',
    },
  });
  assert.equal(database.runs[1].cadence_audit, null);
});
