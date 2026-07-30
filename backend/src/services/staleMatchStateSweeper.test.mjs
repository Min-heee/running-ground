// 유령 대기방 청소 (오너 2026-07-31: "대기실 오래되면 아예 삭제되어야지").
//
// 여기서 못 박는 계약:
//  1) 시작 전 대기방은 마지막 활동 기준 MATCH_ROOM_WAITING_TTL_MS이 지나면 실제로 지워진다.
//  2) 사람이 드나들거나 준비를 누르는 살아 있는 대기실은 지워지지 않는다.
//  3) 청소는 누가 앱을 열어주기를 기다리지 않는다 — 서버 타이머가 스스로 돈다.

import assert from 'node:assert/strict';

import { MATCH_ROOM_WAITING_TTL_MS } from '../lib/matchConstants.mjs';
import { isWaitingMatchRoomExpired } from '../lib/matchPureHelpers.mjs';
import { pruneMatchRooms } from '../lib/matchRoom/matchRoomCore.mjs';
import { sweepStaleMatchState, startStaleMatchStateSweeper } from './staleMatchStateSweeper.mjs';

function runTest(name, testFn) {
  try {
    const result = testFn();

    if (result && typeof result.then === 'function') {
      return result.then(
        () => console.log(`[staleMatchStateSweeper] ok - ${name}`),
        (error) => {
          console.error(`[staleMatchStateSweeper] failed - ${name}`);
          throw error;
        },
      );
    }

    console.log(`[staleMatchStateSweeper] ok - ${name}`);
    return Promise.resolve();
  } catch (error) {
    console.error(`[staleMatchStateSweeper] failed - ${name}`);
    throw error;
  }
}

const NOW = new Date('2026-07-31T12:00:00.000Z');

function isoAgo(ms) {
  return new Date(NOW.getTime() - ms).toISOString();
}

function buildWaitingRoom(overrides = {}) {
  return {
    id: 'duel-room-1',
    mode: 'duel',
    startMode: 'host',
    hostUserId: 'u1',
    distanceKm: 3,
    inviteToken: 'ABC123',
    maxParticipants: 2,
    minParticipants: 2,
    invitedFriendIds: [],
    participants: [{ userId: 'u1', isHost: true, joinedAt: isoAgo(MATCH_ROOM_WAITING_TTL_MS + 60_000) }],
    createdAt: isoAgo(MATCH_ROOM_WAITING_TTL_MS + 60_000),
    linkedMatchId: null,
    ...overrides,
  };
}

function buildStore(rooms) {
  return {
    users: [{ id: 'u1' }, { id: 'u2' }],
    matchRooms: rooms,
    matchSessions: [],
    matchQueues: { duel: [], group: [] },
  };
}

await runTest('a waiting room past its lifetime is pruned away', () => {
  const store = buildStore([buildWaitingRoom()]);

  pruneMatchRooms(store, NOW);

  assert.equal(store.matchRooms.length, 0);
});

await runTest('a waiting room still inside its lifetime survives', () => {
  const freshAt = isoAgo(MATCH_ROOM_WAITING_TTL_MS - 60_000);
  const store = buildStore([buildWaitingRoom({
    createdAt: freshAt,
    participants: [{ userId: 'u1', isHost: true, joinedAt: freshAt }],
  })]);

  pruneMatchRooms(store, NOW);

  assert.equal(store.matchRooms.length, 1);
});

// 활동 기준이 createdAt 하나였다면 사람이 계속 들어오는 대기실도 2시간에 죽는다.
await runTest('a recent join keeps an old room alive', () => {
  const store = buildStore([buildWaitingRoom({
    participants: [
      { userId: 'u1', isHost: true, joinedAt: isoAgo(MATCH_ROOM_WAITING_TTL_MS + 60_000) },
      { userId: 'u2', isHost: false, joinedAt: isoAgo(60_000) },
    ],
  })]);

  pruneMatchRooms(store, NOW);

  assert.equal(store.matchRooms.length, 1);
});

// 준비 토글은 updatedAt을 밀어준다 (matchRoomActions.updateRunningMatchRoomReady).
await runTest('a recent updatedAt keeps an old room alive', () => {
  const store = buildStore([buildWaitingRoom({ updatedAt: isoAgo(60_000) })]);

  pruneMatchRooms(store, NOW);

  assert.equal(store.matchRooms.length, 1);
});

await runTest('rooms with a linked match are not judged by the waiting lifetime', () => {
  const room = buildWaitingRoom({ linkedMatchId: 'duel-match-1' });

  assert.equal(isWaitingMatchRoomExpired(room, NOW), false);
});

await runTest('scheduled rooms are not judged by the waiting lifetime', () => {
  const room = buildWaitingRoom({ startMode: 'scheduled' });

  assert.equal(isWaitingMatchRoomExpired(room, NOW), false);
});

await runTest('a room with no readable timestamps is treated as expired', () => {
  const room = buildWaitingRoom({ createdAt: null, updatedAt: null, participants: [{ userId: 'u1', isHost: true }] });

  assert.equal(isWaitingMatchRoomExpired(room, NOW), true);
});

await runTest('the sweep reports what it removed', async () => {
  const store = buildStore([buildWaitingRoom()]);
  const swept = await sweepStaleMatchState({
    mutateStore: (mutator) => Promise.resolve(mutator(store)),
    now: NOW,
  });

  assert.equal(swept.removedRooms, 1);
  assert.equal(store.matchRooms.length, 0);
});

await runTest('the sweep leaves a healthy store untouched', async () => {
  const freshAt = isoAgo(60_000);
  const store = buildStore([buildWaitingRoom({
    createdAt: freshAt,
    participants: [{ userId: 'u1', isHost: true, joinedAt: freshAt }],
  })]);
  const swept = await sweepStaleMatchState({
    mutateStore: (mutator) => Promise.resolve(mutator(store)),
    now: NOW,
  });

  assert.equal(swept.removedRooms, 0);
  assert.equal(swept.removedSessions, 0);
  assert.equal(swept.removedQueueEntries, 0);
  assert.equal(store.matchRooms.length, 1);
});

// 청소가 유저 요청에 얹히지 않고 스스로 돈다는 것 — 이게 "아예 삭제되어야지"의 핵심이다.
await runTest('the sweeper runs on its own timer and can be stopped', async () => {
  // 타이머 경로는 진짜 현재 시각을 쓴다 — 고정 NOW 기준 픽스처를 그대로 넣으면
  // 실행 시각에 따라 방이 아직 미래에 만들어진 방이 된다.
  const staleAt = new Date(Date.now() - (MATCH_ROOM_WAITING_TTL_MS + 60_000)).toISOString();
  const store = buildStore([buildWaitingRoom({
    createdAt: staleAt,
    participants: [{ userId: 'u1', isHost: true, joinedAt: staleAt }],
  })]);
  const swepts = [];
  const sweeper = startStaleMatchStateSweeper({
    intervalMs: 5,
    mutateStore: (mutator) => Promise.resolve(mutator(store)),
    onSwept: (swept) => swepts.push(swept),
  });

  await new Promise((resolve) => setTimeout(resolve, 40));
  sweeper.stop();

  assert.equal(store.matchRooms.length, 0);
  assert.equal(swepts.length, 1, '지울 게 없어진 뒤로는 보고하지 않는다');
  assert.equal(swepts[0].removedRooms, 1);
});

await runTest('a failing sweep does not throw out of the timer', async () => {
  const errors = [];
  const sweeper = startStaleMatchStateSweeper({
    intervalMs: 5,
    mutateStore: () => Promise.reject(new Error('store locked')),
    onError: (error) => errors.push(error),
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  sweeper.stop();

  assert.ok(errors.length >= 1);
  assert.equal(errors[0].message, 'store locked');
});
