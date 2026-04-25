import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const backendRoot = resolve(projectRoot, 'backend');
const validEnvironments = new Set(['preview', 'production']);

function readArgValue(flagName) {
  const index = process.argv.indexOf(flagName);

  if (index < 0 || index + 1 >= process.argv.length) {
    return '';
  }

  return process.argv[index + 1]?.trim() ?? '';
}

function hasFlag(flagName) {
  return process.argv.includes(flagName);
}

function usage() {
  return `
Usage:
  npm run backend:migrate:public:postgres -- --env preview
  npm run backend:migrate:public:postgres -- --env production --skip-sessions
  npm run backend:migrate:public:postgres -- --env preview --dry-run

Options:
  --env preview|production       Public stack environment to migrate.
  --env-file <path>              Optional backend env file path.
  --skip-sessions                Exclude active sessions from the SQL snapshot.
  --dry-run                      Validate and generate the migration summary only.
`.trim();
}

function fail(message) {
  console.error(`[public-postgres-migrate] ${message}`);
  console.error('');
  console.error(usage());
  process.exit(1);
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const entries = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

function parsePostgresConnectionString(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = new URL(value);

    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      return {};
    }

    return {
      username: decodeURIComponent(parsed.username || ''),
      database: parsed.pathname.replace(/^\//, ''),
    };
  } catch {
    return {};
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    shell: false,
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(`${command} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }

  return result;
}

function extractStoreSnapshot({ appEnv, envFilePath, outputPath }) {
  const result = runCommand('docker', [
    'compose',
    '-p',
    `runningground-${appEnv}`,
    '--env-file',
    envFilePath,
    '-f',
    './backend/compose.public.yaml',
    'exec',
    '-T',
    'api',
    'node',
    '-e',
    "process.stdout.write(require('node:fs').readFileSync('/app/data/store.json', 'utf8'));",
  ]);

  if (!result.stdout?.trim()) {
    throw new Error('api 컨테이너에서 store.json 을 읽지 못했어요.');
  }

  JSON.parse(result.stdout);
  writeFileSync(outputPath, result.stdout, 'utf8');
}

function applySqlToPostgres({ appEnv, envFilePath, postgresUser, postgresDb, sqlBuffer }) {
  runCommand(
    'docker',
    [
      'compose',
      '-p',
      `runningground-${appEnv}`,
      '--env-file',
      envFilePath,
      '-f',
      './backend/compose.public.yaml',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      postgresUser,
      '-d',
      postgresDb,
    ],
    { encoding: 'buffer', input: sqlBuffer, maxBuffer: 30 * 1024 * 1024 },
  );
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    return;
  }

  const appEnv = readArgValue('--env');

  if (!validEnvironments.has(appEnv)) {
    fail('--env must be preview or production.');
  }

  const dryRun = hasFlag('--dry-run');
  const skipSessions = hasFlag('--skip-sessions');
  const envFilePath = resolve(projectRoot, readArgValue('--env-file') || `backend/.env.${appEnv}`);

  if (!existsSync(envFilePath)) {
    fail(`env file not found: ${envFilePath}`);
  }

  const envEntries = readEnvFile(envFilePath);
  const parsedConnection = parsePostgresConnectionString(
    envEntries.BACKEND_POSTGRES_DATABASE_URL || envEntries.DATABASE_URL || '',
  );
  const postgresUser = envEntries.POSTGRES_USER || parsedConnection.username || 'runningground';
  const postgresDb = envEntries.POSTGRES_DB || parsedConnection.database || `runningground_${appEnv}`;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'runningground-public-postgres-'));
  const tempStoreFilePath = join(tempDirectory, `store-${appEnv}.json`);
  const tempSqlFilePath = join(tempDirectory, `store-${appEnv}.sql`);

  try {
    console.log(`[public-postgres-migrate] env: ${appEnv}`);
    console.log(`[public-postgres-migrate] env file: ${envFilePath}`);
    console.log('[public-postgres-migrate] extracting current JSON store from public api container...');
    extractStoreSnapshot({
      appEnv,
      envFilePath,
      outputPath: tempStoreFilePath,
    });

    if (dryRun) {
      console.log('[public-postgres-migrate] running dry-run validation...');
      const args = [
        './backend/db/migrate-json-to-postgres.mjs',
        '--store-file',
        tempStoreFilePath,
        '--dry-run',
      ];

      if (skipSessions) {
        args.push('--skip-sessions');
      }

      runCommand(process.execPath, args);
      console.log('[public-postgres-migrate] dry run complete');
      return;
    }

    console.log('[public-postgres-migrate] generating PostgreSQL migration SQL...');
    const migrationArgs = [
      './backend/db/migrate-json-to-postgres.mjs',
      '--store-file',
      tempStoreFilePath,
      '--out',
      tempSqlFilePath,
      '--write-sql',
    ];

    if (skipSessions) {
      migrationArgs.push('--skip-sessions');
    }

    runCommand(process.execPath, migrationArgs);

    console.log('[public-postgres-migrate] applying schema to public postgres container...');
    applySqlToPostgres({
      appEnv,
      envFilePath,
      postgresUser,
      postgresDb,
      sqlBuffer: readFileSync(resolve(backendRoot, 'db', 'schema.sql')),
    });

    console.log('[public-postgres-migrate] importing JSON snapshot into public postgres container...');
    applySqlToPostgres({
      appEnv,
      envFilePath,
      postgresUser,
      postgresDb,
      sqlBuffer: readFileSync(tempSqlFilePath),
    });

    console.log('[public-postgres-migrate] done');
    console.log('[public-postgres-migrate] next: enable BACKEND_POSTGRES_ENABLE_* flags as needed and redeploy.');
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[public-postgres-migrate] ${error.message}`);
  process.exitCode = 1;
});
