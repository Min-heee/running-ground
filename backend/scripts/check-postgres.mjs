import {
  APP_ENV,
  POSTGRES_APPLICATION_NAME,
  POSTGRES_CONNECTION_TIMEOUT_MS,
  POSTGRES_DATABASE_URL,
  POSTGRES_IDLE_TIMEOUT_MS,
  POSTGRES_POOL_MAX,
  POSTGRES_SSL,
} from '../src/config.mjs';
import { createPostgresDatabase } from '../src/database/postgresDatabase.mjs';

function readArgValue(flagName) {
  const index = process.argv.indexOf(flagName);

  if (index === -1) {
    return '';
  }

  return process.argv[index + 1] ?? '';
}

const databaseUrl = readArgValue('--database-url') || POSTGRES_DATABASE_URL;

if (!databaseUrl) {
  console.error('[postgres-check] BACKEND_POSTGRES_DATABASE_URL 또는 DATABASE_URL 이 필요해.');
  process.exit(1);
}

const database = createPostgresDatabase({
  connectionString: databaseUrl,
  ssl: POSTGRES_SSL,
  maxConnections: POSTGRES_POOL_MAX,
  idleTimeoutMs: POSTGRES_IDLE_TIMEOUT_MS,
  connectionTimeoutMs: POSTGRES_CONNECTION_TIMEOUT_MS,
  applicationName: POSTGRES_APPLICATION_NAME,
});

try {
  const status = await database.check();
  console.log(JSON.stringify({
    ok: true,
    env: APP_ENV,
    postgres: {
      ...status,
      ssl: POSTGRES_SSL,
      poolMax: POSTGRES_POOL_MAX,
      idleTimeoutMs: POSTGRES_IDLE_TIMEOUT_MS,
      connectionTimeoutMs: POSTGRES_CONNECTION_TIMEOUT_MS,
      applicationName: POSTGRES_APPLICATION_NAME,
    },
  }, null, 2));
} catch (error) {
  console.error('[postgres-check] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await database.close();
}
