import assert from 'node:assert/strict';
import { buildUserRunMetrics, getRunPointValue } from '../points.mjs';
import { createPostgresFriendsRepository } from './postgresFriendsRepository.mjs';

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

function createUniqueViolation(constraint) {
  const error = new Error(`duplicate key value violates unique constraint "${constraint}"`);
  error.code = '23505';
  error.constraint = constraint;
  return error;
}

class FakePostgresDatabase {
  constructor(initialStore = {}) {
    this.users = clone(initialStore.users ?? []);
    this.sessions = clone(initialStore.sessions ?? []);
    this.runs = clone(initialStore.runs ?? []);
    this.friendRequests = clone(initialStore.friendRequests ?? []);
    this.friendships = clone(initialStore.friendships ?? []);
    this.appMetadata = clone(initialStore.appMetadata ?? {});
    this.transactions = 0;
  }

  async transaction(callback) {
    this.transactions += 1;
    return callback(this);
  }

  async query(sql, params = []) {
    const normalizedSql = normalizeSql(sql);

    if (normalizedSql.startsWith('select u.* from sessions s join users u on u.id = s.user_id where s.token = $1')) {
      const session = this.sessions.find((entry) => entry.token === params[0]);
      const user = session ? this.users.find((entry) => entry.id === session.user_id) : null;
      return {
        rows: user ? [clone(user)] : [],
      };
    }

    if (normalizedSql.startsWith('select * from users where id = $1 limit 1')) {
      const user = this.users.find((entry) => entry.id === params[0]);
      return {
        rows: user ? [clone(user)] : [],
      };
    }

    if (normalizedSql.startsWith('select * from users where public_tag = $1 limit 1')) {
      const user = this.users.find((entry) => entry.public_tag === params[0]);
      return {
        rows: user ? [clone(user)] : [],
      };
    }

    if (normalizedSql.startsWith('select * from users where id = any($1::text[])')) {
      const ids = new Set(params[0]);
      return {
        rows: this.users.filter((entry) => ids.has(entry.id)).map((row) => clone(row)),
      };
    }

    if (normalizedSql.startsWith('select id, user_id, run_date, distance_km, pace, source_label, source_type, external_id,')) {
      const ids = new Set(params[0]);
      return {
        rows: this.runs
          .filter((entry) => ids.has(entry.user_id))
          .sort((left, right) => {
            const userOrder = String(left.user_id).localeCompare(String(right.user_id));
            if (userOrder !== 0) {
              return userOrder;
            }

            const dateOrder = String(right.run_date).localeCompare(String(left.run_date));
            if (dateOrder !== 0) {
              return dateOrder;
            }

            return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
          })
          .map((row) => clone(row)),
      };
    }

    if (normalizedSql.startsWith('select value from app_metadata where key = $1 limit 1')) {
      const value = this.appMetadata[params[0]];
      return {
        rows: typeof value === 'undefined' ? [] : [{ value: clone(value) }],
      };
    }

    if (normalizedSql.startsWith('select user_a_id, user_b_id from friendships where user_a_id = $1 or user_b_id = $1')) {
      return {
        rows: this.friendships
          .filter((entry) => entry.user_a_id === params[0] || entry.user_b_id === params[0])
          .map((row) => clone(row)),
      };
    }

    if (normalizedSql.startsWith('select id from friendships where user_a_id = $1 and user_b_id = $2 limit 1')) {
      const friendship = this.friendships.find((entry) => entry.user_a_id === params[0] && entry.user_b_id === params[1]);
      return {
        rows: friendship ? [{ id: friendship.id }] : [],
      };
    }

    if (normalizedSql.startsWith("select id from friend_requests where status = 'pending' and (")) {
      const request = this.friendRequests.find((entry) => (
        entry.status === 'pending'
        && (
          (entry.requester_id === params[0] && entry.receiver_id === params[1])
          || (entry.requester_id === params[1] && entry.receiver_id === params[0])
        )
      ));
      return {
        rows: request ? [{ id: request.id }] : [],
      };
    }

    if (normalizedSql.startsWith("select id, requester_id, receiver_id, status, created_at, updated_at from friend_requests where status = 'pending'")) {
      return {
        rows: this.friendRequests
          .filter((entry) => entry.status === 'pending' && (entry.requester_id === params[0] || entry.receiver_id === params[0]))
          .sort((left, right) => String(left.created_at ?? '').localeCompare(String(right.created_at ?? '')))
          .map((row) => clone(row)),
      };
    }

    if (normalizedSql.startsWith('select id, requester_id, receiver_id, status, created_at, updated_at from friend_requests where id = $1 limit 1')) {
      const request = this.friendRequests.find((entry) => entry.id === params[0]);
      return {
        rows: request ? [clone(request)] : [],
      };
    }

    if (normalizedSql.startsWith('insert into friend_requests (')) {
      this.friendRequests.push({
        id: params[0],
        requester_id: params[1],
        receiver_id: params[2],
        status: params[3],
        created_at: params[4],
        updated_at: params[5],
      });
      return { rows: [] };
    }

    if (normalizedSql.startsWith('update friend_requests set status = $2,')) {
      this.friendRequests = this.friendRequests.map((entry) => (
        entry.id === params[0]
          ? {
            ...entry,
            status: params[1],
            updated_at: params[2],
          }
          : entry
      ));
      return { rows: [] };
    }

    if (normalizedSql.startsWith('insert into friendships (id, user_a_id, user_b_id, created_at)')) {
      const duplicate = this.friendships.find((entry) => entry.user_a_id === params[1] && entry.user_b_id === params[2]);

      if (duplicate) {
        throw createUniqueViolation('friendships_user_a_id_user_b_id_key');
      }

      this.friendships.push({
        id: params[0],
        user_a_id: params[1],
        user_b_id: params[2],
        created_at: params[3],
      });
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
  let idIndex = 0;
  const fixedNow = new Date('2026-04-24T00:00:00.000Z');

  const repository = createPostgresFriendsRepository({
    database,
    nextId: (prefix) => {
      idIndex += 1;
      return `${prefix}-test-${idIndex}`;
    },
    buildRunDetail: (run, weeklyDistanceKm, sourceOverride, metrics) => ({
      run: {
        ...run,
        source: sourceOverride ?? run.source,
      },
      weeklyDistanceKm,
      earnedPoint: getRunPointValue(metrics, run.id),
    }),
    buildUserMetrics: (runs) => buildUserRunMetrics(runs, fixedNow),
    createError: (statusCode, message) => new TestApiError(statusCode, message),
    nowIso: () => fixedNow.toISOString(),
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
    console.log(`[postgresFriendsRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[postgresFriendsRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('returns leaderboard with ranks and actionable requests', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', nickname: '민병희', public_tag: '#ME001' },
      { id: 'user-juno', nickname: '준호', public_tag: '#JUNO1' },
      { id: 'user-seoyeon', nickname: '서연', public_tag: '#SEO01' },
      { id: 'user-gayeong', nickname: '가영', public_tag: '#GAY01' },
      { id: 'user-haneul', nickname: '하늘', public_tag: '#HAN01' },
    ],
    sessions: [
      { token: 'token-me', user_id: 'user-me', expires_at: '2099-01-01T00:00:00.000Z' },
    ],
    friendships: [
      { id: 'friendship-1', user_a_id: 'user-juno', user_b_id: 'user-me' },
      { id: 'friendship-2', user_a_id: 'user-me', user_b_id: 'user-seoyeon' },
    ],
    friendRequests: [
      { id: 'request-1', requester_id: 'user-gayeong', receiver_id: 'user-me', status: 'pending', created_at: '2026-04-23T00:00:00.000Z' },
      { id: 'request-2', requester_id: 'user-me', receiver_id: 'user-haneul', status: 'pending', created_at: '2026-04-23T01:00:00.000Z' },
    ],
    runs: [
      // Competitive (in-app GPS) runs drive the leaderboard ordering by distance:
      // 준호 12 > 서연 10 > 민병희 8.
      { id: 'run-me', user_id: 'user-me', run_date: '2026-04-23', distance_km: 8, pace: '05:30/km', source_label: 'RunningGround', source_type: 'runningground' },
      // Import that hugely inflates user-me's FULL weekly distance (and full
      // points) but must be excluded from the competitive leaderboard rank and
      // shown distance.
      { id: 'run-me-import', user_id: 'user-me', run_date: '2026-04-22', distance_km: 99, pace: '05:50/km', source_label: 'NRC', source_type: 'nrc' },
      { id: 'run-juno', user_id: 'user-juno', run_date: '2026-04-23', distance_km: 12, pace: '05:20/km', source_label: 'RunningGround', source_type: 'runningground' },
      { id: 'run-seoyeon-1', user_id: 'user-seoyeon', run_date: '2026-04-22', distance_km: 5, pace: '05:20/km', source_label: 'RunningGround', source_type: 'runningground' },
      { id: 'run-seoyeon-2', user_id: 'user-seoyeon', run_date: '2026-04-23', distance_km: 5, pace: '05:10/km', source_label: 'RunningGround', source_type: 'runningground' },
    ],
  });

  const result = await repository.getLeaderboard({ token: 'token-me' });

  // user-me's 99km import does not push them above 준호/서연: competitive
  // distance stays 8, so the import-excluded order holds.
  assert.deepEqual(result.ranks.map((entry) => `${entry.rank}:${entry.name}`), [
    '1:준호',
    '2:서연',
    '3:민병희',
  ]);
  // Shown distance is the competitive value (8), never the import-inflated full.
  assert.equal(result.ranks.find((entry) => entry.name === '민병희')?.distanceKm, 8);
  assert.deepEqual(result.requests, [
    { id: 'request-1', name: '가영', tag: '#GAY01', status: 'received' },
    { id: 'request-2', name: '하늘', tag: '#HAN01', status: 'pending' },
  ]);
});

await runTest('stores live sharing and exposes running location on leaderboard', async () => {
  const { repository, database } = createRepositoryHarness({
    users: [
      { id: 'user-me', nickname: '민병희', public_tag: '#ME001' },
      { id: 'user-juno', nickname: '준호', public_tag: '#JUNO1' },
    ],
    sessions: [
      { token: 'token-me', user_id: 'user-me', expires_at: '2099-01-01T00:00:00.000Z' },
    ],
    friendships: [
      { id: 'friendship-1', user_a_id: 'user-juno', user_b_id: 'user-me' },
    ],
    runs: [
      { id: 'run-me', user_id: 'user-me', run_date: '2026-04-23', distance_km: 8, pace: '05:40/km', source_label: 'Manual', source_type: 'manual' },
      { id: 'run-juno', user_id: 'user-juno', run_date: '2026-04-23', distance_km: 12, pace: '05:20/km', source_label: 'NRC', source_type: 'nrc' },
    ],
  });

  const updated = await repository.updateLiveSharing({
    token: 'token-me',
    enabled: true,
    status: 'running',
    locationLabel: '성수동 근처',
  });
  const leaderboard = await repository.getLeaderboard({
    token: 'token-me',
  });

  assert.deepEqual(updated, {
    success: true,
    liveSharingEnabled: true,
    isRunningNow: true,
    locationLabel: '성수동 근처',
    updatedAt: '2026-04-24T00:00:00.000Z',
  });
  assert.equal(database.appMetadata.live_run_shares['user-me'].locationLabel, '성수동 근처');
  assert.equal(
    leaderboard.ranks.find((entry) => entry.id === 'user-me')?.liveLocationLabel,
    '성수동 근처',
  );
  assert.equal(
    leaderboard.ranks.find((entry) => entry.id === 'user-me')?.isRunningNow,
    true,
  );
});

await runTest('creates friend requests with duplicate protection', async () => {
  const { repository, database } = createRepositoryHarness({
    users: [
      { id: 'user-me', nickname: '민병희', public_tag: '#ME001' },
      { id: 'user-new', nickname: '새친구', public_tag: '#NEW01' },
    ],
    sessions: [
      { token: 'token-me', user_id: 'user-me', expires_at: '2099-01-01T00:00:00.000Z' },
    ],
  });

  const created = await repository.createRequest({
    token: 'token-me',
    tag: '#NEW01',
  });

  assert.deepEqual(created, {
    success: true,
    requestId: 'request-test-1',
    status: 'pending',
  });
  assert.equal(database.friendRequests.length, 1);
  assert.equal(database.transactions, 1);

  await assert.rejects(() => repository.createRequest({
    token: 'token-me',
    tag: '#NEW01',
  }), (error) => {
    assertApiError(error, 409, '이미 대기 중인 친구 요청이 있어.');
    return true;
  });
});

await runTest('accepts received requests and creates a friendship', async () => {
  const { repository, database } = createRepositoryHarness({
    users: [
      { id: 'user-me', nickname: '민병희', public_tag: '#ME001' },
      { id: 'user-other', nickname: '친구', public_tag: '#OTH01' },
    ],
    sessions: [
      { token: 'token-me', user_id: 'user-me', expires_at: '2099-01-01T00:00:00.000Z' },
    ],
    friendRequests: [
      { id: 'request-1', requester_id: 'user-other', receiver_id: 'user-me', status: 'pending', created_at: '2026-04-23T00:00:00.000Z' },
    ],
  });

  const result = await repository.respondToRequest({
    token: 'token-me',
    requestId: 'request-1',
    action: 'accept',
  });

  assert.deepEqual(result, {
    success: true,
    requestId: 'request-1',
    status: 'accepted',
  });
  assert.equal(database.friendRequests[0].status, 'accepted');
  assert.equal(database.friendships.length, 1);
  assert.deepEqual(database.friendships[0], {
    id: 'friendship-test-1',
    user_a_id: 'user-me',
    user_b_id: 'user-other',
    created_at: '2026-04-24T00:00:00.000Z',
  });
});

await runTest('returns friend activity and friend run detail', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', nickname: '민병희', public_tag: '#ME001' },
      { id: 'user-friend', nickname: '친구', public_tag: '#FRI01' },
    ],
    sessions: [
      { token: 'token-me', user_id: 'user-me', expires_at: '2099-01-01T00:00:00.000Z' },
    ],
    friendships: [
      { id: 'friendship-1', user_a_id: 'user-friend', user_b_id: 'user-me' },
    ],
    runs: [
      { id: 'run-me', user_id: 'user-me', run_date: '2026-04-23', distance_km: 6, pace: '05:50/km', source_label: 'Manual', source_type: 'manual' },
      { id: 'run-friend-1', user_id: 'user-friend', run_date: '2026-04-22', distance_km: 5, pace: '05:40/km', source_label: 'NRC', source_type: 'nrc' },
      { id: 'run-friend-2', user_id: 'user-friend', run_date: '2026-04-23', distance_km: 7.2, pace: '05:15/km', source_label: 'NRC', source_type: 'nrc' },
    ],
  });

  const activity = await repository.getFriendActivity({
    token: 'token-me',
    friendId: 'user-friend',
  });
  const runDetail = await repository.getFriendRun({
    token: 'token-me',
    friendId: 'user-friend',
    runId: 'run-friend-1',
  });

  assert.equal(activity.friend.rank, 1);
  assert.equal(activity.friend.name, '친구');
  assert.equal(activity.monthlyDistanceKm, 12.2);
  assert.equal(activity.runs.length, 2);
  assert.equal(runDetail.run.id, 'run-friend-1');
  assert.equal(runDetail.run.source, '친구 기록');
  assert.equal(runDetail.weeklyDistanceKm, 12.2);
});

await runTest('rejects non-friend activity access', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', nickname: '민병희', public_tag: '#ME001' },
      { id: 'user-stranger', nickname: '낯선친구', public_tag: '#STR01' },
    ],
    sessions: [
      { token: 'token-me', user_id: 'user-me', expires_at: '2099-01-01T00:00:00.000Z' },
    ],
  });

  await assert.rejects(() => repository.getFriendActivity({
    token: 'token-me',
    friendId: 'user-stranger',
  }), (error) => {
    assertApiError(error, 403, '친구로 연결된 사용자 기록만 볼 수 있어.');
    return true;
  });
});
