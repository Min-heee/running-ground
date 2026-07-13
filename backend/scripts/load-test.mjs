#!/usr/bin/env node
// Concurrent-match capacity load test for the RunningGround backend.
//
// Boots the REAL server as a child process in postgres whole-store mode (the production
// architecture: every mutation is a serialized read-modify-write of ONE jsonb row under
// SELECT ... FOR UPDATE), registers real users through the phone-OTP flow, creates real
// duel/group matches through the party-run room seam (the same HTTP flow the contract
// test drives), then replays the live-match client traffic shape:
//
//   - per runner: one progress POST every --progress-interval-ms (default 2.5s, matching
//     the app's live-match upload cadence), OPEN-LOOP — ticks fire on schedule whether or
//     not the previous response has returned, which is how real phones behave and what
//     exposes queue collapse (closed-loop drivers self-throttle and hide the knee).
//   - an idle read population: --idle-pollers users each doing a GET read every
//     --idle-poll-interval-ms (default 15s, matching reservation-room polling).
//
// The ladder (--steps, default 5,10,20,40,80 concurrent duels = 10..160 active runners)
// runs in ONE server process against ONE store row, fresh users per step. Per step it
// reports client-side p50/p95/p99/max latency + error/timeout counts per endpoint class,
// api-process CPU%/RSS, postgres CPU%, pg lock-wait counts, and app_store row size.
//
// SAFETY: this harness only ever talks to 127.0.0.1 — it refuses to start against any
// non-loopback database or backend host.
//
// Usage (from backend/):
//   node scripts/load-test.mjs --pg-url postgres://loadtest@127.0.0.1:15433/runningground_loadtest
// See docs/load-test.md for the full local-postgres setup recipe and flag reference.

import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import pg from 'pg';

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, '..');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      flags[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      flags[arg.slice(2)] = 'true';
    }
  }
  return flags;
}

const flags = parseFlags(process.argv.slice(2));

function flagNumber(name, defaultValue) {
  const raw = flags[name];
  const parsed = Number(raw);
  return raw !== undefined && Number.isFinite(parsed) ? parsed : defaultValue;
}

function flagString(name, defaultValue) {
  return typeof flags[name] === 'string' && flags[name] ? flags[name] : defaultValue;
}

const config = {
  pgUrl: flagString('pg-url', 'postgres://loadtest@127.0.0.1:15433/runningground_loadtest'),
  port: flagNumber('port', 18091),
  steps: flagString('steps', '5,10,20,40,80').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0),
  stepSeconds: flagNumber('step-seconds', 75),
  progressIntervalMs: flagNumber('progress-interval-ms', 2500),
  idlePollers: flagNumber('idle-pollers', 20),
  idlePollIntervalMs: flagNumber('idle-poll-interval-ms', 15000),
  groupMatches: flagNumber('group-matches', 0),
  groupSize: flagNumber('group-size', 5),
  fillerRunsPerUser: flagNumber('filler-runs-per-user', 8),
  requestTimeoutMs: flagNumber('request-timeout-ms', 10000),
  setupConcurrency: flagNumber('setup-concurrency', 8),
  pgPoolMax: flagNumber('pg-pool-max', 10),
  matchDistanceKm: flagNumber('match-distance-km', 5),
  out: flagString('out', join(process.cwd(), 'loadtest-results.md')),
  keepData: flags['keep-data'] === 'true',
};

// ---------------------------------------------------------------------------
// Safety gate: LOCAL ONLY. This harness must never touch production.
// ---------------------------------------------------------------------------

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const FORBIDDEN_FRAGMENTS = ['running-ground.com', '<SERVER_IP>'];

function assertLocalOnly() {
  for (const fragment of FORBIDDEN_FRAGMENTS) {
    if (config.pgUrl.includes(fragment)) {
      throw new Error(`SAFETY: --pg-url points at production (${fragment}). Refusing to run.`);
    }
  }
  const parsed = new URL(config.pgUrl);
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`SAFETY: --pg-url host must be loopback, got '${parsed.hostname}'. Refusing to run.`);
  }
}

assertLocalOnly();

const TEST_HOST = '127.0.0.1';
const baseUrl = `http://${TEST_HOST}:${config.port}`;

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function log(message) {
  console.log(`[load-test] ${new Date().toISOString().slice(11, 19)} ${message}`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) {
    return null;
  }
  const index = Math.min(sortedValues.length - 1, Math.ceil((p / 100) * sortedValues.length) - 1);
  return sortedValues[Math.max(0, index)];
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

function formatPaceLabel(secondsPerKm) {
  const total = Math.round(secondsPerKm);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}/km`;
}

// ---------------------------------------------------------------------------
// Latency recorder (per endpoint class, reset per ladder step)
// ---------------------------------------------------------------------------

function createRecorder() {
  const classes = new Map();
  return {
    record(className, ms, errorKind) {
      let bucket = classes.get(className);
      if (!bucket) {
        bucket = { latencies: [], errors: new Map(), count: 0 };
        classes.set(className, bucket);
      }
      bucket.count += 1;
      if (errorKind) {
        bucket.errors.set(errorKind, (bucket.errors.get(errorKind) ?? 0) + 1);
      } else {
        bucket.latencies.push(ms);
      }
    },
    summarize() {
      const summary = {};
      for (const [className, bucket] of classes) {
        const sorted = [...bucket.latencies].sort((a, b) => a - b);
        summary[className] = {
          count: bucket.count,
          okCount: sorted.length,
          errorCount: bucket.count - sorted.length,
          errors: Object.fromEntries(bucket.errors),
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          p99: percentile(sorted, 99),
          max: sorted.length ? sorted[sorted.length - 1] : null,
        };
      }
      return summary;
    },
  };
}

let activeRecorder = createRecorder();

// ---------------------------------------------------------------------------
// HTTP client (per-request timeout; records into the active recorder)
// ---------------------------------------------------------------------------

async function apiRequest(className, token, method, path, body, { expectOk = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({}));
    const elapsed = performance.now() - startedAt;
    const ok = response.status >= 200 && response.status < 300;
    activeRecorder.record(className, elapsed, ok ? null : `http_${response.status}`);
    if (expectOk && !ok) {
      throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
    }
    return { ok, status: response.status, payload };
  } catch (error) {
    const elapsed = performance.now() - startedAt;
    if (error?.message?.startsWith(`${method} ${path}`)) {
      throw error; // already recorded above
    }
    const kind = controller.signal.aborted ? 'timeout' : 'network';
    activeRecorder.record(className, elapsed, kind);
    if (expectOk) {
      throw new Error(`${method} ${path} failed (${kind}): ${error?.message ?? error}`);
    }
    return { ok: false, status: 0, payload: null, errorKind: kind };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Database helpers (schema apply, reset, row-size + lock-wait sampling)
// ---------------------------------------------------------------------------

const dbPool = new pg.Pool({ connectionString: config.pgUrl, max: 3 });

async function ensureSchema() {
  const schemaSql = readFileSync(join(backendDirectory, 'db', 'schema.sql'), 'utf8');
  await dbPool.query(schemaSql);
}

async function resetData() {
  // Fresh canonical store: the adapter re-seeds app_store row 1 on first load.
  await dbPool.query('truncate app_store, run_routes, app_metadata');
}

async function queryStoreRowBytes() {
  const result = await dbPool.query('select pg_column_size(data) as bytes from app_store where id = 1');
  return result.rows[0]?.bytes ?? 0;
}

async function queryPgActivity() {
  const result = await dbPool.query(`
    select
      count(*) filter (where wait_event_type = 'Lock') as lock_waits,
      count(*) filter (where state = 'active') as active
    from pg_stat_activity
    where datname = current_database()
  `);
  return {
    lockWaits: Number(result.rows[0]?.lock_waits ?? 0),
    active: Number(result.rows[0]?.active ?? 0),
  };
}

async function findPostmasterPid() {
  const result = await dbPool.query("select pid from pg_stat_activity where backend_type = 'checkpointer' limit 1");
  const checkpointerPid = result.rows[0]?.pid;
  if (!checkpointerPid) {
    return null;
  }
  const { stdout } = await execFileAsync('ps', ['-o', 'ppid=', '-p', String(checkpointerPid)]);
  const postmasterPid = Number(stdout.trim());
  return Number.isInteger(postmasterPid) && postmasterPid > 1 ? postmasterPid : null;
}

async function sampleProcess(pid) {
  try {
    const { stdout } = await execFileAsync('ps', ['-o', '%cpu=,rss=', '-p', String(pid)]);
    const [cpu, rss] = stdout.trim().split(/\s+/).map(Number);
    return { cpu: cpu || 0, rssMb: (rss || 0) / 1024 };
  } catch {
    return { cpu: 0, rssMb: 0 };
  }
}

async function samplePostgresTree(postmasterPid) {
  if (!postmasterPid) {
    return { cpu: 0, rssMb: 0 };
  }
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,%cpu=,rss=']);
    let cpu = 0;
    let rssKb = 0;
    for (const line of stdout.split('\n')) {
      const [pid, ppid, pcpu, rss] = line.trim().split(/\s+/).map(Number);
      if (pid === postmasterPid || ppid === postmasterPid) {
        cpu += pcpu || 0;
        rssKb += rss || 0;
      }
    }
    return { cpu, rssMb: rssKb / 1024 };
  } catch {
    return { cpu: 0, rssMb: 0 };
  }
}

// ---------------------------------------------------------------------------
// Backend server child process (contract-test boot pattern)
// ---------------------------------------------------------------------------

let serverChild = null;
const serverOutput = [];

async function bootServer() {
  serverChild = spawn(process.execPath, ['./src/server.mjs'], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      BACKEND_APP_ENV: 'development',
      BACKEND_HOST: TEST_HOST,
      BACKEND_PORT: String(config.port),
      BACKEND_STORE_DRIVER: 'postgres',
      BACKEND_POSTGRES_DATABASE_URL: config.pgUrl,
      BACKEND_POSTGRES_POOL_MAX: String(config.pgPoolMax),
      BACKEND_POSTGRES_SSL: 'false',
      BACKEND_STORE_BACKUP_ON_SAVE: 'false',
      BACKEND_ENABLE_ADMIN_STATUS: 'false',
      BACKEND_ENABLE_RESET_ENDPOINT: 'false',
      BACKEND_PHONE_VERIFICATION_PROVIDER: 'mock',
      // The load driver sends every request from 127.0.0.1, so per-IP abuse guards
      // (SMS/login) would fire long before any real capacity limit. Production sees
      // distinct device IPs, so lifting these locally keeps the test about capacity.
      BACKEND_SMS_PER_IP_PER_HOUR: '1000000',
      BACKEND_SMS_UNIQUE_PHONES_PER_IP_PER_DAY: '1000000',
      BACKEND_SMS_PER_PHONE_PER_DAY: '1000000',
      BACKEND_SMS_GLOBAL_PER_DAY: '10000000',
      BACKEND_LOGIN_PER_IP_PER_MINUTE: '1000000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverChild.stdout.on('data', (chunk) => {
    serverOutput.push(String(chunk));
    if (serverOutput.length > 400) {
      serverOutput.shift();
    }
  });
  serverChild.stderr.on('data', (chunk) => {
    serverOutput.push(String(chunk));
    if (serverOutput.length > 400) {
      serverOutput.shift();
    }
  });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }
    await sleep(150);
  }
  throw new Error(`backend did not become healthy.\n${serverOutput.join('')}`);
}

async function stopServer() {
  if (!serverChild) {
    return;
  }
  serverChild.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => serverChild.once('exit', resolveExit)),
    sleep(4000),
  ]);
  if (serverChild.exitCode === null) {
    serverChild.kill('SIGKILL');
  }
}

// ---------------------------------------------------------------------------
// User registration (real phone-OTP register flow, mock SMS provider)
// ---------------------------------------------------------------------------

async function registerUser(index) {
  const phone = `010${String(20000000 + index)}`;
  const username = `lt-user-${String(index).padStart(4, '0')}`;

  const requested = await apiRequest('setup', null, 'POST', '/api/auth/phone/request-code', {
    purpose: 'signup',
    phone,
  }, { expectOk: true });
  const verified = await apiRequest('setup', null, 'POST', '/api/auth/phone/verify-code', {
    purpose: 'signup',
    requestId: requested.payload.requestId,
    code: requested.payload.testCode,
  }, { expectOk: true });
  const registered = await apiRequest('setup', null, 'POST', '/api/auth/register', {
    username,
    password: 'loadtest-pw1',
    nickname: `부하러너${index}`,
    realName: `부하러너${index}`,
    phone,
    phoneVerificationToken: verified.payload.verifiedToken,
    provinceName: '서울특별시',
    cityName: '',
    districtName: '강남구',
    addressDetail: '로드테스트로 1',
    birthDate: '1995-01-01',
  }, { expectOk: true });

  return {
    index,
    username,
    token: registered.payload.accessToken,
    userId: registered.payload.user?.id ?? username,
  };
}

async function seedFillerRuns(user, runCount) {
  for (let i = 0; i < runCount; i += 1) {
    const daysAgo = 1 + (i % 60);
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const paceSeconds = 320 + ((user.index * 7 + i * 13) % 120);
    await apiRequest('setup', user.token, 'POST', '/api/runs/manual', {
      date,
      distanceKm: Number((3 + ((user.index + i) % 8)).toFixed(1)),
      pace: formatPaceLabel(paceSeconds),
    }, { expectOk: true });
  }
}

// ---------------------------------------------------------------------------
// Match creation via the party-run room seam (identical to the contract test)
// ---------------------------------------------------------------------------

async function createRoomMatch(members, mode) {
  const [host, ...guests] = members;
  const created = await apiRequest('setup', host.token, 'POST', '/api/running/rooms', {
    mode,
    distanceKm: config.matchDistanceKm,
    startMode: 'host',
    maxParticipants: members.length,
  }, { expectOk: true });
  const { roomId, inviteToken } = created.payload.room;

  for (const guest of guests) {
    await apiRequest('setup', guest.token, 'POST', '/api/running/rooms/join', { inviteToken }, { expectOk: true });
    await apiRequest('setup', guest.token, 'POST', '/api/running/rooms/ready', { roomId, ready: true }, { expectOk: true });
  }

  const started = await apiRequest('setup', host.token, 'POST', '/api/running/rooms/start', { roomId }, { expectOk: true });
  const matchId = started.payload.room.linkedMatchId;
  const slotStartAt = started.payload.room.linkedMatchSlotStartAt ?? started.payload.room.slotStartAt;

  for (const guest of guests) {
    await apiRequest('setup', guest.token, 'POST', '/api/running/rooms/countdown-ready', { roomId }, { expectOk: true });
  }

  return { matchId, roomId, slotStartAt, members, mode };
}

// ---------------------------------------------------------------------------
// Open-loop traffic drivers
// ---------------------------------------------------------------------------

function startRunnerLoop(runner, match, timers) {
  const paceSecondsPerKm = 330 + Math.random() * 90; // 5:30 - 7:00 /km
  const paceLabel = formatPaceLabel(paceSecondsPerKm);
  const slotMs = new Date(match.slotStartAt).getTime();

  const tick = () => {
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - slotMs) / 1000));
    const distanceKm = Math.max(0.005, Number((elapsedSeconds / paceSecondsPerKm).toFixed(3)));
    // Fire-and-forget: OPEN LOOP. Never await inside the interval.
    apiRequest('progress', runner.token, 'POST', '/api/running/matches/progress', {
      matchId: match.matchId,
      distanceKm,
      elapsedSeconds,
      currentPace: paceLabel,
      status: 'running',
    });
  };

  const phase = Math.random() * config.progressIntervalMs;
  timers.push(setTimeout(() => {
    tick();
    timers.push(setInterval(tick, config.progressIntervalMs));
  }, phase));
}

function startIdlePollerLoop(user, timers) {
  const tick = () => {
    apiRequest('idle_poll', user.token, 'GET', '/api/home/summary');
  };
  const phase = Math.random() * config.idlePollIntervalMs;
  timers.push(setTimeout(() => {
    tick();
    timers.push(setInterval(tick, config.idlePollIntervalMs));
  }, phase));
}

function startHealthProbe(timers) {
  timers.push(setInterval(() => {
    apiRequest('health', null, 'GET', '/api/health');
  }, 2000));
}

function stopTimers(timers) {
  for (const timer of timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  timers.length = 0;
}

// ---------------------------------------------------------------------------
// Resource sampler (api child CPU/RSS, postgres tree CPU, pg lock waits)
// ---------------------------------------------------------------------------

function startSampler(postmasterPid, samples, timers) {
  timers.push(setInterval(async () => {
    try {
      const [api, pgTree, activity] = await Promise.all([
        sampleProcess(serverChild.pid),
        samplePostgresTree(postmasterPid),
        queryPgActivity(),
      ]);
      samples.push({
        at: Date.now(),
        apiCpu: api.cpu,
        apiRssMb: api.rssMb,
        pgCpu: pgTree.cpu,
        pgRssMb: pgTree.rssMb,
        pgLockWaits: activity.lockWaits,
        pgActive: activity.active,
      });
    } catch {
      // sampling must never break the run
    }
  }, 2000));
}

function summarizeSamples(samples) {
  if (!samples.length) {
    return null;
  }
  const avg = (key) => samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
  const max = (key) => Math.max(...samples.map((s) => s[key]));
  return {
    apiCpuAvg: avg('apiCpu'),
    apiCpuMax: max('apiCpu'),
    apiRssMbMax: max('apiRssMb'),
    pgCpuAvg: avg('pgCpu'),
    pgCpuMax: max('pgCpu'),
    pgLockWaitsAvg: avg('pgLockWaits'),
    pgLockWaitsMax: max('pgLockWaits'),
    pgActiveMax: max('pgActive'),
  };
}

// ---------------------------------------------------------------------------
// Ladder step
// ---------------------------------------------------------------------------

async function runStep({ duels, users, idleUsers, postmasterPid }) {
  const stepLabel = `${duels} duels (${duels * 2} runners)` + (config.groupMatches
    ? ` + ${config.groupMatches} group x${config.groupSize}`
    : '');
  log(`step ${stepLabel}: creating matches...`);

  const storeBytesStart = await queryStoreRowBytes();

  // Build match member groups: 2 users per duel, then groupSize users per group match.
  const matchPlans = [];
  let cursor = 0;
  for (let i = 0; i < duels; i += 1) {
    matchPlans.push({ mode: 'duel', members: users.slice(cursor, cursor + 2) });
    cursor += 2;
  }
  for (let i = 0; i < config.groupMatches; i += 1) {
    matchPlans.push({ mode: 'group', members: users.slice(cursor, cursor + config.groupSize) });
    cursor += config.groupSize;
  }

  const matches = await runPool(matchPlans, 4, (plan) => createRoomMatch(plan.members, plan.mode));
  const latestSlotMs = Math.max(...matches.map((m) => new Date(m.slotStartAt).getTime()));
  const waitMs = Math.max(0, latestSlotMs - Date.now() + 1500);
  log(`step ${stepLabel}: ${matches.length} matches created, waiting ${(waitMs / 1000).toFixed(1)}s for slots to open...`);
  await sleep(waitMs);

  // Steady state: fresh recorder + samples, open-loop drivers.
  activeRecorder = createRecorder();
  const samples = [];
  const timers = [];
  startSampler(postmasterPid, samples, timers);
  startHealthProbe(timers);
  for (const match of matches) {
    for (const member of match.members) {
      startRunnerLoop(member, match, timers);
    }
  }
  for (const idleUser of idleUsers) {
    startIdlePollerLoop(idleUser, timers);
  }

  log(`step ${stepLabel}: steady state for ${config.stepSeconds}s...`);
  await sleep(config.stepSeconds * 1000);
  stopTimers(timers);

  // Drain: let every in-flight request complete or hit its timeout so the step's
  // stats include the stragglers instead of silently dropping them.
  await sleep(config.requestTimeoutMs + 500);

  const summary = activeRecorder.summarize();
  const resourceSummary = summarizeSamples(samples);
  const storeBytesEnd = await queryStoreRowBytes();

  // Teardown: forfeit + clear room state so later steps don't inherit live sessions.
  activeRecorder = createRecorder();
  const allRunners = matches.flatMap((m) => m.members.map((member) => ({ member, matchId: m.matchId })));
  await runPool(allRunners, config.setupConcurrency, async ({ member, matchId }) => {
    await apiRequest('teardown', member.token, 'POST', '/api/running/matches/leave', { matchId });
    await apiRequest('teardown', member.token, 'POST', '/api/running/rooms/force-reset', {});
  });

  return {
    duels,
    runners: matchPlans.reduce((sum, plan) => sum + plan.members.length, 0),
    matches: matches.length,
    stepSeconds: config.stepSeconds,
    latency: summary,
    resources: resourceSummary,
    storeBytesStart,
    storeBytesEnd,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function formatMs(value) {
  return value === null || value === undefined ? '-' : `${value.toFixed(0)}ms`;
}

function buildReport(stepResults, environment) {
  const lines = [];
  lines.push('# RunningGround backend load test — concurrent-match capacity ladder');
  lines.push('');
  lines.push(`- Date: ${new Date().toISOString()}`);
  lines.push(`- Machine: ${environment.cpu}, ${environment.memGb}GB RAM (${environment.ncpu} cores) — NOTE: much faster than the production droplet; absolute numbers WILL be worse in production, the shape (knee location ordering, saturating resource) transfers.`);
  lines.push(`- Store driver: postgres whole-store jsonb row (BACKEND_STORE_DRIVER=postgres), pool max ${config.pgPoolMax}`);
  lines.push(`- Traffic model: per runner 1 progress POST / ${config.progressIntervalMs}ms (open-loop), ${config.idlePollers} idle pollers @ ${config.idlePollIntervalMs}ms GET /api/home/summary, health probe @ 2s`);
  lines.push(`- Filler runs per user: ${config.fillerRunsPerUser}; match distance ${config.matchDistanceKm}km; step steady state ${config.stepSeconds}s`);
  lines.push('');
  lines.push('## Progress POST latency per step (the live-match hot path)');
  lines.push('');
  lines.push('| duels | runners | req total | ok | errors | p50 | p95 | p99 | max | api CPU avg/max % | pg CPU avg/max % | pg lock waits avg/max | store row start→end |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const step of stepResults) {
    const p = step.latency.progress ?? { count: 0, okCount: 0, errorCount: 0, p50: null, p95: null, p99: null, max: null, errors: {} };
    const r = step.resources ?? {};
    const errorLabel = p.errorCount ? `${p.errorCount} (${Object.entries(p.errors).map(([k, v]) => `${k}:${v}`).join(' ')})` : '0';
    lines.push(`| ${step.duels} | ${step.runners} | ${p.count} | ${p.okCount} | ${errorLabel} | ${formatMs(p.p50)} | ${formatMs(p.p95)} | ${formatMs(p.p99)} | ${formatMs(p.max)} | ${r.apiCpuAvg?.toFixed(0) ?? '-'} / ${r.apiCpuMax?.toFixed(0) ?? '-'} | ${r.pgCpuAvg?.toFixed(0) ?? '-'} / ${r.pgCpuMax?.toFixed(0) ?? '-'} | ${r.pgLockWaitsAvg?.toFixed(1) ?? '-'} / ${r.pgLockWaitsMax ?? '-'} | ${(step.storeBytesStart / 1024).toFixed(0)}KB → ${(step.storeBytesEnd / 1024).toFixed(0)}KB |`);
  }
  lines.push('');
  lines.push('## Secondary endpoint classes per step');
  lines.push('');
  lines.push('| duels | idle-poll p50/p95/max | idle-poll err | health p50/p95/max | health err | api RSS max |');
  lines.push('|---|---|---|---|---|---|');
  for (const step of stepResults) {
    const i = step.latency.idle_poll ?? {};
    const h = step.latency.health ?? {};
    lines.push(`| ${step.duels} | ${formatMs(i.p50)} / ${formatMs(i.p95)} / ${formatMs(i.max)} | ${i.errorCount ?? 0} | ${formatMs(h.p50)} / ${formatMs(h.p95)} / ${formatMs(h.max)} | ${h.errorCount ?? 0} | ${step.resources?.apiRssMbMax?.toFixed(0) ?? '-'}MB |`);
  }
  lines.push('');

  const knee = stepResults.find((step) => {
    const p = step.latency.progress;
    return p && (p.errorCount > 0 || (p.p95 !== null && p.p95 > 1000));
  });
  lines.push('## Knee');
  lines.push('');
  lines.push(knee
    ? `First step where progress p95 exceeded 1s or errors appeared: **${knee.duels} concurrent duels (${knee.runners} active runners)**.`
    : `No step crossed the 1s p95 / error threshold up to ${stepResults[stepResults.length - 1]?.duels ?? '?'} concurrent duels on this machine.`);
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const totalRunnersNeeded = config.steps.reduce(
    (sum, duels) => sum + duels * 2 + config.groupMatches * config.groupSize,
    0,
  );
  const totalUsers = totalRunnersNeeded + config.idlePollers;

  log(`plan: steps=[${config.steps.join(', ')}] duels, +${config.groupMatches} group x${config.groupSize} per step, ${config.idlePollers} idle pollers -> ${totalUsers} users total`);
  log(`pg: ${config.pgUrl}`);
  log(`api: ${baseUrl} (child process)`);

  await ensureSchema();
  if (!config.keepData) {
    await resetData();
    log('database reset (app_store/run_routes/app_metadata truncated)');
  }

  await bootServer();
  log(`backend up (pid ${serverChild.pid})`);
  const postmasterPid = await findPostmasterPid();
  log(`postgres postmaster pid: ${postmasterPid ?? 'unknown (pg CPU sampling disabled)'}`);

  // Phase 1: register everyone through the real OTP register flow.
  const registerStarted = performance.now();
  const userIndices = Array.from({ length: totalUsers }, (_, i) => i);
  const users = await runPool(userIndices, config.setupConcurrency, registerUser);
  log(`registered ${users.length} users in ${((performance.now() - registerStarted) / 1000).toFixed(1)}s`);

  // Phase 2: filler runs so the store row is production-shaped, not trivially small.
  if (config.fillerRunsPerUser > 0) {
    const fillerStarted = performance.now();
    await runPool(users, config.setupConcurrency, (user) => seedFillerRuns(user, config.fillerRunsPerUser));
    log(`seeded ${users.length * config.fillerRunsPerUser} filler runs in ${((performance.now() - fillerStarted) / 1000).toFixed(1)}s`);
  }
  log(`store row size after seeding: ${((await queryStoreRowBytes()) / 1024).toFixed(0)}KB`);

  const idleUsers = users.slice(0, config.idlePollers);
  let nextRunnerIndex = config.idlePollers;

  // Phase 3: the ladder. Fresh users per step so leftover per-user match state from a
  // collapsed step can never block the next step's room creation.
  const stepResults = [];
  for (const duels of config.steps) {
    const needed = duels * 2 + config.groupMatches * config.groupSize;
    const stepUsers = users.slice(nextRunnerIndex, nextRunnerIndex + needed);
    nextRunnerIndex += needed;
    if (stepUsers.length < needed) {
      log(`SKIPPING step ${duels}: only ${stepUsers.length}/${needed} users available`);
      continue;
    }
    const result = await runStep({ duels, users: stepUsers, idleUsers, postmasterPid });
    stepResults.push(result);
    const p = result.latency.progress ?? {};
    log(`step ${duels} done: progress p50=${formatMs(p.p50)} p95=${formatMs(p.p95)} p99=${formatMs(p.p99)} errors=${p.errorCount ?? 0} | api CPU avg ${result.resources?.apiCpuAvg?.toFixed(0)}% pg CPU avg ${result.resources?.pgCpuAvg?.toFixed(0)}%`);
    await sleep(3000);
  }

  // Phase 4: report.
  const cpu = (await execFileAsync('sysctl', ['-n', 'machdep.cpu.brand_string'])).stdout.trim();
  const memBytes = Number((await execFileAsync('sysctl', ['-n', 'hw.memsize'])).stdout.trim());
  const ncpu = (await execFileAsync('sysctl', ['-n', 'hw.ncpu'])).stdout.trim();
  const environment = { cpu, memGb: Math.round(memBytes / 1024 ** 3), ncpu };
  const report = buildReport(stepResults, environment);
  writeFileSync(config.out, report, 'utf8');
  writeFileSync(config.out.replace(/\.md$/, '.json'), JSON.stringify({ config, environment, stepResults }, null, 2), 'utf8');
  log(`report written: ${config.out}`);
  console.log(`\n${report}`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  console.error('[load-test] FAILED:', error);
  const tail = serverOutput.slice(-40).join('');
  if (tail) {
    console.error('[load-test] last backend output:\n' + tail);
  }
} finally {
  await stopServer();
  await dbPool.end().catch(() => {});
  process.exit(exitCode);
}
