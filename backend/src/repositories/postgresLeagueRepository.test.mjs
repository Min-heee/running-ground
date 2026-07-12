import assert from 'node:assert/strict';
import { buildUserRunMetrics } from '../lib/points.mjs';
import { createPostgresLeagueRepository } from './postgresLeagueRepository.mjs';

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
    this.appMetadata = clone(initialStore.appMetadata ?? []);
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

    if (normalizedSql.startsWith("select * from users where coalesce(province_name, '') = $1")) {
      return {
        rows: this.users
          .filter((entry) => (
            String(entry.province_name ?? '') === String(params[0] ?? '')
            && String(entry.city_name ?? '') === String(params[1] ?? '')
            && String(entry.district_name ?? '') === String(params[2] ?? '')
          ))
          .map((row) => clone(row)),
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
      const row = this.appMetadata.find((entry) => entry.key === params[0]);
      return {
        rows: row ? [{ value: clone(row.value) }] : [],
      };
    }

    throw new Error(`Unhandled fake SQL: ${normalizedSql}`);
  }
}

function createRepositoryHarness(initialStore = {}) {
  const database = new FakePostgresDatabase(initialStore);
  const fixedNow = new Date('2026-04-24T00:00:00.000Z');
  const repository = createPostgresLeagueRepository({
    database,
    buildUserMetrics: (runs) => buildUserRunMetrics(runs, fixedNow),
    createError: (statusCode, message) => new TestApiError(statusCode, message),
  });

  return {
    repository,
    database,
  };
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[postgresLeagueRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[postgresLeagueRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('returns district personal ranks from postgres rows', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', nickname: '민병희', province_name: '서울특별시', city_name: '', district_name: '강남구' },
      { id: 'user-a', nickname: '가영', province_name: '서울특별시', city_name: '', district_name: '강남구' },
      { id: 'user-b', nickname: '준호', province_name: '서울특별시', city_name: '', district_name: '강남구' },
      { id: 'user-other', nickname: '부산러너', province_name: '부산광역시', city_name: '', district_name: '해운대구' },
    ],
    sessions: [
      { token: 'token-me', user_id: 'user-me', expires_at: '2099-01-01T00:00:00.000Z' },
    ],
    runs: [
      // Competitive (in-app GPS) runs drive the district ranking by distance:
      // 가영 12 > 민병희 10 > 준호 8.
      { id: 'run-me', user_id: 'user-me', run_date: '2026-04-23', distance_km: 10, pace: '05:40/km', source_label: 'RunningGround', source_type: 'runningground' },
      // Import that hugely inflates user-me's FULL weekly distance but must be
      // excluded from the competitive district rank and shown distance.
      { id: 'run-me-import', user_id: 'user-me', run_date: '2026-04-22', distance_km: 99, pace: '06:00/km', source_label: 'NRC', source_type: 'nrc' },
      { id: 'run-a', user_id: 'user-a', run_date: '2026-04-23', distance_km: 12, pace: '05:20/km', source_label: 'RunningGround', source_type: 'runningground' },
      { id: 'run-b', user_id: 'user-b', run_date: '2026-04-23', distance_km: 8, pace: '05:30/km', source_label: 'RunningGround', source_type: 'runningground' },
      { id: 'run-other', user_id: 'user-other', run_date: '2026-04-23', distance_km: 50, pace: '05:00/km', source_label: 'RunningGround', source_type: 'runningground' },
    ],
  });

  const result = await repository.getDistrictPersonal({ token: 'token-me' });

  // myPoints stays FULL (imports included) — points gating is out of scope; only
  // the competitive weekly distance is gated. Derive the expected full points so
  // the assertion does not hard-code the points formula.
  const expectedMyMetrics = buildUserRunMetrics([
    { id: 'run-me', userId: 'user-me', date: '2026-04-23', distanceKm: 10, pace: '05:40/km', source: 'RunningGround', sourceType: 'runningground' },
    { id: 'run-me-import', userId: 'user-me', date: '2026-04-22', distanceKm: 99, pace: '06:00/km', source: 'NRC', sourceType: 'nrc' },
  ], new Date('2026-04-24T00:00:00.000Z'));

  assert.equal(result.districtName, '강남구');
  // The 99km import does not change my competitive rank (still 2) or the shown
  // competitive weekly distance (10, not the import-inflated 109).
  assert.equal(result.myRank.rank, 2);
  assert.equal(result.myPoints, expectedMyMetrics.currentWeekPoints);
  assert.equal(result.weeklyDistanceKm, 10);
  assert.equal(result.myRank.distanceKm, 10);
  // Sanity: the import really did inflate the FULL weekly distance well past the
  // competitive 10, proving the gate is what keeps the board at 10.
  assert.equal(expectedMyMetrics.currentWeekDistanceKm, 109);
  assert.equal(expectedMyMetrics.competitiveWeekDistanceKm, 10);
  assert.deepEqual(result.focusRanks.map((entry) => `${entry.rank}:${entry.name}`), [
    '1:가영',
    '2:민병희',
    '3:준호',
  ]);
});

await runTest('returns region league from app metadata region tree', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', nickname: '민병희' },
    ],
    sessions: [
      { token: 'token-me', user_id: 'user-me', expires_at: '2099-01-01T00:00:00.000Z' },
    ],
    appMetadata: [
      {
        key: 'region_tree',
        value: {
          id: 'region-root',
          name: '대한민국',
          level: 'country',
          children: [
            {
              id: 'region-seoul',
              name: '서울특별시',
              level: 'province',
              averageDistanceKm: 15.2,
              totalDistanceKm: 1520,
              participants: 100,
              children: [
                {
                  id: 'region-gangnam',
                  name: '강남구',
                  level: 'district',
                  averageDistanceKm: 18.2,
                  totalDistanceKm: 728,
                  participants: 40,
                  children: [],
                },
                {
                  id: 'region-mapo',
                  name: '마포구',
                  level: 'district',
                  averageDistanceKm: 14.4,
                  totalDistanceKm: 576,
                  participants: 40,
                  children: [],
                },
              ],
            },
          ],
        },
      },
    ],
  });

  const result = await repository.getRegions({
    token: 'token-me',
    nodeId: 'region-seoul',
  });

  assert.deepEqual(result.breadcrumb, [
    { id: 'region-root', name: '대한민국', level: 'country' },
    { id: 'region-seoul', name: '서울특별시', level: 'province' },
  ]);
  assert.equal(result.currentNode.id, 'region-seoul');
  assert.deepEqual(result.children.map((entry) => `${entry.rank}:${entry.name}`), [
    '1:강남구',
    '2:마포구',
  ]);
});
