import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const backendRoot = resolve(projectRoot, 'backend');
const VALID_ENVS = new Set(['preview', 'production']);

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
  npm run backend:deploy:public -- --env preview --domain preview-api.example.com --email you@example.com
  npm run backend:deploy:public -- --env production --domain api.example.com --email you@example.com

Options:
  --env preview|production       Backend environment to deploy.
  --domain <domain>              Public HTTPS domain that points to this server.
  --email <email>                ACME/Let's Encrypt contact email for Caddy.
  --admin-token <token>          Optional admin token. Generated when omitted.
  --cors-origin <origin>         Optional CORS origin. Defaults to the public domain (plus localhost for preview).
  --env-file <path>              Optional backend env file path.
  --expected-ip <ip>             Optional IP that DNS must resolve to.
  --skip-domain-check            Skip pre-deploy DNS check.
  --skip-docker                  Write and validate env only.
  --skip-health                  Do not wait for public health after deploy.
  --sync-eas-preview             Sync EAS preview app API URL after deploy.
  --dry-run                      Validate generated env without writing or deploying.
`.trim();
}

function fail(message) {
  console.error(`[backend-deploy] ${message}`);
  console.error('');
  console.error(usage());
  process.exit(1);
}

function normalizeDomain(value) {
  const normalized = value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  if (!/^(?=.{1,253}$)(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/.test(normalized)) {
    fail('domain must be a valid public hostname.');
  }

  return normalized;
}

function normalizeEmail(value) {
  const normalized = value.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    fail('email must be a valid email address.');
  }

  return normalized;
}

function quoteEnvValue(value) {
  if (/^[A-Za-z0-9_./:@*=-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function buildDefaultCorsOrigin(appEnv, domain) {
  const publicOrigin = `https://${domain}`;

  if (appEnv === 'preview') {
    return [
      publicOrigin,
      'http://localhost:8081',
      'http://127.0.0.1:8081',
      'http://localhost:19006',
      'http://127.0.0.1:19006',
    ].join(',');
  }

  return publicOrigin;
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
      password: decodeURIComponent(parsed.password || ''),
      database: parsed.pathname.replace(/^\//, ''),
    };
  } catch {
    return {};
  }
}

function buildEnvFileContents({
  appEnv,
  domain,
  email,
  adminToken,
  corsOrigin,
  backupRetention,
  postgresDb,
  postgresUser,
  postgresPassword,
  postgresDatabaseUrl,
  postgresSsl,
  postgresPoolMax,
  postgresIdleTimeoutMs,
  postgresConnectionTimeoutMs,
  postgresApplicationName,
  postgresEnableSessionReads,
  postgresEnableRunReads,
  postgresEnableFriendReads,
  postgresEnableLeagueReads,
}) {
  const lines = [
    `PUBLIC_DOMAIN=${domain}`,
    `ACME_EMAIL=${email}`,
    '',
    `POSTGRES_DB=${quoteEnvValue(postgresDb)}`,
    `POSTGRES_USER=${quoteEnvValue(postgresUser)}`,
    `POSTGRES_PASSWORD=${quoteEnvValue(postgresPassword)}`,
    '',
    `BACKEND_APP_ENV=${appEnv}`,
    'BACKEND_HOST=0.0.0.0',
    'BACKEND_PORT=8081',
    `BACKEND_CORS_ORIGIN=${quoteEnvValue(corsOrigin)}`,
    `BACKEND_PUBLIC_BASE_URL=https://${domain}`,
    'BACKEND_STORE_DRIVER=json',
    'BACKEND_STORE_FILE=/app/data/store.json',
    'BACKEND_STORE_BACKUP_DIRECTORY=/app/data/backups',
    'BACKEND_STORE_BACKUP_ON_SAVE=true',
    `BACKEND_STORE_BACKUP_RETENTION=${backupRetention}`,
    `BACKEND_POSTGRES_DATABASE_URL=${quoteEnvValue(postgresDatabaseUrl)}`,
    `BACKEND_POSTGRES_SSL=${postgresSsl}`,
    `BACKEND_POSTGRES_POOL_MAX=${postgresPoolMax}`,
    `BACKEND_POSTGRES_IDLE_TIMEOUT_MS=${postgresIdleTimeoutMs}`,
    `BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS=${postgresConnectionTimeoutMs}`,
    `BACKEND_POSTGRES_APPLICATION_NAME=${quoteEnvValue(postgresApplicationName)}`,
    `BACKEND_POSTGRES_ENABLE_SESSION_READS=${postgresEnableSessionReads}`,
    `BACKEND_POSTGRES_ENABLE_RUN_READS=${postgresEnableRunReads}`,
    `BACKEND_POSTGRES_ENABLE_FRIEND_READS=${postgresEnableFriendReads}`,
    `BACKEND_POSTGRES_ENABLE_LEAGUE_READS=${postgresEnableLeagueReads}`,
    'BACKEND_SESSION_TTL_HOURS=168',
    'BACKEND_MAX_BODY_SIZE_KB=256',
    'BACKEND_REQUEST_TIMEOUT_MS=30000',
    'BACKEND_HEADERS_TIMEOUT_MS=10000',
    'BACKEND_KEEP_ALIVE_TIMEOUT_MS=5000',
    'BACKEND_MAX_REQUESTS_PER_SOCKET=1000',
    'BACKEND_SHUTDOWN_TIMEOUT_MS=10000',
    `BACKEND_ADMIN_TOKEN=${quoteEnvValue(adminToken)}`,
    'BACKEND_ENABLE_ADMIN_STATUS=true',
    'BACKEND_ENABLE_RESET_ENDPOINT=false',
  ];

  return `${lines.join('\n')}\n`;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function validateBackendEnv(envFilePath, appEnv) {
  runCommand(process.execPath, [
    './backend/scripts/validate-env.mjs',
    '--env-file',
    envFilePath,
    '--env',
    appEnv,
  ]);
}

function deployDocker({ appEnv, envFilePath }) {
  runCommand('docker', [
    'compose',
    '-p',
    `runningground-${appEnv}`,
    '--env-file',
    envFilePath,
    '-f',
    './backend/compose.public.yaml',
    'up',
    '--build',
    '-d',
  ]);
}

function checkDomain(domain, expectedIp) {
  const args = [
    './scripts/check-public-backend-domain.mjs',
    '--domain',
    domain,
    '--skip-ports',
    '--skip-health',
  ];

  if (expectedIp) {
    args.push('--expected-ip', expectedIp);
  }

  runCommand(process.execPath, args);
}

async function waitForHealth(publicBaseUrl, timeoutMs = 120000) {
  const healthUrl = `${publicBaseUrl}/api/health`;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
      const payload = await response.json();

      if (response.ok && payload.status === 'ok') {
        return payload;
      }

      lastError = new Error(`health status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveDelay) => {
      setTimeout(resolveDelay, 2000);
    });
  }

  throw new Error(`public health check failed: ${lastError?.message ?? 'unknown error'}`);
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    return;
  }

  const appEnv = readArgValue('--env');
  const dryRun = hasFlag('--dry-run');

  if (!VALID_ENVS.has(appEnv)) {
    fail('--env must be preview or production.');
  }

  const domain = normalizeDomain(readArgValue('--domain'));
  const email = normalizeEmail(readArgValue('--email'));
  const expectedIp = readArgValue('--expected-ip');
  const publicBaseUrl = `https://${domain}`;
  const envFilePath = dryRun
    ? join(mkdtempSync(join(tmpdir(), 'runningground-backend-env-')), `.env.${appEnv}`)
    : resolve(projectRoot, readArgValue('--env-file') || `backend/.env.${appEnv}`);
  const existingEnv = dryRun ? {} : readEnvFile(envFilePath);
  const existingPostgresConnection = parsePostgresConnectionString(
    existingEnv.BACKEND_POSTGRES_DATABASE_URL || existingEnv.DATABASE_URL || '',
  );
  const adminToken = readArgValue('--admin-token')
    || existingEnv.BACKEND_ADMIN_TOKEN
    || `${appEnv}-admin-${randomBytes(24).toString('hex')}`;
  const explicitCorsOrigin = readArgValue('--cors-origin');
  const existingCorsOrigin = existingEnv.BACKEND_CORS_ORIGIN || '';
  const corsOrigin = explicitCorsOrigin
    || (existingCorsOrigin && existingCorsOrigin !== '*' ? existingCorsOrigin : '')
    || buildDefaultCorsOrigin(appEnv, domain);
  const backupRetention = existingEnv.BACKEND_STORE_BACKUP_RETENTION || (appEnv === 'production' ? '20' : '10');
  const postgresDb = existingEnv.POSTGRES_DB
    || existingPostgresConnection.database
    || `runningground_${appEnv}`;
  const postgresUser = existingEnv.POSTGRES_USER
    || existingPostgresConnection.username
    || 'runningground';
  const postgresPassword = existingEnv.POSTGRES_PASSWORD
    || existingPostgresConnection.password
    || `${appEnv}-postgres-${randomBytes(18).toString('hex')}`;
  const postgresDatabaseUrl = `postgres://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@postgres:5432/${postgresDb}`;
  const postgresSsl = existingEnv.BACKEND_POSTGRES_SSL || 'false';
  const postgresPoolMax = existingEnv.BACKEND_POSTGRES_POOL_MAX || '10';
  const postgresIdleTimeoutMs = existingEnv.BACKEND_POSTGRES_IDLE_TIMEOUT_MS || '30000';
  const postgresConnectionTimeoutMs = existingEnv.BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS || '10000';
  const postgresApplicationName = existingEnv.BACKEND_POSTGRES_APPLICATION_NAME || `runningground-backend-${appEnv}`;
  const postgresEnableSessionReads = existingEnv.BACKEND_POSTGRES_ENABLE_SESSION_READS || 'false';
  const postgresEnableRunReads = existingEnv.BACKEND_POSTGRES_ENABLE_RUN_READS || 'false';
  const postgresEnableFriendReads = existingEnv.BACKEND_POSTGRES_ENABLE_FRIEND_READS || 'false';
  const postgresEnableLeagueReads = existingEnv.BACKEND_POSTGRES_ENABLE_LEAGUE_READS || 'false';

  const envFileContents = buildEnvFileContents({
    appEnv,
    domain,
    email,
    adminToken,
    corsOrigin,
    backupRetention,
    postgresDb,
    postgresUser,
    postgresPassword,
    postgresDatabaseUrl,
    postgresSsl,
    postgresPoolMax,
    postgresIdleTimeoutMs,
    postgresConnectionTimeoutMs,
    postgresApplicationName,
    postgresEnableSessionReads,
    postgresEnableRunReads,
    postgresEnableFriendReads,
    postgresEnableLeagueReads,
  });

  writeFileSync(envFilePath, envFileContents, 'utf8');

  try {
    console.log(`[backend-deploy] env: ${appEnv}`);
    console.log(`[backend-deploy] public URL: ${publicBaseUrl}`);
    console.log(`[backend-deploy] env file: ${envFilePath}`);
    console.log('[backend-deploy] validating backend environment...');
    validateBackendEnv(envFilePath, appEnv);

    if (dryRun) {
      console.log('[backend-deploy] dry run complete');
      return;
    }

    if (!hasFlag('--skip-domain-check')) {
      console.log('[backend-deploy] checking public DNS before deploy...');
      checkDomain(domain, expectedIp);
    }

    if (!hasFlag('--skip-docker')) {
      console.log('[backend-deploy] starting Docker public stack...');
      deployDocker({ appEnv, envFilePath });
    }

    if (!hasFlag('--skip-health')) {
      console.log('[backend-deploy] waiting for public health...');
      const health = await waitForHealth(publicBaseUrl);
      console.log(`[backend-deploy] public backend ready: ${health.status}`);
    }

    if (hasFlag('--sync-eas-preview')) {
      console.log('[backend-deploy] syncing EAS preview app environment...');
      runCommand('npm', [
        'run',
        'preview:sync-eas-env',
        '--',
        '--api-base-url',
        `${publicBaseUrl}/api`,
      ]);
    }

    console.log('[backend-deploy] done');
  } finally {
    if (dryRun) {
      rmSync(resolve(envFilePath, '..'), { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`[backend-deploy] ${error.message}`);
  process.exitCode = 1;
});
