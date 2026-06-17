// Real-Postgres integration suite for the postgres* repositories.
//
// Stage 2 of the Postgres-primary migration. Unlike postgres*Repository.test.mjs (which run
// against an in-memory fake), this suite executes the REAL repository SQL against a REAL
// Postgres reached via BACKEND_POSTGRES_DATABASE_URL (or DATABASE_URL). It is gated: with no
// URL set it prints a skip line and exits 0, so `npm test` / CI stay green without a database.
//
// Run it with a database:
//   BACKEND_POSTGRES_DATABASE_URL=postgres://user:pass@host:5432/db npm run test:integration

import assert from 'node:assert/strict';
import { verifyPassword } from '../../auth.mjs';
import { ApiError } from '../../response/httpResponse.mjs';
import { buildRunDetail } from '../../lib/runHelpers.mjs';
import { buildUserRunMetrics } from '../../points.mjs';
import { createPostgresAuthRepository } from '../../repositories/postgresAuthRepository.mjs';
import { createPostgresFriendsRepository } from '../../repositories/postgresFriendsRepository.mjs';
import { createPostgresLeagueRepository } from '../../repositories/postgresLeagueRepository.mjs';
import { createPostgresRunsRepository } from '../../repositories/postgresRunsRepository.mjs';
import {
  applySchema,
  createIntegrationDatabase,
  hasIntegrationDatabaseUrl,
  truncateAll,
} from './pgIntegrationHarness.mjs';

const SESSION_TTL_MS = 60 * 60 * 1000;

const SOURCE_LABELS = {
  apple_health: 'Apple Health',
  health_connect: 'Health Connect',
  manual: 'Manual',
  nrc: 'Nike Run Club',
  mynb: 'MyNB',
  runningground: 'RunningGround',
};

// Test-local profile builder that mirrors the existing postgresAuthRepository.test.mjs harness:
// it intentionally exposes `user.id` (the production buildProfile in userStoreHelpers omits it)
// so assertions can compare user identities across responses. `store.runs` is the run list the
// repo loads via loadProfileStore.
function buildProfile(store, user) {
  return {
    id: user.id,
    name: user.name,
    publicTag: user.publicTag,
    rankState: user.rankState,
    lifetimeDistanceKm: store.runs
      .filter((run) => run.userId === user.id)
      .reduce((sum, run) => sum + run.distanceKm, 0),
  };
}

// Guard: no database configured. Print the agreed skip line and exit clean. This is what keeps
// `npm test` green on machines/CI without Postgres.
if (!hasIntegrationDatabaseUrl()) {
  console.log('[postgresRepositories.integration] skipped — set BACKEND_POSTGRES_DATABASE_URL');
  process.exit(0);
}

// --- Deterministic dependency factories (mirror the production wiring in server.mjs and the
// existing repo test harnesses), but with monotonically unique ids/tokens so concurrent rows
// never collide inside a single test run. ---
function createDeps() {
  let idIndex = 0;
  let tokenIndex = 0;
  let publicTagIndex = 0;

  return {
    nextId: (prefix) => {
      idIndex += 1;
      return `${prefix}-it-${idIndex}-${Date.now()}`;
    },
    createToken: () => {
      tokenIndex += 1;
      return `token-it-${tokenIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    },
    createPublicTag: () => {
      publicTagIndex += 1;
      // Deterministic + unique per call to avoid public_tag collisions across users.
      return `#IT${String(publicTagIndex).padStart(3, '0')}`;
    },
    createError: (statusCode, message) => new ApiError(statusCode, message),
  };
}

function createRepositories(database) {
  const deps = createDeps();

  const authRepository = createPostgresAuthRepository({
    database,
    sessionTtlMs: SESSION_TTL_MS,
    createToken: deps.createToken,
    nextId: deps.nextId,
    buildProfile,
    createError: deps.createError,
    createPublicTag: deps.createPublicTag,
  });

  const runsRepository = createPostgresRunsRepository({
    database,
    nextId: deps.nextId,
    buildRunDetail,
    buildUserMetrics: buildUserRunMetrics,
    createError: deps.createError,
    sourceLabels: SOURCE_LABELS,
  });

  const friendsRepository = createPostgresFriendsRepository({
    database,
    nextId: deps.nextId,
    buildRunDetail,
    buildUserMetrics: buildUserRunMetrics,
    createError: deps.createError,
  });

  const leagueRepository = createPostgresLeagueRepository({
    database,
    buildUserMetrics: buildUserRunMetrics,
    createError: deps.createError,
  });

  return {
    deps,
    authRepository,
    runsRepository,
    friendsRepository,
    leagueRepository,
  };
}

function buildRegistration(overrides = {}) {
  return {
    username: 'integration-runner',
    password: 'Password123',
    name: '통합러너',
    realName: '민병희',
    phone: '01012345678',
    birthDate: '1990-01-01',
    region: {
      provinceName: '서울특별시',
      cityName: '',
      districtName: '강남구',
    },
    addressDetail: '테헤란로 123',
    ...overrides,
  };
}

const database = createIntegrationDatabase();

let failures = 0;

// Each test truncates all tables first (per-test isolation) then exercises real SQL.
async function runTest(name, testFn) {
  try {
    await truncateAll(database);
    await testFn();
    console.log(`[postgresRepositories.integration] ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`[postgresRepositories.integration] failed - ${name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  }
}

try {
  // Schema uses `create table if not exists`, so applying it is safe and idempotent.
  await applySchema(database);

  // ---------------------------------------------------------------------------
  // auth / social (Stage 1 focus)
  // ---------------------------------------------------------------------------

  await runTest('register then login works against real Postgres', async () => {
    const { authRepository } = createRepositories(database);

    const registered = await authRepository.register(buildRegistration());
    assert.equal(typeof registered.accessToken, 'string');
    assert.equal(registered.user.name, '통합러너');

    // The row landed in Postgres with a hashed (non-plaintext) password.
    const userRows = await database.query('select * from users where username = $1', ['integration-runner']);
    assert.equal(userRows.rows.length, 1);
    assert.notEqual(userRows.rows[0].password_hash, 'Password123');
    assert.equal(verifyPassword('Password123', userRows.rows[0].password_hash), true);

    const sessionRows = await database.query('select * from sessions where user_id = $1', [userRows.rows[0].id]);
    assert.equal(sessionRows.rows.length, 1);

    const loggedIn = await authRepository.login({ username: 'integration-runner', password: 'Password123' });
    assert.equal(typeof loggedIn.accessToken, 'string');
    assert.notEqual(loggedIn.accessToken, registered.accessToken);

    await assert.rejects(
      () => authRepository.login({ username: 'integration-runner', password: 'WrongPassword1' }),
      (error) => error instanceof ApiError && error.statusCode === 401,
    );
  });

  await runTest('findOrCreateSocialUser creates a passwordless user (password_hash IS NULL)', async () => {
    const { authRepository } = createRepositories(database);

    const first = await authRepository.findOrCreateSocialUser({
      provider: 'kakao',
      providerUserId: 'kakao-real-1',
      email: 'social@example.com',
      name: '카카오러너',
    });
    assert.equal(first.isNewUser, true);
    assert.equal(first.user.name, '카카오러너');

    // Verify NULL password_hash directly in the database.
    const nullCheck = await database.query(
      'select id, password_hash from users where id = (select user_id from social_accounts where provider = $1 and provider_user_id = $2)',
      ['kakao', 'kakao-real-1'],
    );
    assert.equal(nullCheck.rows.length, 1);
    assert.equal(nullCheck.rows[0].password_hash, null);

    // The social_accounts link row exists with the right provider identity.
    const accountRows = await database.query(
      'select * from social_accounts where provider = $1 and provider_user_id = $2',
      ['kakao', 'kakao-real-1'],
    );
    assert.equal(accountRows.rows.length, 1);
    assert.equal(accountRows.rows[0].user_id, nullCheck.rows[0].id);
    assert.equal(accountRows.rows[0].email, 'social@example.com');
  });

  await runTest('findOrCreateSocialUser reuses the same user on the second call', async () => {
    const { authRepository } = createRepositories(database);

    const first = await authRepository.findOrCreateSocialUser({
      provider: 'kakao',
      providerUserId: 'kakao-real-2',
      name: '재사용러너',
    });
    assert.equal(first.isNewUser, true);

    const second = await authRepository.findOrCreateSocialUser({
      provider: 'kakao',
      providerUserId: 'kakao-real-2',
    });
    assert.equal(second.isNewUser, false);
    assert.equal(second.user.id, first.user.id);
    assert.notEqual(second.accessToken, first.accessToken);

    const userCount = await database.query('select count(*)::int as count from users');
    assert.equal(userCount.rows[0].count, 1);

    const accountCount = await database.query('select count(*)::int as count from social_accounts');
    assert.equal(accountCount.rows[0].count, 1);
  });

  await runTest('same providerUserId on a different provider yields a distinct user', async () => {
    const { authRepository } = createRepositories(database);

    const kakao = await authRepository.findOrCreateSocialUser({
      provider: 'kakao',
      providerUserId: 'shared-id',
      name: '카카오',
    });
    const naver = await authRepository.findOrCreateSocialUser({
      provider: 'naver',
      providerUserId: 'shared-id',
      name: '네이버',
    });

    assert.equal(naver.isNewUser, true);
    assert.notEqual(naver.user.id, kakao.user.id);

    const userCount = await database.query('select count(*)::int as count from users');
    assert.equal(userCount.rows[0].count, 2);

    const accountCount = await database.query('select count(*)::int as count from social_accounts');
    assert.equal(accountCount.rows[0].count, 2);
  });

  await runTest('social_accounts UNIQUE(provider, provider_user_id) rejects a duplicate raw insert', async () => {
    const { authRepository } = createRepositories(database);

    await authRepository.findOrCreateSocialUser({
      provider: 'kakao',
      providerUserId: 'dup-id',
      name: '원본',
    });

    const userRow = await database.query('select id from users limit 1');
    const userId = userRow.rows[0].id;

    await assert.rejects(
      () => database.query(
        'insert into social_accounts (id, user_id, provider, provider_user_id, email, connected_at) values ($1, $2, $3, $4, $5, now())',
        ['social-dup-raw', userId, 'kakao', 'dup-id', null],
      ),
      (error) => error && error.code === '23505',
    );
  });

  await runTest('deleteAccount removes the user and cascade-deletes its social_accounts rows', async () => {
    const { authRepository } = createRepositories(database);

    const created = await authRepository.findOrCreateSocialUser({
      provider: 'kakao',
      providerUserId: 'cascade-id',
      name: '삭제대상',
    });

    const beforeAccounts = await database.query('select count(*)::int as count from social_accounts');
    assert.equal(beforeAccounts.rows[0].count, 1);

    const result = await authRepository.deleteAccount({ token: created.accessToken });
    assert.equal(result.success, true);
    assert.equal(result.deletedUserId, created.user.id);

    const afterUsers = await database.query('select count(*)::int as count from users');
    assert.equal(afterUsers.rows[0].count, 0);

    // FK `on delete cascade` should have cleared the linked social_accounts row.
    const afterAccounts = await database.query('select count(*)::int as count from social_accounts');
    assert.equal(afterAccounts.rows[0].count, 0);
  });

  await runTest('a passwordless user cannot log in by password', async () => {
    const { authRepository } = createRepositories(database);

    await authRepository.findOrCreateSocialUser({
      provider: 'kakao',
      providerUserId: 'passwordless-id',
      name: '비번없음',
    });

    const userRow = await database.query('select username from users limit 1');
    const username = userRow.rows[0].username;

    await assert.rejects(
      () => authRepository.login({ username, password: 'AnyPassword1' }),
      (error) => error instanceof ApiError && error.statusCode === 401,
    );
  });

  // ---------------------------------------------------------------------------
  // runs
  // ---------------------------------------------------------------------------

  await runTest('createTrackedRun then getRun returns it', async () => {
    const { authRepository, runsRepository } = createRepositories(database);

    const registered = await authRepository.register(buildRegistration({ username: 'runs-runner' }));

    const matchResult = {
      mode: 'duel',
      resultTone: 'win',
      opponentName: '상대러너',
      opponentDistanceKm: 8.1,
    };

    const created = await runsRepository.createTrackedRun({
      token: registered.accessToken,
      input: {
        date: '2026-05-01',
        distanceKm: 8.4,
        pace: '05:10/km',
        durationSeconds: 2604,
        cadenceSpm: 176,
        elevationGainM: 32,
        route: [
          { latitude: 37.1, longitude: 127.1 },
          { latitude: 37.2, longitude: 127.2 },
        ],
        startedAt: '2026-05-01T11:00:00.000Z',
        endedAt: '2026-05-01T11:43:24.000Z',
        matchResult,
      },
    });

    assert.equal(created.run.sourceType, 'runningground');
    assert.equal(created.run.distanceKm, 8.4);
    // The created detail surfaces the match result it was given.
    assert.deepEqual(created.run.matchResult, matchResult);

    const fetched = await runsRepository.getRun({ token: registered.accessToken, runId: created.run.id });
    assert.equal(fetched.run.id, created.run.id);
    assert.equal(fetched.run.distanceKm, 8.4);
    // match_result round-trips intact through Postgres jsonb (stored as a string, read back as an object).
    assert.deepEqual(fetched.run.matchResult, matchResult);

    // And the latest run without an explicit id.
    const latest = await runsRepository.getRun({ token: registered.accessToken });
    assert.equal(latest.run.id, created.run.id);
    assert.deepEqual(latest.run.matchResult, matchResult);
  });

  // ---------------------------------------------------------------------------
  // friends + league + sessions smoke
  // ---------------------------------------------------------------------------

  await runTest('friends smoke: createRequest then accept builds a friendship', async () => {
    const { authRepository, friendsRepository } = createRepositories(database);

    const requester = await authRepository.register(buildRegistration({
      username: 'friend-requester',
      phone: '01011111111',
      realName: '요청자',
    }));
    const receiver = await authRepository.register(buildRegistration({
      username: 'friend-receiver',
      phone: '01022222222',
      realName: '수신자',
    }));

    // Look up the receiver's generated public tag straight from the DB.
    const receiverRow = await database.query('select public_tag from users where username = $1', ['friend-receiver']);
    const receiverTag = receiverRow.rows[0].public_tag;

    const request = await friendsRepository.createRequest({ token: requester.accessToken, tag: receiverTag });
    assert.equal(request.success, true);
    assert.equal(request.status, 'pending');

    const accepted = await friendsRepository.respondToRequest({
      token: receiver.accessToken,
      requestId: request.requestId,
      action: 'accept',
    });
    assert.equal(accepted.status, 'accepted');

    const friendshipCount = await database.query('select count(*)::int as count from friendships');
    assert.equal(friendshipCount.rows[0].count, 1);

    // Leaderboard read executes its real join SQL without error.
    const leaderboard = await friendsRepository.getLeaderboard({ token: requester.accessToken });
    assert.equal(Array.isArray(leaderboard.ranks), true);
  });

  await runTest('league smoke: district personal read executes real SQL', async () => {
    const { authRepository, leagueRepository } = createRepositories(database);

    const registered = await authRepository.register(buildRegistration({
      username: 'league-runner',
      phone: '01033333333',
      realName: '리그러너',
    }));

    const district = await leagueRepository.getDistrictPersonal({ token: registered.accessToken });
    assert.equal(district.districtName, '강남구');
    assert.equal(Array.isArray(district.ranks), true);
  });

  await runTest('sessions smoke: logout removes the session row', async () => {
    const { authRepository } = createRepositories(database);

    const registered = await authRepository.register(buildRegistration({
      username: 'session-runner',
      phone: '01044444444',
      realName: '세션러너',
    }));

    const before = await database.query('select count(*)::int as count from sessions');
    assert.equal(before.rows[0].count, 1);

    await authRepository.logout({ token: registered.accessToken });

    const after = await database.query('select count(*)::int as count from sessions');
    assert.equal(after.rows[0].count, 0);
  });
} finally {
  await database.close();
}

if (failures > 0) {
  console.error(`[postgresRepositories.integration] ${failures} test(s) failed`);
  process.exit(1);
}

console.log('[postgresRepositories.integration] all integration tests passed');
