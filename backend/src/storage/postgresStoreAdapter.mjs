// Postgres-backed durable whole-store adapter (Path B).
//
// Backs the SAME JSON whole-store the json adapter uses, but as a single canonical jsonb row
// (`app_store` where id = 1) in Postgres. This gives the whole-store real ACID durability and a
// serialized single-writer guarantee via `SELECT ... FOR UPDATE` on that one row — concurrent
// mutateStore calls take the row lock in turn, so their read-modify-write cannot interleave and
// lose updates.
//
// It mirrors the json adapter's public surface (src/storage/index.mjs):
//   createStoreBackup, getStoreBackupDirectory, getStoreDiagnostics, getStoreFilePath,
//   listStoreBackups, loadStore, mutateStore, resetStore, restoreStoreBackup, saveStore
// but its loadStore/mutateStore/saveStore/resetStore are ASYNC (the json ones are sync). The
// seam wiring + the app-wide await migration are a LATER step — this module is NOT wired in yet.
//
// It deliberately does NOT import config.mjs (which runs release validation at import time and
// throws outside development). The database connection + backup directory are resolved from the
// environment directly, the same way the integration harness does.

import { createPostgresDatabase } from '../database/postgresDatabase.mjs';
import { createSeedStore } from '../seed.mjs';
import {
  getStoreBackupDirectory,
  listStoreBackupFiles,
  readStoreBackupContents,
  writeStoreBackupContents,
} from './fileStoreBackup.mjs';

const STORE_ROW_ID = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeStore(store) {
  return JSON.stringify(store);
}

function parseBoolean(value, defaultValue = false) {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

// Mirrors scripts/check-postgres.mjs / config.mjs resolution order (BACKEND_POSTGRES_DATABASE_URL
// then DATABASE_URL) without importing config.mjs.
export function resolveStoreDatabaseUrl() {
  const raw = process.env.BACKEND_POSTGRES_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function buildDatabaseFromEnv() {
  const connectionString = resolveStoreDatabaseUrl();

  if (!connectionString) {
    throw new Error(
      'PostgreSQL store driver requires BACKEND_POSTGRES_DATABASE_URL 또는 DATABASE_URL.',
    );
  }

  return createPostgresDatabase({
    connectionString,
    ssl: parseBoolean(process.env.BACKEND_POSTGRES_SSL, false),
    maxConnections: Math.max(1, parseNumber(process.env.BACKEND_POSTGRES_POOL_MAX, 10)),
    idleTimeoutMs: Math.max(1000, parseNumber(process.env.BACKEND_POSTGRES_IDLE_TIMEOUT_MS, 30000)),
    connectionTimeoutMs: Math.max(1000, parseNumber(process.env.BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS, 10000)),
    applicationName: process.env.BACKEND_POSTGRES_APPLICATION_NAME || 'runningground-backend-store',
  });
}

// Build the default initial store using the EXACT same seed builder the json adapter uses, so the
// Postgres-backed store starts identical to the json store (same market items, notices, guide
// steps, version, region tree, etc.).
function buildInitialStore() {
  return createSeedStore();
}

// Insert the canonical row (id = 1) with the default initial store if it does not exist yet.
// `on conflict do nothing` makes this safe under the row lock and against concurrent seeders.
async function seedStoreRow(executor) {
  const initialStore = buildInitialStore();
  await executor.query(
    'insert into app_store (id, data, updated_at) values ($1, $2, now()) on conflict (id) do nothing',
    [STORE_ROW_ID, serializeStore(initialStore)],
  );
  return initialStore;
}

export function createPostgresStoreAdapter(options = {}) {
  const database = options.database ?? buildDatabaseFromEnv();
  const backupOnSave = options.backupOnSave ?? parseBoolean(process.env.BACKEND_STORE_BACKUP_ON_SAVE, false);

  async function loadStore() {
    const existing = await database.query(
      'select data from app_store where id = $1',
      [STORE_ROW_ID],
    );

    if (existing.rows.length > 0) {
      // jsonb comes back already parsed; clone so callers can't mutate the persisted copy.
      return clone(existing.rows[0].data);
    }

    // First load on an empty DB: seed the canonical row with the default initial store.
    const seeded = await seedStoreRow(database);
    return clone(seeded);
  }

  // Single-writer, serialized read-modify-write. The `FOR UPDATE` row lock is the core
  // correctness guarantee: concurrent mutateStore calls block on the same row, so each sees the
  // previous writer's committed mutation and increments cannot be lost. A throwing mutator
  // propagates out of the transaction callback, so postgresDatabase.transaction rolls back —
  // no partial write reaches the row.
  async function mutateStore(mutator) {
    return database.transaction(async (client) => {
      let locked = await client.query(
        'select data from app_store where id = $1 for update',
        [STORE_ROW_ID],
      );

      if (locked.rows.length === 0) {
        // Seed the row inside the transaction, then re-select FOR UPDATE to hold the lock.
        await seedStoreRow(client);
        locked = await client.query(
          'select data from app_store where id = $1 for update',
          [STORE_ROW_ID],
        );
      }

      const store = locked.rows[0].data;
      // Change-detection skip (the production hot path of the pre-launch P0-1 stopgap —
      // this adapter IS the live driver, so the json-store skip alone was not enough):
      // serialize the row pre/post mutator and skip the whole-store jsonb UPDATE when the
      // mutation was read-only (status polls, lookups). Both serializations come from the
      // SAME loaded object graph inside the FOR UPDATE transaction, so jsonb key-order
      // normalization can't produce a false mismatch, and any real change — including the
      // contract-pinned sweep-on-poll self-heals — still writes. The compare can only err
      // toward writing, never toward skipping a real change.
      const beforeSerialized = serializeStore(store);
      const result = mutator(store);
      if (result && typeof result.then === 'function') {
        // Mirror the json store's guard: an async mutator would let the UPDATE run before
        // the mutation finishes — silent corruption.
        throw new Error(
          'mutateStore의 mutator는 동기 함수여야 해. 비동기 mutator는 변경이 끝나기 전에 저장이 실행돼 저장소가 조용히 손상될 수 있어.',
        );
      }
      const afterSerialized = serializeStore(store);

      if (afterSerialized !== beforeSerialized) {
        await client.query(
          'update app_store set data = $1, updated_at = now() where id = $2',
          [afterSerialized, STORE_ROW_ID],
        );
      }

      return result;
    });
  }

  async function saveStore(nextStore) {
    const serialized = serializeStore(nextStore);
    const updated = await database.query(
      'update app_store set data = $1, updated_at = now() where id = $2',
      [serialized, STORE_ROW_ID],
    );

    if (updated.rowCount === 0) {
      // No row yet — insert the provided store as the canonical row.
      await database.query(
        'insert into app_store (id, data, updated_at) values ($1, $2, now()) on conflict (id) do update set data = excluded.data, updated_at = now()',
        [STORE_ROW_ID, serialized],
      );
    }

    if (backupOnSave) {
      writeStoreBackupContents(serialized, 'save');
    }

    return clone(nextStore);
  }

  async function resetStore() {
    const initialStore = buildInitialStore();
    const serialized = serializeStore(initialStore);
    await database.query(
      'insert into app_store (id, data, updated_at) values ($1, $2, now()) on conflict (id) do update set data = excluded.data, updated_at = now()',
      [STORE_ROW_ID, serialized],
    );
    return clone(initialStore);
  }

  // Snapshot the current canonical store to a timestamped file in the backup directory using the
  // SAME on-disk file-backup helper the json adapter uses. Returns the backup file path (or null).
  async function createStoreBackup(reason = 'manual') {
    const current = await loadStore();
    return writeStoreBackupContents(JSON.stringify(current, null, 2), reason);
  }

  function listStoreBackups() {
    return listStoreBackupFiles();
  }

  // Restore the whole-store from a previously written on-disk backup file into the canonical row.
  async function restoreStoreBackup(backupFileNameOrPath) {
    // Snapshot the current store before overwriting (pre-restore safety), mirroring the json path.
    await createStoreBackup('pre-restore');

    const backupContents = readStoreBackupContents(backupFileNameOrPath);
    const restoredStore = JSON.parse(backupContents);
    return saveStore(restoredStore);
  }

  // The Postgres store has no single store FILE; the canonical store lives in the app_store row.
  // Returning null signals "no file path" to ops/admin callers (the json adapter returns a path).
  function getStoreFilePath() {
    return null;
  }

  function getStoreDiagnostics() {
    return {
      driver: 'postgres',
      storeTable: 'app_store',
      storeRowId: STORE_ROW_ID,
      storeFile: null,
      backupDirectory: getStoreBackupDirectory(),
      backupOnSave,
    };
  }

  return {
    database,
    loadStore,
    mutateStore,
    saveStore,
    resetStore,
    createStoreBackup,
    listStoreBackups,
    restoreStoreBackup,
    getStoreBackupDirectory,
    getStoreFilePath,
    getStoreDiagnostics,
  };
}

export default createPostgresStoreAdapter;
