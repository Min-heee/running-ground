import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

// Pin a short tombstone TTL BEFORE any src module (config included) is loaded, so the
// in-process 410→TTL→404 test below can actually observe the expiry. Config clamps the
// TTL to a minimum of 1000ms. Everything under src/ is therefore dynamically imported.
process.env.BACKEND_VANISHED_MATCH_TOMBSTONE_TTL_MS = '1000';

const { createSeedStore } = await import('./seed.mjs');
const { buildGroupMatchResponse } = await import('./lib/matchResponseBuilders.mjs');
const { updateRunningMatchProgress } = await import('./lib/matchActionHandlers.mjs');
const { clearVanishedMatchTombstones } = await import('./lib/vanishedMatchTombstones.mjs');
const { MATCH_SESSION_ALL_DONE_RETENTION_MS } = await import('./lib/matchConstants.mjs');

const TEST_HOST = '127.0.0.1';
const REQUEST_TIMEOUT_MS = 5000;

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createRunner({ id, name, publicTag, districtName = '일산서구' }) {
  return {
    id,
    username: id,
    name,
    realName: name,
    publicTag,
    provinceName: '경기도',
    cityName: '고양시',
    districtName,
    connectedSources: [],
    notificationSettings: {
      friendAlerts: true,
      districtAlerts: true,
      marketAlerts: true,
    },
    createdAt: iso(-24 * 60 * 60 * 1000),
  };
}

function createRun({ id, userId, distanceKm = 5, pace = '06:20/km', startedAt = iso(-24 * 60 * 60 * 1000) }) {
  return {
    id,
    userId,
    date: startedAt.slice(0, 10),
    distanceKm,
    pace,
    source: 'RunningGround',
    sourceType: 'manual',
    startedAt,
    endedAt: iso(-24 * 60 * 60 * 1000 + 32 * 60 * 1000),
    durationSeconds: 32 * 60,
    createdAt: startedAt,
  };
}

function createSession(token, userId) {
  return {
    token,
    userId,
    createdAt: iso(-60 * 1000),
    expiresAt: iso(60 * 60 * 1000),
  };
}

function createSelectableMatchSlotStartAt() {
  const slot = new Date(Date.now() + 2 * 60 * 60 * 1000);
  slot.setMinutes(0, 0, 0);
  return slot.toISOString();
}

function createBaseStore() {
  const store = createSeedStore();
  store.users.push(createRunner({ id: 'runner-user', name: '러너', publicTag: 'runner' }));
  store.sessions.push(createSession('runner-token', 'runner-user'));
  store.runs.push(createRun({ id: 'runner-run-1', userId: 'runner-user', pace: '06:12/km' }));
  return store;
}

function createTestStoreFile(store) {
  const directory = mkdtempSync(join(tmpdir(), 'runningground-backend-match-integrity-'));
  const storeFile = join(directory, 'store.json');
  const backupDirectory = join(directory, 'backups');
  writeFileSync(storeFile, JSON.stringify(store, null, 2), 'utf8');

  return {
    directory,
    storeFile,
    backupDirectory,
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

async function waitForHealth(baseUrl) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < REQUEST_TIMEOUT_MS) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw lastError ?? new Error('backend did not become healthy');
}

async function withBackend(store, { env = {} } = {}, testFn) {
  const storeHandle = createTestStoreFile(store);
  const port = 19000 + Math.floor(Math.random() * 20000);
  const baseUrl = `http://${TEST_HOST}:${port}`;
  const child = spawn(process.execPath, ['./src/server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      BACKEND_APP_ENV: 'development',
      BACKEND_HOST: TEST_HOST,
      BACKEND_PORT: String(port),
      BACKEND_STORE_FILE: storeHandle.storeFile,
      BACKEND_STORE_BACKUP_DIRECTORY: storeHandle.backupDirectory,
      BACKEND_STORE_BACKUP_ON_SAVE: 'false',
      BACKEND_POSTGRES_DATABASE_URL: '',
      BACKEND_ENABLE_ADMIN_STATUS: 'false',
      BACKEND_ENABLE_RESET_ENDPOINT: 'false',
      BACKEND_PHONE_VERIFICATION_PROVIDER: 'mock',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = [];
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  try {
    await waitForHealth(baseUrl);
    await testFn({
      requestRaw: (token, method, path, body) => apiRequestRaw(baseUrl, token, method, path, body),
      readStore: () => JSON.parse(readFileSync(storeHandle.storeFile, 'utf8')),
    });
  } catch (error) {
    error.message = `${error.message}\nbackend output:\n${output.join('')}`;
    throw error;
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      once(child, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    if (!child.killed) {
      child.kill('SIGKILL');
    }
    storeHandle.cleanup();
  }
}

async function apiRequestRaw(baseUrl, token, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));

  return { response, payload };
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[matchIntegrityContract] ok - ${name}`);
  } catch (error) {
    console.error(`[matchIntegrityContract] failed - ${name}`);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 1. testMode intake gate — production config silently ignores the client flag.
// ---------------------------------------------------------------------------

await runTest('production config (ALLOW_TEST_MATCHES=false) silently ignores client testMode at every intake', async () => {
  await withBackend(createBaseStore(), { env: { BACKEND_ALLOW_TEST_MATCHES: 'false' } }, async ({ requestRaw, readStore }) => {
    const slotStartAt = createSelectableMatchSlotStartAt();

    // Duel request: testMode:true must NOT create an instant fake-opponent match —
    // and must NOT 400 (old clients may still send the flag). It runs the real flow.
    const duel = await requestRaw('runner-token', 'POST', '/api/running/matches/duel', {
      distanceKm: 5,
      slotStartAt,
      testMode: true,
    });
    assert.equal(duel.response.status, 200);
    assert.equal(duel.payload.matched, false);
    assert.notEqual(duel.payload.testMode, true);
    assert.notEqual(duel.payload.isTestMatch, true);

    // Status poll: the coerced-false flag reads the REAL queue (still searching).
    const status = await requestRaw('runner-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      testMode: true,
    });
    assert.equal(status.response.status, 200);
    // Real queue answer (waiting) — NOT an instantly-matched test session.
    assert.equal(['matched', 'active'].includes(status.payload.state), false);
    assert.notEqual(status.payload.isTestMatch, true);

    // Cancel: testMode:true is ignored and the real queue entry is removed — 200, no error.
    const cancel = await requestRaw('runner-token', 'POST', '/api/running/matches/cancel', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      testMode: true,
    });
    assert.equal(cancel.response.status, 200);
    assert.equal(cancel.payload.success, true);

    // Group request: same gate.
    const group = await requestRaw('runner-token', 'POST', '/api/running/matches/group', {
      distanceKm: 5,
      slotStartAt,
      testMode: true,
    });
    assert.equal(group.response.status, 200);
    assert.equal(group.payload.matched, false);
    assert.notEqual(group.payload.isTestMatch, true);

    // Nothing test-flavored may have been persisted: no bot sessions, no testMode queue entries.
    const persistedStore = readStore();
    const sessions = Array.isArray(persistedStore.matchSessions) ? persistedStore.matchSessions : [];
    assert.equal(sessions.length, 0, 'no fake-opponent session may be created');
    assert.equal(JSON.stringify(persistedStore).includes('"isTestMatch":true'), false);
    assert.equal(JSON.stringify(persistedStore).includes('"testMode":true'), false);
  });
});

await runTest('non-production default still honors testMode (dev regression guard)', async () => {
  await withBackend(createBaseStore(), {}, async ({ requestRaw, readStore }) => {
    const duel = await requestRaw('runner-token', 'POST', '/api/running/matches/duel', {
      distanceKm: 5,
      testMode: true,
    });
    assert.equal(duel.response.status, 200);
    assert.equal(duel.payload.matched, true);
    assert.equal(duel.payload.isTestMatch, true);

    const persistedStore = readStore();
    const sessions = Array.isArray(persistedStore.matchSessions) ? persistedStore.matchSessions : [];
    assert.equal(sessions.some((session) => session.isTestMatch === true), true);
  });
});

// ---------------------------------------------------------------------------
// 2. Test matches never award rank LP (and never re-award on retry) +
// 3. Pruned match → 410 { code: 'match_gone' } → (after TTL) 404.
//    In-process against the store layer so the prune→tombstone→TTL sequence is
//    driven deterministically (the tombstone map is process-local by design).
// ---------------------------------------------------------------------------

await runTest('finished test match awards ZERO rank LP, marks lpApplied, and the vanished matchId answers 410 then 404 after TTL', async () => {
  clearVanishedMatchTombstones();

  const store = createBaseStore();
  const user = store.users.find((entry) => entry.id === 'runner-user');

  // Create the test group session through the canonical path (bots = profileSnapshot
  // participants) — this is exactly the flow the audit flagged: the group LP loop used
  // to look bots up as store users, throw, and re-award the real user's LP on retry.
  const created = buildGroupMatchResponse(store, user, {
    distanceKm: 5,
    slotStartAt: new Date().toISOString(),
    testMode: true,
  });
  assert.equal(created.isTestMatch, true);

  const session = store.matchSessions.find((entry) => entry.isTestMatch === true && entry.mode === 'group');
  assert.ok(session, 'test group session must exist');
  const matchId = session.id;

  // Pull the slot into the past so the session hydrates 'active', and finish every bot
  // so the real user's finishing push completes the whole match in one call.
  session.slotStartAt = iso(-60 * 1000);
  session.startedAt = iso(-50 * 1000);
  for (const participant of session.participants) {
    if (participant.profileSnapshot) {
      participant.liveStatus = 'finished';
      participant.liveUpdatedAt = iso(-5 * 1000);
      participant.liveDistanceKm = 5;
      participant.liveElapsedSeconds = 1500;
      participant.finishedAt = iso(-5 * 1000);
      participant.finishElapsedSeconds = 1500;
    }
  }

  const rankStateBefore = JSON.stringify(user.rankState ?? null);
  const progressArgs = {
    matchId,
    distanceKm: 5,
    elapsedSeconds: 1400,
    currentPace: '06:00/km',
    status: 'finished',
  };

  const finishResponse = updateRunningMatchProgress(store, user, progressArgs);
  assert.equal(finishResponse.success, true);

  // Zero LP: rankState untouched, lpApplied sealed so no retry can ever re-enter the
  // LP path, and no rank_change notification was emitted.
  assert.equal(JSON.stringify(user.rankState ?? null), rankStateBefore, 'test match must not move rank LP');
  assert.equal(session.lpApplied, true, 'lpApplied must be sealed for test matches');
  const rankChangeNotifications = (store.notifications ?? []).filter((entry) => entry.type === 'rank_change');
  assert.equal(rankChangeNotifications.length, 0, 'no rank LP notification for a test match');

  // POST-FINISH RETENTION (2026-07-09): the all-done session is now RETAINED for the echo
  // window instead of being pruned on the finishing push — this is the fix for the mid-run
  // solo-demotion incident (a device whose finish landed but whose response timed out must
  // still be able to poll the matchId and receive its terminal status). A retry within the
  // window therefore gets a normal (idempotent) response, NOT the terminal 410.
  const retainedSession = store.matchSessions.find((entry) => entry.id === matchId);
  assert.ok(retainedSession, 'the all-done session is retained for the echo window');
  const retryWithinWindow = updateRunningMatchProgress(store, user, progressArgs);
  assert.equal(retryWithinWindow.success, true, 'a retry within the retention window is idempotent, not 410');
  assert.equal(JSON.stringify(user.rankState ?? null), rankStateBefore, 'the retry still awards no LP');

  // Age every participant's done stamps past the retention window: the NEXT lookup's prune
  // now drops + tombstones the session (the retention only defers, never cancels).
  const pastWindowIso = iso(-(MATCH_SESSION_ALL_DONE_RETENTION_MS + 60 * 1000));
  for (const participant of retainedSession.participants) {
    participant.liveUpdatedAt = pastWindowIso;
    if (participant.finishedAt) {
      participant.finishedAt = pastWindowIso;
    }
    if (participant.forfeitedAt) {
      participant.forfeitedAt = pastWindowIso;
    }
  }

  // Retrying now (the stranded-device loop, past the window) prunes+tombstones on entry and
  // answers the terminal 410.
  assert.throws(
    () => updateRunningMatchProgress(store, user, progressArgs),
    (error) => error.statusCode === 410
      && error.details?.code === 'match_gone'
      && JSON.stringify(user.rankState ?? null) === rankStateBefore,
    'past-window match must answer 410 match_gone (and still award no LP)',
  );

  // After the TTL (pinned to 1000ms at the top of this file) the tombstone expires and
  // the endpoint falls back to the plain 404 — the same answer a server restart gives.
  await delay(1200);
  assert.throws(
    () => updateRunningMatchProgress(store, user, progressArgs),
    (error) => error.statusCode === 404,
    'expired tombstone must fall back to 404',
  );
});

console.log('[matchIntegrityContract] all tests passed');
