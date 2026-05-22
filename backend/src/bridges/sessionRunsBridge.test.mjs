import assert from 'node:assert/strict';
import { INITIAL_RANK } from '../lib/rankSystem.mjs';
import { createSessionRunsBridge } from './sessionRunsBridge.mjs';

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

class FakeBridgeDatabase {
  constructor(initialData = {}) {
    this.users = clone(initialData.users ?? []);
    this.sessions = clone(initialData.sessions ?? []);
    this.runs = clone(initialData.runs ?? []);
  }

  async query(sql, params = []) {
    const normalizedSql = normalizeSql(sql);

    if (normalizedSql.startsWith('select u.* from sessions s join users u on u.id = s.user_id')) {
      const session = this.sessions.find((entry) => entry.token === params[0]);

      if (!session) {
        return { rows: [] };
      }

      const user = this.users.find((entry) => entry.id === session.user_id);
      return {
        rows: user ? [clone(user)] : [],
      };
    }

    if (normalizedSql.startsWith('select * from users where id = $1')) {
      const user = this.users.find((entry) => entry.id === params[0]);
      return {
        rows: user ? [clone(user)] : [],
      };
    }

    if (normalizedSql.startsWith('select id, user_id, run_date, distance_km, pace, source_label, source_type, external_id,')) {
      return {
        rows: this.runs
          .filter((entry) => entry.user_id === params[0])
          .sort((left, right) => String(right.run_date).localeCompare(String(left.run_date)))
          .map((entry) => clone(entry)),
      };
    }

    throw new Error(`Unhandled fake SQL: ${normalizedSql}`);
  }
}

function createJsonStore(overrides = {}) {
  return {
    users: [
      {
        id: 'user-json-1',
        username: 'json-runner',
        name: 'JSON 러너',
        publicTag: '#JSON1',
        districtName: '강남구',
      },
    ],
    sessions: [
      {
        token: 'json-token',
        userId: 'user-json-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ],
    runs: [
      {
        id: 'run-json-1',
        userId: 'user-json-1',
        date: '2026-04-24',
        distanceKm: 5,
        pace: '05:30/km',
        source: 'Manual',
        sourceType: 'manual',
      },
    ],
    ...clone(overrides),
  };
}

function createBridgeHarness({
  sessionReadsEnabled = false,
  runReadsEnabled = false,
  databaseData = {},
  jsonStoreOverrides = {},
} = {}) {
  const database = new FakeBridgeDatabase(databaseData);
  const store = createJsonStore(jsonStoreOverrides);
  const bridge = createSessionRunsBridge({
    database,
    sessionReadsEnabled,
    runReadsEnabled,
    createError: (statusCode, message) => new TestApiError(statusCode, message),
  });

  return {
    bridge,
    store,
  };
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[sessionRunsBridge] ok - ${name}`);
  } catch (error) {
    console.error(`[sessionRunsBridge] failed - ${name}`);
    throw error;
  }
}

await runTest('falls back to JSON session lookup when postgres session reads are disabled', async () => {
  const { bridge, store } = createBridgeHarness();
  const result = await bridge.findUserByToken({
    store,
    token: 'json-token',
  });

  assert.equal(result.source, 'json');
  assert.equal(result.user.id, 'user-json-1');
});

await runTest('reads the current user from postgres when session bridge is enabled', async () => {
  const { bridge, store } = createBridgeHarness({
    sessionReadsEnabled: true,
    databaseData: {
      users: [
        {
          id: 'user-db-1',
          username: 'db-runner',
          nickname: 'DB 러너',
          public_tag: '#DB001',
          district_name: '서초구',
          connected_sources: [],
          notification_settings: {},
        },
      ],
      sessions: [
        {
          token: 'db-token',
          user_id: 'user-db-1',
        },
      ],
    },
  });

  const result = await bridge.findUserByToken({
    store,
    token: 'db-token',
  });

  assert.equal(result.source, 'postgres');
  assert.equal(result.user.id, 'user-db-1');
  assert.equal(result.user.name, 'DB 러너');
  assert.deepEqual(result.user.rankState, INITIAL_RANK);
});

await runTest('falls back to JSON session lookup when postgres has no matching session', async () => {
  const { bridge, store } = createBridgeHarness({
    sessionReadsEnabled: true,
  });

  const result = await bridge.findUserByToken({
    store,
    token: 'json-token',
  });

  assert.equal(result.source, 'json');
  assert.equal(result.user.id, 'user-json-1');
});

await runTest('reads runs and metrics from postgres when run bridge is enabled', async () => {
  const { bridge, store } = createBridgeHarness({
    runReadsEnabled: true,
    databaseData: {
      runs: [
        {
          id: 'run-db-2',
          user_id: 'user-json-1',
          run_date: '2026-04-24',
          distance_km: '7.5',
          pace: '05:10/km',
          source_label: 'RunningGround',
          source_type: 'runningground',
          created_at: '2026-04-24T00:00:00.000Z',
        },
        {
          id: 'run-db-1',
          user_id: 'user-json-1',
          run_date: '2026-04-23',
          distance_km: '4.0',
          pace: '05:45/km',
          source_label: 'Manual',
          source_type: 'manual',
          created_at: '2026-04-23T00:00:00.000Z',
        },
      ],
    },
  });

  const runResult = await bridge.getRunsForUser({
    store,
    userId: 'user-json-1',
  });
  const metricsResult = await bridge.getUserMetrics({
    store,
    userId: 'user-json-1',
  });

  assert.equal(runResult.source, 'postgres');
  assert.equal(runResult.runs.length, 2);
  assert.equal(runResult.runs[0].id, 'run-db-2');
  assert.equal(metricsResult.source, 'postgres');
  assert.equal(metricsResult.metrics.lifetimeDistanceKm, 11.5);
});

await runTest('falls back to JSON runs when postgres run bridge is empty', async () => {
  const { bridge, store } = createBridgeHarness({
    runReadsEnabled: true,
  });

  const runResult = await bridge.getRunsForUser({
    store,
    userId: 'user-json-1',
  });

  assert.equal(runResult.source, 'json');
  assert.equal(runResult.runs.length, 1);
  assert.equal(runResult.runs[0].id, 'run-json-1');
});

await runTest('returns empty postgres runs when fallback is disabled', async () => {
  const { bridge, store } = createBridgeHarness({
    runReadsEnabled: true,
  });

  const runResult = await bridge.getRunsForUser({
    store,
    userId: 'user-json-1',
    fallbackToJsonIfEmpty: false,
  });

  assert.equal(runResult.source, 'postgres');
  assert.deepEqual(runResult.runs, []);
});

await runTest('looks up a user by id with postgres first and JSON fallback', async () => {
  const { bridge, store } = createBridgeHarness({
    sessionReadsEnabled: true,
    databaseData: {
      users: [
        {
          id: 'user-db-2',
          username: 'friend-db',
          nickname: 'DB 친구',
          public_tag: '#DBFND',
          district_name: '송파구',
          connected_sources: [],
          notification_settings: {},
        },
      ],
    },
  });

  const postgresResult = await bridge.findUserById({
    store,
    userId: 'user-db-2',
  });
  const jsonResult = await bridge.findUserById({
    store,
    userId: 'user-json-1',
  });

  assert.equal(postgresResult.source, 'postgres');
  assert.equal(postgresResult.user.name, 'DB 친구');
  assert.deepEqual(postgresResult.user.rankState, INITIAL_RANK);
  assert.equal(jsonResult.source, 'json');
  assert.equal(jsonResult.user.name, 'JSON 러너');
});
