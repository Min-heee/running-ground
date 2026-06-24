import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createSeedStore } from './seed.mjs';
import {
  MATCH_ROOM_HOST_LOADING_SECONDS,
  MATCH_ROOM_HOST_MAX_LOADING_WAIT_SECONDS,
  MATCH_ROOM_HOST_START_DELAY_SECONDS,
} from './lib/matchConstants.mjs';

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

function addLinkedDuelRoom(store, {
  roomId = 'duel-linked-room',
  matchId = 'duel-contract-match',
  slotStartAt,
} = {}) {
  store.matchRooms.push({
    id: roomId,
    inviteToken: 'LINKED1',
    hostUserId: 'host-user',
    mode: 'duel',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt,
    linkedMatchId: matchId,
    linkedMatchStatus: 'active',
    linkedMatchDistanceKm: 5,
    linkedMatchSlotStartAt: slotStartAt,
    createdAt: iso(-180 * 1000),
    updatedAt: iso(-120 * 1000),
    invitedFriendIds: [],
    participants: [
      {
        userId: 'host-user',
        name: '방장 러너',
        tag: 'host',
        districtName: '일산서구',
        averagePace: '06:12/km',
        levelLabel: 'Lv.1',
        isHost: true,
        isReady: true,
        isCountdownReady: true,
        invited: false,
        joinedAt: iso(-180 * 1000),
      },
      {
        userId: 'guest-user',
        name: '참가 러너',
        tag: 'guest',
        districtName: '일산동구',
        averagePace: '06:25/km',
        levelLabel: 'Lv.1',
        isHost: false,
        isReady: true,
        isCountdownReady: true,
        invited: false,
        joinedAt: iso(-180 * 1000),
      },
    ],
  });
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

async function apiRequest(baseUrl, token, method, path, body) {
  const { response, payload } = await apiRequestRaw(baseUrl, token, method, path, body);

  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
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
    const startedSlotStartAtMs = new Date(started.room.linkedMatchSlotStartAt).getTime();
    const startedSlotLeadMs = startedSlotStartAtMs - Date.now();
    assert.equal(started.room.linkedMatchId.length > 0, true);
    assert.equal(started.room.linkedMatchSlotStartAt, started.room.slotStartAt);
    assert.equal(started.room.state, 'arming');
    assert.ok(startedSlotLeadMs > (MATCH_ROOM_HOST_START_DELAY_SECONDS + MATCH_ROOM_HOST_LOADING_SECONDS) * 1000);
    assert.ok(startedSlotLeadMs <= (MATCH_ROOM_HOST_START_DELAY_SECONDS + MATCH_ROOM_HOST_MAX_LOADING_WAIT_SECONDS + 1) * 1000);
    assert.equal(started.room.countdownReadyCount, 1);
    assert.equal(started.room.countdownReadyRequiredCount, 2);
    assert.equal(started.room.participants.find((participant) => participant.userId === 'host-user').isCountdownReady, true);
    assert.equal(started.room.participants.find((participant) => participant.userId === 'guest-user').isCountdownReady, false);

    const guestReady = await request('guest-token', 'POST', '/api/running/rooms/countdown-ready', {
      roomId: created.room.roomId,
    });
    assert.equal(guestReady.room.linkedMatchId, started.room.linkedMatchId);
    // Arming must NOT move the shared start time: the host has no room-update channel
    // once linkedMatchId is set, so a rewritten slot would leave the two devices
    // counting down against different slots (a variable gap of however long the last
    // ack took). The slot agreed at start is kept.
    assert.equal(guestReady.room.slotStartAt, started.room.slotStartAt);
    assert.equal(guestReady.room.linkedMatchSlotStartAt, guestReady.room.slotStartAt);
    const armedSlotStartAtMs = new Date(guestReady.room.linkedMatchSlotStartAt).getTime();
    const armedSlotLeadMs = armedSlotStartAtMs - Date.now();
    assert.ok(armedSlotLeadMs > MATCH_ROOM_HOST_START_DELAY_SECONDS * 1000);
    assert.ok(armedSlotLeadMs <= (MATCH_ROOM_HOST_START_DELAY_SECONDS + MATCH_ROOM_HOST_MAX_LOADING_WAIT_SECONDS + 1) * 1000);
    assert.equal(guestReady.room.state, 'arming');
    assert.equal(guestReady.room.countdownReadyCount, 2);
    assert.equal(guestReady.room.participants.every((participant) => participant.isCountdownReady), true);

    const hostSynced = await request('host-token', 'GET', '/api/running/rooms/my');
    assert.equal(hostSynced.room.linkedMatchId, started.room.linkedMatchId);
    assert.equal(hostSynced.room.countdownReadyCount, 2);
    assert.equal(hostSynced.room.linkedMatchSlotStartAt, guestReady.room.linkedMatchSlotStartAt);
    assert.equal(hostSynced.room.state, 'arming');
  });
});

await runTest('group party run room never seats fewer than the group minimum', async () => {
  await withBackend(createBaseStore(), async ({ request }) => {
    // Simulates a stale duel value of 2 leaking into the group create payload
    // (the original bug). The backend safety net must clamp the cap up so the
    // group room can hold more than two runners.
    const staleDuelValueRoom = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'group',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 2,
    });
    assert.equal(staleDuelValueRoom.room.mode, 'group');
    assert.equal(staleDuelValueRoom.room.maxParticipants > 2, true);
    assert.equal(staleDuelValueRoom.room.minParticipants > 2, true);
  });

  await withBackend(createBaseStore(), async ({ request }) => {
    // A sensible explicit group size is preserved, and a missing value falls
    // back to the default capacity (never 2).
    const explicitSizeRoom = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'group',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 12,
    });
    assert.equal(explicitSizeRoom.room.maxParticipants, 12);

    const guest = await request('guest-token', 'POST', '/api/running/rooms/join', {
      inviteToken: explicitSizeRoom.room.inviteToken,
    });
    assert.equal(guest.room.participants.length, 2);
    assert.equal(guest.room.participants.length < explicitSizeRoom.room.maxParticipants, true);
  });
});

await runTest('party run room invite creates a recipient notification', async () => {
  const store = createBaseStore();
  store.friendships.push({
    id: 'friendship-host-guest',
    userIds: ['host-user', 'guest-user'],
    createdAt: iso(-60 * 1000),
  });

  await withBackend(store, async ({ request, readStore }) => {
    await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'duel',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 2,
      invitedFriendIds: ['guest-user'],
    });
    const persisted = readStore();
    const notification = persisted.notifications.find((item) => item.userId === 'guest-user' && item.type === 'match_invite');

    assert.equal(Boolean(notification), true);
    assert.equal(notification.data.mode, 'duel');
    assert.equal(typeof notification.data.roomId, 'string');
    assert.equal(typeof notification.data.inviteToken, 'string');
  });
});

await runTest('stale room cleanup detaches finished participant before new room creation', async () => {
  const store = createBaseStore();
  const slotStartAt = iso(-60 * 1000);
  const hostUser = store.users.find((user) => user.id === 'host-user');
  hostUser.activeRoomId = 'missing-room';
  store.liveRunShares = [
    {
      userId: 'host-user',
      enabled: true,
      status: 'idle',
      updatedAt: iso(-30 * 1000),
    },
  ];
  store.matchSessions.push({
    id: 'linked-active-duel',
    mode: 'duel',
    isTestMatch: false,
    distanceKm: 5,
    slotStartAt,
    startedAt: iso(-60 * 1000),
    createdAt: iso(-120 * 1000),
    matchedAt: iso(-120 * 1000),
    participants: [
      {
        userId: 'host-user',
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1800,
        livePace: '06:00/km',
        liveUpdatedAt: iso(-20 * 1000),
        finishedAt: iso(-10 * 1000),
      },
      {
        userId: 'guest-user',
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 3,
        liveElapsedSeconds: 1200,
        livePace: '06:40/km',
        liveUpdatedAt: iso(-10 * 1000),
        finishedAt: null,
      },
    ],
  });
  store.matchRooms.push({
    id: 'stale-linked-room',
    inviteToken: 'STALE1',
    hostUserId: 'host-user',
    mode: 'duel',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt,
    maxParticipants: 2,
    minParticipants: 2,
    invitedFriendIds: [],
    participants: [
      {
        userId: 'host-user',
        isHost: true,
        isReady: false,
        isCountdownReady: true,
        invited: false,
        joinedAt: iso(-120 * 1000),
      },
      {
        userId: 'guest-user',
        isHost: false,
        isReady: true,
        isCountdownReady: true,
        invited: false,
        joinedAt: iso(-110 * 1000),
      },
    ],
    createdAt: iso(-120 * 1000),
    linkedMatchId: 'linked-active-duel',
  });

  await withBackend(store, async ({ request }) => {
    const cleanup = await request('host-token', 'POST', '/api/running/rooms/cleanup-stale', {});
    assert.equal(cleanup.success, true);
    assert.equal(cleanup.cleaned, true);
    assert.equal(cleanup.room, null);
    assert.equal(cleanup.cleanedItems.includes('matchRooms.detachedDoneParticipant'), true);
    assert.equal(cleanup.cleanedItems.includes('user.activeRoomId'), true);
    assert.equal(cleanup.cleanedItems.includes('liveRunShares.currentUser'), true);

    const created = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'duel',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 2,
    });
    assert.equal(created.success, true);
    assert.equal(created.room.mode, 'duel');
    assert.equal(created.room.hostUserId, 'host-user');

    const guestRoom = await request('guest-token', 'GET', '/api/running/rooms/my');
    assert.equal(guestRoom.room.roomId, 'stale-linked-room');
    assert.equal(guestRoom.room.hostUserId, 'guest-user');
  });
});

await runTest('stale active room reference is cleaned before room creation', async () => {
  const store = createBaseStore();
  const hostUser = store.users.find((user) => user.id === 'host-user');
  hostUser.activeRoomId = 'missing-room';
  hostUser.activeMatchRoomId = 'missing-room';

  await withBackend(store, async ({ request }) => {
    const cleanup = await request('host-token', 'POST', '/api/running/rooms/cleanup-stale', {});
    assert.equal(cleanup.success, true);
    assert.equal(cleanup.cleaned, true);
    assert.equal(cleanup.blocker, undefined);
    assert.equal(cleanup.cleanedItems.includes('user.activeRoomId'), true);
    assert.equal(cleanup.cleanedItems.includes('user.activeMatchRoomId'), true);

    const created = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'duel',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 2,
    });
    assert.equal(created.success, true);
    assert.equal(created.room.mode, 'duel');
    assert.equal(created.room.hostUserId, 'host-user');
  });
});

await runTest('stale match session is pruned before room creation', async () => {
  const store = createBaseStore();
  const hostUser = store.users.find((user) => user.id === 'host-user');
  hostUser.activeMatchId = 'stale-finished-duel';
  store.matchSessions.push({
    id: 'stale-finished-duel',
    mode: 'duel',
    isTestMatch: false,
    distanceKm: 5,
    slotStartAt: iso(-60 * 60 * 1000),
    startedAt: iso(-60 * 60 * 1000),
    createdAt: iso(-70 * 60 * 1000),
    matchedAt: iso(-70 * 60 * 1000),
    participants: [
      {
        userId: 'host-user',
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1800,
        livePace: '06:00/km',
        liveUpdatedAt: iso(-50 * 60 * 1000),
        finishedAt: iso(-49 * 60 * 1000),
      },
      {
        userId: 'guest-user',
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 4.8,
        liveElapsedSeconds: 1800,
        livePace: '06:15/km',
        liveUpdatedAt: iso(-50 * 60 * 1000),
        finishedAt: iso(-49 * 60 * 1000),
      },
    ],
  });

  await withBackend(store, async ({ request }) => {
    const cleanup = await request('host-token', 'POST', '/api/running/rooms/cleanup-stale', {});
    assert.equal(cleanup.success, true);
    assert.equal(cleanup.cleaned, true);
    assert.equal(cleanup.blocker, undefined);
    assert.equal(cleanup.cleanedItems.includes('matchSessions.pruned'), true);
    assert.equal(cleanup.cleanedItems.includes('user.activeMatchId'), true);

    const created = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'duel',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 2,
    });
    assert.equal(created.success, true);
    assert.equal(created.room.mode, 'duel');
    assert.equal(created.room.hostUserId, 'host-user');
  });
});

await runTest('stale match session is pruned before room join', async () => {
  const store = createBaseStore();
  const guestUser = store.users.find((user) => user.id === 'guest-user');
  const slotStartAt = createSelectableMatchSlotStartAt();
  guestUser.activeMatchId = 'guest-stale-duel';
  store.matchRooms.push({
    id: 'joinable-room',
    inviteToken: 'JOINME',
    hostUserId: 'host-user',
    mode: 'duel',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt,
    maxParticipants: 2,
    minParticipants: 2,
    invitedFriendIds: [],
    participants: [
      {
        userId: 'host-user',
        isHost: true,
        isReady: false,
        isCountdownReady: false,
        invited: false,
        joinedAt: iso(-60 * 1000),
      },
    ],
    createdAt: iso(-60 * 1000),
    linkedMatchId: null,
  });
  store.matchSessions.push({
    id: 'guest-stale-duel',
    mode: 'duel',
    isTestMatch: false,
    distanceKm: 5,
    slotStartAt: iso(-60 * 60 * 1000),
    startedAt: iso(-60 * 60 * 1000),
    createdAt: iso(-70 * 60 * 1000),
    matchedAt: iso(-70 * 60 * 1000),
    participants: [
      {
        userId: 'guest-user',
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1800,
        livePace: '06:00/km',
        liveUpdatedAt: iso(-50 * 60 * 1000),
        finishedAt: iso(-49 * 60 * 1000),
      },
    ],
  });

  await withBackend(store, async ({ request }) => {
    const joined = await request('guest-token', 'POST', '/api/running/rooms/join', {
      inviteToken: 'JOINME',
    });
    assert.equal(joined.success, true);
    assert.equal(joined.room.roomId, 'joinable-room');
    assert.equal(joined.room.participants.length, 2);
    assert.equal(joined.room.isHost, false);
  });
});

await runTest('invalid invite code returns an error instead of a null-room success', async () => {
  await withBackend(createBaseStore(), async ({ requestRaw }) => {
    const joinAttempt = await requestRaw('guest-token', 'POST', '/api/running/rooms/join', {
      inviteToken: 'MISSING',
    });

    assert.equal(joinAttempt.response.status, 404);
    assert.equal(joinAttempt.payload.success, undefined);
    assert.match(joinAttempt.payload.message, /참여할 방/);
  });
});

await runTest('normal active room is not cleaned and create reports blocker source', async () => {
  const store = createBaseStore();
  const slotStartAt = createSelectableMatchSlotStartAt();
  store.matchRooms.push({
    id: 'active-room',
    inviteToken: 'ACTIVE1',
    hostUserId: 'host-user',
    mode: 'duel',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt,
    maxParticipants: 2,
    minParticipants: 2,
    invitedFriendIds: [],
    participants: [
      {
        userId: 'host-user',
        isHost: true,
        isReady: false,
        isCountdownReady: false,
        invited: false,
        joinedAt: iso(-60 * 1000),
      },
    ],
    createdAt: iso(-60 * 1000),
    linkedMatchId: null,
  });

  await withBackend(store, async ({ request, requestRaw }) => {
    const cleanup = await request('host-token', 'POST', '/api/running/rooms/cleanup-stale', {});
    assert.equal(cleanup.success, true);
    assert.equal(cleanup.cleaned, false);
    assert.equal(cleanup.blocker, 'activeRoom');
    assert.equal(cleanup.blockerSource, 'matchRooms.participant');
    assert.equal(cleanup.blockerDetails.source, 'matchRooms.participant');
    assert.equal(cleanup.blockerDetails.roomId, 'active-room');
    assert.equal(cleanup.room.roomId, 'active-room');

    const createAttempt = await requestRaw('host-token', 'POST', '/api/running/rooms', {
      mode: 'duel',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 2,
    });
    assert.equal(createAttempt.response.status, 400);
    assert.equal(createAttempt.payload.details.blocker, 'activeRoom');
    assert.equal(createAttempt.payload.details.blockerSource, 'matchRooms.participant');
    assert.equal(createAttempt.payload.details.blockerDetails.roomId, 'active-room');
  });
});

await runTest('force reset clears linked room blockers and allows a new room', async () => {
  const store = createBaseStore();
  const slotStartAt = createSelectableMatchSlotStartAt();
  const hostUser = store.users.find((user) => user.id === 'host-user');
  hostUser.activeRoomId = 'linked-blocked-room';
  hostUser.activeMatchId = 'linked-blocked-match';
  store.matchSessions.push({
    id: 'linked-blocked-match',
    mode: 'duel',
    isTestMatch: false,
    distanceKm: 5,
    slotStartAt,
    startedAt: null,
    createdAt: iso(-60 * 1000),
    matchedAt: iso(-60 * 1000),
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
  store.matchRooms.push({
    id: 'linked-blocked-room',
    inviteToken: 'BLOCK1',
    hostUserId: 'host-user',
    mode: 'duel',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt,
    maxParticipants: 2,
    minParticipants: 2,
    invitedFriendIds: [],
    participants: [
      {
        userId: 'host-user',
        isHost: true,
        isReady: false,
        isCountdownReady: true,
        invited: false,
        joinedAt: iso(-60 * 1000),
      },
      {
        userId: 'guest-user',
        isHost: false,
        isReady: true,
        isCountdownReady: true,
        invited: false,
        joinedAt: iso(-50 * 1000),
      },
    ],
    createdAt: iso(-60 * 1000),
    linkedMatchId: 'linked-blocked-match',
  });
  store.matchQueues.duel.push({
    id: 'blocked-queue',
    userId: 'host-user',
    distanceKm: 5,
    slotStartAt,
    requestedAt: iso(-30 * 1000),
  });
  store.liveRunShares = [
    {
      userId: 'host-user',
      status: 'running',
      updatedAt: iso(0),
    },
  ];

  await withBackend(store, async ({ request, requestRaw, readStore }) => {
    const leaveAttempt = await requestRaw('host-token', 'POST', '/api/running/rooms/leave', {
      roomId: 'linked-blocked-room',
    });
    assert.equal(leaveAttempt.response.status, 400);

    const reset = await request('host-token', 'POST', '/api/running/rooms/force-reset', {});
    assert.equal(reset.success, true);
    assert.equal(reset.cleaned, true);
    assert.equal(reset.cleanedItems.includes('matchRooms.hostTransferred:linked-blocked-room'), true);
    assert.equal(reset.cleanedItems.includes('matchRooms.participantRemoved:linked-blocked-room'), true);
    assert.equal(reset.cleanedItems.includes('matchSessions.forfeited:linked-blocked-match'), true);
    assert.equal(reset.cleanedItems.includes('matchQueues.duel.removed'), true);
    assert.equal(reset.cleanedItems.includes('liveRunShares.currentUser'), true);
    assert.equal(reset.cleanedItems.includes('user.activeRoomId'), true);
    assert.equal(reset.cleanedItems.includes('user.activeMatchId'), true);

    const persistedAfterReset = readStore();
    assert.equal(persistedAfterReset.matchSessions.some((session) => session.id === 'linked-blocked-match'), true);

    const hostRoom = await request('host-token', 'GET', '/api/running/rooms/my');
    assert.equal(hostRoom.room, null);

    const guestRoom = await request('guest-token', 'GET', '/api/running/rooms/my');
    assert.equal(guestRoom.room.linkedMatchId, 'linked-blocked-match');

    const hostStatus = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'linked-blocked-match',
    });
    assert.equal(hostStatus.matchId, 'linked-blocked-match');
    assert.equal(hostStatus.currentUserLiveStatus, 'forfeited');
    assert.equal(hostStatus.opponent.liveStatus, 'ready');

    const guestStatus = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'linked-blocked-match',
    });
    assert.equal(guestStatus.matchId, 'linked-blocked-match');
    assert.equal(guestStatus.currentUserLiveStatus, 'ready');
    assert.equal(guestStatus.opponent.liveStatus, 'forfeited');

    const created = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'duel',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 2,
    });
    assert.equal(created.success, true);
    assert.equal(created.room.hostUserId, 'host-user');
  });
});

await runTest('normal active room blocks joining another room with blocker source', async () => {
  const store = createBaseStore();
  const slotStartAt = createSelectableMatchSlotStartAt();
  store.matchRooms.push(
    {
      id: 'guest-current-room',
      inviteToken: 'CURRENT',
      hostUserId: 'guest-user',
      mode: 'duel',
      startMode: 'host',
      distanceKm: 5,
      slotStartAt,
      maxParticipants: 2,
      minParticipants: 2,
      invitedFriendIds: [],
      participants: [
        {
          userId: 'guest-user',
          isHost: true,
          isReady: false,
          isCountdownReady: false,
          invited: false,
          joinedAt: iso(-60 * 1000),
        },
      ],
      createdAt: iso(-60 * 1000),
      linkedMatchId: null,
    },
    {
      id: 'host-open-room',
      inviteToken: 'OPEN1',
      hostUserId: 'host-user',
      mode: 'duel',
      startMode: 'host',
      distanceKm: 5,
      slotStartAt,
      maxParticipants: 2,
      minParticipants: 2,
      invitedFriendIds: [],
      participants: [
        {
          userId: 'host-user',
          isHost: true,
          isReady: false,
          isCountdownReady: false,
          invited: false,
          joinedAt: iso(-60 * 1000),
        },
      ],
      createdAt: iso(-60 * 1000),
      linkedMatchId: null,
    },
  );

  await withBackend(store, async ({ requestRaw }) => {
    const joinAttempt = await requestRaw('guest-token', 'POST', '/api/running/rooms/join', {
      inviteToken: 'OPEN1',
    });
    assert.equal(joinAttempt.response.status, 400);
    assert.equal(joinAttempt.payload.details.blocker, 'activeRoom');
    assert.equal(joinAttempt.payload.details.blockerSource, 'matchRooms.participant');
    assert.equal(joinAttempt.payload.details.blockerDetails.roomId, 'guest-current-room');
  });
});

await runTest('match status accepts sub-hour slot timestamps when matchId is provided', async () => {
  const { store, slotStartAt } = createActiveDuelStore();
  const subHourSlotStartAt = new Date(slotStartAt);
  subHourSlotStartAt.setMinutes(23, 47, 123);

  await withBackend(store, async ({ request, requestRaw }) => {
    const status = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt: subHourSlotStartAt.toISOString(),
      matchId: 'duel-contract-match',
    });
    assert.equal(status.matchId, 'duel-contract-match');
    assert.equal(status.state, 'active');

    const rejected = await requestRaw('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt: subHourSlotStartAt.toISOString(),
    });
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.payload.message, '매칭 시간은 1시간 단위로만 선택할 수 있어.');
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

await runTest('duel forfeit keeps active session when the opponent never started', async () => {
  const { store, slotStartAt } = createActiveDuelStore();

  await withBackend(store, async ({ request, readStore }) => {
    const forfeitResult = await request('guest-token', 'POST', '/api/running/matches/leave', {
      matchId: 'duel-contract-match',
    });
    assert.equal(forfeitResult.success, true);

    const persistedAfterForfeit = readStore();
    assert.equal(persistedAfterForfeit.matchSessions.some((session) => session.id === 'duel-contract-match'), true);

    const hostStatus = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(hostStatus.state, 'active');
    assert.equal(hostStatus.currentUserLiveStatus, 'ready');
    assert.equal(hostStatus.opponent.liveStatus, 'forfeited');

    const hostProgress = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.2,
      elapsedSeconds: 95,
      currentPace: '06:10/km',
      status: 'running',
    });
    assert.equal(hostProgress.currentUserLiveStatus, 'running');
    assert.equal(hostProgress.opponent.liveStatus, 'forfeited');
  });
});

await runTest('duel forfeit keeps a linked room when the opponent never started', async () => {
  const { store, slotStartAt } = createActiveDuelStore();
  addLinkedDuelRoom(store, { slotStartAt });

  await withBackend(store, async ({ request, readStore }) => {
    const forfeitResult = await request('guest-token', 'POST', '/api/running/matches/leave', {
      matchId: 'duel-contract-match',
    });
    assert.equal(forfeitResult.success, true);

    const persisted = readStore();
    assert.equal(persisted.matchSessions.some((session) => session.id === 'duel-contract-match'), true);
    assert.equal(persisted.matchRooms.some((room) => room.linkedMatchId === 'duel-contract-match'), true);

    const hostStatus = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(hostStatus.currentUserLiveStatus, 'ready');
    assert.equal(hostStatus.opponent.liveStatus, 'forfeited');
  });
});

await runTest('duel forfeit keeps the linked room while the opponent is still running', async () => {
  const { store, slotStartAt } = createActiveDuelStore();
  const hostParticipant = store.matchSessions[0].participants.find((participant) => participant.userId === 'host-user');
  hostParticipant.liveStatus = 'running';
  hostParticipant.liveDistanceKm = 1.1;
  hostParticipant.liveElapsedSeconds = 420;
  hostParticipant.livePace = '06:22/km';
  hostParticipant.liveUpdatedAt = iso(-5 * 1000);
  addLinkedDuelRoom(store, { slotStartAt });

  await withBackend(store, async ({ request, readStore }) => {
    const forfeitResult = await request('guest-token', 'POST', '/api/running/matches/leave', {
      matchId: 'duel-contract-match',
    });
    assert.equal(forfeitResult.success, true);

    const persisted = readStore();
    assert.equal(persisted.matchSessions.some((session) => session.id === 'duel-contract-match'), true);
    assert.equal(persisted.matchRooms.some((room) => room.linkedMatchId === 'duel-contract-match'), true);

    const hostStatus = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(hostStatus.currentUserLiveStatus, 'running');
    assert.equal(hostStatus.opponent.liveStatus, 'forfeited');
  });
});

await runTest('match progress finishes a participant when they reach the goal distance', async () => {
  const { store, slotStartAt } = createActiveDuelStore();

  await withBackend(store, async ({ request }) => {
    const belowGoal = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 4.8,
      elapsedSeconds: 1500,
      currentPace: '05:00/km',
      status: 'running',
    });
    assert.equal(belowGoal.currentUserLiveStatus, 'running');

    const reachedGoal = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 5.2,
      elapsedSeconds: 1530,
      currentPace: '05:02/km',
      status: 'running',
    });
    assert.equal(reachedGoal.currentUserLiveStatus, 'finished');

    const guestView = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(guestView.opponent.liveStatus, 'finished');
    assert.equal(guestView.opponent.liveDistanceKm, 5);
    assert.equal(typeof guestView.opponent.finishedAt, 'string');
    const firstFinishedAt = guestView.opponent.finishedAt;

    await new Promise((resolve) => setTimeout(resolve, 20));

    await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 5.4,
      elapsedSeconds: 1560,
      currentPace: '05:04/km',
      status: 'running',
    });

    const guestViewAfterRepeatHeartbeat = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(guestViewAfterRepeatHeartbeat.opponent.liveStatus, 'finished');
    assert.equal(guestViewAfterRepeatHeartbeat.opponent.finishedAt, firstFinishedAt);
  });
});

await runTest('duel winner finish response survives while resolved linked room is pruned', async () => {
  const { store, slotStartAt } = createActiveDuelStore();
  const hostParticipant = store.matchSessions[0].participants.find((participant) => participant.userId === 'host-user');
  const guestParticipant = store.matchSessions[0].participants.find((participant) => participant.userId === 'guest-user');
  hostParticipant.liveStatus = 'running';
  hostParticipant.liveDistanceKm = 4.8;
  hostParticipant.liveElapsedSeconds = 1500;
  hostParticipant.livePace = '05:12/km';
  hostParticipant.liveUpdatedAt = iso(-5 * 1000);
  guestParticipant.liveStatus = 'forfeited';
  guestParticipant.liveDistanceKm = 0.6;
  guestParticipant.liveElapsedSeconds = 240;
  guestParticipant.livePace = '06:40/km';
  guestParticipant.liveUpdatedAt = iso(-30 * 1000);
  guestParticipant.forfeitedAt = iso(-30 * 1000);
  addLinkedDuelRoom(store, { slotStartAt });

  await withBackend(store, async ({ request, readStore }) => {
    const finished = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 5.02,
      elapsedSeconds: 1530,
      currentPace: '05:05/km',
      status: 'running',
    });
    assert.equal(finished.currentUserLiveStatus, 'finished');
    assert.equal(finished.opponent.liveStatus, 'forfeited');
    assert.equal(finished.matchId, 'duel-contract-match');

    const persisted = readStore();
    assert.equal(persisted.matchSessions.some((session) => session.id === 'duel-contract-match'), false);
    assert.equal(persisted.matchRooms.some((room) => room.linkedMatchId === 'duel-contract-match'), false);
  });
});

await runTest('match completion creates result and rank notifications for participants', async () => {
  const { store } = createActiveDuelStore();
  for (const user of store.users) {
    user.rankState = { tier: '입문', lp: 50 };
  }

  await withBackend(store, async ({ request, readStore }) => {
    await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 5.2,
      elapsedSeconds: 1530,
      currentPace: '05:02/km',
      status: 'running',
    });
    await request('guest-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 5.01,
      elapsedSeconds: 1590,
      currentPace: '05:18/km',
      status: 'running',
    });

    const persisted = readStore();
    const resultNotifications = persisted.notifications.filter((item) => item.type === 'match_result');
    const rankNotifications = persisted.notifications.filter((item) => item.type === 'rank_change');

    assert.equal(resultNotifications.length, 2);
    assert.deepEqual(new Set(resultNotifications.map((item) => item.userId)), new Set(['host-user', 'guest-user']));
    assert.equal(rankNotifications.length, 2);
    assert.deepEqual(new Set(rankNotifications.map((item) => item.data.matchId)), new Set(['duel-contract-match']));
  });
});

await runTest('match progress finishes within goal distance tolerance before exact target', async () => {
  const { store, slotStartAt } = createActiveDuelStore();
  store.matchSessions[0].distanceKm = 0.5;

  await withBackend(store, async ({ request }) => {
    const belowGoal = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.479,
      elapsedSeconds: 1500,
      currentPace: '05:00/km',
      status: 'running',
    });
    assert.equal(belowGoal.currentUserLiveStatus, 'running');

    const reachedGoal = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.48,
      elapsedSeconds: 1530,
      currentPace: '05:02/km',
      status: 'running',
    });
    assert.equal(reachedGoal.currentUserLiveStatus, 'finished');

    const guestView = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 0.5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(guestView.opponent.liveStatus, 'finished');
    assert.equal(guestView.opponent.liveDistanceKm, 0.48);
    assert.equal(typeof guestView.opponent.finishedAt, 'string');
  });
});

await runTest('match progress accepts client finished status as a terminal signal', async () => {
  const { store, slotStartAt } = createActiveDuelStore();
  store.matchSessions[0].distanceKm = 0.5;

  await withBackend(store, async ({ request }) => {
    const clientFinished = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.47,
      elapsedSeconds: 1530,
      currentPace: '05:02/km',
      status: 'finished',
    });
    assert.equal(clientFinished.currentUserLiveStatus, 'finished');

    const guestView = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 0.5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(guestView.opponent.liveStatus, 'finished');
    assert.equal(guestView.opponent.liveDistanceKm, 0.47);
    assert.equal(typeof guestView.opponent.finishedAt, 'string');
  });
});

await runTest('match progress remains finished when a later heartbeat reports lower distance', async () => {
  const { store, slotStartAt } = createActiveDuelStore();
  store.matchSessions[0].distanceKm = 0.5;

  await withBackend(store, async ({ request }) => {
    await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.47,
      elapsedSeconds: 1530,
      currentPace: '05:02/km',
      status: 'finished',
    });

    const guestView = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 0.5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(guestView.opponent.liveStatus, 'finished');
    const firstFinishedAt = guestView.opponent.finishedAt;

    await new Promise((resolve) => setTimeout(resolve, 20));

    await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.3,
      elapsedSeconds: 1560,
      currentPace: '05:04/km',
      status: 'running',
    });

    const guestViewAfterStaleHeartbeat = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 0.5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(guestViewAfterStaleHeartbeat.opponent.liveStatus, 'finished');
    assert.equal(guestViewAfterStaleHeartbeat.opponent.finishedAt, firstFinishedAt);
    assert.equal(guestViewAfterStaleHeartbeat.opponent.liveDistanceKm, 0.47);
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

function createResolvedGroupStore() {
  const store = createBaseStore();
  store.users.push(
    createRunner({ id: 'third-user', name: '세번째 러너', publicTag: 'third', districtName: '마포구' }),
  );
  store.sessions.push(createSession('third-token', 'third-user'));
  const slotStartAt = createSelectableMatchSlotStartAt();
  const startedAt = iso(-30 * 60 * 1000);

  store.matchSessions.push({
    id: 'group-contract-match',
    mode: 'group',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt,
    startedAt,
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    participants: [
      {
        userId: 'host-user',
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1500,
        livePace: '05:00/km',
        liveUpdatedAt: iso(-10 * 60 * 1000),
        finishedAt: iso(-10 * 60 * 1000),
        finishElapsedSeconds: 1500,
      },
      {
        userId: 'guest-user',
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1560,
        livePace: '05:12/km',
        liveUpdatedAt: iso(-9 * 60 * 1000),
        finishedAt: iso(-9 * 60 * 1000),
        finishElapsedSeconds: 1560,
      },
      {
        userId: 'third-user',
        seedRank: 3,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1620,
        livePace: '05:24/km',
        liveUpdatedAt: iso(-8 * 60 * 1000),
        finishedAt: iso(-8 * 60 * 1000),
        finishElapsedSeconds: 1620,
      },
    ],
  });

  return { store, slotStartAt };
}

await runTest('match result endpoint returns a resolved duel pair with win/lose tones', async () => {
  const { store } = createActiveDuelStore();
  const session = store.matchSessions[0];
  const hostParticipant = session.participants.find((participant) => participant.userId === 'host-user');
  const guestParticipant = session.participants.find((participant) => participant.userId === 'guest-user');
  hostParticipant.liveStatus = 'finished';
  hostParticipant.liveDistanceKm = 5;
  hostParticipant.liveElapsedSeconds = 1500;
  hostParticipant.livePace = '05:00/km';
  hostParticipant.liveUpdatedAt = iso(-10 * 60 * 1000);
  hostParticipant.finishedAt = iso(-10 * 60 * 1000);
  hostParticipant.finishElapsedSeconds = 1500;
  guestParticipant.liveStatus = 'finished';
  guestParticipant.liveDistanceKm = 5;
  guestParticipant.liveElapsedSeconds = 1620;
  guestParticipant.livePace = '05:24/km';
  guestParticipant.liveUpdatedAt = iso(-9 * 60 * 1000);
  guestParticipant.finishedAt = iso(-9 * 60 * 1000);
  guestParticipant.finishElapsedSeconds = 1620;

  await withBackend(store, async ({ request }) => {
    const result = await request('host-token', 'GET', '/api/running/matches/duel-contract-match/result');
    assert.equal(result.matchId, 'duel-contract-match');
    assert.equal(result.mode, 'duel');
    assert.equal(result.source, 'official');
    assert.equal(result.comparedDistanceKm, 5);
    assert.equal(result.participants.length, 2);

    const [winner, loser] = result.participants;
    assert.equal(winner.userId, 'host-user');
    assert.equal(winner.rank, 1);
    assert.equal(winner.resultTone, 'win');
    assert.equal(winner.name, '방장 러너');
    assert.equal(winner.districtName, '일산서구');
    assert.equal(winner.provinceName, '경기도');
    assert.equal(winner.cityName, '고양시');
    assert.equal(winner.finishElapsedSeconds, 1500);
    assert.equal(winner.paceSecondsPerKm, 300);
    assert.equal(winner.isMe, true);
    assert.equal(winner.forfeited, false);

    assert.equal(loser.userId, 'guest-user');
    assert.equal(loser.rank, 2);
    assert.equal(loser.resultTone, 'lose');
    assert.equal(loser.finishElapsedSeconds, 1620);
    assert.equal(loser.paceSecondsPerKm, 324);
    assert.equal(loser.isMe, false);

    // The opposing participant fetches the identical result keyed by the same matchId,
    // with only the isMe flag flipping.
    const guestResult = await request('guest-token', 'GET', '/api/running/matches/duel-contract-match/result');
    assert.equal(guestResult.participants[0].userId, 'host-user');
    assert.equal(guestResult.participants[0].resultTone, 'win');
    assert.equal(guestResult.participants[0].isMe, false);
    assert.equal(guestResult.participants[1].isMe, true);
  });
});

await runTest('match result endpoint returns a ranked group roster', async () => {
  const { store } = createResolvedGroupStore();

  await withBackend(store, async ({ request }) => {
    const result = await request('third-token', 'GET', '/api/running/matches/group-contract-match/result');
    assert.equal(result.mode, 'group');
    assert.equal(result.source, 'official');
    assert.equal(result.participants.length, 3);
    assert.deepEqual(result.participants.map((participant) => participant.rank), [1, 2, 3]);
    assert.deepEqual(result.participants.map((participant) => participant.userId), ['host-user', 'guest-user', 'third-user']);
    // Group rows never carry a duel tone.
    assert.equal(result.participants.every((participant) => participant.resultTone === null), true);
    assert.equal(result.participants[0].finishElapsedSeconds, 1500);
    assert.equal(result.participants[0].paceSecondsPerKm, 300);
    assert.equal(result.participants[2].isMe, true);
    assert.equal(result.participants[2].districtName, '마포구');
  });
});

await runTest('match result endpoint hides matches from non-participants with a 404', async () => {
  const { store } = createResolvedGroupStore();
  // A real user who is NOT in this match.
  store.users.push(createRunner({ id: 'stranger-user', name: '외부 러너', publicTag: 'stranger' }));
  store.sessions.push(createSession('stranger-token', 'stranger-user'));

  await withBackend(store, async ({ requestRaw }) => {
    const denied = await requestRaw('stranger-token', 'GET', '/api/running/matches/group-contract-match/result');
    assert.equal(denied.response.status, 404);
    assert.equal(denied.payload.matchId, undefined);
  });
});

await runTest('match result endpoint returns 404 while a match is not yet resolved', async () => {
  const { store } = createActiveDuelStore();
  // Both participants are still 'ready' (no finish / forfeit / official progress).

  await withBackend(store, async ({ requestRaw }) => {
    const pending = await requestRaw('host-token', 'GET', '/api/running/matches/duel-contract-match/result');
    assert.equal(pending.response.status, 404);

    const missing = await requestRaw('host-token', 'GET', '/api/running/matches/does-not-exist/result');
    assert.equal(missing.response.status, 404);
  });
});

await runTest('match result endpoint reconstructs a duel from saved runs after the session is pruned', async () => {
  await withBackend(createBaseStore(), async ({ request, requestRaw }) => {
    const matchId = 'saved-duel-match';
    const guestStartedAt = iso(-9 * 60 * 1000);
    const guestEndedAt = iso(-7 * 60 * 1000);
    // The loser saves their tracked run carrying the matchId — no live session exists.
    await request('guest-token', 'POST', '/api/runs/tracked', {
      date: guestStartedAt.slice(0, 10),
      distanceKm: 5,
      pace: '05:24/km',
      durationSeconds: 1620,
      startedAt: guestStartedAt,
      endedAt: guestEndedAt,
      route: [
        { latitude: 37.658, longitude: 126.77, timestamp: guestStartedAt },
        { latitude: 37.661, longitude: 126.773, timestamp: guestEndedAt },
      ],
      matchResult: {
        mode: 'duel',
        matchId,
        source: 'official',
        title: '아쉽게 졌어요',
        summary: '다음엔 이겨봐요.',
        badgeLabel: '패',
        opponentName: '방장 러너',
        resultTone: 'lose',
        comparedDistanceKm: 5,
        myDurationSeconds: 1620,
        myPaceLabel: '05:24/km',
        opponentDurationSeconds: 1500,
        opponentPaceLabel: '05:00/km',
      },
    });

    // The matchId persists on the saved run-detail so the client can re-fetch from an old run.
    const activity = await request('guest-token', 'GET', '/api/me/activity');
    const savedRecord = activity.runs.find((run) => run.matchResult?.matchId === matchId);
    assert.equal(Boolean(savedRecord), true);
    assert.equal(savedRecord.matchResult.mode, 'duel');

    const result = await request('guest-token', 'GET', `/api/running/matches/${matchId}/result`);
    assert.equal(result.matchId, matchId);
    assert.equal(result.mode, 'duel');
    assert.equal(result.source, 'official');
    assert.equal(result.participants.length, 2);

    const me = result.participants.find((participant) => participant.isMe);
    const opponent = result.participants.find((participant) => !participant.isMe);
    assert.equal(me.userId, 'guest-user');
    assert.equal(me.resultTone, 'lose');
    assert.equal(me.finishElapsedSeconds, 1620);
    assert.equal(me.paceSecondsPerKm, 324);
    assert.equal(me.districtName, '일산동구');
    assert.equal(opponent.name, '방장 러너');
    assert.equal(opponent.resultTone, 'win');
    assert.equal(opponent.finishElapsedSeconds, 1500);
    assert.equal(opponent.paceSecondsPerKm, 300);
    // The winning tone leads the ordered pair.
    assert.equal(result.participants[0].resultTone, 'win');

    // A different real user who never saved a run for this match cannot read it.
    const denied = await requestRaw('host-token', 'GET', `/api/running/matches/${matchId}/result`);
    assert.equal(denied.response.status, 404);
  });
});

await runTest('a waiting duel runner discovers the reservation an opponent creates on their next status poll', async () => {
  await withBackend(createBaseStore(), async ({ request }) => {
    const slotStartAt = createSelectableMatchSlotStartAt();

    // Host schedules the slot first. No compatible opponent is waiting, so they sit in
    // the queue with matched:false and NO matchId.
    const hostRequest = await request('host-token', 'POST', '/api/running/matches/duel', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
    });
    assert.equal(hostRequest.matched, false);
    assert.equal(hostRequest.opponent, undefined);

    // While waiting, the host polls status by slot + distance (NO matchId) — exactly what
    // the client's waiting-discovery poll sends. Still waiting, still no matchId.
    const hostWaiting = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
    });
    assert.equal(hostWaiting.state, 'waiting');
    assert.equal(hostWaiting.matchId, undefined);

    // Guest schedules the SAME slot. Their request pairs against the waiting host and
    // creates one session containing BOTH runners.
    const guestRequest = await request('guest-token', 'POST', '/api/running/matches/duel', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
    });
    assert.equal(guestRequest.matched, true);
    assert.equal(guestRequest.opponent.id, 'host-user');

    // The host's NEXT status poll (still by slot + distance, no matchId) now discovers the
    // reservation: state flips to 'matched', a matchId appears, and the opponent is the guest.
    const hostDiscovered = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
    });
    assert.equal(hostDiscovered.state, 'matched');
    assert.equal(typeof hostDiscovered.matchId, 'string');
    assert.equal(hostDiscovered.matchId.length > 0, true);
    assert.equal(hostDiscovered.opponent.id, 'guest-user');

    // Both runners now see the SAME session.
    const guestStatus = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
    });
    assert.equal(guestStatus.matchId, hostDiscovered.matchId);

    // The host's upcoming-matches list also surfaces the freshly-created reservation.
    const hostUpcoming = await request('host-token', 'GET', '/api/running/matches/upcoming');
    assert.equal(hostUpcoming.items.some((item) => item.matchId === hostDiscovered.matchId), true);
  });
});

await runTest('duel slot count excludes self, is per-distance, and drops to none after cancel', async () => {
  const store = createBaseStore();
  // A third runner whose pace is far from the host/guest so nobody auto-pairs and all
  // three sit in the duel queue together — letting us observe the slot-count badge.
  store.users.push(
    createRunner({ id: 'far-user', name: '먼 페이스 러너', publicTag: 'far', districtName: '강남구' }),
  );
  store.sessions.push(createSession('far-token', 'far-user'));
  // 08:30/km is well beyond ±15s of the host (06:12) and guest (06:25), so far-user never
  // pairs with them — they all remain waiting.
  store.runs.push(createRun({ id: 'far-run-1', userId: 'far-user', pace: '08:30/km' }));

  await withBackend(store, async ({ request }) => {
    const slotStartAt = createSelectableMatchSlotStartAt();
    const slotKey5km = `${slotStartAt}|5`;
    const slotKey10km = `${slotStartAt}|10`;

    // Host searches 5km. Alone → no matchId, and their OWN upcoming count must be absent
    // (a lone searcher never counts themselves) — this is the "1명 대기" self-inclusion bug.
    const hostRequest = await request('host-token', 'POST', '/api/running/matches/duel', {
      mode: 'duel', distanceKm: 5, slotStartAt,
    });
    assert.equal(hostRequest.matched, false);
    const hostUpcomingAlone = await request('host-token', 'GET', '/api/running/matches/upcoming');
    assert.equal(hostUpcomingAlone.duelSlotCounts[slotKey5km], undefined, 'lone host does not count themselves');

    // far-user searches the SAME slot at 5km but at an incompatible pace → no pair forms,
    // so both stay waiting and can each observe the other in the slot count.
    const farRequest = await request('far-token', 'POST', '/api/running/matches/duel', {
      mode: 'duel', distanceKm: 5, slotStartAt,
    });
    assert.equal(farRequest.matched, false, 'incompatible paces do not pair');

    // Host's upcoming now shows exactly ONE other 5km waiter (far-user) — counts the OTHER
    // runner, never self — and nothing leaks into the unrelated 10km bucket (per-distance).
    const hostUpcomingWithOther = await request('host-token', 'GET', '/api/running/matches/upcoming');
    assert.equal(hostUpcomingWithOther.duelSlotCounts[slotKey5km], 1, 'host sees one OTHER 5km waiter');
    assert.equal(hostUpcomingWithOther.duelSlotCounts[slotKey10km], undefined, 'no 10km waiter — separate bucket stays empty');

    // Host cancels their 5km search. The backend removes their queue entry immediately.
    await request('host-token', 'POST', '/api/running/matches/cancel', {
      mode: 'duel', distanceKm: 5, slotStartAt,
    });

    // far-user (still waiting at 5km) now sees NO other 5km waiter — the host's cancelled
    // entry is gone, so the badge drops to absent rather than lingering as a stale "1명".
    const farUpcomingAfterHostCancel = await request('far-token', 'GET', '/api/running/matches/upcoming');
    assert.equal(
      farUpcomingAfterHostCancel.duelSlotCounts[slotKey5km],
      undefined,
      'cancelled host entry no longer counts toward the remaining waiter',
    );
  });
});

await runTest('a group match forms once three compatible runners schedule the same slot', async () => {
  const store = createBaseStore();
  store.users.push(
    createRunner({ id: 'third-user', name: '세번째 러너', publicTag: 'third', districtName: '마포구' }),
  );
  store.sessions.push(createSession('third-token', 'third-user'));
  store.runs.push(createRun({ id: 'third-run-1', userId: 'third-user', pace: '06:18/km' }));

  await withBackend(store, async ({ request }) => {
    const slotStartAt = createSelectableMatchSlotStartAt();

    const first = await request('host-token', 'POST', '/api/running/matches/group', {
      mode: 'group',
      distanceKm: 5,
      slotStartAt,
    });
    assert.equal(first.matched, false);

    const second = await request('guest-token', 'POST', '/api/running/matches/group', {
      mode: 'group',
      distanceKm: 5,
      slotStartAt,
    });
    // Two compatible runners still fall short of the group minimum (now 3, was 5).
    assert.equal(second.matched, false);

    const third = await request('third-token', 'POST', '/api/running/matches/group', {
      mode: 'group',
      distanceKm: 5,
      slotStartAt,
    });
    // The third compatible runner reaches the lowered minimum and the group forms.
    assert.equal(third.matched, true);
    assert.equal(third.participants.length >= 3, true);

    // The two earlier runners discover the group reservation on their next status poll.
    const hostDiscovered = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'group',
      distanceKm: 5,
      slotStartAt,
    });
    assert.equal(hostDiscovered.state, 'matched');
    assert.equal(typeof hostDiscovered.matchId, 'string');
    assert.equal(hostDiscovered.participantCount >= 3, true);
  });
});
