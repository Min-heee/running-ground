import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  npm run preview:smoke
  npm run preview:smoke -- --api-base-url https://preview.example.com/api
  npm run preview:smoke -- --admin-token preview-admin-xxxx

Options:
  --api-base-url <url>   Preview API base URL. Defaults to preview-public-info.json or .env.
  --admin-token <token>  Optional admin token for /api/admin/status verification.
  --username <value>     Smoke user username. Defaults to preview-smoke-user.
  --password <value>     Smoke user password. Defaults to change-this-preview-smoke-password
  --require-admin        Fail when admin token is missing or admin status is unhealthy.
  --timeout-ms <number>  Request timeout in milliseconds. Defaults to 10000.
  --help                 Show this message.
`.trim();
}

function fail(message) {
  console.error(`[preview-smoke] ${message}`);
  process.exit(1);
}

function logStep(message) {
  console.log(`[preview-smoke] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

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

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
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

function normalizeApiBaseUrl(value) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    return '';
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    fail('api base url must start with http:// or https://');
  }

  const normalized = trimmed.replace(/\/+$/, '');
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

function withTrailingApiBase(value) {
  const normalized = normalizeApiBaseUrl(value);

  if (!normalized) {
    fail('preview api base url could not be resolved.');
  }

  return normalized;
}

function createRequestHeaders(accessToken) {
  return {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function requestJson(apiBaseUrl, pathname, {
  method = 'GET',
  headers = {},
  body,
  expectedStatuses = [200],
  timeoutMs = 10000,
} = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  const allowedStatuses = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];

  if (!allowedStatuses.includes(response.status)) {
    throw new Error(`${method} ${pathname} failed with ${response.status}: ${payload?.message ?? text}`);
  }

  return {
    status: response.status,
    payload,
  };
}

function buildSmokeUserProfile() {
  return {
    nickname: '프리뷰스모크',
    realName: '프리뷰 스모크',
    phone: '01012345678',
    provinceName: '서울특별시',
    cityName: '',
    districtName: '강남구',
    universityName: '러닝앱대학교',
    addressDetail: '프리뷰 테스트',
    birthDate: '1998-01-01',
  };
}

async function ensurePreviewUser(apiBaseUrl, {
  username,
  password,
  timeoutMs,
}) {
  const availability = await requestJson(
    apiBaseUrl,
    `/auth/check-username?username=${encodeURIComponent(username)}`,
    { timeoutMs },
  );

  if (availability.payload.available) {
    const registerPayload = {
      username,
      password,
      ...buildSmokeUserProfile(),
    };
    const registered = await requestJson(apiBaseUrl, '/auth/register', {
      method: 'POST',
      timeoutMs,
      expectedStatuses: [201],
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registerPayload),
    });

    return {
      accessToken: registered.payload.accessToken,
      user: registered.payload.user,
      created: true,
    };
  }

  const loggedIn = await requestJson(apiBaseUrl, '/auth/login', {
    method: 'POST',
    timeoutMs,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  return {
    accessToken: loggedIn.payload.accessToken,
    user: loggedIn.payload.user,
    created: false,
  };
}

function buildManualRunInput() {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 1);

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');

  return {
    date: `${year}-${month}-${day}`,
    distanceKm: 5.0,
    pace: '05:40/km',
  };
}

function getRunId(payload) {
  return payload?.run?.id ?? payload?.id ?? '';
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    return;
  }

  const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const envFilePath = resolve(projectRoot, '.env');
  const previewInfoPath = resolve(projectRoot, 'preview-public-info.json');
  loadEnvFile(envFilePath);

  const previewInfo = readJsonFile(previewInfoPath);
  const timeoutMs = Number.parseInt(readArgValue('--timeout-ms') || '10000', 10);
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;
  const username = readArgValue('--username') || 'preview-smoke-user';
  const password = readArgValue('--password') || 'change-this-preview-smoke-password';
  const apiBaseUrl = withTrailingApiBase(
    readArgValue('--api-base-url')
    || previewInfo?.apiBaseUrl
    || process.env.EXPO_PUBLIC_API_BASE_URL
    || '',
  );
  const adminToken = readArgValue('--admin-token') || previewInfo?.adminToken || process.env.PREVIEW_ADMIN_TOKEN || '';

  logStep(`api base url: ${apiBaseUrl}`);
  logStep(`smoke user: ${username}`);

  const health = await requestJson(apiBaseUrl, '/health', { timeoutMs: safeTimeoutMs });
  assert(health.payload.status === 'ok', 'public health status is not ok.');
  assert(health.payload.ready === true, 'public health ready flag is missing.');
  logStep(`public health ok (${health.payload.environment ?? 'unknown'})`);

  if (adminToken) {
    const adminStatus = await requestJson(apiBaseUrl, '/admin/status', {
      timeoutMs: safeTimeoutMs,
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(adminStatus.payload.status === 'ok', 'admin status response is not ok.');
    logStep(`admin status ok (users=${adminStatus.payload.counts?.users ?? 'n/a'}, runs=${adminStatus.payload.counts?.runs ?? 'n/a'})`);
  } else if (hasFlag('--require-admin')) {
    fail('admin token is required but was not provided.');
  } else {
    logStep('admin token not provided, skipping admin status check');
  }

  const session = await ensurePreviewUser(apiBaseUrl, {
    username,
    password,
    timeoutMs: safeTimeoutMs,
  });
  const accessToken = session.accessToken;
  assert(typeof accessToken === 'string' && accessToken.length > 10, 'access token is missing after auth.');
  logStep(session.created ? 'preview smoke user registered' : 'preview smoke user logged in');

  const authHeaders = createRequestHeaders(accessToken);

  const profile = await requestJson(apiBaseUrl, '/me/profile', {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
  });
  assert(typeof profile.payload.name === 'string' && profile.payload.name.length > 0, 'profile name is missing.');

  const homeSummary = await requestJson(apiBaseUrl, '/home/summary', {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
  });
  assert(Number.isFinite(homeSummary.payload.totalDistanceKm), 'home summary total distance is invalid.');

  const myActivity = await requestJson(apiBaseUrl, '/me/activity', {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
  });
  assert(Array.isArray(myActivity.payload.runs), 'my activity runs payload is invalid.');

  let latestRun = await requestJson(apiBaseUrl, '/runs/latest', {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
    expectedStatuses: [200, 404],
  });

  if (latestRun.status === 404) {
    logStep('latest run missing, creating one manual run for smoke coverage');
    const createdRun = await requestJson(apiBaseUrl, '/runs/manual', {
      method: 'POST',
      timeoutMs: safeTimeoutMs,
      expectedStatuses: [201],
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildManualRunInput()),
    });
    assert(createdRun.payload.run?.id, 'manual run creation did not return a run id.');

    latestRun = await requestJson(apiBaseUrl, '/runs/latest', {
      timeoutMs: safeTimeoutMs,
      headers: authHeaders,
    });
  }

  const latestRunId = getRunId(latestRun.payload);
  assert(latestRunId, 'latest run payload is missing an id.');

  const runDetail = await requestJson(apiBaseUrl, `/runs/${latestRunId}`, {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
  });
  assert(getRunId(runDetail.payload) === latestRunId, 'run detail did not return the requested run.');

  const leaderboard = await requestJson(apiBaseUrl, '/friends/leaderboard', {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
  });
  assert(Array.isArray(leaderboard.payload.ranks), 'friends leaderboard ranks payload is invalid.');

  const regionLeague = await requestJson(apiBaseUrl, '/league/regions', {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
  });
  assert(regionLeague.payload.currentNode?.id, 'region league current node is missing.');
  assert(Array.isArray(regionLeague.payload.children), 'region league children payload is invalid.');

  const universityLeague = await requestJson(apiBaseUrl, '/league/universities', {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
  });
  assert(Array.isArray(universityLeague.payload.ranks), 'university league ranks payload is invalid.');

  const marketOverview = await requestJson(apiBaseUrl, '/market/overview', {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
  });
  assert(Array.isArray(marketOverview.payload.items), 'market overview items payload is invalid.');

  const offlineRaceHub = await requestJson(apiBaseUrl, '/offline-races/hub', {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
  });
  assert(Array.isArray(offlineRaceHub.payload.upcomingEvents), 'offline race hub upcoming events payload is invalid.');
  assert(Array.isArray(offlineRaceHub.payload.guideSteps), 'offline race hub guide steps payload is invalid.');

  const integrationSources = await requestJson(apiBaseUrl, '/integrations/sources', {
    timeoutMs: safeTimeoutMs,
    headers: authHeaders,
  });
  assert(Array.isArray(integrationSources.payload.sources), 'integration sources payload is invalid.');

  console.log('');
  console.log('[preview-smoke] summary');
  console.log(`[preview-smoke] publicBaseUrl: ${health.payload.publicBaseUrl ?? apiBaseUrl.replace(/\/api$/, '')}`);
  console.log(`[preview-smoke] environment: ${health.payload.environment ?? 'unknown'}`);
  console.log(`[preview-smoke] user: ${profile.payload.name} (${username})`);
  console.log(`[preview-smoke] latestRunId: ${latestRunId}`);
  console.log(`[preview-smoke] leaderboardRanks: ${leaderboard.payload.ranks.length}`);
  console.log(`[preview-smoke] regionChildren: ${regionLeague.payload.children.length}`);
  console.log(`[preview-smoke] universityRanks: ${universityLeague.payload.ranks.length}`);
  console.log(`[preview-smoke] marketItems: ${marketOverview.payload.items.length}`);
  console.log(`[preview-smoke] upcomingRaces: ${offlineRaceHub.payload.upcomingEvents.length}`);
  console.log(`[preview-smoke] integrationSources: ${integrationSources.payload.sources.length}`);
  console.log('[preview-smoke] all public preview checks passed');
}

main().catch((error) => {
  console.error(`[preview-smoke] ${error.message}`);
  process.exitCode = 1;
});
