import assert from 'node:assert/strict';
import { createJsonAuthRepository } from './authRepository.mjs';
import { verifyPassword } from '../auth.mjs';
import { INITIAL_RANK } from '../lib/rankSystem.mjs';

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
      rankState: user.rankState,
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

// A store-seedable verified phone challenge — register() ('signup') and resetPassword() ('reset')
// each require one for the exact number, matching by verifiedToken, and consume it on success.
function verifiedPhoneChallenge(purpose, phone, verifiedToken) {
  return {
    id: `req-${verifiedToken}`,
    purpose,
    phone,
    status: 'verified',
    verifiedToken,
    verifiedAt: '2024-01-01T00:00:00.000Z',
    registrationExpiresAt: '2999-12-31T00:00:00.000Z',
    attempts: 0,
    maxAttempts: 5,
    consumedAt: '',
  };
}

function verifiedSignupPhoneChallenge(phone, verifiedToken) {
  return verifiedPhoneChallenge('signup', phone, verifiedToken);
}

function verifiedResetPhoneChallenge(phone, verifiedToken) {
  return verifiedPhoneChallenge('reset', phone, verifiedToken);
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

await runTest('checks username availability', async () => {
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

  assert.deepEqual(await repository.checkUsername('new-runner'), {
    username: 'new-runner',
    available: true,
    message: '사용할 수 있는 아이디예요.',
  });
  assert.deepEqual(await repository.checkUsername('runner'), {
    username: 'runner',
    available: false,
    message: '이미 사용 중인 아이디예요.',
  });
});

await runTest('finds username by identity fields', async () => {
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

  assert.deepEqual(await repository.findUsername({
    realName: '민병희',
    phone: '01012345678',
    birthDate: '1990-01-01',
  }), {
    success: true,
    username: 'runner',
    maskedPhone: '010-****-5678',
  });
});

await runTest('registers a user, hashes password, and creates a session', async () => {
  const { repository, storeHarness } = createRepositoryHarness({
    phoneVerificationChallenges: [verifiedSignupPhoneChallenge('01012345678', 'vt-register-1')],
  });
  const result = await repository.register({
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
    addressDetail: '테헤란로 123',
    phoneVerificationToken: 'vt-register-1',
  });
  const store = storeHarness.getStore();
  const user = store.users[0];

  assert.equal(store.phoneVerificationChallenges[0].status, 'consumed');

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
  assert.deepEqual(user.rankState, INITIAL_RANK);
  assert.deepEqual(result.user.rankState, INITIAL_RANK);
  assert.deepEqual(user.notificationSettings, {
    friendAlerts: true,
    districtAlerts: true,
    marketAlerts: false,
    matchReminders: true,
  });
});

await runTest('rejects duplicate registration', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        name: '러너',
        publicTag: '#RUN01',
      },
    ],
    phoneVerificationChallenges: [verifiedSignupPhoneChallenge('01012345678', 'vt-dup')],
  });

  await assert.rejects(repository.register({
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
    addressDetail: '테스트',
    phoneVerificationToken: 'vt-dup',
  }), (error) => {
    assertApiError(error, 409, '이미 사용 중인 아이디예요.');
    return true;
  });
});

await runTest('rejects registration when the phone number is already in use', async () => {
  const { repository, storeHarness } = createRepositoryHarness({
    phoneVerificationChallenges: [
      verifiedSignupPhoneChallenge('01012345678', 'vt-phone-first'),
      verifiedSignupPhoneChallenge('01012345678', 'vt-phone-second'),
    ],
  });

  await repository.register({
    username: 'first-runner',
    password: 'Password123',
    name: '첫러너',
    realName: '민병희',
    phone: '01012345678',
    birthDate: '1990-01-01',
    region: {
      provinceName: '서울특별시',
      cityName: '',
      districtName: '강남구',
    },
    addressDetail: '테헤란로 123',
    phoneVerificationToken: 'vt-phone-first',
  });

  assert.equal(storeHarness.getStore().users.length, 1);

  // A SECOND signup with the SAME phone (different username) is rejected, even though
  // it carries its own freshly verified phone challenge.
  await assert.rejects(repository.register({
    username: 'second-runner',
    password: 'Password456',
    name: '둘째러너',
    realName: '김러너',
    phone: '01012345678',
    birthDate: '1999-02-24',
    region: {
      provinceName: '서울특별시',
      cityName: '',
      districtName: '서초구',
    },
    addressDetail: '서초대로 1',
    phoneVerificationToken: 'vt-phone-second',
  }), (error) => {
    assertApiError(error, 409, '이 번호로 이미 가입한 계정이 있어요. 로그인하거나 비밀번호 찾기를 이용해줘.');
    return true;
  });

  const store = storeHarness.getStore();
  assert.equal(store.users.length, 1);
  assert.equal(store.sessions.length, 1);
});

await runTest('rejects registration without a verified phone challenge', async () => {
  const { repository } = createRepositoryHarness();

  await assert.rejects(repository.register({
    username: 'unverified-runner',
    password: 'Password123',
    name: '미인증',
    realName: '미인증',
    phone: '01012345678',
    birthDate: '1990-01-01',
    region: {
      provinceName: '서울특별시',
      cityName: '',
      districtName: '강남구',
    },
    addressDetail: '테스트',
    phoneVerificationToken: 'no-such-token',
  }), (error) => {
    assertApiError(error, 400, '휴대폰 인증을 먼저 완료해주세요.');
    return true;
  });
});

await runTest('logs in with a valid password and rejects invalid credentials', async () => {
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

  await assert.rejects(repository.login({
    username: 'runner',
    password: 'WrongPassword1',
  }), (error) => {
    assertApiError(error, 401, '아이디 또는 비밀번호가 맞지 않아요.');
    return true;
  });

  const result = await repository.login({
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

await runTest('resets password with a verified reset challenge, clears sessions, and consumes the challenge', async () => {
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
    phoneVerificationChallenges: [verifiedResetPhoneChallenge('01012345678', 'vt-reset-1')],
  });

  assert.deepEqual(await repository.resetPassword({
    username: 'runner',
    realName: '민병희',
    phone: '01012345678',
    birthDate: '1990-01-01',
    newPassword: 'NewPassword123',
    phoneVerificationToken: 'vt-reset-1',
  }), {
    success: true,
    username: 'runner',
    message: '비밀번호를 새로 바꿨어요. 이제 새 비밀번호로 로그인해주세요.',
  });

  const store = storeHarness.getStore();
  assert.equal(store.sessions.length, 0);
  assert.equal(verifyPassword('NewPassword123', store.users[0].passwordHash), true);
  // The reset challenge is consumed so its token can't be replayed.
  assert.equal(store.phoneVerificationChallenges[0].status, 'consumed');
});

await runTest('rejects password reset without a verified reset challenge', async () => {
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
    // A verified SIGNUP challenge for the same phone must NOT satisfy a reset (purpose-scoped).
    phoneVerificationChallenges: [verifiedSignupPhoneChallenge('01012345678', 'vt-wrong-purpose')],
  });

  await assert.rejects(repository.resetPassword({
    username: 'runner',
    realName: '민병희',
    phone: '01012345678',
    birthDate: '1990-01-01',
    newPassword: 'NewPassword123',
    phoneVerificationToken: 'vt-wrong-purpose',
  }), (error) => {
    assertApiError(error, 400, '휴대폰 인증을 먼저 완료해주세요.');
    return true;
  });

  const store = storeHarness.getStore();
  // The password and sessions are untouched when the reset is rejected.
  assert.equal(store.sessions.length, 1);
  assert.equal(verifyPassword('Password123', store.users[0].passwordHash ?? store.users[0].password), true);
});

await runTest('logs out idempotently', async () => {
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

  assert.deepEqual(await repository.logout({ token: 'token-1' }), {
    success: true,
  });
  assert.equal(storeHarness.getStore().sessions.length, 0);
  assert.deepEqual(await repository.logout({ token: 'token-1' }), {
    success: true,
  });
});

await runTest('deletes the current account and cleans related records', async () => {
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

  assert.deepEqual(await repository.deleteAccount({ token: 'token-1' }), {
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

await runTest('requires a valid session to delete the current account', async () => {
  const { repository } = createRepositoryHarness();

  await assert.rejects(repository.deleteAccount({ token: 'missing-token' }), (error) => {
    assertApiError(error, 401, '로그인이 필요해요.');
    return true;
  });
});

await runTest('findOrCreateSocialUser creates a passwordless user then reuses it by identity', async () => {
  const { repository, storeHarness } = createRepositoryHarness();

  const first = await repository.findOrCreateSocialUser({
    provider: 'kakao',
    providerUserId: 'kakao-123',
    email: 'a@b.com',
    name: '카카오유저',
  });
  assert.equal(typeof first.accessToken, 'string');
  assert.equal(first.user.name, '카카오유저');
  assert.equal(first.isNewUser, true);

  const afterFirst = storeHarness.getStore();
  assert.equal(afterFirst.users.length, 1);
  assert.equal(afterFirst.users[0].passwordHash, undefined);
  assert.equal(afterFirst.users[0].socialAccounts[0].provider, 'kakao');
  assert.equal(afterFirst.users[0].socialAccounts[0].providerUserId, 'kakao-123');
  assert.equal(afterFirst.users[0].socialAccounts[0].email, 'a@b.com');

  // Same social identity → no new user, same id, fresh session token.
  const second = await repository.findOrCreateSocialUser({ provider: 'kakao', providerUserId: 'kakao-123' });
  assert.equal(second.user.id, first.user.id);
  assert.equal(second.isNewUser, false);
  assert.equal(storeHarness.getStore().users.length, 1);
  assert.notEqual(second.accessToken, first.accessToken);

  // Same providerUserId but different provider → a distinct user; blank name falls back.
  const third = await repository.findOrCreateSocialUser({ provider: 'naver', providerUserId: 'kakao-123', name: '  ' });
  assert.notEqual(third.user.id, first.user.id);
  assert.equal(third.isNewUser, true);
  assert.equal(storeHarness.getStore().users.length, 2);
  assert.equal(third.user.name, '네이버 러너');
});
