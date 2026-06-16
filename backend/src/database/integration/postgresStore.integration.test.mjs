// Real-Postgres integration suite for the Postgres-backed durable whole-store adapter (Path B).
//
// This exercises src/storage/postgresStoreAdapter.mjs against a REAL Postgres reached via
// BACKEND_POSTGRES_DATABASE_URL (or DATABASE_URL). Like the repositories integration suite it is
// gated: with no URL set it prints a skip line and exits 0, so `npm test` / CI stay green without
// a database. The adapter is NOT wired into the app yet — this proves the keystone in isolation.
//
// Run it with a database:
//   BACKEND_POSTGRES_DATABASE_URL=postgres://user:pass@host:5432/db \
//     node ./src/database/integration/postgresStore.integration.test.mjs

import assert from 'node:assert/strict';
import { createSeedStore } from '../../seed.mjs';
import { createPostgresStoreAdapter } from '../../storage/postgresStoreAdapter.mjs';
import {
  applySchema,
  createIntegrationDatabase,
  hasIntegrationDatabaseUrl,
} from './pgIntegrationHarness.mjs';

// Guard: no database configured. Print the agreed skip line and exit clean.
if (!hasIntegrationDatabaseUrl()) {
  console.log('[postgresStore.integration] skipped — set BACKEND_POSTGRES_DATABASE_URL');
  process.exit(0);
}

const TEST_COUNTER_KEY = '__integrationTestCounter';

const database = createIntegrationDatabase();
const store = createPostgresStoreAdapter({ database });

let failures = 0;

// Per-test isolation: drop the single canonical store row so each test starts from a clean slate.
async function resetStoreRow() {
  await database.query('delete from app_store where id = 1');
}

async function runTest(name, testFn) {
  try {
    await resetStoreRow();
    await testFn();
    console.log(`[postgresStore.integration] ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`[postgresStore.integration] failed - ${name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  }
}

try {
  await applySchema(database);

  // -------------------------------------------------------------------------
  // seed-on-first-load
  // -------------------------------------------------------------------------
  await runTest('loadStore on an empty DB seeds + returns the default initial store', async () => {
    // No row exists yet.
    const before = await database.query('select count(*)::int as count from app_store');
    assert.equal(before.rows[0].count, 0);

    const loaded = await store.loadStore();

    // Returns the EXACT default initial store the json adapter seeds.
    assert.deepEqual(loaded, createSeedStore());

    // And it persisted the canonical row id = 1.
    const after = await database.query('select id, data from app_store');
    assert.equal(after.rows.length, 1);
    assert.equal(after.rows[0].id, 1);
    assert.deepEqual(after.rows[0].data, createSeedStore());

    // Returned value is a deep clone: mutating it does not touch the persisted copy.
    loaded.notices.push({ id: 'should-not-persist' });
    const reloaded = await store.loadStore();
    assert.deepEqual(reloaded, createSeedStore());
  });

  // -------------------------------------------------------------------------
  // mutate persists + returns the mutator's result
  // -------------------------------------------------------------------------
  await runTest('mutateStore persists the mutation and returns the mutator result', async () => {
    await store.loadStore(); // seed

    const noticeId = 'integration-notice-1';
    const result = await store.mutateStore((draft) => {
      draft.notices.push({ id: noticeId, title: 'hello', message: 'world', priority: 0, isActive: true });
      return { addedId: noticeId, totalNotices: draft.notices.length };
    });

    // The returned value is exactly what the mutator returned.
    assert.deepEqual(result, { addedId: noticeId, totalNotices: 1 });

    // A fresh load sees the persisted mutation.
    const reloaded = await store.loadStore();
    assert.equal(reloaded.notices.length, 1);
    assert.equal(reloaded.notices[0].id, noticeId);
  });

  // -------------------------------------------------------------------------
  // saveStore overwrites; resetStore restores the default
  // -------------------------------------------------------------------------
  await runTest('saveStore overwrites the whole store; resetStore restores the default', async () => {
    await store.loadStore(); // seed

    const replacement = createSeedStore();
    replacement.offlineRaceGuideSteps = ['overwritten step'];
    replacement.notices = [{ id: 'overwrite-notice', title: 't', message: 'm', priority: 1, isActive: true }];

    await store.saveStore(replacement);

    const afterSave = await store.loadStore();
    assert.deepEqual(afterSave.offlineRaceGuideSteps, ['overwritten step']);
    assert.equal(afterSave.notices.length, 1);
    assert.equal(afterSave.notices[0].id, 'overwrite-notice');

    await store.resetStore();

    const afterReset = await store.loadStore();
    assert.deepEqual(afterReset, createSeedStore());
  });

  // -------------------------------------------------------------------------
  // CONCURRENCY — the key test. Three concurrent read-modify-write increments must all land.
  // Without the FOR UPDATE row lock a race would lose increments and the final counter < 3.
  // -------------------------------------------------------------------------
  await runTest('concurrent mutateStore increments serialize via FOR UPDATE (no lost updates)', async () => {
    await store.loadStore(); // seed

    const incCounter = (draft) => {
      const current = typeof draft[TEST_COUNTER_KEY] === 'number' ? draft[TEST_COUNTER_KEY] : 0;
      draft[TEST_COUNTER_KEY] = current + 1;
      return draft[TEST_COUNTER_KEY];
    };

    await Promise.all([
      store.mutateStore(incCounter),
      store.mutateStore(incCounter),
      store.mutateStore(incCounter),
    ]);

    const reloaded = await store.loadStore();
    // All three increments survived: the row lock serialized the read-modify-write.
    assert.equal(reloaded[TEST_COUNTER_KEY], 3);

    // Clean up the test-only key so the store shape stays equivalent to the default seed.
    await store.mutateStore((draft) => {
      delete draft[TEST_COUNTER_KEY];
    });
    const cleaned = await store.loadStore();
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned, TEST_COUNTER_KEY), false);
  });

  // -------------------------------------------------------------------------
  // transaction rollback — a throwing mutator leaves the store unchanged
  // -------------------------------------------------------------------------
  await runTest('a throwing mutator rolls the transaction back (no partial write)', async () => {
    await store.loadStore(); // seed

    // Land a known good state first.
    await store.mutateStore((draft) => {
      draft.notices.push({ id: 'keep-me', title: 't', message: 'm', priority: 0, isActive: true });
    });

    const sentinel = new Error('intentional mutator failure');
    await assert.rejects(
      () => store.mutateStore((draft) => {
        // Mutate in place, then throw — the UPDATE must never commit.
        draft.notices.push({ id: 'should-be-rolled-back', title: 't', message: 'm', priority: 0, isActive: true });
        throw sentinel;
      }),
      (error) => error === sentinel,
    );

    const afterRollback = await store.loadStore();
    // Only the pre-failure notice remains; the rolled-back push is gone.
    assert.equal(afterRollback.notices.length, 1);
    assert.equal(afterRollback.notices[0].id, 'keep-me');
  });
} finally {
  await database.close();
}

if (failures > 0) {
  console.error(`[postgresStore.integration] ${failures} test(s) failed`);
  process.exit(1);
}

console.log('[postgresStore.integration] all integration tests passed');
