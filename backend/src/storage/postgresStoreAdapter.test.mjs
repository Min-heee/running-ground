import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresStoreAdapter } from './postgresStoreAdapter.mjs';

// ---------------------------------------------------------------------------
// Unit tests for the mutateStore change-detection skip — the PRODUCTION hot
// path (BACKEND_STORE_DRIVER=postgres). A read-only mutation (status poll)
// must NOT issue the whole-store jsonb UPDATE; any real change must. No live
// Postgres needed: the adapter takes an injected database.
// ---------------------------------------------------------------------------

function createStubDatabase(initialData) {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.startsWith('select data from app_store')) {
        return { rows: [{ data: initialData }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return {
    queries,
    async query(sql, params) {
      return client.query(sql, params);
    },
    async transaction(callback) {
      return callback(client);
    },
  };
}

function updateQueries(database) {
  return database.queries.filter((entry) => entry.sql.startsWith('update app_store'));
}

test('read-only mutation skips the whole-store UPDATE entirely', async () => {
  const database = createStubDatabase({ users: [{ id: 'u1' }], runs: [] });
  const adapter = createPostgresStoreAdapter({ database, backupOnSave: false });

  const result = await adapter.mutateStore((store) => store.users.length);

  assert.equal(result, 1);
  assert.equal(updateQueries(database).length, 0);
});

test('a real change still issues the UPDATE with the new serialization', async () => {
  const database = createStubDatabase({ users: [], runs: [] });
  const adapter = createPostgresStoreAdapter({ database, backupOnSave: false });

  const result = await adapter.mutateStore((store) => {
    store.users.push({ id: 'u2' });
    return 'changed';
  });

  assert.equal(result, 'changed');
  const updates = updateQueries(database);
  assert.equal(updates.length, 1);
  assert.match(updates[0].params[0], /"u2"/);
});

test('sweep-style mutation (delete inside a poll) counts as a change and persists', async () => {
  const database = createStubDatabase({ matchSessions: [{ id: 'm1' }, { id: 'm2' }] });
  const adapter = createPostgresStoreAdapter({ database, backupOnSave: false });

  await adapter.mutateStore((store) => {
    store.matchSessions = store.matchSessions.filter((session) => session.id !== 'm1');
  });

  const updates = updateQueries(database);
  assert.equal(updates.length, 1);
  assert.doesNotMatch(updates[0].params[0], /"m1"/);
});

test('async mutator throws and writes nothing', async () => {
  const database = createStubDatabase({ users: [] });
  const adapter = createPostgresStoreAdapter({ database, backupOnSave: false });

  await assert.rejects(
    adapter.mutateStore(async (store) => {
      store.users.push({ id: 'late' });
    }),
    /동기 함수여야/,
  );
  assert.equal(updateQueries(database).length, 0);
});

// ---------------------------------------------------------------------------
// #209 GPS route side-table tests. This stub is jsonb-faithful: the app_store
// row is kept SERIALIZED and re-parsed on every select (like real jsonb), so
// idempotency across "reboots" is exercised for real, and run_routes rows are
// kept in a Map so round-trips and ON CONFLICT semantics can be asserted.
// ---------------------------------------------------------------------------

function createJsonbStubDatabase(initialData, { failRunRoutesDdl = false } = {}) {
  const state = {
    appStoreData: JSON.stringify(initialData),
    runRoutes: new Map(),
    queries: [],
    updateCount: 0,
  };

  async function runQuery(sql, params = []) {
    state.queries.push({ sql, params });
    const normalized = sql.trim().toLowerCase();

    if (normalized.startsWith('create table if not exists run_routes') || normalized.startsWith('create index if not exists run_routes')) {
      if (failRunRoutesDdl) {
        throw new Error('permission denied for schema public');
      }

      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('select data from app_store')) {
      return { rows: [{ data: JSON.parse(state.appStoreData) }], rowCount: 1 };
    }

    if (normalized.startsWith('update app_store')) {
      state.appStoreData = params[0];
      state.updateCount += 1;
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('insert into run_routes')) {
      const [runId, userId, route] = params;

      if (!state.runRoutes.has(runId)) {
        state.runRoutes.set(runId, { userId, route: JSON.parse(route) });
      }

      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('select route from run_routes')) {
      const entry = state.runRoutes.get(params[0]);
      return entry
        ? { rows: [{ route: JSON.parse(JSON.stringify(entry.route)) }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }

    return { rows: [], rowCount: 1 };
  }

  return {
    state,
    async query(sql, params) {
      return runQuery(sql, params);
    },
    async transaction(callback) {
      return callback({ query: runQuery });
    },
  };
}

function parseStoredBlob(database) {
  return JSON.parse(database.state.appStoreData);
}

const SAMPLE_ROUTE = [
  { latitude: 37.5665, longitude: 126.978, timestamp: '2026-07-11T06:30:00.000Z' },
  { latitude: 37.5671, longitude: 126.9792, timestamp: '2026-07-11T06:31:00.000Z' },
];

test('#209 mutateStore sweeps a freshly created run route into run_routes and slims the blob', async () => {
  const database = createJsonbStubDatabase({ users: [], runs: [] });
  const adapter = createPostgresStoreAdapter({ database, backupOnSave: false });

  const result = await adapter.mutateStore((store) => {
    const run = {
      id: 'run-1',
      userId: 'user-1',
      date: '2026-07-11',
      distanceKm: 5.2,
      route: SAMPLE_ROUTE,
      startedAt: '2026-07-11T06:30:00.000Z',
    };
    store.runs.push(run);
    // Mirror the runs repository: the mutator's return payload references the embedded route.
    return { run: { id: run.id, route: run.route } };
  });

  // The payload built inside the mutator still carries the route (the client response shape).
  assert.deepEqual(result.run.route, SAMPLE_ROUTE);

  // The side table has the route, keyed by run id, with the user id.
  assert.deepEqual(database.state.runRoutes.get('run-1')?.route, SAMPLE_ROUTE);
  assert.equal(database.state.runRoutes.get('run-1')?.userId, 'user-1');

  // The persisted blob is slim: marker present, no coordinates, everything else intact.
  const storedRun = parseStoredBlob(database).runs[0];
  assert.equal(storedRun.routeStored, true);
  assert.equal(storedRun.route, undefined);
  assert.equal(storedRun.distanceKm, 5.2);
  assert.equal(storedRun.startedAt, '2026-07-11T06:30:00.000Z');
  assert.doesNotMatch(database.state.appStoreData, /37\.5665/);
});

test('#209 read-only mutation on an already-slim store still skips the UPDATE', async () => {
  const database = createJsonbStubDatabase({
    users: [],
    runs: [{ id: 'run-1', userId: 'user-1', distanceKm: 5.2, routeStored: true }],
  });
  const adapter = createPostgresStoreAdapter({ database, backupOnSave: false });

  await adapter.mutateStore((store) => store.runs.length);

  assert.equal(database.state.updateCount, 0);
  assert.equal(database.state.runRoutes.size, 0);
});

test('#209 boot migration moves legacy embedded routes out once and is idempotent across restarts', async () => {
  const database = createJsonbStubDatabase({
    users: [],
    runs: [
      { id: 'run-legacy-1', userId: 'user-1', distanceKm: 3.1, route: SAMPLE_ROUTE, matchResult: { matchId: 'duel-1', resultTone: 'win' } },
      { id: 'run-legacy-2', userId: 'user-2', distanceKm: 7.4, route: [] },
      { id: 'run-manual', userId: 'user-1', distanceKm: 2.0 },
    ],
  });
  const adapter = createPostgresStoreAdapter({ database, backupOnSave: false });

  const first = await adapter.migrateEmbeddedRunRoutes();
  assert.equal(first.migratedRuns, 2, 'both routed runs migrate; the manual run is untouched');
  assert.ok(first.bytesSaved > 0, 'the slimmed blob is smaller');
  assert.equal(database.state.updateCount, 1, 'one persisted slim write');
  assert.deepEqual(database.state.runRoutes.get('run-legacy-1')?.route, SAMPLE_ROUTE);
  assert.deepEqual(database.state.runRoutes.get('run-legacy-2')?.route, []);

  const blobAfterFirst = parseStoredBlob(database);
  assert.equal(blobAfterFirst.runs[0].routeStored, true);
  assert.equal(blobAfterFirst.runs[0].route, undefined);
  assert.equal(blobAfterFirst.runs[0].matchResult.resultTone, 'win', 'verdict fields survive the sweep');
  assert.equal(blobAfterFirst.runs[2].routeStored, undefined, 'runs without a route gain no marker');

  // Simulate a restart: a fresh adapter over the same database migrates nothing and writes nothing.
  const rebooted = createPostgresStoreAdapter({ database, backupOnSave: false });
  const second = await rebooted.migrateEmbeddedRunRoutes();
  assert.equal(second.migratedRuns, 0);
  assert.equal(second.bytesSaved, 0);
  assert.equal(database.state.updateCount, 1, 'no second UPDATE — migration is a no-op on re-run');
});

test('#209 getRunRoute round-trips a swept route and misses cleanly', async () => {
  const database = createJsonbStubDatabase({ users: [], runs: [] });
  const adapter = createPostgresStoreAdapter({ database, backupOnSave: false });

  await adapter.mutateStore((store) => {
    store.runs.push({ id: 'run-1', userId: 'user-1', route: SAMPLE_ROUTE });
  });

  assert.deepEqual(await adapter.getRunRoute('run-1'), SAMPLE_ROUTE);
  assert.equal(await adapter.getRunRoute('run-unknown'), null);
  assert.equal(await adapter.getRunRoute(''), null);
});

test('#209 a failed run_routes schema ensure degrades to embedded routes without failing the write', async () => {
  const database = createJsonbStubDatabase({ users: [], runs: [] }, { failRunRoutesDdl: true });
  const adapter = createPostgresStoreAdapter({ database, backupOnSave: false });

  await adapter.mutateStore((store) => {
    store.runs.push({ id: 'run-1', userId: 'user-1', route: SAMPLE_ROUTE });
  });

  const storedRun = parseStoredBlob(database).runs[0];
  assert.deepEqual(storedRun.route, SAMPLE_ROUTE, 'route stays embedded (pre-#209 behavior)');
  assert.equal(storedRun.routeStored, undefined);
  assert.equal(database.state.runRoutes.size, 0);
  assert.equal(await adapter.getRunRoute('run-1'), null);
});
