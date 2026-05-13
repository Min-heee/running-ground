import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaultPreviewInfoPath = resolve(projectRoot, 'preview-public-info.json');
const defaultEnvPath = resolve(projectRoot, '.env');
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_EAS_PROJECT_ID = 'd57b0e4f-f084-4000-8ec7-188ee2561c52';
const DEFAULT_IOS_BUNDLE_ID = 'com.minheee.runnigapp';
const DEFAULT_ANDROID_PACKAGE = 'com.minheee.runnigapp';

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

function readJsonFile(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const result = {};
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

    result[key] = value;
  }

  return result;
}

function normalizeApiBaseUrl(rawValue) {
  const trimmedValue = rawValue?.trim();

  if (!trimmedValue) {
    return '';
  }

  const parsedUrl = new URL(trimmedValue);

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('preview TestFlight API 주소는 HTTPS 여야 합니다.');
  }

  parsedUrl.hash = '';
  parsedUrl.search = '';
  parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');

  if (!parsedUrl.pathname.endsWith('/api')) {
    parsedUrl.pathname = `${parsedUrl.pathname}/api`.replace(/\/+/g, '/');
  }

  return parsedUrl.toString().replace(/\/+$/, '');
}

function resolveApiBaseUrl() {
  const directApiBaseUrl = readArgValue('--api-base-url');

  if (directApiBaseUrl) {
    return normalizeApiBaseUrl(directApiBaseUrl);
  }

  const publicUrl = readArgValue('--public-url');

  if (publicUrl) {
    return normalizeApiBaseUrl(`${publicUrl.replace(/\/+$/, '')}/api`);
  }

  const previewInfoPath = resolve(projectRoot, readArgValue('--preview-info') || defaultPreviewInfoPath);
  const previewInfo = readJsonFile(previewInfoPath);

  if (previewInfo?.apiBaseUrl) {
    return normalizeApiBaseUrl(previewInfo.apiBaseUrl);
  }

  if (previewInfo?.publicUrl) {
    return normalizeApiBaseUrl(`${String(previewInfo.publicUrl).replace(/\/+$/, '')}/api`);
  }

  const envPath = resolve(projectRoot, readArgValue('--env-file') || defaultEnvPath);
  const env = readEnvFile(envPath);

  if (env.EXPO_PUBLIC_API_BASE_URL) {
    return normalizeApiBaseUrl(env.EXPO_PUBLIC_API_BASE_URL);
  }

  throw new Error(
    [
      'preview API 주소를 찾지 못했습니다.',
      '--api-base-url https://example.trycloudflare.com/api 를 넘기거나,',
      'preview-public-info.json 또는 .env 에 EXPO_PUBLIC_API_BASE_URL 을 준비해주세요.',
    ].join('\n'),
  );
}

async function waitForHealth(apiBaseUrl, timeoutMs) {
  const healthUrl = `${apiBaseUrl.replace(/\/+$/, '')}/health`;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
      const payload = await response.json();

      if (response.ok && payload.status === 'ok') {
        return payload;
      }

      lastError = new Error(`health status: ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 1000);
    });
  }

  throw new Error(`preview backend health check failed: ${lastError?.message ?? 'unknown error'}`);
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

function upsertEasEnv(name, value) {
  runCommand('npx', [
    'eas',
    'env:create',
    'preview',
    '--name',
    name,
    '--value',
    value,
    '--visibility',
    'plaintext',
    '--type',
    'string',
    '--force',
    '--non-interactive',
  ]);
}

async function main() {
  const apiBaseUrl = resolveApiBaseUrl();
  const timeoutMs = Number.parseInt(readArgValue('--timeout-ms') || `${DEFAULT_TIMEOUT_MS}`, 10);

  console.log(`[preview-sync] API base URL: ${apiBaseUrl}`);

  if (!hasFlag('--skip-health')) {
    console.log('[preview-sync] checking backend health...');
    const health = await waitForHealth(apiBaseUrl, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
    console.log(`[preview-sync] backend ready: ${health.status}`);
  }

  console.log('[preview-sync] updating EAS preview environment variables...');
  upsertEasEnv('EXPO_PUBLIC_API_BASE_URL', apiBaseUrl);
  upsertEasEnv('EXPO_PUBLIC_USE_MOCK_API', 'false');
  upsertEasEnv('EXPO_PUBLIC_API_TIMEOUT_MS', '10000');

  console.log('[preview-sync] validating TestFlight release environment...');
  runCommand('npx', [
    'eas',
    'env:exec',
    'preview',
    `APP_VARIANT=production IOS_BUNDLE_ID=${DEFAULT_IOS_BUNDLE_ID} ANDROID_PACKAGE=${DEFAULT_ANDROID_PACKAGE} EAS_PROJECT_ID=${DEFAULT_EAS_PROJECT_ID} node ./scripts/validate-release-env.mjs`,
    '--non-interactive',
  ]);

  console.log('[preview-sync] done');
}

main().catch((error) => {
  console.error(`[preview-sync] ${error.message}`);
  process.exitCode = 1;
});
