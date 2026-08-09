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
  MATCH_SEAL_REVISION_WINDOW_MS,
} from './lib/matchConstants.mjs';
import { DUEL_LP } from './lib/rankSystem.mjs';
import {
  acknowledgeRunningMatchRoomCountdown,
  createRunningMatchRoom,
  joinRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchRoomReady,
} from './lib/matchRoomStoreHelpers.mjs';
import { findMatchSessionById } from './lib/runningMatchSessionStoreHelpers.mjs';
import {
  getMatchRoomLastActivityAtMs,
  isWaitingMatchRoomExpired,
} from './lib/matchPureHelpers.mjs';

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
    // Match surfaces read the COMPETITIVE-only runner profile — fixture runs must
    // be app-tracked or the pace falls back to the neutral 5.5.
    sourceType: 'runningground',
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

// `pastSlot: true` puts the session's slot in the PAST so the Stage-2 slot gate
// (buildRunningMatchStatusResponse) reports the session's real hydrated 'active'
// state instead of down-ranking a pre-slot session to 'matched'. Use it for tests
// that model a genuinely in-progress match (live progress / forfeit / official
// comparison). The default keeps the ~2h-future slot the pre-slot/countdown and
// cancel-reservation tests depend on. -60s keeps the slot well inside the 4h
// active TTL while making readyToStart true.
function createActiveDuelStore({ pastSlot = false } = {}) {
  const store = createBaseStore();
  const slotStartAt = pastSlot ? iso(-60 * 1000) : createSelectableMatchSlotStartAt();
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

await runTest('LATE arm (straggler ack inside the final 10s) keeps the shared slot — never re-stamps mid-countdown', async () => {
  // In-process (no HTTP) so the straggler case is reproducible without sleeping: the slot is
  // pulled back to ~6s ahead, simulating a guest whose countdown-ready ack lands INSIDE the
  // final 10s window. The old arm rebuilt any slot closer than now+10s to now+15s — re-stamping
  // the shared start mid-countdown (observed live: the host counted 3-2-1 on the original
  // instant while the guest's digit died at ~6 and the duel status carried a +9s-moved slot).
  // GAME-GRADE RULE: a still-future slot NEVER moves; the straggler joins at the current digit.
  const store = createBaseStore();
  const hostUser = store.users.find((user) => user.id === 'host-user');
  const guestUser = store.users.find((user) => user.id === 'guest-user');

  const created = createRunningMatchRoom(store, hostUser, { mode: 'duel', distanceKm: 5, startMode: 'host' });
  const roomId = created.room.roomId;
  joinRunningMatchRoom(store, guestUser, { inviteToken: created.room.inviteToken });
  updateRunningMatchRoomReady(store, guestUser, { roomId, ready: true });
  const started = startRunningMatchRoom(store, hostUser, { roomId });

  const lateSlotStartAt = iso(6_000);
  const rawRoom = store.matchRooms.find((room) => room.id === roomId);
  const linkedSession = findMatchSessionById(store, started.room.linkedMatchId);
  rawRoom.slotStartAt = lateSlotStartAt;
  linkedSession.slotStartAt = lateSlotStartAt;
  assert.equal(rawRoom.countdownArmedAt, undefined);

  const acked = acknowledgeRunningMatchRoomCountdown(store, guestUser, { roomId });
  assert.equal(acked.room.slotStartAt, lateSlotStartAt);
  assert.equal(acked.room.linkedMatchSlotStartAt, lateSlotStartAt);
  assert.equal(Boolean(rawRoom.countdownArmedAt), true);
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

// 오너 2026-07-31: 방장의 '방 삭제'는 방을 폭파한다. 예전에는 남은 사람이 있으면 방장만
// 넘기고 방을 살려 뒀고, 그래서 앱은 "삭제됨"인데 서버/관리자 화면에는 방이 남았다.
await runTest('host delete blows up the room: participants are kicked and the room is gone', async () => {
  const store = createBaseStore();

  await withBackend(store, async ({ request, readStore }) => {
    const created = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'duel',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 2,
    });
    const { roomId, inviteToken } = created.room;

    await request('guest-token', 'POST', '/api/running/rooms/join', { inviteToken });

    const left = await request('host-token', 'POST', '/api/running/rooms/leave', { roomId, deleteRoom: true });
    assert.equal(left.room, null);

    const persisted = readStore();
    assert.equal(persisted.matchRooms.some((entry) => entry.id === roomId), false, '방이 서버에서 실제로 사라져야 한다');

    // 남아 있던 참가자에게도 방이 없다 — 방장만 빠지고 방이 이어지지 않는다.
    const guestRoom = await request('guest-token', 'GET', '/api/running/rooms/my');
    assert.equal(guestRoom.room, null);

    // 쫓겨난 이유를 알림으로 남긴다. 이미 없는 방이라 이동 링크(roomId)는 싣지 않는다.
    const closedNotification = persisted.notifications.find(
      (item) => item.userId === 'guest-user' && item.type === 'match_room_closed',
    );
    assert.equal(Boolean(closedNotification), true);
    assert.equal(closedNotification.data.roomId, undefined);

    // 그리고 방장은 곧바로 새 방을 만들 수 있어야 한다 — 유령 방이 막지 않는다.
    const recreated = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'duel',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 2,
    });
    assert.equal(recreated.success, true);
  });
});

// 적대 검증에서 나온 사고 경로: 클라의 자동 복구 경로들(빈 대기실 화해, 방 만들기 blocker
// 회수)도 같은 leave 엔드포인트를 부른다. 삭제 의사표시가 없으면 절대 폭파되면 안 된다.
await runTest('host leave WITHOUT the delete flag never blows up the room — it hands the host role over', async () => {
  const store = createBaseStore();

  await withBackend(store, async ({ request, readStore }) => {
    const created = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'group',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 10,
    });
    const { roomId, inviteToken } = created.room;

    await request('guest-token', 'POST', '/api/running/rooms/join', { inviteToken });
    await request('host-token', 'POST', '/api/running/rooms/leave', { roomId });

    const persisted = readStore();
    const room = persisted.matchRooms.find((entry) => entry.id === roomId);

    assert.equal(Boolean(room), true, '의사표시 없는 이탈은 방을 지우지 않는다');
    assert.equal(room.hostUserId, 'guest-user');
    assert.deepEqual(room.participants.map((participant) => participant.userId), ['guest-user']);
    assert.equal(room.participants[0].isHost, true);
    assert.equal(
      persisted.notifications.some((item) => item.type === 'match_room_closed'),
      false,
      '아무도 삭제를 누르지 않았으므로 폭파 알림도 없다',
    );
  });
});

// 마지막 활동 시각이 과거로 되감기면 멀쩡한 대기실이 만료 처리된다.
await runTest('a leave refreshes the room activity clock instead of rewinding it', async () => {
  const store = createBaseStore();

  await withBackend(store, async ({ request, readStore }) => {
    const created = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'group',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 10,
    });
    const { roomId, inviteToken } = created.room;

    await request('guest-token', 'POST', '/api/running/rooms/join', { inviteToken });
    await request('guest-token', 'POST', '/api/running/rooms/leave', { roomId });

    const room = readStore().matchRooms.find((entry) => entry.id === roomId);
    const lastActivityMs = getMatchRoomLastActivityAtMs(room);

    assert.equal(Number.isFinite(lastActivityMs), true);
    assert.equal(lastActivityMs >= Date.parse(room.createdAt), true, '나간 사람의 joinedAt이 사라져도 시계가 뒤로 가면 안 된다');
    assert.equal(isWaitingMatchRoomExpired(room, new Date()), false);
  });
});

await runTest('a guest leaving only removes that guest — the room lives on', async () => {
  const store = createBaseStore();

  await withBackend(store, async ({ request, readStore }) => {
    const created = await request('host-token', 'POST', '/api/running/rooms', {
      mode: 'group',
      distanceKm: 5,
      startMode: 'host',
      maxParticipants: 10,
    });
    const { roomId, inviteToken } = created.room;

    await request('guest-token', 'POST', '/api/running/rooms/join', { inviteToken });
    await request('guest-token', 'POST', '/api/running/rooms/leave', { roomId });

    const persisted = readStore();
    const room = persisted.matchRooms.find((entry) => entry.id === roomId);

    assert.equal(Boolean(room), true);
    assert.deepEqual(room.participants.map((participant) => participant.userId), ['host-user']);
    assert.equal(room.hostUserId, 'host-user');
    assert.equal(
      persisted.notifications.some((item) => item.type === 'match_room_closed'),
      false,
      '게스트 퇴장은 폭파가 아니다',
    );
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
    // The slot is in the future (createActiveDuelStore's slot is ~2h out), so the server
    // slot-gates the status to 'matched' with a live countdown — it must NOT report 'active'
    // before the slot (mirrors the room slot gate; a pre-slot 'active' from the direct status
    // endpoint is exactly what re-created the guest countdown skip).
    assert.equal(status.state, 'matched');
    assert.equal(typeof status.countdownRemainingSeconds, 'number');

    const rejected = await requestRaw('host-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt: subHourSlotStartAt.toISOString(),
    });
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.payload.message, '매칭 시간은 1시간 단위로만 선택할 수 있어요.');
  });
});

await runTest('match progress uploads feed official comparison and forfeit state', async () => {
  // Genuinely active match (live progress + official comparison + forfeit), so the slot
  // must be in the past for the gate to report the real 'active' state.
  const { store, slotStartAt } = createActiveDuelStore({ pastSlot: true });

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
  // The host is mid-run (currentUserLiveStatus 'ready' then 'running') and the match must
  // report 'active', so the slot has to be in the past for the gate to surface that state.
  const { store, slotStartAt } = createActiveDuelStore({ pastSlot: true });

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

await runTest('duel winner finish: session retained for the echo window, linked room still pruned', async () => {
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
    // POST-FINISH RETENTION (2026-07-09): the now all-done session (host finished + guest
    // forfeited) is RETAINED for the echo window so the slower finisher's device can still
    // receive its 'finished' status and save with the matchId — this is the fix for the
    // 2026-07-09 mid-run solo-demotion incident. The party ROOM has served its purpose and is
    // still pruned immediately (a retained lobby would block starting a new party).
    assert.equal(persisted.matchSessions.some((session) => session.id === 'duel-contract-match'), true);
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
    // Tolerance is 5m (0.005km): for a 0.5km goal the finish threshold is 0.495km.
    const belowGoal = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.49,
      elapsedSeconds: 1500,
      currentPace: '05:00/km',
      status: 'running',
    });
    assert.equal(belowGoal.currentUserLiveStatus, 'running');

    const reachedGoal = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 0.496,
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
    // The opponent view rounds liveDistanceKm to 2 decimals, so 0.496 surfaces as 0.50.
    assert.equal(guestView.opponent.liveDistanceKm, 0.5);
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

await runTest('a finished re-push (post-finish heartbeat) leaves the persisted store byte-identical', async () => {
  // B-2 pin: once a participant's finish is frozen (liveStatus 'finished' +
  // finishElapsedSeconds), re-pushing 'finished' — the client's post-finish heartbeat and the
  // durable finish resend — must not re-stamp the live fields. The whole mutation becomes
  // byte-identical, so the adapters' no-change serialization skip drops the whole-store row
  // UPDATE entirely (the persisted store does not move at all), and the standings/verdict the
  // opponent polls are unchanged.
  const { store, slotStartAt } = createActiveDuelStore({ pastSlot: true });

  await withBackend(store, async ({ request, readStore }) => {
    const finish = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 5,
      elapsedSeconds: 1530,
      currentPace: '05:02/km',
      status: 'finished',
    });
    assert.equal(finish.currentUserLiveStatus, 'finished');
    assert.equal(finish.currentUserFinishElapsedSeconds, 1530);

    const guestViewAfterFinish = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    const frozenFinishedAt = guestViewAfterFinish.opponent.finishedAt;
    assert.equal(guestViewAfterFinish.opponent.liveStatus, 'finished');

    const persistedAfterFinish = JSON.stringify(readStore());

    // Far enough apart that a re-stamped liveUpdatedAt WOULD change the serialization.
    await new Promise((resolve) => setTimeout(resolve, 25));

    const repush = await request('host-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 5,
      elapsedSeconds: 1530,
      currentPace: '05:02/km',
      status: 'finished',
    });
    assert.equal(repush.currentUserLiveStatus, 'finished');
    assert.equal(repush.currentUserFinishElapsedSeconds, 1530);

    assert.equal(
      JSON.stringify(readStore()),
      persistedAfterFinish,
      'the finished re-push must not rewrite the persisted store',
    );

    // Standings/verdict unchanged: the opponent's poll reads the identical frozen snapshot.
    const guestViewAfterRepush = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt,
      matchId: 'duel-contract-match',
    });
    assert.equal(guestViewAfterRepush.opponent.liveStatus, 'finished');
    assert.equal(guestViewAfterRepush.opponent.finishedAt, frozenFinishedAt);
    assert.equal(guestViewAfterRepush.opponent.liveDistanceKm, guestViewAfterFinish.opponent.liveDistanceKm);
    // (officialComparison carries a poll-time comparedAt, so compare its standing-bearing
    // fields rather than the whole object.)
    assert.equal(guestViewAfterRepush.officialComparison?.leaderUserId, guestViewAfterFinish.officialComparison?.leaderUserId);
    assert.equal(guestViewAfterRepush.officialComparison?.leaderDistanceKm, guestViewAfterFinish.officialComparison?.leaderDistanceKm);
    assert.equal(guestViewAfterRepush.officialComparison?.participantCount, guestViewAfterFinish.officialComparison?.participantCount);
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
  // The session is pruned (no live session), so BOTH the save path and the GET /result endpoint
  // reconstruct the duel SERVER-side from the durable saved runs — the client's claimed tone is
  // never trusted for a real matchId. The guest (slower, 1620s) lingers and saves FIRST while no
  // opponent run exists yet → its record is stored PENDING. The host (faster, 1500s) saves
  // SECOND; now the guest's run is present, so the host's verdict resolves SERVER-side to a
  // verified 'win' against the guest's measured finish — even though the host claimed nothing
  // special. The GET /result endpoint then reconstructs the full WIN/LOSE pair from the host's
  // verified record.
  const store = createBaseStore();
  store.users.push(createRunner({ id: 'stranger-user', name: '외부 러너', publicTag: 'stranger' }));
  store.sessions.push(createSession('stranger-token', 'stranger-user'));

  await withBackend(store, async ({ request, requestRaw }) => {
    const matchId = 'saved-duel-match';
    const guestStartedAt = iso(-9 * 60 * 1000);
    const guestEndedAt = iso(-7 * 60 * 1000);
    // Guest saves first (no opponent run yet) carrying the matchId — no live session exists.
    const guestSaved = await request('guest-token', 'POST', '/api/runs/tracked', {
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
    // No opponent run yet → the guest's record is PENDING, not a self-trusted tone.
    assert.equal(guestSaved.run.matchResult.resultTone, undefined);
    assert.equal(guestSaved.pointBreakdown.matchBonusPoints, 0);

    // Host saves second; the guest's run is now present, so the host's verdict resolves
    // SERVER-side. Even a fabricated client tone would be overridden — here the host is the
    // faster finish (1500 < 1620), so the server-verified outcome is 'win'.
    const hostStartedAt = iso(-9 * 60 * 1000);
    const hostEndedAt = iso(-7 * 60 * 1000);
    const hostSaved = await request('host-token', 'POST', '/api/runs/tracked', {
      date: hostStartedAt.slice(0, 10),
      distanceKm: 5,
      pace: '05:00/km',
      durationSeconds: 1500,
      startedAt: hostStartedAt,
      endedAt: hostEndedAt,
      route: [
        { latitude: 37.668, longitude: 126.78, timestamp: hostStartedAt },
        { latitude: 37.671, longitude: 126.783, timestamp: hostEndedAt },
      ],
      matchResult: {
        mode: 'duel',
        matchId,
        source: 'official',
        title: '이겼어요',
        summary: '잘했어요.',
        badgeLabel: '승',
        opponentName: '참가 러너',
        resultTone: 'win',
        comparedDistanceKm: 5,
        myDurationSeconds: 1500,
        myPaceLabel: '05:00/km',
        opponentDurationSeconds: 1620,
        opponentPaceLabel: '05:24/km',
      },
    });
    assert.equal(hostSaved.run.matchResult.resultTone, 'win');
    assert.equal(hostSaved.run.matchResult.opponentId, 'guest-user');
    assert.equal(hostSaved.pointBreakdown.matchBonusPoints, 20);

    // The guest's reconcile path re-saves once the opponent's run has landed; the server now
    // resolves the guest's PENDING record to a verified 'lose' against the host's measured finish.
    const guestReconciled = await request('guest-token', 'POST', '/api/runs/tracked', {
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
        resultTone: 'win', // a stale/crafted client still claims a win — the server must override.
        comparedDistanceKm: 5,
        myDurationSeconds: 1620,
        myPaceLabel: '05:24/km',
      },
    });
    assert.equal(guestReconciled.run.matchResult.resultTone, 'lose');
    assert.equal(guestReconciled.pointBreakdown.matchBonusPoints, 10);

    // The matchId persists on the saved run-detail so the client can re-fetch from an old run.
    const activity = await request('host-token', 'GET', '/api/me/activity');
    const savedRecord = activity.runs.find((run) => run.matchResult?.matchId === matchId);
    assert.equal(Boolean(savedRecord), true);
    assert.equal(savedRecord.matchResult.mode, 'duel');

    const result = await request('host-token', 'GET', `/api/running/matches/${matchId}/result`);
    assert.equal(result.matchId, matchId);
    assert.equal(result.mode, 'duel');
    assert.equal(result.source, 'official');
    assert.equal(result.participants.length, 2);

    const me = result.participants.find((participant) => participant.isMe);
    const opponent = result.participants.find((participant) => !participant.isMe);
    assert.equal(me.userId, 'host-user');
    assert.equal(me.resultTone, 'win');
    assert.equal(me.finishElapsedSeconds, 1500);
    assert.equal(me.paceSecondsPerKm, 300);
    assert.equal(opponent.userId, 'guest-user');
    assert.equal(opponent.name, '참가 러너');
    assert.equal(opponent.resultTone, 'lose');
    assert.equal(opponent.finishElapsedSeconds, 1620);
    assert.equal(opponent.paceSecondsPerKm, 324);
    assert.equal(opponent.districtName, '일산동구');
    // The winning tone leads the ordered pair.
    assert.equal(result.participants[0].resultTone, 'win');

    // A different real user who never saved a run for this match cannot read it.
    const denied = await requestRaw('stranger-token', 'GET', `/api/running/matches/${matchId}/result`);
    assert.equal(denied.response.status, 404);
  });
});

// An active group session where exactly one runner has finished and the other two are
// still running. `liveUpdatedAt` is recent so the still-running runners are NOT treated
// as disconnected/DNF and the §B4 fallback window has not elapsed → the group is UNSETTLED.
function createUnsettledGroupStore() {
  const store = createBaseStore();
  store.users.push(
    createRunner({ id: 'third-user', name: '세번째 러너', publicTag: 'third', districtName: '마포구' }),
  );
  store.sessions.push(createSession('third-token', 'third-user'));
  const slotStartAt = createSelectableMatchSlotStartAt();

  store.matchSessions.push({
    id: 'unsettled-group-match',
    mode: 'group',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt,
    startedAt: iso(-20 * 60 * 1000),
    createdAt: iso(-21 * 60 * 1000),
    matchedAt: iso(-21 * 60 * 1000),
    participants: [
      {
        userId: 'host-user',
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1500,
        livePace: '05:00/km',
        liveUpdatedAt: iso(-5 * 1000),
        finishedAt: iso(-5 * 1000),
        finishElapsedSeconds: 1500,
      },
      {
        userId: 'guest-user',
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 3.2,
        liveElapsedSeconds: 1000,
        livePace: '05:12/km',
        liveUpdatedAt: iso(-3 * 1000),
        finishedAt: null,
        finishElapsedSeconds: null,
      },
      {
        userId: 'third-user',
        seedRank: 3,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 2.8,
        liveElapsedSeconds: 1000,
        livePace: '05:24/km',
        liveUpdatedAt: iso(-3 * 1000),
        finishedAt: null,
        finishElapsedSeconds: null,
      },
    ],
  });

  return { store, slotStartAt };
}

await runTest('group status exposes a RESOLVED groupVerdict (§B4 sealed) while the live session still exists', async () => {
  // Two finishers + one runner who stopped reporting long ago. The stalled runner keeps a
  // non-terminal liveStatus so the session survives pruning (it is not "done"), but the §B4
  // fallback window has elapsed since the earliest finish → the server seals the placement
  // server-side, ranking the stalled runner as DNF after the finishers.
  const store = createBaseStore();
  store.users.push(
    createRunner({ id: 'third-user', name: '세번째 러너', publicTag: 'third', districtName: '마포구' }),
  );
  store.sessions.push(createSession('third-token', 'third-user'));
  const slotStartAt = createSelectableMatchSlotStartAt();
  const longAgo = iso(-20 * 60 * 1000);

  store.matchSessions.push({
    id: 'sealed-group-match',
    mode: 'group',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt,
    startedAt: iso(-25 * 60 * 1000),
    createdAt: iso(-26 * 60 * 1000),
    matchedAt: iso(-26 * 60 * 1000),
    participants: [
      {
        userId: 'host-user',
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1500,
        livePace: '05:00/km',
        liveUpdatedAt: longAgo,
        finishedAt: longAgo,
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
        liveUpdatedAt: iso(-19 * 60 * 1000),
        finishedAt: iso(-19 * 60 * 1000),
        finishElapsedSeconds: 1560,
      },
      {
        // Still 'running' in storage but no live update for ~20m → resolves to disconnected
        // (non-terminal, so the session is NOT pruned) and is a DNF in the sealed verdict.
        userId: 'third-user',
        seedRank: 3,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 3,
        liveElapsedSeconds: 900,
        livePace: '05:24/km',
        liveUpdatedAt: longAgo,
        finishedAt: null,
        finishElapsedSeconds: null,
      },
    ],
  });

  await withBackend(store, async ({ request }) => {
    const guestStatus = await request('guest-token', 'POST', '/api/running/matches/status', {
      mode: 'group',
      distanceKm: 5,
      slotStartAt,
      matchId: 'sealed-group-match',
    });
    assert.equal(guestStatus.mode, 'group');
    assert.equal(Boolean(guestStatus.groupVerdict), true);
    assert.equal(guestStatus.groupVerdict.resolved, true);
    // Finishers lead by measured elapsed (host 1500 < guest 1560); the stalled runner is last.
    assert.equal(guestStatus.groupVerdict.myRank, 2);
    const order = guestStatus.groupVerdict.participants.map((participant) => participant.userId);
    assert.equal(order[0], 'host-user');
    assert.equal(order[1], 'guest-user');
    assert.equal(order[order.length - 1], 'third-user');
    // The live participants standings are untouched alongside the final verdict.
    assert.equal(Array.isArray(guestStatus.participants), true);
  });
});

await runTest('group status returns an UNRESOLVED groupVerdict while runners are still going (client holds PENDING, never a wrong rank)', async () => {
  const { store, slotStartAt } = createUnsettledGroupStore();

  await withBackend(store, async ({ request }) => {
    const status = await request('host-token', 'POST', '/api/running/matches/status', {
      mode: 'group',
      distanceKm: 5,
      slotStartAt,
      matchId: 'unsettled-group-match',
    });
    assert.equal(status.mode, 'group');
    // The verdict is present but unresolved — a graceful, additive signal. The client must
    // render a PENDING placeholder, never a fabricated final placement.
    assert.equal(Boolean(status.groupVerdict), true);
    assert.equal(status.groupVerdict.resolved, false);
    assert.equal(status.groupVerdict.myRank, null);
  });
});

await runTest('a group save against an unsettled session is PENDING (no rank, no rank LP), then reconciles to the server placement', async () => {
  const { store, slotStartAt } = createUnsettledGroupStore();

  await withBackend(store, async ({ request }) => {
    const startedAt = iso(-9 * 60 * 1000);
    const endedAt = iso(-7 * 60 * 1000);

    // The host finished first and saves while the others are still running. Even a fabricated
    // 1위 claim must be held PENDING (server cannot yet seal the final ordering).
    const earlySave = await request('host-token', 'POST', '/api/runs/tracked', {
      date: startedAt.slice(0, 10),
      distanceKm: 5,
      pace: '05:00/km',
      durationSeconds: 1500,
      startedAt,
      endedAt,
      route: [
        { latitude: 37.668, longitude: 126.78, timestamp: startedAt },
        { latitude: 37.671, longitude: 126.783, timestamp: endedAt },
      ],
      matchResult: {
        mode: 'group',
        matchId: 'unsettled-group-match',
        source: 'official',
        title: '1위로 마무리했어요',
        summary: '가장 먼저 들어왔어요.',
        badgeLabel: '1위',
        rank: 1,
        participantCount: 3,
        comparedDistanceKm: 5,
        myDurationSeconds: 1500,
        myPaceLabel: '05:00/km',
      },
    });
    // No rank persisted → the group rank LP bonus is 0, never a client-claimed placement.
    assert.equal(earlySave.run.matchResult.rank, undefined);
    assert.equal(earlySave.run.matchResult.badgeLabel, '결과 집계 중');
    assert.equal(earlySave.pointBreakdown.matchBonusPoints, 0);
    // The runner's own measured metrics are kept.
    assert.equal(earlySave.run.matchResult.myDurationSeconds, 1500);
  });
});

// PIN UPDATED for the fair-verdict design (2026-07-05): a save against a PROVISIONAL seal now
// stays PENDING (never persist a verdict that may still flip once inside the revision window;
// the finalization back-fill heals it — see the STUCK tests). The save-time rank override + the
// rank-based bonus therefore apply to a save that arrives after the seal FINALIZED, which this
// fixture models by pre-writing the window-closed seal + sealFinalizedAt (what the sweep stamps
// on any match-route touch past resolvedAt+10min).
await runTest('a group save against a FINALIZED §B4-sealed live session overrides a fabricated rank and awards the rank-based LP', async () => {
  // Two finishers + one stalled (disconnected) runner whose §B4 window has elapsed: the live
  // session survives pruning (the stalled runner is non-terminal) so the save resolves from the
  // live session's groupVerdict. The guest (real finish 1560 → 2위) claims a fabricated 1위; the
  // server overrides it to 2위 and awards the 2위 group LP (20), never the self-claimed amount.
  const store = createBaseStore();
  store.users.push(
    createRunner({ id: 'third-user', name: '세번째 러너', publicTag: 'third', districtName: '마포구' }),
  );
  store.sessions.push(createSession('third-token', 'third-user'));
  const slotStartAt = createSelectableMatchSlotStartAt();
  const longAgo = iso(-20 * 60 * 1000);

  store.matchSessions.push({
    id: 'sealed-save-group-match',
    mode: 'group',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt,
    startedAt: iso(-25 * 60 * 1000),
    createdAt: iso(-26 * 60 * 1000),
    matchedAt: iso(-26 * 60 * 1000),
    groupFallbackResolution: {
      resolvedAt: iso(-(MATCH_SEAL_REVISION_WINDOW_MS + 5 * 60 * 1000)),
      finisherUserIds: ['host-user', 'guest-user'],
      dnfUserIds: ['third-user'],
    },
    sealFinalizedAt: iso(-60 * 1000),
    participants: [
      {
        userId: 'host-user',
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1500,
        livePace: '05:00/km',
        liveUpdatedAt: longAgo,
        finishedAt: longAgo,
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
        liveUpdatedAt: iso(-19 * 60 * 1000),
        finishedAt: iso(-19 * 60 * 1000),
        finishElapsedSeconds: 1560,
      },
      {
        userId: 'third-user',
        seedRank: 3,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 3,
        liveElapsedSeconds: 900,
        livePace: '05:24/km',
        liveUpdatedAt: longAgo,
        finishedAt: null,
        finishElapsedSeconds: null,
      },
    ],
  });

  await withBackend(store, async ({ request }) => {
    const startedAt = iso(-9 * 60 * 1000);
    const endedAt = iso(-7 * 60 * 1000);

    const guestSave = await request('guest-token', 'POST', '/api/runs/tracked', {
      date: startedAt.slice(0, 10),
      distanceKm: 5,
      pace: '05:12/km',
      durationSeconds: 1560,
      startedAt,
      endedAt,
      route: [
        { latitude: 37.658, longitude: 126.77, timestamp: startedAt },
        { latitude: 37.661, longitude: 126.773, timestamp: endedAt },
      ],
      matchResult: {
        mode: 'group',
        matchId: 'sealed-save-group-match',
        source: 'official',
        title: '1위로 마무리했어요',
        summary: '가장 먼저 들어왔어요.',
        badgeLabel: '1위',
        rank: 1,
        participantCount: 3,
        comparedDistanceKm: 5,
        myDurationSeconds: 1560,
        myPaceLabel: '05:12/km',
      },
    });
    assert.equal(guestSave.run.matchResult.rank, 2);
    assert.equal(guestSave.run.matchResult.badgeLabel, '2위');
    assert.equal(guestSave.pointBreakdown.matchBonusPoints, 20);
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

// ---------------------------------------------------------------------------
// Competitive-correctness regression coverage for the server-authoritative
// duel verdict at run save (the 1v1 party-run "both phones win" + wrong
// opponent-name bug). matchId = 'duel-contract-match' (host finishes faster).
// ---------------------------------------------------------------------------

// A RESOLVED duel session both runners finished. Host (1500s) is faster than guest (1620s),
// so the server-authoritative winner is the host regardless of what either device claims.
// isPartyRun marks it a 1대1 파티런 — still COMPETITIVE (win/lose + the +20P duel bonus).
function createResolvedPartyDuelStore() {
  const { store, slotStartAt } = createActiveDuelStore();
  const session = store.matchSessions[0];
  session.isPartyRun = true;
  const host = session.participants.find((participant) => participant.userId === 'host-user');
  const guest = session.participants.find((participant) => participant.userId === 'guest-user');
  host.liveStatus = 'finished';
  host.liveDistanceKm = 5;
  host.liveElapsedSeconds = 1500;
  host.livePace = '05:00/km';
  host.liveUpdatedAt = iso(-10 * 60 * 1000);
  host.finishedAt = iso(-10 * 60 * 1000);
  host.finishElapsedSeconds = 1500;
  guest.liveStatus = 'finished';
  guest.liveDistanceKm = 5;
  guest.liveElapsedSeconds = 1620;
  guest.livePace = '05:24/km';
  guest.liveUpdatedAt = iso(-9 * 60 * 1000);
  guest.finishedAt = iso(-9 * 60 * 1000);
  guest.finishElapsedSeconds = 1620;
  return { store, slotStartAt };
}

function saveDuelRun(request, token, { resultTone, opponentName, badgeLabel, extra = {} }) {
  const startedAt = iso(-10 * 60 * 1000);
  const endedAt = iso(-1 * 60 * 1000);
  return request(token, 'POST', '/api/runs/tracked', {
    date: startedAt.slice(0, 10),
    distanceKm: 5,
    pace: '05:00/km',
    durationSeconds: 1500,
    startedAt,
    endedAt,
    route: [
      { latitude: 37.658, longitude: 126.77, timestamp: startedAt },
      { latitude: 37.668, longitude: 126.78, timestamp: endedAt },
    ],
    matchResult: {
      mode: 'duel',
      matchId: 'duel-contract-match',
      source: 'party',
      title: '대결 결과',
      summary: '대결 요약',
      badgeLabel: badgeLabel ?? '승리',
      opponentName,
      resultTone,
      comparedDistanceKm: 5,
      myDurationSeconds: 1500,
      myPaceLabel: '05:00/km',
      ...extra,
    },
  });
}

await runTest('both 1v1 party-run devices claim a local win → the server resolves ONE winner (the faster finish) and persists agreeing tones', async () => {
  const { store } = createResolvedPartyDuelStore();
  await withBackend(store, async ({ request }) => {
    // Both devices POST their tracked run each CLAIMING a local win (the screen-off bug input):
    // the host with its own device label, the guest likewise. The server must overwrite both.
    const hostSaved = await saveDuelRun(request, 'host-token', {
      resultTone: 'win',
      opponentName: '아이폰14',
      badgeLabel: '승리',
    });
    const guestSaved = await saveDuelRun(request, 'guest-token', {
      resultTone: 'win',
      opponentName: '갤럭시S24',
      badgeLabel: '승리',
    });

    // The host actually finished faster (1500 < 1620), so the server resolves the host the
    // winner and the guest the loser — never both 'win'.
    assert.equal(hostSaved.run.matchResult.resultTone, 'win');
    assert.equal(guestSaved.run.matchResult.resultTone, 'lose');

    // The opponent name is each runner's REAL account name, not the saved device label.
    assert.equal(hostSaved.run.matchResult.opponentName, '참가 러너');
    assert.equal(guestSaved.run.matchResult.opponentName, '방장 러너');

    // KEEP party-run competitive points: only the server-resolved winner gets +20P; the loser
    // gets the loss bonus (10), never a second +20P from a client-claimed win.
    assert.equal(hostSaved.pointBreakdown.matchBonusPoints, 20);
    assert.equal(guestSaved.pointBreakdown.matchBonusPoints, 10);
  });
});

await runTest('the server-resolved loser cannot self-award the +20P win bonus even when it claims a win', async () => {
  const { store } = createResolvedPartyDuelStore();
  await withBackend(store, async ({ request }) => {
    // The SLOWER runner (guest, 1620s) claims a win. The server must downgrade it to a loss so
    // no double-award is possible.
    const guestSaved = await saveDuelRun(request, 'guest-token', {
      resultTone: 'win',
      opponentName: '내 폰',
      badgeLabel: '승리',
    });
    assert.equal(guestSaved.run.matchResult.resultTone, 'lose');
    assert.equal(guestSaved.run.matchResult.badgeLabel, '패배');
    assert.equal(guestSaved.pointBreakdown.matchBonusPoints, 10);
  });
});

await runTest('the reconstructed 대결 결과 shows the OPPONENT real name + userId, not the viewer device label', async () => {
  const { store } = createResolvedPartyDuelStore();
  await withBackend(store, async ({ request }) => {
    // Only the guest saves (server resolves its loss + the real opponent identity). Then the
    // session is gone for the result endpoint's saved-run reconstruction path test below; here
    // the live session is still present, so it resolves from the session directly.
    await saveDuelRun(request, 'guest-token', {
      resultTone: 'win',
      opponentName: '갤럭시S24',
      badgeLabel: '승리',
    });

    const result = await request('guest-token', 'GET', '/api/running/matches/duel-contract-match/result');
    const me = result.participants.find((participant) => participant.isMe);
    const opponent = result.participants.find((participant) => !participant.isMe);
    assert.equal(me.userId, 'guest-user');
    assert.equal(me.resultTone, 'lose');
    // The opponent row is the host's REAL account name + userId — never the viewer's saved
    // device label ('갤럭시S24').
    assert.equal(opponent.userId, 'host-user');
    assert.equal(opponent.name, '방장 러너');
    assert.equal(opponent.resultTone, 'win');
  });
});

await runTest('a duel saved before the opponent finishes is PENDING (no win, no +20P) and later reconciles to the official verdict', async () => {
  // Only the host has finished; the guest never synced a finish, so the verdict is unresolvable
  // at the host's save. The session is NOT pruned (the guest is not done), so the server-side
  // resolver sees an unresolved verdict and stores the host's record PENDING.
  const { store } = createActiveDuelStore();
  const session = store.matchSessions[0];
  session.isPartyRun = true;
  const host = session.participants.find((participant) => participant.userId === 'host-user');
  host.liveStatus = 'finished';
  host.liveDistanceKm = 5;
  host.liveElapsedSeconds = 1500;
  host.livePace = '05:00/km';
  host.liveUpdatedAt = iso(-30 * 1000);
  host.finishedAt = iso(-30 * 1000);
  host.finishElapsedSeconds = 1500;

  await withBackend(store, async ({ request }) => {
    // The host saves claiming a win while the guest has not finished.
    const hostSaved = await saveDuelRun(request, 'host-token', {
      resultTone: 'win',
      opponentName: '아이폰14',
      badgeLabel: '승리',
    });
    // PENDING: no definite tone, neutral badge, and crucially NO +20P from the client's claim.
    assert.equal(hostSaved.run.matchResult.resultTone, undefined);
    assert.equal(hostSaved.run.matchResult.badgeLabel, '결과 집계 중');
    assert.equal(hostSaved.pointBreakdown.matchBonusPoints, 0);

    // The guest now finishes SLOWER via the live progress endpoint, resolving the verdict. The
    // progress response surfaces the resolved duelVerdict the client reconcile path consumes —
    // here from the guest's perspective the outcome is 'lose' (the host won), which proves the
    // official verdict the host's PENDING record reconciles to is the faster runner = the host.
    const guestFinish = await request('guest-token', 'POST', '/api/running/matches/progress', {
      matchId: 'duel-contract-match',
      distanceKm: 5.1,
      elapsedSeconds: 1620,
      currentPace: '05:24/km',
      status: 'finished',
    });
    assert.equal(guestFinish.duelVerdict.resolved, true);
    assert.equal(guestFinish.duelVerdict.outcome, 'lose');
    // The winner is the faster finisher (the host), never both — the verdict names one winner.
    assert.equal(guestFinish.duelVerdict.winnerUserId, 'host-user');
  });
});

await runTest('after the session is PRUNED, a save with a fabricated client win is reconstructed from saved runs — the slower finisher is OVERRIDDEN to lose (0 bonus), the faster to win; an opponent-less save is PENDING then reconciles', async () => {
  // The adversarial post-prune hole: a duel's live session is pruned as the NORMAL both-finished
  // end-state, so the lingering SECOND saver hits the NO-SESSION branch. A stale build or a crafted
  // POST then carries a fabricated resultTone:'win'. The server must NOT trust it — it reconstructs
  // the verdict from the durable saved runs (faster finish wins) and overrides the claim.
  const matchId = 'pruned-duel-match';

  await withBackend(createBaseStore(), async ({ request }) => {
    const startedAt = iso(-10 * 60 * 1000);
    const endedAt = iso(-1 * 60 * 1000);
    const saveFabricatedWin = (token, durationSeconds, opponentName) => request(token, 'POST', '/api/runs/tracked', {
      date: startedAt.slice(0, 10),
      distanceKm: 5,
      pace: '05:00/km',
      durationSeconds,
      startedAt,
      endedAt,
      route: [
        { latitude: 37.658, longitude: 126.77, timestamp: startedAt },
        { latitude: 37.668, longitude: 126.78, timestamp: endedAt },
      ],
      // Every device CLAIMS a win with its own device label — the screen-off/stale-client input.
      matchResult: {
        mode: 'duel',
        matchId,
        source: 'party',
        title: '대결 결과',
        summary: '대결 요약',
        badgeLabel: '승리',
        opponentName,
        resultTone: 'win',
        comparedDistanceKm: 5,
        myDurationSeconds: durationSeconds,
        myPaceLabel: '05:00/km',
      },
    });

    // 1) The SLOWER runner (guest, 1620s) saves FIRST. No opponent run exists yet, so the verdict
    // cannot be reconstructed → PENDING, and crucially NO +20P from the client-claimed win.
    const guestFirst = await saveFabricatedWin('guest-token', 1620, '아이폰14');
    assert.equal(guestFirst.run.matchResult.resultTone, undefined);
    assert.equal(guestFirst.run.matchResult.badgeLabel, '결과 집계 중');
    assert.equal(guestFirst.pointBreakdown.matchBonusPoints, 0);

    // 2) The FASTER runner (host, 1500s) saves SECOND. The guest's saved run is now present, so the
    // server reconstructs the verdict from the two measured finishes → host is the verified winner.
    const hostSaved = await saveFabricatedWin('host-token', 1500, '갤럭시S24');
    assert.equal(hostSaved.run.matchResult.resultTone, 'win');
    assert.equal(hostSaved.run.matchResult.badgeLabel, '승리');
    // The opponent identity is the guest's REAL account, not the host's saved device label.
    assert.equal(hostSaved.run.matchResult.opponentId, 'guest-user');
    assert.equal(hostSaved.run.matchResult.opponentName, '참가 러너');
    assert.equal(hostSaved.pointBreakdown.matchBonusPoints, 20);

    // 3) The guest's reconcile re-save still fabricates a win, but the host's run is now present, so
    // the server OVERRIDES the slower finisher to 'lose' — never a second self-awarded +20P.
    const guestReconciled = await saveFabricatedWin('guest-token', 1620, '아이폰14');
    assert.equal(guestReconciled.run.matchResult.resultTone, 'lose');
    assert.equal(guestReconciled.run.matchResult.badgeLabel, '패배');
    assert.equal(guestReconciled.run.matchResult.opponentId, 'host-user');
    assert.equal(guestReconciled.run.matchResult.opponentName, '방장 러너');
    assert.equal(guestReconciled.pointBreakdown.matchBonusPoints, 10);

    // The GET /result endpoint reconstructs the same single-winner pair from the saved runs.
    const result = await request('host-token', 'GET', `/api/running/matches/${matchId}/result`);
    const winner = result.participants.find((participant) => participant.resultTone === 'win');
    const loser = result.participants.find((participant) => participant.resultTone === 'lose');
    assert.equal(winner.userId, 'host-user');
    assert.equal(loser.userId, 'guest-user');
  });
});

await runTest('WINNER-FIRST duel: the faster finisher saves FIRST (PENDING, 0P) and the opponent\'s save alone heals it to 승리 +20P — no client re-save', async () => {
  // 오너 실기기 대결 2026-08-09. The mirror of the test above, and the case that actually bites:
  // the FASTER runner finishes first, so they also SAVE first — with no opponent run to verify
  // against, their blob is stored PENDING (correctly: a client-claimed win is never trusted).
  // Nothing then healed it. The session-based back-fill runs only inside
  // sweepStuckMatchSessionFallbacks, which skips any match that never sealed — and a both-finished
  // duel never seals. So the winner's card stayed "결과 집계 중" and getMatchBonusPoints kept
  // returning 0, while the loser (saving second, able to verify) collected 10P. Every duel
  // structurally shortchanged its winner.
  // The heal requires the LIVE session — it is the only server-built roster, and matchId is
  // unvalidated client input (see backFillMatchCounterpartSavedRuns). A finished session is kept
  // for MATCH_SESSION_ALL_DONE_RETENTION_MS (10 min), which covers a normal duel's two saves.
  const matchId = 'duel-contract-match';
  const { store } = createActiveDuelStore();
  const session = store.matchSessions[0];
  session.isPartyRun = true;

  // The FASTER runner has finished; the opponent is still out on the course.
  const host = session.participants.find((participant) => participant.userId === 'host-user');
  host.liveStatus = 'finished';
  host.liveDistanceKm = 5;
  host.liveElapsedSeconds = 1500;
  host.livePace = '05:00/km';
  host.liveUpdatedAt = iso(-30 * 1000);
  host.finishedAt = iso(-30 * 1000);
  host.finishElapsedSeconds = 1500;

  await withBackend(store, async ({ request, readStore }) => {
    const startedAt = iso(-10 * 60 * 1000);
    const endedAt = iso(-1 * 60 * 1000);
    const saveClaimingWin = (token, durationSeconds, opponentName) => request(token, 'POST', '/api/runs/tracked', {
      date: startedAt.slice(0, 10),
      distanceKm: 5,
      pace: '05:00/km',
      durationSeconds,
      startedAt,
      endedAt,
      route: [
        { latitude: 37.658, longitude: 126.77, timestamp: startedAt },
        { latitude: 37.668, longitude: 126.78, timestamp: endedAt },
      ],
      matchResult: {
        mode: 'duel',
        matchId,
        source: 'party',
        title: '대결 결과',
        summary: '대결 요약',
        badgeLabel: '승리',
        opponentName,
        resultTone: 'win',
        comparedDistanceKm: 5,
        myDurationSeconds: durationSeconds,
        myPaceLabel: '05:00/km',
      },
    });

    // 1) The FASTER runner (host, 1500s) saves FIRST. No opponent run exists yet → PENDING, 0P.
    // This part was always correct and must stay correct: an unverifiable win earns nothing.
    const hostFirst = await saveClaimingWin('host-token', 1500, '갤럭시S24');
    assert.equal(hostFirst.run.matchResult.resultTone, undefined);
    assert.equal(hostFirst.run.matchResult.badgeLabel, '결과 집계 중');
    assert.equal(hostFirst.pointBreakdown.matchBonusPoints, 0);

    const hostBefore = await request('host-token', 'GET', '/api/me/activity');

    // 2) The SLOWER runner finishes on the course, then saves. Their own verdict resolves to
    // 'lose' (10P) — that half always worked.
    const guestFinish = await request('guest-token', 'POST', '/api/running/matches/progress', {
      matchId,
      distanceKm: 5.1,
      elapsedSeconds: 1620,
      currentPace: '05:24/km',
      status: 'finished',
    });
    assert.equal(guestFinish.duelVerdict.winnerUserId, 'host-user');

    const guestSecond = await saveClaimingWin('guest-token', 1620, '아이폰14');
    assert.equal(guestSecond.run.matchResult.resultTone, 'lose');
    assert.equal(guestSecond.pointBreakdown.matchBonusPoints, 10);

    // 3) THE REGRESSION: the host sent nothing more, yet their PERSISTED blob must now carry the
    // verified win. Before the fix this stayed PENDING forever.
    const hostRun = readStore().runs.find((run) => (
      run.userId === 'host-user' && run.matchResult?.matchId === matchId
    ));
    assert.equal(hostRun.matchResult.resultTone, 'win');
    assert.equal(hostRun.matchResult.badgeLabel, '승리');
    // Healed through the same resolver the save path uses — real opponent account, not a device label.
    assert.equal(hostRun.matchResult.opponentId, 'guest-user');
    assert.equal(hostRun.matchResult.opponentName, '참가 러너');

    // 4) Points are derived from the blob (no stored balance), so the healed card must move the
    // host's user-visible monthly points by exactly the duel win bonus — without any re-save.
    const hostAfter = await request('host-token', 'GET', '/api/me/activity');
    assert.equal(hostAfter.monthlyPoints - hostBefore.monthlyPoints, 20);
    const hostActivityRun = hostAfter.runs.find((run) => run.matchResult?.matchId === matchId);
    assert.equal(hostActivityRun.matchResult.resultTone, 'win');

    // 5) The heal is one-directional and idempotent: the loser is never upgraded, and a repeat
    // save does not mint a second bonus.
    const guestRun = readStore().runs.find((run) => (
      run.userId === 'guest-user' && run.matchResult?.matchId === matchId
    ));
    assert.equal(guestRun.matchResult.resultTone, 'lose');

    const hostReSaved = await saveClaimingWin('host-token', 1500, '갤럭시S24');
    assert.equal(hostReSaved.run.matchResult.resultTone, 'win');
    assert.equal(hostReSaved.pointBreakdown.matchBonusPoints, 20);
    assert.equal(readStore().runs.filter((run) => run.matchResult?.matchId === matchId).length, 2);
  });
});

await runTest('GET /result derives pace from the MEASURED distance, not a screen-off-frozen comparedDistanceKm', async () => {
  // 오너 실기기 대결 2026-08-09 (duel-match-e545bceb): both runs were 6km, but a screen-off freeze
  // stranded matchResult.comparedDistanceKm at 3.06 / 3.23 while the finish times kept advancing.
  // 대결 결과 divided the full time by that frozen distance and printed 12:08/km and 11:40/km —
  // roughly double, and flatly contradicting the 기록 상세 card (6:11 / 6:17) for the same runs.
  const matchId = 'frozen-compared-distance-duel';

  await withBackend(createBaseStore(), async ({ request }) => {
    const startedAt = iso(-60 * 60 * 1000);
    const endedAt = iso(-20 * 60 * 1000);
    const save = (token, durationSeconds, comparedDistanceKm) => request(token, 'POST', '/api/runs/tracked', {
      date: startedAt.slice(0, 10),
      distanceKm: 6,
      pace: '06:11/km',
      durationSeconds,
      startedAt,
      endedAt,
      route: [
        { latitude: 37.658, longitude: 126.77, timestamp: startedAt },
        { latitude: 37.668, longitude: 126.78, timestamp: endedAt },
      ],
      matchResult: {
        mode: 'duel',
        matchId,
        source: 'party',
        title: '대결 결과',
        summary: '대결 요약',
        badgeLabel: '승리',
        opponentName: '상대',
        resultTone: 'win',
        // The corrupted field, exactly as found in production.
        comparedDistanceKm,
        myDurationSeconds: durationSeconds,
        myPaceLabel: '06:11/km',
      },
    });

    await save('guest-token', 2261, 3.23);
    await save('host-token', 2227, 3.06);

    const result = await request('host-token', 'GET', `/api/running/matches/${matchId}/result`);
    const byUser = new Map(result.participants.map((participant) => [participant.userId, participant]));

    // 2227s / 6km = 371 s/km = 6:11/km, and 2261s / 6km = 377 s/km = 6:17/km — the same numbers
    // the run detail screen shows. Under the old divisor these were 728 and 700.
    assert.equal(byUser.get('host-user').paceSecondsPerKm, 371);
    assert.equal(byUser.get('guest-user').paceSecondsPerKm, 377);

    // The verdict still follows the measured finish times, never the frozen distance: the faster
    // finisher (2227s) resolves to 'win' at save.
    assert.equal(byUser.get('host-user').resultTone, 'win');
    // The first saver stays PENDING here BY DESIGN — this store has no live session, and the
    // counterpart heal refuses to rewrite another runner's record without a server-built roster
    // (backFillMatchCounterpartSavedRuns). That is the documented residual: such leftovers are
    // repaired by scripts/backfill-pending-match-results.mjs under operator review, never guessed.
    assert.equal(byUser.get('guest-user').resultTone, null);
  });
});

// ---------------------------------------------------------------------------
// DURABLE one-finisher (DNF) resolution: the permanent-PENDING launch blocker.
// One runner finishes and saves a PENDING record; the other never finishes (quit /
// screen-off). After the §B4 window elapses nobody re-invokes a verdict-builder, so the
// seal never fired → the saved card was stuck on "결과 집계 중" forever. The fix routes
// GET /result through mutateStore (seals + back-fills) AND sweeps in pruneMatchSessions.
// Fair-verdict design (2026-07-05) refinement: the seal is PROVISIONAL for a 10-minute
// revision window (a delayed-but-plausible late finish may still flip it once), so the
// irreversible effects — saved-run back-fill, LP, result notifications — run at
// FINALIZATION (window close, or every-participant-done) instead of at seal time.
// ---------------------------------------------------------------------------

// A duel where ONLY the host finished (>§B4 window ago) and the guest never finished — and the
// host already SAVED a PENDING record. The window (90s) has elapsed because finishedAt is 100s old.
// `sealedAgoMs` optionally pre-writes the §B4 seal that many ms in the past — used to model a
// session whose SEAL-REVISION window (10min from resolvedAt) has already closed, so the next
// touch runs the FINALIZATION phase (sealFinalizedAt + LP + back-fill).
function createStuckOneFinisherDuelStore({ sealedAgoMs = null } = {}) {
  const store = createBaseStore();
  const slotStartAt = createSelectableMatchSlotStartAt();
  const finishedAt = iso(-100 * 1000); // > MATCH_DUEL_FINISH_FALLBACK_MS (90s) ago

  store.matchSessions.push({
    id: 'stuck-duel-match',
    mode: 'duel',
    isTestMatch: false,
    distanceKm: 5,
    slotStartAt,
    startedAt: iso(-30 * 60 * 1000),
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    ...(sealedAgoMs !== null
      ? {
          duelFallbackResolution: {
            resolvedAt: iso(-sealedAgoMs),
            winnerUserId: 'host-user',
            dnfUserId: 'guest-user',
          },
        }
      : {}),
    participants: [
      {
        userId: 'host-user',
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1500,
        livePace: '05:00/km',
        liveUpdatedAt: finishedAt,
        finishedAt,
        finishElapsedSeconds: 1500,
      },
      {
        // The guest quit / went screen-off: a stale 'running' heartbeat, never a finish.
        userId: 'guest-user',
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 3.2,
        liveElapsedSeconds: 1100,
        livePace: '05:40/km',
        liveUpdatedAt: iso(-100 * 1000),
        finishedAt: null,
        finishElapsedSeconds: null,
      },
    ],
  });

  // The host's already-saved PENDING run (no resultTone, neutral badge) — exactly what the save
  // path persists when the verdict is unresolvable at save time.
  const startedAt = iso(-40 * 60 * 1000);
  store.runs.push({
    id: 'host-stuck-run',
    userId: 'host-user',
    date: startedAt.slice(0, 10),
    distanceKm: 5,
    pace: '05:00/km',
    source: 'RunningGround',
    sourceType: 'tracked',
    startedAt,
    endedAt: iso(-39 * 60 * 1000),
    durationSeconds: 1500,
    createdAt: iso(-39 * 60 * 1000),
    matchResult: {
      mode: 'duel',
      matchId: 'stuck-duel-match',
      source: 'official',
      title: '대결 결과를 집계하고 있어요',
      summary: '상대가 완주하면 결과가 자동으로 업데이트돼요.',
      badgeLabel: '결과 집계 중',
      opponentName: '참가 러너',
      comparedDistanceKm: 5,
      myDurationSeconds: 1500,
      myPaceLabel: '05:00/km',
    },
  });

  return { store, slotStartAt };
}

// PIN UPDATED for the fair-verdict design (2026-07-05): the first /result after the §B4 window
// still SEALS + PERSISTS, and still DISPLAYS the DNF win — but the verdict is now PROVISIONAL
// for the 10-minute revision window, so the saved-run back-fill (an irreversible persist: its
// never-downgrade guard would block a later correction) is DEFERRED to finalization. The
// display heal is unchanged; the durable heal moves to the window close (next test).
await runTest('STUCK one-finisher duel: GET /result after the §B4 window SEALS + shows the PROVISIONAL DNF win; back-fill/LP stay deferred inside the revision window', async () => {
  const { store } = createStuckOneFinisherDuelStore();
  for (const user of store.users) {
    user.rankState = { tier: '입문', lp: 50 };
  }

  await withBackend(store, async ({ request, readStore }) => {
    // BEFORE: the host's saved record is PENDING and the session carries no seal.
    const before = readStore();
    const beforeRun = before.runs.find((entry) => entry.id === 'host-stuck-run');
    assert.equal(beforeRun.matchResult.resultTone, undefined);
    assert.equal(beforeRun.matchResult.badgeLabel, '결과 집계 중');
    assert.equal(before.matchSessions.find((entry) => entry.id === 'stuck-duel-match').duelFallbackResolution, undefined);

    // The host opens 기록상세 → GET /result. This is the FIRST request after the window; it must
    // resolve + PERSIST the seal and DISPLAY the DNF win, flagged provisional (가확정).
    const result = await request('host-token', 'GET', '/api/running/matches/stuck-duel-match/result');
    assert.equal(result.matchId, 'stuck-duel-match');
    assert.equal(result.provisional, true);
    const me = result.participants.find((participant) => participant.userId === 'host-user');
    const opponent = result.participants.find((participant) => participant.userId === 'guest-user');
    assert.equal(me.resultTone, 'win');
    assert.equal(opponent.resultTone, 'lose');
    // The DNF opponent carries no official finish.
    assert.equal(opponent.finishElapsedSeconds, null);

    // AFTER: the seal is PERSISTED on the session, but nothing irreversible ran — the saved run
    // stays PENDING (deferred back-fill), no LP moved, no notifications, not finalized.
    const after = readStore();
    const sealedSession = after.matchSessions.find((entry) => entry.id === 'stuck-duel-match');
    assert.equal(sealedSession.duelFallbackResolution.winnerUserId, 'host-user');
    assert.equal(sealedSession.duelFallbackResolution.dnfUserId, 'guest-user');
    assert.equal(sealedSession.sealFinalizedAt, undefined);
    const stillPendingRun = after.runs.find((entry) => entry.id === 'host-stuck-run');
    assert.equal(stillPendingRun.matchResult.resultTone, undefined);
    assert.equal(stillPendingRun.matchResult.badgeLabel, '결과 집계 중');
    assert.equal(after.users.find((entry) => entry.id === 'host-user').rankState.lp, 50);
    assert.equal(after.users.find((entry) => entry.id === 'guest-user').rankState.lp, 50);
    assert.equal((after.notifications ?? []).filter((entry) => ['match_result', 'rank_change'].includes(entry.type)).length, 0);

    // A SECOND /result read is idempotent: the verdict is identical and the seal is not recomputed.
    const second = await request('host-token', 'GET', '/api/running/matches/stuck-duel-match/result');
    assert.equal(second.participants.find((participant) => participant.userId === 'host-user').resultTone, 'win');
    const afterSecond = readStore();
    assert.equal(afterSecond.matchSessions.find((entry) => entry.id === 'stuck-duel-match').duelFallbackResolution.resolvedAt, sealedSession.duelFallbackResolution.resolvedAt);
  });
});

// PIN UPDATED for the fair-verdict design (2026-07-05): the sweep's self-heal (back-fill) now
// runs at FINALIZATION — the seal's revision window (10min) must have closed — and finalization
// additionally applies the LP + result notifications the sealed path used to strand forever.
// The fixture pre-writes the seal 11 minutes in the past to model that moment.
await runTest('STUCK one-finisher duel: the SWEEP FINALIZES a window-closed seal WITHOUT any /result call (bystander poll) — back-fill + LP + notifications exactly once', async () => {
  const { store } = createStuckOneFinisherDuelStore({ sealedAgoMs: MATCH_SEAL_REVISION_WINDOW_MS + 60 * 1000 });
  for (const user of store.users) {
    user.rankState = { tier: '입문', lp: 50 };
  }
  // A bystander whose unrelated status poll runs pruneMatchSessions across the whole store.
  store.users.push(createRunner({ id: 'bystander', name: '구경 러너', publicTag: 'bystander' }));
  store.sessions.push(createSession('bystander-token', 'bystander'));

  await withBackend(store, async ({ request, readStore }) => {
    // The bystander never touches the stuck match — they just poll their own (empty) duel status,
    // which runs pruneMatchSessions → the sweep finalizes + back-fills + applies LP.
    await request('bystander-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt: createSelectableMatchSlotStartAt(),
    });

    const after = readStore();
    const sealedSession = after.matchSessions.find((entry) => entry.id === 'stuck-duel-match');
    assert.equal(sealedSession.duelFallbackResolution.winnerUserId, 'host-user');
    assert.equal(typeof sealedSession.sealFinalizedAt, 'string');
    const healedRun = after.runs.find((entry) => entry.id === 'host-stuck-run');
    assert.equal(healedRun.matchResult.resultTone, 'win');
    assert.equal(healedRun.matchResult.badgeLabel, '승리');
    // LP finally applies for the sealed win (host '06:12/km' vs guest '06:25/km' → 13s apart →
    // win-vs-slower / loss-vs-faster deltas), and the DNF side takes the loser delta.
    assert.equal(after.users.find((entry) => entry.id === 'host-user').rankState.lp, 50 + DUEL_LP.winVsSlower);
    assert.equal(after.users.find((entry) => entry.id === 'guest-user').rankState.lp, 50 + DUEL_LP.lossVsFaster);
    assert.equal((after.notifications ?? []).filter((entry) => entry.type === 'match_result').length, 2);

    // A second bystander poll changes nothing (finalization is one-way idempotent).
    await request('bystander-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt: createSelectableMatchSlotStartAt(),
    });
    const afterSecond = readStore();
    assert.equal(afterSecond.matchSessions.find((entry) => entry.id === 'stuck-duel-match').sealFinalizedAt, sealedSession.sealFinalizedAt);
    assert.equal(afterSecond.users.find((entry) => entry.id === 'host-user').rankState.lp, 50 + DUEL_LP.winVsSlower);
    assert.equal((afterSecond.notifications ?? []).filter((entry) => entry.type === 'match_result').length, 2);
  });
});

// A group where ONLY the host finished (>§B4 window ago); guest + third never finished, and the
// host already SAVED a rank-less PENDING group record. `sealedAgoMs` optionally pre-writes the
// group seal that many ms in the past (window-closed finalization fixture — see the duel twin).
function createStuckOneFinisherGroupStore({ sealedAgoMs = null } = {}) {
  const store = createBaseStore();
  store.users.push(
    createRunner({ id: 'third-user', name: '세번째 러너', publicTag: 'third', districtName: '마포구' }),
  );
  store.sessions.push(createSession('third-token', 'third-user'));
  const slotStartAt = createSelectableMatchSlotStartAt();
  const finishedAt = iso(-100 * 1000);

  store.matchSessions.push({
    id: 'stuck-group-match',
    mode: 'group',
    isTestMatch: false,
    isPartyRun: false,
    distanceKm: 5,
    slotStartAt,
    startedAt: iso(-30 * 60 * 1000),
    createdAt: iso(-31 * 60 * 1000),
    matchedAt: iso(-31 * 60 * 1000),
    ...(sealedAgoMs !== null
      ? {
          groupFallbackResolution: {
            resolvedAt: iso(-sealedAgoMs),
            finisherUserIds: ['host-user'],
            dnfUserIds: ['guest-user', 'third-user'],
          },
        }
      : {}),
    participants: [
      {
        userId: 'host-user',
        seedRank: 1,
        acceptedAt: null,
        liveStatus: 'finished',
        liveDistanceKm: 5,
        liveElapsedSeconds: 1500,
        livePace: '05:00/km',
        liveUpdatedAt: finishedAt,
        finishedAt,
        finishElapsedSeconds: 1500,
      },
      {
        userId: 'guest-user',
        seedRank: 2,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 3.0,
        liveElapsedSeconds: 1000,
        livePace: '05:33/km',
        liveUpdatedAt: iso(-100 * 1000),
        finishedAt: null,
        finishElapsedSeconds: null,
      },
      {
        userId: 'third-user',
        seedRank: 3,
        acceptedAt: null,
        liveStatus: 'running',
        liveDistanceKm: 2.4,
        liveElapsedSeconds: 900,
        livePace: '06:15/km',
        liveUpdatedAt: iso(-100 * 1000),
        finishedAt: null,
        finishElapsedSeconds: null,
      },
    ],
  });

  const startedAt = iso(-40 * 60 * 1000);
  store.runs.push({
    id: 'host-stuck-group-run',
    userId: 'host-user',
    date: startedAt.slice(0, 10),
    distanceKm: 5,
    pace: '05:00/km',
    source: 'RunningGround',
    sourceType: 'tracked',
    startedAt,
    endedAt: iso(-39 * 60 * 1000),
    durationSeconds: 1500,
    createdAt: iso(-39 * 60 * 1000),
    matchResult: {
      mode: 'group',
      matchId: 'stuck-group-match',
      source: 'official',
      title: '그룹 결과를 집계하고 있어요',
      summary: '다른 참가자가 완주하면 순위가 자동으로 업데이트돼요.',
      badgeLabel: '결과 집계 중',
      participantCount: 3,
      comparedDistanceKm: 5,
      myDurationSeconds: 1500,
      myPaceLabel: '05:00/km',
    },
  });

  return { store, slotStartAt };
}

// PIN UPDATED for the fair-verdict design (2026-07-05): same deferral as the duel — the first
// /result still SEALS + PERSISTS + DISPLAYS the placement (provisional), but the saved-run
// back-fill waits for finalization so a late finisher inside the revision window can still
// re-enter the ordering.
await runTest('STUCK one-finisher group: GET /result after the §B4 window SEALS + shows the PROVISIONAL placement; back-fill stays deferred inside the revision window', async () => {
  const { store } = createStuckOneFinisherGroupStore();

  await withBackend(store, async ({ request, readStore }) => {
    const before = readStore();
    assert.equal(before.runs.find((entry) => entry.id === 'host-stuck-group-run').matchResult.rank, undefined);
    assert.equal(before.matchSessions.find((entry) => entry.id === 'stuck-group-match').groupFallbackResolution, undefined);

    const result = await request('host-token', 'GET', '/api/running/matches/stuck-group-match/result');
    assert.equal(result.mode, 'group');
    assert.equal(result.provisional, true);
    const me = result.participants.find((participant) => participant.userId === 'host-user');
    assert.equal(me.rank, 1);

    const after = readStore();
    const sealedSession = after.matchSessions.find((entry) => entry.id === 'stuck-group-match');
    assert.deepEqual(sealedSession.groupFallbackResolution.finisherUserIds, ['host-user']);
    assert.deepEqual(new Set(sealedSession.groupFallbackResolution.dnfUserIds), new Set(['guest-user', 'third-user']));
    assert.equal(sealedSession.sealFinalizedAt, undefined);
    // The saved record stays PENDING until the revision window closes (deferred back-fill).
    const stillPendingRun = after.runs.find((entry) => entry.id === 'host-stuck-group-run');
    assert.equal(stillPendingRun.matchResult.rank, undefined);
    assert.equal(stillPendingRun.matchResult.badgeLabel, '결과 집계 중');
  });
});

// PIN UPDATED for the fair-verdict design (2026-07-05): the sweep's durable heal now runs at
// FINALIZATION (window-closed seal, pre-written 11min ago), mirroring the duel twin above.
await runTest('STUCK one-finisher group: the SWEEP FINALIZES a window-closed seal WITHOUT any /result call and back-fills the placement', async () => {
  const { store } = createStuckOneFinisherGroupStore({ sealedAgoMs: MATCH_SEAL_REVISION_WINDOW_MS + 60 * 1000 });
  store.users.push(createRunner({ id: 'bystander', name: '구경 러너', publicTag: 'bystander' }));
  store.sessions.push(createSession('bystander-token', 'bystander'));

  await withBackend(store, async ({ request, readStore }) => {
    await request('bystander-token', 'POST', '/api/running/matches/status', {
      mode: 'duel',
      distanceKm: 5,
      slotStartAt: createSelectableMatchSlotStartAt(),
    });

    const after = readStore();
    const sealedSession = after.matchSessions.find((entry) => entry.id === 'stuck-group-match');
    assert.deepEqual(sealedSession.groupFallbackResolution.finisherUserIds, ['host-user']);
    assert.equal(typeof sealedSession.sealFinalizedAt, 'string');
    const healedRun = after.runs.find((entry) => entry.id === 'host-stuck-group-run');
    assert.equal(healedRun.matchResult.rank, 1);
    assert.equal(healedRun.matchResult.badgeLabel, '1위');
  });
});

await runTest('HAPPY PATH unaffected: a one-finisher match still INSIDE the §B4 window is NOT sealed and stays PENDING (no premature DNF resolution)', async () => {
  const { store } = createStuckOneFinisherDuelStore();
  // Move the host finish to JUST 20s ago — inside the 90s window, so it must NOT seal yet.
  const session = store.matchSessions.find((entry) => entry.id === 'stuck-duel-match');
  const recentFinish = iso(-20 * 1000);
  const host = session.participants.find((participant) => participant.userId === 'host-user');
  host.finishedAt = recentFinish;
  host.liveUpdatedAt = recentFinish;

  await withBackend(store, async ({ request, readStore }) => {
    // The bystander poll runs the sweep, but the window has NOT elapsed → no seal, no heal.
    store.users.push(createRunner({ id: 'bystander', name: '구경 러너', publicTag: 'bystander' }));
    await request('host-token', 'GET', '/api/running/matches/stuck-duel-match/result').catch(() => null);

    const after = readStore();
    const stillUnsealed = after.matchSessions.find((entry) => entry.id === 'stuck-duel-match');
    assert.equal(stillUnsealed.duelFallbackResolution, undefined);
    const stillPending = after.runs.find((entry) => entry.id === 'host-stuck-run');
    assert.equal(stillPending.matchResult.resultTone, undefined);
    assert.equal(stillPending.matchResult.badgeLabel, '결과 집계 중');
  });
});
