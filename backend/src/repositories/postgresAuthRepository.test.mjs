import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../auth.mjs';
import { INITIAL_RANK } from '../lib/rankSystem.mjs';
import { createPostgresAuthRepository } from './postgresAuthRepository.mjs';

class TestApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

class FakePostgresDatabase {
  constructor(initialStore = {}) {
    this.users = clone(initialStore.users ?? []);
    this.sessions = clone(initialStore.sessions ?? []);
    this.runs = clone(initialStore.runs ?? []);
    this.integrationImports = clone(initialStore.integrationImports ?? []);
    this.friendRequests = clone(initialStore.friendRequests ?? []);
    this.friendships = clone(initialStore.friendships ?? []);
    this.rewardRedemptions = clone(initialStore.rewardRedemptions ?? []);
    this.offlineRaceEntries = clone(initialStore.offlineRaceEntries ?? []);
    this.socialAccounts = clone(initialStore.socialAccounts ?? []);
    this.appMetadata = clone(initialStore.appMetadata ?? {});
    this.insertUserError = initialStore.insertUserError;
    this.transactions = 0;
  }

  async transaction(callback) {
    this.transactions += 1;
    return callback(this);
  }

  async query(sql, params = []) {
    const normalizedSql = normalizeSql(sql);

    if (normalizedSql.startsWith('select * from users where username = $1')) {
      return {
        rows: this.users.filter((user) => user.username === params[0]).slice(0, 1),
      };
    }

    if (normalizedSql.startsWith('select * from users where real_name = $1 and phone = $2 and birth_date = $3 limit 1')) {
      return {
        rows: this.users.filter((user) => (
          user.real_name === params[0]
          && user.phone === params[1]
          && user.birth_date === params[2]
        )).slice(0, 1),
      };
    }

    if (normalizedSql.startsWith('select * from users where username = $1 and real_name = $2 and phone = $3 and birth_date = $4 limit 1')) {
      return {
        rows: this.users.filter((user) => (
          user.username === params[0]
          && user.real_name === params[1]
          && user.phone === params[2]
          && user.birth_date === params[3]
        )).slice(0, 1),
      };
    }

    if (normalizedSql.startsWith('select users.* from social_accounts join users on users.id = social_accounts.user_id where social_accounts.provider = $1 and social_accounts.provider_user_id = $2')) {
      const account = this.socialAccounts.find((entry) => (
        entry.provider === params[0] && entry.provider_user_id === params[1]
      ));

      if (!account) {
        return { rows: [] };
      }

      return {
        rows: this.users.filter((user) => user.id === account.user_id).slice(0, 1),
      };
    }

    if (normalizedSql.startsWith('select id from users where username = $1')) {
      return {
        rows: this.users
          .filter((user) => user.username === params[0])
          .slice(0, 1)
          .map((user) => ({ id: user.id })),
      };
    }

    if (normalizedSql.startsWith('select 1 from users where public_tag = $1')) {
      return {
        rows: this.users.some((user) => user.public_tag === params[0]) ? [{ '?column?': 1 }] : [],
      };
    }

    if (normalizedSql.startsWith('insert into users')) {
      if (this.insertUserError) {
        throw this.insertUserError;
      }

      this.users.push({
        id: params[0],
        username: params[1],
        password_hash: params[2],
        password_updated_at: params[3],
        nickname: params[4],
        real_name: params[5],
        phone: params[6],
        birth_date: params[7],
        public_tag: params[8],
        province_name: params[9],
        city_name: params[10],
        district_name: params[11],
        university_name: params[12],
        address_detail: params[13],
        reward_points: params[14],
        streak_days: params[15],
        rank_state: typeof params[16] === 'string' ? JSON.parse(params[16]) : clone(params[16]),
        connected_sources: typeof params[17] === 'string' ? JSON.parse(params[17]) : clone(params[17]),
        notification_settings: typeof params[18] === 'string' ? JSON.parse(params[18]) : clone(params[18]),
        created_at: params[19],
        updated_at: params[20],
      });

      return { rows: [] };
    }

    if (normalizedSql.startsWith('insert into social_accounts')) {
      this.socialAccounts.push({
        id: params[0],
        user_id: params[1],
        provider: params[2],
        provider_user_id: params[3],
        email: params[4],
        connected_at: params[5],
      });

      return { rows: [] };
    }

    if (normalizedSql.startsWith('insert into sessions')) {
      this.sessions.push({
        token: params[0],
        user_id: params[1],
        created_at: params[2],
        expires_at: params[3],
      });

      return { rows: [] };
    }

    if (normalizedSql.startsWith('select id, user_id, run_date, distance_km')) {
      return {
        rows: this.runs
          .filter((run) => run.user_id === params[0])
          .sort((left, right) => String(right.run_date).localeCompare(String(left.run_date))),
      };
    }

    if (normalizedSql.startsWith('select users.* from sessions join users on users.id = sessions.user_id where sessions.token = $1')) {
      const session = this.sessions.find((entry) => entry.token === params[0]);

      if (!session) {
        return { rows: [] };
      }

      return {
        rows: this.users.filter((user) => user.id === session.user_id).slice(0, 1),
      };
    }

    if (normalizedSql.startsWith('select value from app_metadata where key = $1 limit 1')) {
      const value = this.appMetadata[params[0]];
      return {
        rows: typeof value === 'undefined' ? [] : [{ value: clone(value) }],
      };
    }

    if (normalizedSql.startsWith('delete from sessions where token = $1')) {
      this.sessions = this.sessions.filter((session) => session.token !== params[0]);
      return { rows: [] };
    }

    if (normalizedSql.startsWith('delete from sessions where user_id = $1')) {
      this.sessions = this.sessions.filter((session) => session.user_id !== params[0]);
      return { rows: [] };
    }

    if (normalizedSql.startsWith('update users set password_hash = $2, password_updated_at = $3, updated_at = $3 where id = $1')) {
      this.users = this.users.map((user) => (
        user.id === params[0]
          ? {
              ...user,
              password_hash: params[1],
              password_updated_at: params[2],
              updated_at: params[2],
            }
          : user
      ));
      return { rows: [] };
    }

    if (normalizedSql.startsWith('delete from users where id = $1')) {
      this.users = this.users.filter((user) => user.id !== params[0]);
      this.sessions = this.sessions.filter((session) => session.user_id !== params[0]);
      this.runs = this.runs.filter((run) => run.user_id !== params[0]);
      this.integrationImports = this.integrationImports.filter((entry) => entry.user_id !== params[0]);
      this.friendRequests = this.friendRequests.filter((entry) => entry.requester_id !== params[0] && entry.receiver_id !== params[0]);
      this.friendships = this.friendships.filter((entry) => entry.user_a_id !== params[0] && entry.user_b_id !== params[0]);
      this.rewardRedemptions = this.rewardRedemptions.filter((entry) => entry.user_id !== params[0]);
      this.offlineRaceEntries = this.offlineRaceEntries.filter((entry) => entry.user_id !== params[0]);
      return { rows: [] };
    }

    if (normalizedSql.startsWith('insert into app_metadata (key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value = excluded.value, updated_at = now()')) {
      this.appMetadata[params[0]] = JSON.parse(params[1]);
      return { rows: [] };
    }

    throw new Error(`Unhandled fake SQL: ${normalizedSql}`);
  }
}

function createRepositoryHarness(initialStore = {}) {
  const database = new FakePostgresDatabase(initialStore);
  let tokenIndex = 0;
  let idIndex = 0;
  const publicTags = ['#TAG01', '#TAG02', '#TAG03'];

  const repository = createPostgresAuthRepository({
    database,
    sessionTtlMs: 60 * 60 * 1000,
    createToken: () => {
      tokenIndex += 1;
      return `token-${tokenIndex}`;
    },
    nextId: (prefix) => {
      idIndex += 1;
      return `${prefix}-test-${idIndex}`;
    },
    createPublicTag: () => publicTags.shift() ?? '#TAG99',
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
    database,
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
    console.log(`[postgresAuthRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[postgresAuthRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('checks username availability', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        nickname: '러너',
        public_tag: '#RUN01',
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
        password_hash: hashPassword('Password123'),
        nickname: '러너',
        real_name: '민병희',
        phone: '01012345678',
        birth_date: '1990-01-01',
        public_tag: '#RUN01',
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
  const { repository, database } = createRepositoryHarness();
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
    universityName: '서울대학교',
    addressDetail: '테헤란로 123',
  });
  const user = database.users[0];

  assert.equal(result.accessToken, 'token-1');
  assert.equal(result.user.name, '새러너');
  assert.equal(database.users.length, 1);
  assert.equal(database.sessions.length, 1);
  assert.equal(database.sessions[0].user_id, user.id);
  assert.equal(database.sessions[0].token, 'token-1');
  assert.equal(user.username, 'new-runner');
  assert.equal(user.real_name, '민병희');
  assert.notEqual(user.password_hash, 'Password123');
  assert.equal(verifyPassword('Password123', user.password_hash), true);
  assert.equal(user.public_tag, '#TAG01');
  assert.deepEqual(user.rank_state, INITIAL_RANK);
  assert.deepEqual(result.user.rankState, INITIAL_RANK);
  assert.equal(user.connected_sources.length, 7);
  assert.deepEqual(user.notification_settings, {
    friendAlerts: true,
    districtAlerts: true,
    marketAlerts: false,
    matchReminders: true,
  });
  assert.equal(database.transactions, 1);
});

await runTest('rejects duplicate registration', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        password_hash: hashPassword('Password123'),
        nickname: '러너',
        public_tag: '#RUN01',
      },
    ],
  });

  await assert.rejects(() => repository.register({
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

await runTest('maps database username unique violations to duplicate registration', async () => {
  const uniqueViolation = new Error('duplicate key value violates unique constraint "users_username_unique_idx"');
  uniqueViolation.code = '23505';
  uniqueViolation.constraint = 'users_username_unique_idx';
  const { repository } = createRepositoryHarness({
    insertUserError: uniqueViolation,
  });

  await assert.rejects(() => repository.register({
    username: 'runner',
    password: 'Password123',
    name: '동시가입러너',
    realName: '동시가입',
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

await runTest('logs in with a valid password and rejects invalid credentials', async () => {
  const { repository, database } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        password_hash: hashPassword('Password123'),
        nickname: '러너',
        public_tag: '#RUN01',
      },
    ],
    runs: [
      {
        id: 'run-1',
        user_id: 'user-existing',
        run_date: '2026-04-23',
        distance_km: 5,
        pace: '5:10',
        source_label: 'Nike Run Club',
        source_type: 'nrc',
      },
    ],
  });

  await assert.rejects(() => repository.login({
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

  assert.equal(result.accessToken, 'token-1');
  assert.equal(result.user.id, 'user-existing');
  assert.deepEqual(result.user.rankState, INITIAL_RANK);
  assert.equal(result.user.lifetimeDistanceKm, 5);
  assert.equal(database.sessions.length, 1);
  assert.equal(database.sessions[0].token, 'token-1');
});

await runTest('resets password by identity and clears sessions', async () => {
  const { repository, database } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        password_hash: hashPassword('Password123'),
        nickname: '러너',
        real_name: '민병희',
        phone: '01012345678',
        birth_date: '1990-01-01',
        public_tag: '#RUN01',
      },
    ],
    sessions: [
      {
        token: 'token-1',
        user_id: 'user-existing',
        created_at: '2026-04-23T00:00:00.000Z',
        expires_at: '2026-04-23T01:00:00.000Z',
      },
    ],
  });

  assert.deepEqual(await repository.resetPassword({
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

  assert.equal(database.sessions.length, 0);
  assert.equal(verifyPassword('NewPassword123', database.users[0].password_hash), true);
});

await runTest('logs out idempotently', async () => {
  const { repository, database } = createRepositoryHarness({
    sessions: [
      {
        token: 'token-1',
        user_id: 'user-existing',
        created_at: '2026-04-23T00:00:00.000Z',
        expires_at: '2026-04-23T01:00:00.000Z',
      },
    ],
  });

  assert.deepEqual(await repository.logout({ token: 'token-1' }), {
    success: true,
  });
  assert.equal(database.sessions.length, 0);
  assert.deepEqual(await repository.logout({ token: 'token-1' }), {
    success: true,
  });
});

await runTest('deletes the current account and lets cascades clear related records', async () => {
  const { repository, database } = createRepositoryHarness({
    users: [
      {
        id: 'user-existing',
        username: 'runner',
        password_hash: hashPassword('Password123'),
        nickname: '러너',
        public_tag: '#RUN01',
      },
      {
        id: 'user-friend',
        username: 'friend',
        password_hash: hashPassword('Password123'),
        nickname: '친구',
        public_tag: '#FRI01',
      },
    ],
    sessions: [
      {
        token: 'token-1',
        user_id: 'user-existing',
        created_at: '2026-04-23T00:00:00.000Z',
        expires_at: '2026-04-23T01:00:00.000Z',
      },
      {
        token: 'token-friend',
        user_id: 'user-friend',
        created_at: '2026-04-23T00:00:00.000Z',
        expires_at: '2026-04-23T01:00:00.000Z',
      },
    ],
    runs: [
      {
        id: 'run-1',
        user_id: 'user-existing',
        run_date: '2026-04-23',
        distance_km: 5,
      },
    ],
    integrationImports: [
      {
        id: 'import-1',
        user_id: 'user-existing',
      },
    ],
    friendRequests: [
      {
        id: 'request-1',
        requester_id: 'user-existing',
        receiver_id: 'user-friend',
      },
    ],
    friendships: [
      {
        id: 'friendship-1',
        user_a_id: 'user-existing',
        user_b_id: 'user-friend',
      },
    ],
    rewardRedemptions: [
      {
        id: 'reward-1',
        user_id: 'user-existing',
      },
    ],
    offlineRaceEntries: [
      {
        id: 'entry-1',
        user_id: 'user-existing',
      },
    ],
    appMetadata: {
      live_run_shares: {
        'user-existing': {
          enabled: true,
          status: 'running',
          locationLabel: '성수동 근처',
          updatedAt: '2026-04-24T00:00:00.000Z',
        },
      },
    },
  });

  assert.deepEqual(await repository.deleteAccount({ token: 'token-1' }), {
    success: true,
    deletedUserId: 'user-existing',
  });

  assert.equal(database.users.length, 1);
  assert.equal(database.users[0].id, 'user-friend');
  assert.equal(database.sessions.length, 1);
  assert.equal(database.sessions[0].user_id, 'user-friend');
  assert.equal(database.runs.length, 0);
  assert.equal(database.integrationImports.length, 0);
  assert.equal(database.friendRequests.length, 0);
  assert.equal(database.friendships.length, 0);
  assert.equal(database.rewardRedemptions.length, 0);
  assert.equal(database.offlineRaceEntries.length, 0);
  assert.deepEqual(database.appMetadata.live_run_shares, {});
});

await runTest('requires a valid session to delete the current account', async () => {
  const { repository } = createRepositoryHarness();

  await assert.rejects(() => repository.deleteAccount({ token: 'missing-token' }), (error) => {
    assertApiError(error, 401, '로그인이 필요해요.');
    return true;
  });
});

await runTest('findOrCreateSocialUser creates a passwordless user then reuses it by identity', async () => {
  const { repository, database } = createRepositoryHarness();

  const first = await repository.findOrCreateSocialUser({
    provider: 'kakao',
    providerUserId: 'kakao-123',
    email: 'a@b.com',
    name: '카카오유저',
  });
  assert.equal(typeof first.accessToken, 'string');
  assert.equal(first.user.name, '카카오유저');
  assert.equal(first.isNewUser, true);
  assert.equal(database.transactions, 1);

  // Passwordless: the inserted user row carries a null password_hash.
  assert.equal(database.users.length, 1);
  assert.equal(database.users[0].password_hash, null);

  // The social account row links the provider identity to the new user.
  assert.equal(database.socialAccounts.length, 1);
  assert.equal(database.socialAccounts[0].user_id, database.users[0].id);
  assert.equal(database.socialAccounts[0].provider, 'kakao');
  assert.equal(database.socialAccounts[0].provider_user_id, 'kakao-123');
  assert.equal(database.socialAccounts[0].email, 'a@b.com');

  // Same social identity → no new user, same id, fresh session token.
  const second = await repository.findOrCreateSocialUser({ provider: 'kakao', providerUserId: 'kakao-123' });
  assert.equal(second.user.id, first.user.id);
  assert.equal(second.isNewUser, false);
  assert.equal(database.users.length, 1);
  assert.equal(database.socialAccounts.length, 1);
  assert.notEqual(second.accessToken, first.accessToken);

  // Same providerUserId but different provider → a distinct user; blank name falls back.
  const third = await repository.findOrCreateSocialUser({ provider: 'naver', providerUserId: 'kakao-123', name: '  ' });
  assert.notEqual(third.user.id, first.user.id);
  assert.equal(third.isNewUser, true);
  assert.equal(database.users.length, 2);
  assert.equal(database.socialAccounts.length, 2);
  assert.equal(third.user.name, '네이버 러너');
});
