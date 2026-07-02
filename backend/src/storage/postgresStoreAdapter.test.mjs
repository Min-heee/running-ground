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
