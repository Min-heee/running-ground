#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_BASE_URL = process.env.RUNNIGAPP_API_BASE_URL ?? 'http://localhost:8081/api';
const SUPPORTED_SOURCES = new Set(['apple_health', 'health_connect', 'garmin', 'strava', 'nrc']);

function printUsage() {
  console.log(`Usage:
  node ./scripts/provider-import.mjs --username <id> --password <pw> --source <sourceType> --file <payload.json> [--base-url <url>] [--queue-only] [--no-connect]

Options:
  --username     로그인 아이디
  --password     로그인 비밀번호
  --source       apple_health | health_connect | garmin | strava | nrc
  --file         가져올 기록 JSON 파일 경로
  --base-url     백엔드 API base url (default: ${DEFAULT_BASE_URL})
  --queue-only   import 큐 적재만 하고 sync는 하지 않음
  --no-connect   source connect 호출을 건너뜀

JSON file shape:
  [
    {
      "externalId": "health-001",
      "date": "2026-04-15",
      "distanceKm": 5.2,
      "pace": "05:31/km"
    }
  ]

or

  { "runs": [ ... ] }
`);
}

function parseArgs(argv) {
  const parsed = {
    baseUrl: DEFAULT_BASE_URL,
    queueOnly: false,
    connect: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--queue-only') {
      parsed.queueOnly = true;
      continue;
    }

    if (token === '--no-connect') {
      parsed.connect = false;
      continue;
    }

    const value = argv[index + 1];

    if (!value || value.startsWith('--')) {
      throw new Error(`${token} 옵션 값이 비어 있어.`);
    }

    if (token === '--username') {
      parsed.username = value;
      index += 1;
      continue;
    }

    if (token === '--password') {
      parsed.password = value;
      index += 1;
      continue;
    }

    if (token === '--source') {
      parsed.source = value;
      index += 1;
      continue;
    }

    if (token === '--file') {
      parsed.file = value;
      index += 1;
      continue;
    }

    if (token === '--base-url') {
      parsed.baseUrl = value;
      index += 1;
      continue;
    }

    throw new Error(`알 수 없는 옵션이야: ${token}`);
  }

  return parsed;
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl ?? '').trim().replace(/\/+$/, '');

  if (!trimmed) {
    throw new Error('base url이 비어 있어.');
  }

  return trimmed;
}

function readRunsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object' && Array.isArray(payload.runs)) {
    return payload.runs;
  }

  throw new Error('JSON 파일은 배열 또는 { runs: [...] } 형식이어야 해.');
}

async function requestJson(url, init, label) {
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${label} 실패: ${payload?.message ?? text}`);
  }

  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.username || !args.password || !args.source || !args.file) {
    printUsage();
    throw new Error('필수 옵션이 빠져 있어.');
  }

  if (!SUPPORTED_SOURCES.has(args.source)) {
    throw new Error(`지원하지 않는 sourceType이야: ${args.source}`);
  }

  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const filePath = resolve(process.cwd(), args.file);
  const rawFile = await readFile(filePath, 'utf8');
  const filePayload = JSON.parse(rawFile);
  const runs = readRunsPayload(filePayload);

  if (runs.length === 0) {
    throw new Error('가져올 기록이 한 건도 없어.');
  }

  const auth = await requestJson(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      username: String(args.username).trim().toLowerCase(),
      password: String(args.password),
    }),
  }, '로그인');
  const accessToken = auth.accessToken;

  if (args.connect) {
    const connectResult = await requestJson(`${baseUrl}/integrations/sources/${args.source}/connect`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }, '소스 연결');

    console.log(`[provider-import] ${connectResult.source.displayName} 연결 준비 완료`);
  }

  const queueResult = await requestJson(`${baseUrl}/integrations/sources/${args.source}/import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ runs }),
  }, 'import 큐 적재');

  console.log(`[provider-import] queued ${queueResult.queuedRuns} run(s), pending ${queueResult.pendingRuns}`);

  if (args.queueOnly) {
    return;
  }

  const syncResult = await requestJson(`${baseUrl}/integrations/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  }, '동기화');

  console.log(
    `[provider-import] synced sources=${syncResult.syncedSources} scanned=${syncResult.scannedRuns} imported=${syncResult.importedRuns} duplicate=${syncResult.duplicateRuns} at=${syncResult.lastSyncedAt}`,
  );
}

main().catch((error) => {
  console.error(`[provider-import] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
