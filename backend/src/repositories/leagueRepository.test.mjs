import assert from 'node:assert/strict';
import { createJsonLeagueRepository } from './leagueRepository.mjs';

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
    regionTree: {
      id: 'region-root',
      name: '대한민국',
      level: 'country',
      children: [],
    },
    ...clone(initialStore),
  };

  return {
    loadStore() {
      return clone(store);
    },
    getStore() {
      return clone(store);
    },
  };
}

function createRepositoryHarness(initialStore = {}, metricsByUserId = {}) {
  const storeHarness = createStoreHarness(initialStore);
  const repository = createJsonLeagueRepository({
    loadStore: storeHarness.loadStore,
    requireUserByToken: (store, token) => {
      const session = store.sessions.find((entry) => entry.token === token);

      if (!session) {
        throw new TestApiError(401, '세션이 만료됐어. 다시 로그인해줘.');
      }

      return store.users.find((entry) => entry.id === session.userId);
    },
    getUserMetrics: (_store, userId) => metricsByUserId[userId] ?? {
      currentWeekDistanceKm: 0,
      currentWeekPoints: 0,
    },
    createError: (statusCode, message) => new TestApiError(statusCode, message),
  });

  return {
    repository,
    storeHarness,
  };
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[leagueRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[leagueRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('returns district personal ranks focused around current user', () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', provinceName: '서울특별시', cityName: '', districtName: '강남구' },
      { id: 'user-a', name: '가영', provinceName: '서울특별시', cityName: '', districtName: '강남구' },
      { id: 'user-b', name: '준호', provinceName: '서울특별시', cityName: '', districtName: '강남구' },
      { id: 'user-other', name: '부산러너', provinceName: '부산광역시', cityName: '', districtName: '해운대구' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
  }, {
    'user-me': { currentWeekDistanceKm: 10, currentWeekPoints: 15 },
    'user-a': { currentWeekDistanceKm: 12, currentWeekPoints: 20 },
    'user-b': { currentWeekDistanceKm: 8, currentWeekPoints: 11 },
    'user-other': { currentWeekDistanceKm: 50, currentWeekPoints: 80 },
  });

  const result = repository.getDistrictPersonal({ token: 'token-me' });

  assert.equal(result.districtName, '강남구');
  assert.equal(result.myRank.rank, 2);
  assert.equal(result.myPoints, 15);
  assert.equal(result.weeklyDistanceKm, 10);
  assert.deepEqual(result.focusRanks.map((entry) => `${entry.rank}:${entry.name}`), [
    '1:가영',
    '2:민병희',
    '3:준호',
  ]);
});

await runTest('returns ranked region children with breadcrumb', () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
    regionTree: {
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
        {
          id: 'region-busan',
          name: '부산광역시',
          level: 'province',
          averageDistanceKm: 11.7,
          totalDistanceKm: 1170,
          participants: 100,
          children: [],
        },
      ],
    },
  });

  const result = repository.getRegions({
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

await runTest('aggregates university league ranks', () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', universityName: '서울대학교' },
      { id: 'user-a', name: '가영', universityName: '서울대학교' },
      { id: 'user-b', name: '준호', universityName: '연세대학교' },
      { id: 'user-c', name: '서연', universityName: '연세대학교' },
      { id: 'user-d', name: '하늘', universityName: '고려대학교' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
  }, {
    'user-me': { currentWeekDistanceKm: 8, currentWeekPoints: 10 },
    'user-a': { currentWeekDistanceKm: 10, currentWeekPoints: 12 },
    'user-b': { currentWeekDistanceKm: 12, currentWeekPoints: 16 },
    'user-c': { currentWeekDistanceKm: 8, currentWeekPoints: 9 },
    'user-d': { currentWeekDistanceKm: 7, currentWeekPoints: 8 },
  });

  const result = repository.getUniversities({ token: 'token-me' });

  assert.deepEqual(result.ranks, [
    {
      rank: 1,
      universityName: '연세대학교',
      totalDistanceKm: 20,
      participants: 2,
      averageDistanceKm: 10,
    },
    {
      rank: 2,
      universityName: '서울대학교',
      totalDistanceKm: 18,
      participants: 2,
      averageDistanceKm: 9,
    },
    {
      rank: 3,
      universityName: '고려대학교',
      totalDistanceKm: 7,
      participants: 1,
      averageDistanceKm: 7,
    },
  ]);
});
