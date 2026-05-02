import assert from 'node:assert/strict';
import { createJsonAuthRepository } from './authRepository.mjs';
import { verifyPassword } from '../auth.mjs';

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

function createRepositoryHarness(initialStore = {}) {
  const storeHarness = createStoreHarness(initialStore);
  let tokenIndex = 0;
  let idIndex = 0;

  const repository = createJsonAuthRepository({
    loadStore: storeHarness.loadStore,
    mutateStore: storeHarness.mutateStore,
    sessionTtlMs: 60 * 60 * 1000,
    createToken: () => {
      tokenIndex += 1;
      return `token-${tokenIndex}`;
    },
    nextId: (prefix) => {
      idIndex += 1;
      return `${prefix}-test-${idIndex}`;
    },
    buildProfile: (store, user) => ({
      id: user.id,
      name: user.name,
      publicTag: user.publicTag,
      lifetimeDistanceKm: store.runs
        .filter((run) => run.userId === user.id)
        .reduce((sum, run) => sum + run.distanceKm, 0),
    }),
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
    console.log(`[authRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[authRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('checks username availability', () => {
  const { repository } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        name: '러너',
        publicTag: '#RUN01',
      },
    ],
  });

  assert.deepEqual(repository.checkUsername('new-runner'), {
    username: 'new-runner',
    available: true,
    message: '사용할 수 있는 아이디예요.',
  });
  assert.deepEqual(repository.checkUsername('runner'), {
    username: 'runner',
    available: false,
    message: '이미 사용 중인 아이디예요.',
  });
});

await runTest('finds username by identity fields', () => {
  const { repository } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        realName: '민병희',
        phone: '01012345678',
        birthDate: '1990-01-01',
        name: '러너',
        publicTag: '#RUN01',
      },
    ],
  });

  assert.deepEqual(repository.findUsername({
    realName: '민병희',
    phone: '01012345678',
    birthDate: '1990-01-01',
  }), {
    success: true,
    username: 'runner',
    maskedPhone: '010-****-5678',
  });
});

await runTest('registers a user, hashes password, and creates a session', () => {
  const { repository, storeHarness } = createRepositoryHarness();
  const result = repository.register({
    username: 'new-runner',
    password: 'Password123',
    name: '새러너',
    realName: '민병희',
    phone: '01012345678',
    birthDate: '1990-01-01',
    region: {
      provinceName: '서울특별시',
      cityName: '',
      districtName: '강남구',
    },
    universityName: '서울대학교',
    addressDetail: '테헤란로 123',
  });
  const store = storeHarness.getStore();
  const user = store.users[0];

  assert.equal(result.accessToken, 'token-1');
  assert.equal(result.user.name, '새러너');
  assert.equal(store.users.length, 1);
  assert.equal(store.sessions.length, 1);
  assert.equal(store.sessions[0].userId, user.id);
  assert.equal(store.sessions[0].token, 'token-1');
  assert.equal(user.username, 'new-runner');
  assert.equal(user.realName, '민병희');
  assert.equal(user.password, undefined);
  assert.notEqual(user.passwordHash, 'Password123');
  assert.equal(verifyPassword('Password123', user.passwordHash), true);
  assert.match(user.publicTag, /^#[A-Z2-9]{5}$/);
  assert.equal(user.connectedSources.length, 7);
  assert.deepEqual(user.notificationSettings, {
    friendAlerts: true,
    districtAlerts: true,
    marketAlerts: false,
    matchReminders: true,
  });
});

await runTest('rejects duplicate registration', () => {
  const { repository } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        name: '러너',
        publicTag: '#RUN01',
      },
    ],
  });

  assert.throws(() => repository.register({
    username: 'runner',
    password: 'Password123',
    name: '중복러너',
    realName: '중복',
    phone: '01012345678',
    birthDate: '1990-01-01',
    region: {
      provinceName: '서울특별시',
      cityName: '',
      districtName: '강남구',
    },
    universityName: '',
    addressDetail: '테스트',
  }), (error) => {
    assertApiError(error, 409, '이미 사용 중인 아이디예요.');
    return true;
  });
});

await runTest('logs in with a valid password and rejects invalid credentials', () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        password: 'Password123',
        name: '러너',
        publicTag: '#RUN01',
      },
    ],
    runs: [
      {
        id: 'run-1',
        userId: 'user-existing',
        distanceKm: 5,
      },
    ],
  });

  assert.throws(() => repository.login({
    username: 'runner',
    password: 'WrongPassword1',
  }), (error) => {
    assertApiError(error, 401, '아이디 또는 비밀번호가 맞지 않아요.');
    return true;
  });

  const result = repository.login({
    username: 'runner',
    password: 'Password123',
  });
  const store = storeHarness.getStore();

  assert.equal(result.accessToken, 'token-1');
  assert.equal(result.user.id, 'user-existing');
  assert.equal(result.user.lifetimeDistanceKm, 5);
  assert.equal(store.sessions.length, 1);
  assert.equal(store.sessions[0].token, 'token-1');
});

await runTest('resets password by identity and clears sessions', () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        password: 'Password123',
        realName: '민병희',
        phone: '01012345678',
        birthDate: '1990-01-01',
        name: '러너',
        publicTag: '#RUN01',
      },
    ],
    sessions: [
      {
        token: 'token-1',
        userId: 'user-existing',
        createdAt: '2026-04-23T00:00:00.000Z',
        expiresAt: '2026-04-23T01:00:00.000Z',
      },
    ],
  });

  assert.deepEqual(repository.resetPassword({
    username: 'runner',
    realName: '민병희',
    phone: '01012345678',
    birthDate: '1990-01-01',
    newPassword: 'NewPassword123',
  }), {
    success: true,
    username: 'runner',
    message: '비밀번호를 새로 바꿨어요. 이제 새 비밀번호로 로그인해주세요.',
  });

  const store = storeHarness.getStore();
  assert.equal(store.sessions.length, 0);
  assert.equal(verifyPassword('NewPassword123', store.users[0].passwordHash), true);
});

await runTest('logs out idempotently', () => {
  const { repository, storeHarness } = createRepositoryHarness({
    sessions: [
      {
        token: 'token-1',
        userId: 'user-existing',
        createdAt: '2026-04-23T00:00:00.000Z',
        expiresAt: '2026-04-23T01:00:00.000Z',
      },
    ],
  });

  assert.deepEqual(repository.logout({ token: 'token-1' }), {
    success: true,
  });
  assert.equal(storeHarness.getStore().sessions.length, 0);
  assert.deepEqual(repository.logout({ token: 'token-1' }), {
    success: true,
  });
});

await runTest('deletes the current account and cleans related records', () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        password: 'Password123',
        name: '러너',
        publicTag: '#RUN01',
      },
      {
        id: 'user-friend',
        username: 'friend',
        password: 'Password123',
        name: '친구',
        publicTag: '#FRI01',
      },
    ],
    sessions: [
      {
        token: 'token-1',
        userId: 'user-existing',
        createdAt: '2026-04-23T00:00:00.000Z',
        expiresAt: '2026-04-23T01:00:00.000Z',
      },
      {
        token: 'token-friend',
        userId: 'user-friend',
        createdAt: '2026-04-23T00:00:00.000Z',
        expiresAt: '2026-04-23T01:00:00.000Z',
      },
    ],
    runs: [
      {
        id: 'run-1',
        userId: 'user-existing',
        distanceKm: 5,
      },
    ],
    friendships: [
      {
        id: 'friendship-1',
        userIds: ['user-existing', 'user-friend'],
      },
    ],
    friendRequests: [
      {
        id: 'request-1',
        requesterId: 'user-existing',
        receiverId: 'user-friend',
      },
    ],
    rewardRedemptions: [
      {
        id: 'reward-1',
        userId: 'user-existing',
      },
    ],
    integrationImports: [
      {
        id: 'import-1',
        userId: 'user-existing',
      },
    ],
    offlineRaceEvents: [
      {
        id: 'race-1',
        registeredUserTags: ['#RUN01', '#FRI01'],
      },
    ],
  });

  assert.deepEqual(repository.deleteAccount({ token: 'token-1' }), {
    success: true,
    deletedUserId: 'user-existing',
  });

  const store = storeHarness.getStore();
  assert.equal(store.users.length, 1);
  assert.equal(store.users[0].id, 'user-friend');
  assert.equal(store.sessions.length, 1);
  assert.equal(store.sessions[0].userId, 'user-friend');
  assert.equal(store.runs.length, 0);
  assert.equal(store.friendships.length, 0);
  assert.equal(store.friendRequests.length, 0);
  assert.equal(store.rewardRedemptions.length, 0);
  assert.equal(store.integrationImports.length, 0);
  assert.deepEqual(store.offlineRaceEvents[0].registeredUserTags, ['#FRI01']);
});

await runTest('requires a valid session to delete the current account', () => {
  const { repository } = createRepositoryHarness();

  assert.throws(() => repository.deleteAccount({ token: 'missing-token' }), (error) => {
    assertApiError(error, 401, '로그인이 필요해요.');
    return true;
  });
});
