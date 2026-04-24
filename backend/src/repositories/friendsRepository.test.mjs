import assert from 'node:assert/strict';
import { createJsonFriendsRepository } from './friendsRepository.mjs';

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
    sessions: [],
    friendships: [],
    friendRequests: [],
    runs: [],
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

function createRepositoryHarness(initialStore = {}, metricsByUserId = {}) {
  const storeHarness = createStoreHarness(initialStore);
  let idIndex = 0;

  const repository = createJsonFriendsRepository({
    loadStore: storeHarness.loadStore,
    mutateStore: storeHarness.mutateStore,
    requireUserByToken: (store, token) => {
      const session = store.sessions.find((entry) => entry.token === token);

      if (!session) {
        throw new TestApiError(401, '세션이 만료됐어. 다시 로그인해줘.');
      }

      return store.users.find((entry) => entry.id === session.userId);
    },
    findUserById: (store, userId) => {
      const user = store.users.find((entry) => entry.id === userId);

      if (!user) {
        throw new TestApiError(404, '사용자를 찾을 수 없어.');
      }

      return user;
    },
    getRunsForUser: (store, userId) => store.runs
      .filter((entry) => entry.userId === userId)
      .sort((left, right) => right.date.localeCompare(left.date)),
    getUserMetrics: (_store, userId) => metricsByUserId[userId] ?? {
      currentWeekDistanceKm: 0,
      currentWeekPoints: 0,
      currentMonthDistanceKm: 0,
      currentMonthPoints: 0,
    },
    buildRunDetail: (run, weeklyDistanceKm, sourceOverride) => ({
      run: {
        ...run,
        source: sourceOverride ?? run.source,
      },
      weeklyDistanceKm,
    }),
    nextId: (prefix) => {
      idIndex += 1;
      return `${prefix}-test-${idIndex}`;
    },
    nowIso: () => '2026-04-24T00:00:00.000Z',
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
    console.log(`[friendsRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[friendsRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('returns leaderboard with ranks and actionable requests', () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', publicTag: '#ME001' },
      { id: 'user-juno', name: '준호', publicTag: '#JUNO1' },
      { id: 'user-seoyeon', name: '서연', publicTag: '#SEO01' },
      { id: 'user-gayeong', name: '가영', publicTag: '#GAY01' },
      { id: 'user-haneul', name: '하늘', publicTag: '#HAN01' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
    friendships: [
      { id: 'friendship-1', userIds: ['user-me', 'user-juno'] },
      { id: 'friendship-2', userIds: ['user-me', 'user-seoyeon'] },
    ],
    friendRequests: [
      { id: 'request-1', requesterId: 'user-gayeong', receiverId: 'user-me', status: 'pending' },
      { id: 'request-2', requesterId: 'user-me', receiverId: 'user-haneul', status: 'pending' },
      { id: 'request-3', requesterId: 'user-haneul', receiverId: 'user-me', status: 'accepted' },
    ],
  }, {
    'user-me': { currentWeekDistanceKm: 10, currentWeekPoints: 20, currentMonthDistanceKm: 30, currentMonthPoints: 40 },
    'user-juno': { currentWeekDistanceKm: 12, currentWeekPoints: 18, currentMonthDistanceKm: 50, currentMonthPoints: 60 },
    'user-seoyeon': { currentWeekDistanceKm: 10, currentWeekPoints: 25, currentMonthDistanceKm: 45, currentMonthPoints: 55 },
  });

  const result = repository.getLeaderboard({ token: 'token-me' });

  assert.deepEqual(result.ranks.map((entry) => `${entry.rank}:${entry.name}`), [
    '1:준호',
    '2:서연',
    '3:민병희',
  ]);
  assert.deepEqual(result.requests, [
    { id: 'request-1', name: '가영', tag: '#GAY01', status: 'received' },
    { id: 'request-2', name: '하늘', tag: '#HAN01', status: 'pending' },
  ]);
});

await runTest('stores live sharing and exposes running location on leaderboard', () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', publicTag: '#ME001' },
      { id: 'user-juno', name: '준호', publicTag: '#JUNO1' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
    friendships: [
      { id: 'friendship-1', userIds: ['user-me', 'user-juno'] },
    ],
  }, {
    'user-me': { currentWeekDistanceKm: 8, currentWeekPoints: 12, currentMonthDistanceKm: 24, currentMonthPoints: 30 },
    'user-juno': { currentWeekDistanceKm: 12, currentWeekPoints: 18, currentMonthDistanceKm: 40, currentMonthPoints: 50 },
  });

  const updated = repository.updateLiveSharing({
    token: 'token-me',
    enabled: true,
    status: 'running',
    locationLabel: '성수동 근처',
  });
  const leaderboard = repository.getLeaderboard({ token: 'token-me' });

  assert.deepEqual(updated, {
    success: true,
    liveSharingEnabled: true,
    isRunningNow: true,
    locationLabel: '성수동 근처',
    updatedAt: '2026-04-24T00:00:00.000Z',
  });
  assert.equal(storeHarness.getStore().liveRunShares[0].locationLabel, '성수동 근처');
  assert.equal(
    leaderboard.ranks.find((entry) => entry.id === 'user-me')?.liveLocationLabel,
    '성수동 근처',
  );
});

await runTest('creates a friend request and rejects duplicates', () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', publicTag: '#ME001' },
      { id: 'user-new', name: '새친구', publicTag: '#NEW01' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
  });

  const created = repository.createRequest({
    token: 'token-me',
    tag: '#NEW01',
  });

  assert.deepEqual(created, {
    success: true,
    requestId: 'request-test-1',
    status: 'pending',
  });
  assert.equal(storeHarness.getStore().friendRequests.length, 1);

  assert.throws(() => repository.createRequest({
    token: 'token-me',
    tag: '#NEW01',
  }), (error) => {
    assertApiError(error, 409, '이미 대기 중인 친구 요청이 있어.');
    return true;
  });
});

await runTest('accepts a received friend request and creates a friendship', () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', publicTag: '#ME001' },
      { id: 'user-other', name: '다른친구', publicTag: '#OTH01' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
    friendRequests: [
      { id: 'request-1', requesterId: 'user-other', receiverId: 'user-me', status: 'pending' },
    ],
  });

  const result = repository.respondToRequest({
    token: 'token-me',
    requestId: 'request-1',
    action: 'accept',
  });
  const store = storeHarness.getStore();

  assert.deepEqual(result, {
    success: true,
    requestId: 'request-1',
    status: 'accepted',
  });
  assert.equal(store.friendRequests[0].status, 'accepted');
  assert.equal(store.friendships.length, 1);
  assert.deepEqual(store.friendships[0].userIds, ['user-other', 'user-me']);
});

await runTest('returns friend activity and friend run detail', () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', publicTag: '#ME001' },
      { id: 'user-friend', name: '친구', publicTag: '#FRI01' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
    friendships: [
      { id: 'friendship-1', userIds: ['user-me', 'user-friend'] },
    ],
    runs: [
      { id: 'run-1', userId: 'user-friend', date: '2026-04-23', distanceKm: 7.2, pace: '05:15/km', source: 'NRC' },
      { id: 'run-2', userId: 'user-friend', date: '2026-04-22', distanceKm: 5, pace: '05:40/km', source: 'NRC' },
    ],
  }, {
    'user-me': { currentWeekDistanceKm: 6, currentWeekPoints: 10, currentMonthDistanceKm: 16, currentMonthPoints: 30 },
    'user-friend': { currentWeekDistanceKm: 12.2, currentWeekPoints: 22, currentMonthDistanceKm: 50, currentMonthPoints: 80 },
  });

  const activity = repository.getFriendActivity({
    token: 'token-me',
    friendId: 'user-friend',
  });
  const runDetail = repository.getFriendRun({
    token: 'token-me',
    friendId: 'user-friend',
    runId: 'run-2',
  });

  assert.equal(activity.friend.rank, 1);
  assert.equal(activity.friend.name, '친구');
  assert.equal(activity.monthlyDistanceKm, 50);
  assert.equal(activity.monthlyPoints, 80);
  assert.equal(activity.runs.length, 2);
  assert.equal(runDetail.run.id, 'run-2');
  assert.equal(runDetail.run.source, '친구 기록');
  assert.equal(runDetail.weeklyDistanceKm, 12.2);
});

await runTest('rejects access to non-friend activity', () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', publicTag: '#ME001' },
      { id: 'user-stranger', name: '낯선친구', publicTag: '#STR01' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
  });

  assert.throws(() => repository.getFriendActivity({
    token: 'token-me',
    friendId: 'user-stranger',
  }), (error) => {
    assertApiError(error, 403, '친구로 연결된 사용자 기록만 볼 수 있어.');
    return true;
  });
});
