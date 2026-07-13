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

// GPS route side table (#209). Saved runs used to embed their full GPS route (up to ~1500
// points, ~200KB) INSIDE the app_store jsonb blob, so every whole-store UPDATE re-serialized
// the entire run history and the 2.5s match-progress POSTs convoyed behind multi-second row
// writes. Routes are display-only polylines — verdicts/LP/points never read them — so they are
// stored out-of-band in run_routes and the blob only keeps a `routeStored: true` marker.
const RUN_ROUTES_TABLE_DDL = [
  `create table if not exists run_routes (
    run_id text primary key,
    user_id text,
    route jsonb not null,
    created_at timestamptz not null default now()
  )`,
  'create index if not exists run_routes_user_idx on run_routes (user_id)',
];

// 매 진행 push가 app_store 행 전체를 새 버전으로 다시 쓰는 워크로드라 dead tuple과 TOAST 팽창이
// 빠르게 쌓이고, 팽창은 곧 FOR UPDATE 읽기 비용 증가 → 락 점유 연장 → 더 느린 push의 되먹임이다.
// fillfactor 50은 페이지 내 재사용 여지를 남기고, 스케일팩터 0 + 임계 10은 autovacuum이 몇 번의
// 쓰기마다 곧장 돌게 해 팽창을 상시 억제한다. (idempotent — 기존 프로덕션 볼륨은 initdb를 다시
// 타지 않으므로 런타임에서 직접 적용한다. 실패해도 치명적이지 않아 route ensure와 분리 처리.)
const APP_STORE_STORAGE_TUNING_DDL = [
  'alter table app_store set (fillfactor = 50)',
  'alter table app_store set (autovacuum_vacuum_scale_factor = 0.0, autovacuum_vacuum_threshold = 10)',
  // TOAST 파라미터는 본테이블 설정을 상속하지 않는다 — blob 팽창의 실체는 TOAST 쪽이므로 명시 필수.
  'alter table app_store set (toast.autovacuum_vacuum_scale_factor = 0.0, toast.autovacuum_vacuum_threshold = 10)',
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeStore(store) {
  return JSON.stringify(store);
}

// Strip every embedded GPS route out of store.runs IN PLACE and return the extracted
// (runId, userId, route) rows. Runs keep all other fields (distance/pace/stats/matchResult/
// startedAt/...) plus a `routeStored: true` marker so read paths know to re-attach from the
// side table. Runs without an id are left untouched (nothing to key the side row on).
export function extractEmbeddedRunRoutes(store) {
  const extracted = [];

  if (!Array.isArray(store?.runs)) {
    return extracted;
  }

  for (const run of store.runs) {
    if (!run || typeof run !== 'object' || !Array.isArray(run.route)) {
      continue;
    }

    if (typeof run.id !== 'string' || !run.id) {
      continue;
    }

    extracted.push({
      runId: run.id,
      userId: typeof run.userId === 'string' && run.userId ? run.userId : null,
      route: run.route,
    });
    delete run.route;
    run.routeStored = true;
  }

  return extracted;
}

async function insertRunRoutes(executor, extractedRoutes) {
  for (const entry of extractedRoutes) {
    // DO NOTHING on conflict: a route is written exactly once per run id (retried match saves
    // upgrade matchResult only, never the polyline), so the first stored copy always wins.
    await executor.query(
      'insert into run_routes (run_id, user_id, route) values ($1, $2, $3) on conflict (run_id) do nothing',
      [entry.runId, entry.userId, JSON.stringify(entry.route)],
    );
  }
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
    connectionTimeoutMs: Math.max(1000, parseNumber(process.env.BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS, 4000)),
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

  // run_routes schema ensure — lazy, memoized on success only. Existing production volumes
  // never re-run docker-entrypoint-initdb.d, so the runtime creates the side table itself.
  // A failed ensure DEGRADES GRACEFULLY: routes stay embedded in the blob (pre-#209 behavior)
  // instead of failing every write on a missing table, and the next call retries.
  let runRoutesSchemaReady = false;
  let runRoutesSchemaEnsurePromise = null;
  let appStoreTuningApplied = false;

  function ensureRunRoutesSchema() {
    if (runRoutesSchemaReady) {
      return Promise.resolve(true);
    }

    if (!runRoutesSchemaEnsurePromise) {
      runRoutesSchemaEnsurePromise = (async () => {
        try {
          for (const statement of RUN_ROUTES_TABLE_DDL) {
            await database.query(statement);
          }

          runRoutesSchemaReady = true;
        } catch (error) {
          console.error(
            `[runningground-backend] run_routes schema ensure failed (routes stay embedded until it succeeds): ${error?.message ?? error}`,
          );
        } finally {
          runRoutesSchemaEnsurePromise = null;
        }

        // 스토리지 튜닝은 route ensure와 성패를 묶지 않는다 — ALTER가 어떤 이유로 실패해도
        // route 추출(위)이나 쓰기 경로는 멀쩡히 동작해야 한다.
        if (runRoutesSchemaReady && !appStoreTuningApplied) {
          try {
            for (const statement of APP_STORE_STORAGE_TUNING_DDL) {
              await database.query(statement);
            }
            appStoreTuningApplied = true;
          } catch (error) {
            console.error(
              `[runningground-backend] app_store storage tuning failed (non-fatal): ${error?.message ?? error}`,
            );
          }
        }

        return runRoutesSchemaReady;
      })();
    }

    return runRoutesSchemaEnsurePromise;
  }

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

  // In-process write mutex. The Postgres row lock already fully serializes writers, so queueing
  // them here changes NOTHING about ordering or isolation — but it moves the waiting from
  // "checked-out pool client blocked on FOR UPDATE" to "promise in Node". Without this, a write
  // convoy parks on pool clients until all 10 are held by waiters and every lock-free READ
  // (home, health, login) starves in the pool-acquire queue — the load test reproduced exactly
  // that as an 89%-timeout full-API collapse at 160 concurrent runners. With it, reads keep
  // flowing on free pool slots no matter how deep the write queue gets.
  let writeQueueTail = Promise.resolve();
  let writeQueueDepth = 0;
  // 조기경보 계기판 두 눈금: ① T_lock(락 아래에서 보낸 시간 + blob 크기) — 스토어 비대화가
  // 먼저 밀어올리는 눈금, ② 큐 대기시간/깊이 — 뮤텍스 도입 후의 새 포화 신호(개별 쓰기는 계속
  // 빠른데 대기줄만 길어지는 과부하는 이 눈금에만 나타난다). 느릴 때만, 5초에 한 번만 남긴다.
  let lastSlowMutateLogAtMs = 0;

  function mutateStore(mutator) {
    const enqueuedAtMs = Date.now();
    writeQueueDepth += 1;
    const run = async () => {
      try {
        return await performMutateStore(mutator, enqueuedAtMs);
      } finally {
        writeQueueDepth -= 1;
      }
    };
    const chained = writeQueueTail.then(run, run);
    writeQueueTail = chained.then(() => undefined, () => undefined);
    return chained;
  }

  // Single-writer, serialized read-modify-write. The `FOR UPDATE` row lock is the core
  // correctness guarantee: concurrent mutateStore calls block on the same row, so each sees the
  // previous writer's committed mutation and increments cannot be lost. A throwing mutator
  // propagates out of the transaction callback, so postgresDatabase.transaction rolls back —
  // no partial write reaches the row.
  async function performMutateStore(mutator, enqueuedAtMs = Date.now()) {
    const routeSideTableReady = await ensureRunRoutesSchema();
    const lockPhaseStartedAtMs = Date.now();
    const queueWaitMs = lockPhaseStartedAtMs - enqueuedAtMs;
    let persistedBlobBytes = 0;

    const transactionResult = await database.transaction(async (client) => {
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
      // #209 GPS route side-table sweep: AFTER the mutator (so the result it built — e.g. the
      // tracked-run detail payload — still references the embedded route array), move every
      // embedded run route into run_routes and slim the blob. Runs inside the SAME transaction
      // as the whole-store UPDATE, so a route row and its `routeStored: true` marker commit (or
      // roll back) atomically — no crash window can strand a marker without a side row.
      const extractedRoutes = routeSideTableReady ? extractEmbeddedRunRoutes(store) : [];
      const afterSerialized = serializeStore(store);
      persistedBlobBytes = afterSerialized.length;

      if (extractedRoutes.length > 0) {
        await insertRunRoutes(client, extractedRoutes);
      }

      if (afterSerialized !== beforeSerialized) {
        await client.query(
          'update app_store set data = $1, updated_at = now() where id = $2',
          [afterSerialized, STORE_ROW_ID],
        );
      }

      return result;
    });

    const lockPhaseDurationMs = Date.now() - lockPhaseStartedAtMs;

    if ((lockPhaseDurationMs > 50 || queueWaitMs > 500) && Date.now() - lastSlowMutateLogAtMs >= 5000) {
      lastSlowMutateLogAtMs = Date.now();
      console.warn(
        `[runningground-backend] slow store mutate: lock ${lockPhaseDurationMs}ms, queue wait ${queueWaitMs}ms, depth ${writeQueueDepth} (blob ${persistedBlobBytes} bytes) — 락이 길면 스토어 비대화, 대기가 길면 쓰기 과부하 신호`,
      );
    }

    return transactionResult;
  }

  async function saveStore(nextStore) {
    // Sweep embedded routes here too so restoring an OLD (pre-#209) fat backup immediately
    // re-slims the blob instead of waiting for the next mutateStore. Existing side rows win
    // (insert ... on conflict do nothing).
    const routeSideTableReady = await ensureRunRoutesSchema();
    const storeToPersist = clone(nextStore);
    const extractedRoutes = routeSideTableReady ? extractEmbeddedRunRoutes(storeToPersist) : [];
    const serialized = serializeStore(storeToPersist);

    if (extractedRoutes.length > 0) {
      await database.transaction(async (client) => {
        await insertRunRoutes(client, extractedRoutes);
        await client.query(
          'insert into app_store (id, data, updated_at) values ($1, $2, now()) on conflict (id) do update set data = excluded.data, updated_at = now()',
          [STORE_ROW_ID, serialized],
        );
      });
    } else {
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
    }

    if (backupOnSave) {
      writeStoreBackupContents(serialized, 'save');
    }

    return clone(storeToPersist);
  }

  // Read one run's GPS route back from the side table (null when absent or side table
  // unavailable). jsonb arrives already parsed; clone so callers can't mutate the stored copy.
  async function getRunRoute(runId) {
    if (typeof runId !== 'string' || !runId) {
      return null;
    }

    if (!(await ensureRunRoutesSchema())) {
      return null;
    }

    const result = await database.query(
      'select route from run_routes where run_id = $1',
      [runId],
    );
    const route = result.rows[0]?.route;
    return Array.isArray(route) ? clone(route) : null;
  }

  // One-time (idempotent) boot migration: sweep every legacy run that still embeds its GPS
  // route inside the app_store blob into run_routes, then persist the slimmed blob ONCE.
  // Re-runs are no-ops (nothing left to extract → no UPDATE). Safe across restarts: the
  // route inserts and the blob UPDATE share one transaction under the row lock.
  async function migrateEmbeddedRunRoutes() {
    if (!(await ensureRunRoutesSchema())) {
      console.error('[runningground-backend] run_routes boot migration skipped: schema ensure failed (routes stay embedded).');
      return { migratedRuns: 0, bytesSaved: 0 };
    }

    const summary = await database.transaction(async (client) => {
      const locked = await client.query(
        'select data from app_store where id = $1 for update',
        [STORE_ROW_ID],
      );

      if (locked.rows.length === 0) {
        return { migratedRuns: 0, bytesSaved: 0 };
      }

      const store = locked.rows[0].data;
      const beforeSerialized = serializeStore(store);
      const extractedRoutes = extractEmbeddedRunRoutes(store);

      if (extractedRoutes.length === 0) {
        return { migratedRuns: 0, bytesSaved: 0 };
      }

      await insertRunRoutes(client, extractedRoutes);
      const afterSerialized = serializeStore(store);
      await client.query(
        'update app_store set data = $1, updated_at = now() where id = $2',
        [afterSerialized, STORE_ROW_ID],
      );

      return {
        migratedRuns: extractedRoutes.length,
        bytesSaved: Math.max(0, beforeSerialized.length - afterSerialized.length),
      };
    });

    console.log(
      `[runningground-backend] run_routes migration: ${summary.migratedRuns} run route(s) moved out of the app_store blob (~${Math.round(summary.bytesSaved / 1024)}KB trimmed).`,
    );
    return summary;
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
    getRunRoute,
    migrateEmbeddedRunRoutes,
  };
}

export default createPostgresStoreAdapter;
