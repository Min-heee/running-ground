import assert from 'node:assert/strict';
import { createJsonAdminRepository } from './adminRepository.mjs';

class TestApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStoreHarness(initialStore = {}) {
  let store = {
    users: [],
    runs: [],
    sessions: [],
    friendships: [],
    friendRequests: [],
    rewardRedemptions: [],
    integrationImports: [],
    offlineRaceEvents: [],
    notices: [],
    ...clone(initialStore),
  };

  return {
    loadStore() {
      return clone(store);
    },
    mutateStore(mutator) {
      const nextStore = clone(store);
      const result = mutator(nextStore);
      store = nextStore;
      return result;
    },
    getStore() {
      return clone(store);
    },
  };
}

function createRepositoryHarness(initialStore = {}) {
  const storeHarness = createStoreHarness(initialStore);
  let idIndex = 0;
  const repository = createJsonAdminRepository({
    loadStore: storeHarness.loadStore,
    mutateStore: storeHarness.mutateStore,
    ensureNoticeStore: (store) => {
      if (!Array.isArray(store.notices)) {
        store.notices = [];
      }
    },
    ensureOfflineRaceStore: (store) => {
      if (!Array.isArray(store.offlineRaceEvents)) {
        store.offlineRaceEvents = [];
      }
    },
    ensureIntegrationImports: (store) => {
      if (!Array.isArray(store.integrationImports)) {
        store.integrationImports = [];
      }
      return store.integrationImports;
    },
    findUserById: (store, userId) => {
      const user = store.users.find((entry) => entry.id === userId);

      if (!user) {
        throw new TestApiError(404, '사용자를 찾을 수 없어요.');
      }

      return user;
    },
    buildAdminOverview: (store) => ({
      counts: {
        users: store.users.length,
        notices: store.notices.length,
      },
    }),
    buildAdminUsers: (store) => ({
      users: store.users.map((user) => ({
        id: user.id,
        name: user.name,
      })),
    }),
    buildAdminNotices: (store) => ({
      items: [...(store.notices ?? [])]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((notice) => ({
          id: notice.id,
          title: notice.title,
          message: notice.message,
          priority: notice.priority,
          isActive: notice.isActive,
          createdAt: notice.createdAt,
          updatedAt: notice.updatedAt,
        })),
    }),
    buildActiveNotices: (store) => ({
      items: (store.notices ?? [])
        .filter((notice) => notice.isActive !== false)
        .map((notice) => ({
          id: notice.id,
          title: notice.title,
        })),
    }),
    buildNoticeEntry: (notice) => ({
      id: notice.id,
      title: notice.title,
      message: notice.message,
      priority: notice.priority,
      isActive: notice.isActive,
      createdAt: notice.createdAt,
      updatedAt: notice.updatedAt,
    }),
    nextId: (prefix) => {
      idIndex += 1;
      return `${prefix}-test-${idIndex}`;
    },
    nowIso: () => '2026-04-24T03:00:00.000Z',
    createError: (statusCode, message) => new TestApiError(statusCode, message),
  });

  return {
    repository,
    storeHarness,
  };
}

function assertApiError(error, statusCode, message) {
  assert(error instanceof TestApiError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.message, message);
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[adminRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[adminRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('creates, updates, lists, and deletes notices', async () => {
  const { repository, storeHarness } = createRepositoryHarness();

  const created = await repository.createNotice({
    input: {
      title: '긴급 점검',
      message: '오늘 밤 점검 예정',
      priority: 2,
      isActive: true,
    },
  });

  assert.equal(created.item.id, 'notice-test-1');
  assert.equal(storeHarness.getStore().notices.length, 1);
  assert.deepEqual(await repository.getActiveNotices(), {
    items: [{ id: 'notice-test-1', title: '긴급 점검' }],
  });

  const updated = await repository.updateNotice({
    noticeId: 'notice-test-1',
    input: {
      title: '점검 연기',
      message: '내일 새벽으로 변경',
      priority: 1,
      isActive: false,
    },
  });

  assert.equal(updated.item.title, '점검 연기');
  assert.equal((await repository.getActiveNotices()).items.length, 0);

  const deleted = await repository.deleteNotice({
    noticeId: 'notice-test-1',
  });

  assert.deepEqual(deleted, { items: [] });
});

await runTest('deletes a user and cleans related records', async () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', publicTag: '#ME001' },
      { id: 'user-friend', name: '친구', publicTag: '#FRI01' },
    ],
    runs: [
      { id: 'run-1', userId: 'user-me' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
    friendships: [
      { id: 'friendship-1', userIds: ['user-me', 'user-friend'] },
    ],
    friendRequests: [
      { id: 'request-1', requesterId: 'user-me', receiverId: 'user-friend' },
    ],
    rewardRedemptions: [
      { id: 'redemption-1', userId: 'user-me' },
    ],
    integrationImports: [
      { id: 'import-1', userId: 'user-me' },
    ],
    offlineRaceEvents: [
      { id: 'race-1', registeredUserTags: ['#ME001', '#FRI01'] },
    ],
  });

  const result = await repository.deleteUser({ userId: 'user-me' });
  const store = storeHarness.getStore();

  assert.deepEqual(result, {
    success: true,
    deletedUserId: 'user-me',
    users: [{ id: 'user-friend', name: '친구' }],
    // 애플 미연결 계정 — 철회할 토큰 없음 (라우트가 쓰고 응답에서 제거).
    appleRefreshToken: null,
  });
  assert.equal(store.users.length, 1);
  assert.equal(store.runs.length, 0);
  assert.equal(store.sessions.length, 0);
  assert.equal(store.friendships.length, 0);
  assert.equal(store.friendRequests.length, 0);
  assert.equal(store.rewardRedemptions.length, 0);
  assert.equal(store.integrationImports.length, 0);
  assert.deepEqual(store.offlineRaceEvents[0].registeredUserTags, ['#FRI01']);
});

// 크루대전 (2026-09-18): 관리자 삭제도 유저 탈퇴와 같은 계약 — 마지막 멤버면 크루가 닫힌다.
await runTest('deleteUser closes the crew of its last member and cancels pending join requests', async () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', publicTag: '#ME001' },
      { id: 'user-captain', name: '캡틴', publicTag: '#CAP01' },
    ],
    crews: [
      {
        id: 'crew-solo', name: '혼자', nameKey: '혼자', inviteCode: 'ABC234', captainUserId: 'user-me',
        createdByUserId: 'user-me', createdAt: '2026-10-01T00:00:00.000Z', closedAt: null, bans: [],
      },
      {
        id: 'crew-other', name: '노을', nameKey: '노을', inviteCode: 'XYZ789', captainUserId: 'user-captain',
        createdByUserId: 'user-captain', createdAt: '2026-10-01T00:00:00.000Z', closedAt: null, bans: [],
      },
    ],
    crewMembers: [
      { id: 'row-1', crewId: 'crew-solo', userId: 'user-me', role: 'captain', joinedAt: '2026-10-01T00:00:00.000Z', countsFrom: '2026-10-01T15:00:00.000Z', leftAt: null, leftReason: null },
      { id: 'row-2', crewId: 'crew-other', userId: 'user-captain', role: 'captain', joinedAt: '2026-10-01T00:00:00.000Z', countsFrom: '2026-10-01T15:00:00.000Z', leftAt: null, leftReason: null },
    ],
    crewJoinRequests: [
      { id: 'request-1', crewId: 'crew-other', userId: 'user-me', status: 'pending', createdAt: new Date().toISOString(), decidedAt: null },
    ],
    crewSeasonAwards: [],
  });

  await repository.deleteUser({ userId: 'user-me' });

  const store = storeHarness.getStore();
  assert.equal(store.crewMembers.find((row) => row.userId === 'user-me').leftReason, 'deleted');
  assert.equal(typeof store.crews.find((crew) => crew.id === 'crew-solo').closedAt, 'string');
  assert.equal(store.crews.find((crew) => crew.id === 'crew-other').closedAt, null);
  assert.equal(store.crewJoinRequests[0].status, 'cancelled');
});

await runTest('surfaces missing notice errors', async () => {
  const { repository } = createRepositoryHarness();

  await assert.rejects(repository.updateNotice({
    noticeId: 'notice-missing',
    input: {
      title: '없음',
      message: '없음',
      priority: 0,
      isActive: true,
    },
  }), (error) => {
    assertApiError(error, 404, '수정할 공지를 찾지 못했어요.');
    return true;
  });
});

// ── 라이브 강제 정리 (2026-07-23) ────────────────────────────────────────────

await runTest('force-deleting a live session removes it plus its linked room', async () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [{ id: 'u1', name: '회원G', publicTag: '#AAAAA' }],
    matchSessions: [
      { id: 'duel-match-9', mode: 'duel', participants: [{ userId: 'u1' }] },
      { id: 'group-match-2', mode: 'group', participants: [] },
    ],
    matchRooms: [
      { id: 'room-9', mode: 'duel', hostUserId: 'u1', participants: [{ userId: 'u1' }], linkedMatchId: 'duel-match-9' },
      // createdAt/joinedAt은 실제 방이 항상 갖는 필드 — 없으면 대기방 만료 판정이 유령 방으로 본다.
      { id: 'room-free', mode: 'group', hostUserId: 'u1', participants: [{ userId: 'u1', joinedAt: new Date().toISOString() }], linkedMatchId: null, createdAt: new Date().toISOString() },
    ],
  });

  const live = await repository.deleteLiveMatchSession({ sessionId: 'duel-match-9' });

  const store = storeHarness.getStore();
  assert.deepEqual(store.matchSessions.map((entry) => entry.id), ['group-match-2']);
  assert.deepEqual(store.matchRooms.map((entry) => entry.id), ['room-free']);
  // 응답은 갱신된 라이브 스냅샷.
  assert.equal(live.counts.sessions, 1);
  assert.equal(live.rooms.length, 1);
});

await runTest('force-deleting a linked room tears down its session too', async () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [{ id: 'u1', name: '회원G', publicTag: '#AAAAA' }],
    matchSessions: [{ id: 'group-match-7', mode: 'group', participants: [] }],
    matchRooms: [{ id: 'room-7', mode: 'group', hostUserId: 'u1', participants: [{ userId: 'u1' }], linkedMatchId: 'group-match-7' }],
  });

  await repository.deleteLiveMatchRoom({ roomId: 'room-7' });

  const store = storeHarness.getStore();
  assert.deepEqual(store.matchSessions, []);
  assert.deepEqual(store.matchRooms, []);
});

await runTest('deleting an unknown live session surfaces a 404', async () => {
  const { repository } = createRepositoryHarness({ users: [] });

  await assert.rejects(
    () => repository.deleteLiveMatchSession({ sessionId: 'nope' }),
    (error) => error.statusCode === 404,
  );
});
