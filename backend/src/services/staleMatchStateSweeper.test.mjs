// 유령 대기방 청소 (오너 2026-07-31: "대기실 오래되면 아예 삭제되어야지").
//
// 여기서 못 박는 계약:
//  1) 시작 전 대기방은 마지막 활동 기준 MATCH_ROOM_WAITING_TTL_MS이 지나면 실제로 지워진다.
//  2) 사람이 드나들거나 준비를 누르는 살아 있는 대기실은 지워지지 않는다.
//  3) 청소는 누가 앱을 열어주기를 기다리지 않는다 — 서버 타이머가 스스로 돈다.

import assert from 'node:assert/strict';

import { MATCH_ROOM_WAITING_TTL_MS } from '../lib/matchConstants.mjs';
import {
  getMatchRoomLastActivityAtMs,
  isWaitingMatchRoomExpired,
} from '../lib/matchPureHelpers.mjs';
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

// 적대 검증에서 나온 경로: prune은 탈퇴한 유저의 참가 기록을 걷어내는데, 그 사람의 joinedAt이
// 방의 마지막 활동 시각이었다면 시계가 과거로 되감겨 멀쩡한 대기실이 같은 패스에서 죽었다.
await runTest('pruning a withdrawn participant does not rewind the room activity clock', () => {
  const store = buildStore([buildWaitingRoom({
    participants: [
      { userId: 'u1', isHost: true, joinedAt: isoAgo(MATCH_ROOM_WAITING_TTL_MS + 60_000) },
      // 방금 들어왔던 사람이 탈퇴해 users에서 사라진 상태.
      { userId: 'gone-user', isHost: false, joinedAt: isoAgo(60_000) },
    ],
  })]);

  pruneMatchRooms(store, NOW);

  assert.equal(store.matchRooms.length, 1, '탈퇴자 정리가 방을 죽이면 안 된다');
  assert.deepEqual(store.matchRooms[0].participants.map((entry) => entry.userId), ['u1']);
  assert.equal(getMatchRoomLastActivityAtMs(store.matchRooms[0]), NOW.getTime());
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

// 예약 파티런 (2026-09-09): 링크(세션 생성)는 요청이 아니라 서버 시계가 결정한다 — 최소 인원이
// 모여 있는데 아직 링크되지 않은 예약 방(배포 전 레코드, 실패한 sync)은 청소기가 스스로 잇는다.
await runTest('the sweep links a scheduled room that already has its runners, without any traffic', async () => {
  const slotStartAt = new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const store = buildStore([buildWaitingRoom({
    startMode: 'scheduled',
    slotStartAt,
    participants: [
      { userId: 'u1', isHost: true, joinedAt: isoAgo(10 * 60_000) },
      { userId: 'u2', isHost: false, isReady: true, joinedAt: isoAgo(60_000) },
    ],
  })]);
  store.users = [{ id: 'u1', name: '방장' }, { id: 'u2', name: '친구' }];

  const swept = await sweepStaleMatchState({
    mutateStore: (mutator) => Promise.resolve(mutator(store)),
    now: NOW,
  });

  assert.equal(swept.linkedRooms, 1);
  assert.equal(swept.removedRooms, 0);
  const [room] = store.matchRooms;
  assert.equal(typeof room.linkedMatchId, 'string');
  const [session] = store.matchSessions;
  assert.equal(session.id, room.linkedMatchId);
  assert.equal(session.isPartyRun, true);
  assert.equal(session.slotStartAt, slotStartAt);
  assert.deepEqual(session.participants.map((participant) => participant.userId), ['u1', 'u2']);
  const reserved = store.notifications.find((item) => item.userId === 'u1' && item.type === 'match_reserved');
  assert.match(reserved.body, /^친구님이 수락했어요 · .+ 시작$/);

  // 두 번째 청소는 아무것도 바꾸지 않는다 — 링크는 한 번뿐이다.
  const again = await sweepStaleMatchState({
    mutateStore: (mutator) => Promise.resolve(mutator(store)),
    now: NOW,
  });
  assert.equal(again.linkedRooms, 0);
  assert.equal(store.matchSessions.length, 1);
});

// 수락(isReady)이 빠진 게스트가 있으면 인원이 차 있어도 링크하지 않는다 — 시간이 정해지기 전에
// 들어와 있던 게스트는 대기실에서 그 시간을 수락해야 한다.
await runTest('the sweep never links a scheduled room whose guest has not accepted the time', async () => {
  const store = buildStore([buildWaitingRoom({
    startMode: 'scheduled',
    slotStartAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    participants: [
      { userId: 'u1', isHost: true, joinedAt: isoAgo(10 * 60_000) },
      { userId: 'u2', isHost: false, isReady: false, joinedAt: isoAgo(60_000) },
    ],
  })]);

  const swept = await sweepStaleMatchState({
    mutateStore: (mutator) => Promise.resolve(mutator(store)),
    now: NOW,
  });

  assert.equal(swept.linkedRooms, 0);
  assert.equal(store.matchRooms[0].linkedMatchId, null);
  assert.equal(store.matchSessions.length, 0);
});

await runTest('the sweep never links a scheduled room below its minimum', async () => {
  const store = buildStore([buildWaitingRoom({
    startMode: 'scheduled',
    slotStartAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  })]);

  const swept = await sweepStaleMatchState({
    mutateStore: (mutator) => Promise.resolve(mutator(store)),
    now: NOW,
  });

  assert.equal(swept.linkedRooms, 0);
  assert.equal(store.matchRooms[0].linkedMatchId, null);
  assert.equal(store.matchSessions.length, 0);
});
