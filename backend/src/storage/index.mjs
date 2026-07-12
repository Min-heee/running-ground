// Durable whole-store seam.
//
// This module is the single import surface the rest of the backend uses for the durable
// whole-store (`@/storage` / `../storage/index.mjs`). It selects the backing adapter by
// BACKEND_STORE_DRIVER and exposes a UNIFORM ASYNC interface so the app can `await` store
// operations regardless of driver:
//
//   - json (default)  → wraps the synchronous file-backed json adapter (src/store.mjs via
//                        jsonStoreAdapter.mjs). The core store ops are re-exported as ASYNC
//                        wrappers so callers must `await` them — that is what lets the json
//                        test suite catch any missing `await` in the await migration.
//   - postgres        → lazily builds the Postgres database (from BACKEND_POSTGRES_DATABASE_URL
//                        / DATABASE_URL, the same resolution postgresStoreAdapter/check-postgres
//                        use) and the postgres store adapter, whose store ops are already async.
//
// Pure synchronous helpers that are sync in BOTH adapters (getStoreFilePath,
// getStoreBackupDirectory, getStoreDiagnostics, listStoreBackups) are exposed as-is.

import * as jsonStoreAdapter from './jsonStoreAdapter.mjs';

export const STORE_DRIVER = (process.env.BACKEND_STORE_DRIVER ?? 'json').trim().toLowerCase();

const SUPPORTED_STORE_DRIVERS = new Set(['json', 'postgres']);

if (!SUPPORTED_STORE_DRIVERS.has(STORE_DRIVER)) {
  throw new Error(
    `Unsupported BACKEND_STORE_DRIVER: ${STORE_DRIVER}. 지원하는 값은 'json' 또는 'postgres' 뿐이에요.`,
  );
}

// P1-3 fail-fast: the compose default of BACKEND_STORE_DRIVER=json is a footgun once a Postgres
// URL is configured — the app would boot on the empty seeded json store and silently ignore the
// real data sitting in Postgres. Refuse to boot in that mismatch instead of serving a fake store.
// (Resolution order mirrors config.mjs / postgresStoreAdapter: BACKEND_POSTGRES_DATABASE_URL then
// DATABASE_URL.)
const POSTGRES_URL_PRESENT = Boolean(
  (process.env.BACKEND_POSTGRES_DATABASE_URL ?? process.env.DATABASE_URL ?? '').trim(),
);

if (STORE_DRIVER === 'json' && POSTGRES_URL_PRESENT) {
  throw new Error(
    'postgres URL is set but BACKEND_STORE_DRIVER=json — refusing to boot on the json store and '
    + 'silently ignore Postgres data. Set BACKEND_STORE_DRIVER=postgres.',
  );
}

// Resolve the active adapter once. For the postgres driver we build the database + adapter from
// the environment at module init (its constructor is synchronous; only its store ops are async),
// so the exported async methods all close over a single adapter instance. The json adapter is
// imported eagerly above (it never touches Postgres); the postgres adapter is imported lazily so
// the json path never loads the pg driver.
let activeAdapter = jsonStoreAdapter;

if (STORE_DRIVER === 'postgres') {
  const { createPostgresStoreAdapter } = await import('./postgresStoreAdapter.mjs');
  activeAdapter = createPostgresStoreAdapter();
  // #209 GPS route side-table boot migration (postgres driver only, idempotent): move every
  // legacy run route still embedded in the app_store blob into run_routes and persist the
  // slimmed blob once, so per-mutation serialize cost stops scaling with run history. Runs at
  // module init (top-level await), i.e. before the server accepts any request.
  await activeAdapter.migrateEmbeddedRunRoutes();
  // Legacy integration-source cleanup (idempotent): drop mynb rows, force-disconnect the
  // hidden nrc/strava/garmin brand rows. The postgres adapter does not run the json store's
  // migration list, so user-shape migrations need an explicit boot sweep here; the change
  // detection inside mutateStore makes the no-op case skip the row write entirely.
  // Failure-tolerant on purpose: a transient DB blip must not crash-loop the boot — the
  // sweep is idempotent and simply retries on the next restart.
  const { cleanupLegacyIntegrationSources } = await import('../lib/integrationSourceMigrations.mjs');
  try {
    await activeAdapter.mutateStore((store) => {
      cleanupLegacyIntegrationSources(store);
    });
  } catch (error) {
    console.error(
      `[runningground-backend] legacy integration-source cleanup failed (idempotent — retries next boot): ${error?.message ?? error}`,
    );
  }
}

// ---- Async-uniform core store operations -------------------------------------------------
// Each wrapper returns a Promise. For the json adapter the underlying call is synchronous, but
// the `async` wrapper still forces every caller to `await`, surfacing any missed await under the
// json test gate. For the postgres adapter the underlying call is already async.

export async function loadStore() {
  return activeAdapter.loadStore();
}

export async function saveStore(nextStore) {
  return activeAdapter.saveStore(nextStore);
}

export async function mutateStore(mutator) {
  return activeAdapter.mutateStore(mutator);
}

export async function resetStore() {
  return activeAdapter.resetStore();
}

export async function createStoreBackup(reason) {
  return activeAdapter.createStoreBackup(reason);
}

export async function restoreStoreBackup(backupFileNameOrPath) {
  return activeAdapter.restoreStoreBackup(backupFileNameOrPath);
}

// #209: read one run's GPS route from the side table. json driver keeps routes embedded in the
// run objects (no side table), so it answers null and callers simply use run.route as before.
export async function getStoredRunRoute(runId) {
  if (typeof activeAdapter.getRunRoute !== 'function') {
    return null;
  }

  return activeAdapter.getRunRoute(runId);
}

// ---- Synchronous helpers (sync in both adapters) -----------------------------------------

export function listStoreBackups() {
  return activeAdapter.listStoreBackups();
}

export function getStoreFilePath() {
  return activeAdapter.getStoreFilePath();
}

export function getStoreBackupDirectory() {
  return activeAdapter.getStoreBackupDirectory();
}

export function getStoreDiagnostics() {
  return activeAdapter.getStoreDiagnostics();
}
