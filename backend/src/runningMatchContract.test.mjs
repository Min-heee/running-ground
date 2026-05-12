import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createSeedStore } from './seed.mjs';

const TEST_HOST = '127.0.0.1';
const REQUEST_TIMEOUT_MS = 5000;

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createRunner({
  id,
  name,
  publicTag,
  districtName = '일산서구',
}) {
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

function createRun({
  id,
  userId,
  distanceKm = 5,
  pace = '06:20/km',
  startedAt = iso(-24 * 60 * 60 * 1000),
}) {
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
  store.users.push(
    createRunner({ id: 'host-user', name: '방장 러너', publicTag: 'host' }),
    createRunner({ id: 'guest-user', name: '참가 러너', publicTag: 'guest', districtName: '일산동구' }),
  );
  store.sessions.push(
    createSession('host-token', 'host-user'),
    createSession('guest-token', 'guest-user'),
  );
  store.runs.push(
    createRun({ id: 'host-run-1', userId: 'host-user', pace: '06:12/km' }),
    createRun({ id: 'guest-run-1', userId: 'guest-user', pace: '06:25/km' }),
  );

  return store;
}

function createActiveDuelStore() {
  const store = createBaseStore();
  const slotStartAt = createSelectableMatchSlotStartAt();
  const startedAt = iso(-120 * 1000);

  store.matchSessions.push({
    id: 'duel-contract-match',
    mode: 'duel',
    isTestMatch: false,
    distanceKm: 5,
    slotStartAt,
    startedAt,
    createdAt: iso(-180 * 1000),
    matchedAt: iso(-180 * 1000),
    participants: [
      {
        userId: 'host-user',
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'ready',
        liveDistanceKm: 0,
        liveElapsedSeconds: 0,
        livePace: '--:--/km',
        liveUpdatedAt: null,
        finishedAt: null,
      },
      {
        userId: 'guest-user',
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'ready',
        liveDistanceKm: 0,
        liveElapsedSeconds: 0,
        livePace: '--:--/km',
        liveUpdatedAt: null,
        finishedAt: null,
      },
    ],
  });

  return { store, slotStartAt };
}

function createTestStoreFile(store) {
  const directory = mkdtempSync(join(tmpdir(), 'runningground-backend-contract-'));
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

async function withBackend(store, testFn) {
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = [];
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  try {
    await waitForHealth(baseUrl);
    await testFn({
      request: (token, method, path, body) => apiRequest(baseUrl, token, method, path, body),
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

async function apiRequest(baseUrl, token, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[runningMatchContract] ok - ${name}`);
  } catch (error) {
    console.error(`[runningMatchContract] failed - ${name}`);
    throw error;
  }
}

await runTest('party run room start creates a linked match and accepts countdown readiness', async () => {
  await withBackend(createBaseStore(), async ({ request }) => {
    const created = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'duel',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 2,
    });
    assert.equal(created.success, true);
    assert.equal(created.room.mode, 'duel');
    assert.equal(created.room.canStart, false);
    assert.equal(created.room.participants.length, 1);

    const joined = await request('guest-token', 'POST', '/api/running/rooms/join', {
      inviteToken: created.room.inviteToken,
    });
    assert.equal(joined.room.participants.length, 2);
    assert.equal(joined.room.isHost, false);

    await request('guest-token', 'POST', '/api/running/rooms/ready', {
      roomId: created.room.roomId,
      ready: true,
    });

    const hostRoomBeforeStart = await request('host-token', 'GET', '/api/running/rooms/my');
    assert.equal(hostRoomBeforeStart.room.canStart, true);

    const started = await request('host-token', 'POST', '/api/running/rooms/start', {
      roomId: created.room.roomId,
    });
    assert.equal(started.room.linkedMatchId.length > 0, true);
    assert.equal(started.room.countdownReadyCount, 1);
    assert.equal(started.room.countdownReadyRequiredCount, 2);
    assert.equal(started.room.participants.find((participant) => participant.userId === 'host-user').isCountdownReady, true);
    assert.equal(started.room.participants.find((participant) => participant.userId === 'guest-user').isCountdownReady, false);

    const guestReady = await request('guest-token', 'POST', '/api/running/rooms/countdown-ready', {
      roomId: created.room.roomId,
    });
    assert.equal(guestReady.room.linkedMatchId, started.room.linkedMatchId);
    assert.equal(guestReady.room.countdownReadyCount, 2);
    assert.equal(guestReady.room.participants.every((participant) => participant.isCountdownReady), true);

    const hostSynced = await request('host-token', 'GET', '/api/running/rooms/my');
    assert.equal(hostSynced.room.linkedMatchId, started.room.linkedMatchId);
    assert.equal(hostSynced.room.countdownReadyCount, 2);
    assert.equal(['countdown', 'arming'].includes(hostSynced.room.state), true);
  });
});

await runTest('match progress uploads feed official comparison and forfeit state', async () => {
  const { store, slotStartAt } = createActiveDuelStore();

  await withBackend(store, async ({ request }) => {
    const hostProgress = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.4,
      elapsedSeconds: 120,
      currentPace: '05:00/km',
      status: 'running',
    });
    assert.equal(hostProgress.matchId, 'duel-contract-match');
    assert.equal(hostProgress.currentUserLiveStatus, 'running');

    const guestProgress = await request('guest-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.3,
      elapsedSeconds: 120,
      currentPace: '06:40/km',
      status: 'running',
    });
    assert.equal(guestProgress.currentUserLiveStatus, 'running');

    const hostStatus = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(hostStatus.state, 'active');
    assert.equal(hostStatus.opponent.id, 'guest-user');
    assert.equal(hostStatus.opponent.liveStatus, 'running');
    assert.equal(hostStatus.opponent.liveDistanceKm, 0.3);
    assert.equal(hostStatus.officialComparison.participantCount, 2);
    assert.equal(hostStatus.officialComparison.readyParticipantCount, 2);
    assert.equal(hostStatus.officialComparison.userRank, 1);
    assert.equal(hostStatus.officialComparison.userDistanceKm, 0.4);
    assert.equal(hostStatus.officialComparison.leaderUserId, 'host-user');

    const forfeitResult = await request('guest-token', 'POST', '/api/running/matches/leave', {
      matchId: 'duel-contract-match',
    });
    assert.equal(forfeitResult.success, true);

    const afterForfeit = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(afterForfeit.opponent.liveStatus, 'forfeited');
    assert.equal(afterForfeit.currentUserLiveStatus, 'running');
  });
});

await runTest('duel forfeit flow persists both match results and exposes them in activity records', async () => {
  const { store, slotStartAt } = createActiveDuelStore();

  await withBackend(store, async ({ request }) => {
    await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.42,
      elapsedSeconds: 150,
      currentPace: '05:57/km',
      status: 'running',
    });

    await request('guest-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.35,
      elapsedSeconds: 150,
      currentPace: '07:08/km',
      status: 'running',
    });

    const forfeitResult = await request('guest-token', 'POST', '/api/running/matches/leave', {
      matchId: 'duel-contract-match',
    });
    assert.equal(forfeitResult.success, true);

    const hostStatus = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(hostStatus.opponent.id, 'guest-user');
    assert.equal(hostStatus.opponent.liveStatus, 'forfeited');
    assert.equal(hostStatus.currentUserLiveStatus, 'running');

    const guestStartedAt = iso(-9 * 60 * 1000);
    const guestEndedAt = iso(-7 * 60 * 1000);
    const guestSaved = await request('guest-token', 'POST', '/api/runs/tracked', {
      date: guestStartedAt.slice(0, 10),
      distanceKm: 0.35,
      pace: '07:08/km',
      durationSeconds: 150,
      startedAt: guestStartedAt,
      endedAt: guestEndedAt,
      route: [
        { latitude: 37.658, longitude: 126.77, timestamp: guestStartedAt },
        { latitude: 37.661, longitude: 126.773, timestamp: guestEndedAt },
      ],
      matchResult: {
        mode: 'duel',
        title: '기권으로 대결을 마쳤어요',
        summary: '내 기록은 저장되고 대결 전적은 기권 패로 남아요.',
        badgeLabel: '기권 패',
        opponentName: '방장 러너',
        resultTone: 'lose',
        gapKm: 0.07,
        comparedDistanceKm: 0.35,
      },
    });
    assert.equal(guestSaved.run.matchResult.badgeLabel, '기권 패');
    assert.equal(guestSaved.pointBreakdown.matchBonusPoints, 10);

    const hostStartedAt = iso(-9 * 60 * 1000);
    const hostEndedAt = iso(-7 * 60 * 1000);
    const hostSaved = await request('host-token', 'POST', '/api/runs/tracked', {
      date: hostStartedAt.slice(0, 10),
      distanceKm: 0.42,
      pace: '05:57/km',
      durationSeconds: 150,
      startedAt: hostStartedAt,
      endedAt: hostEndedAt,
      route: [
        { latitude: 37.668, longitude: 126.78, timestamp: hostStartedAt },
        { latitude: 37.672, longitude: 126.784, timestamp: hostEndedAt },
      ],
      matchResult: {
        mode: 'duel',
        title: '상대 기권으로 승리했어요',
        summary: '상대가 기권해서 내 전적은 승리로 저장돼요.',
        badgeLabel: '상대 기권 승',
        opponentName: '참가 러너',
        resultTone: 'win',
        gapKm: 0.07,
        comparedDistanceKm: 0.42,
      },
    });
    assert.equal(hostSaved.run.matchResult.badgeLabel, '상대 기권 승');
    assert.equal(hostSaved.pointBreakdown.matchBonusPoints, 20);

    const guestActivity = await request('guest-token', 'GET', '/api/me/activity');
    const guestRecord = guestActivity.runs.find((run) => run.id === guestSaved.run.id);
    assert.equal(guestRecord.matchResult.mode, 'duel');
    assert.equal(guestRecord.matchResult.resultTone, 'lose');
    assert.equal(guestRecord.matchResult.badgeLabel, '기권 패');
    assert.equal(guestRecord.matchResult.opponentName, '방장 러너');

    const hostActivity = await request('host-token', 'GET', '/api/me/activity');
    const hostRecord = hostActivity.runs.find((run) => run.id === hostSaved.run.id);
    assert.equal(hostRecord.matchResult.mode, 'duel');
    assert.equal(hostRecord.matchResult.resultTone, 'win');
    assert.equal(hostRecord.matchResult.badgeLabel, '상대 기권 승');
    assert.equal(hostRecord.matchResult.opponentName, '참가 러너');
  });
});

await runTest('tracked run API persists match result records and match bonus points', async () => {
  await withBackend(createBaseStore(), async ({ request }) => {
    const startedAt = iso(-10 * 60 * 1000);
    const endedAt = iso(-1 * 60 * 1000);
    const saved = await request('host-token', 'POST', '/api/runs/tracked', {
      date: startedAt.slice(0, 10),
      distanceKm: 1.2,
      pace: '08:20/km',
      durationSeconds: 600,
      cadenceSpm: 160,
      elevationGainM: 5,
      startedAt,
      endedAt,
      route: [
        {
          latitude: 37.658,
          longitude: 126.77,
          accuracyM: 8,
          timestamp: startedAt,
        },
        {
          latitude: 37.668,
          longitude: 126.78,
          accuracyM: 8,
          timestamp: endedAt,
        },
      ],
      matchResult: {
        mode: 'duel',
        title: '기권으로 대결을 마쳤어요',
        summary: '전적은 기권 패로 남아요.',
        badgeLabel: '기권 패',
        opponentName: '참가 러너',
        resultTone: 'lose',
        gapKm: 0.3,
        comparedDistanceKm: 0.9,
      },
    });

    assert.equal(saved.run.matchResult.mode, 'duel');
    assert.equal(saved.run.matchResult.badgeLabel, '기권 패');
    assert.equal(saved.run.matchResult.resultTone, 'lose');
    assert.equal(saved.run.matchResult.comparedDistanceKm, 0.9);
    assert.equal(saved.pointBreakdown.matchBonusPoints, 10);
  });
});
