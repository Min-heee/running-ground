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
    getUserMetrics: (_store, userId) => ({
      currentWeekDistanceKm: 0,
      currentWeekPoints: 0,
      currentMonthDistanceKm: 0,
      ...(metricsByUserId[userId] ?? {}),
    }),
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

await runTest('returns district personal ranks focused around current user', async () => {
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

  const result = await repository.getDistrictPersonal({ token: 'token-me' });

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

await runTest('returns ranked region children with breadcrumb', async () => {
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

function createCappedRegionTree() {
  return {
    id: 'region-root',
    name: '대한민국',
    level: 'country',
    children: [
      {
        id: 'kr-gg',
        name: '경기도',
        level: 'province',
        averageDistanceKm: 20,
        totalDistanceKm: 2000,
        participants: 200,
        children: [
          {
            id: 'kr-gg-01',
            name: '고양시',
            level: 'city',
            averageDistanceKm: 22,
            totalDistanceKm: 880,
            participants: 40,
            children: [
              {
                id: 'kr-gg-01-01',
                name: '덕양구',
                level: 'district',
                averageDistanceKm: 23,
                totalDistanceKm: 460,
                participants: 20,
                children: [],
              },
              {
                id: 'kr-gg-01-02',
                name: '일산동구',
                level: 'district',
                averageDistanceKm: 21,
                totalDistanceKm: 420,
                participants: 20,
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

await runTest('caps the region drill at the city level (시/군 nodes are leaves)', async () => {
  const { repository } = createRepositoryHarness({
    users: [{ id: 'user-me', name: '민병희' }],
    sessions: [{ token: 'token-me', userId: 'user-me' }],
    regionTree: createCappedRegionTree(),
  });

  const cityResult = await repository.getRegions({ token: 'token-me', nodeId: 'kr-gg-01' });

  assert.equal(cityResult.currentNode.id, 'kr-gg-01');
  // A city node must expose NO children even though 덕양구/일산동구 exist.
  assert.deepEqual(cityResult.children, []);
  // Breadcrumb stops at three levels (country -> province -> city).
  assert.deepEqual(cityResult.breadcrumb, [
    { id: 'region-root', name: '대한민국', level: 'country' },
    { id: 'kr-gg', name: '경기도', level: 'province' },
    { id: 'kr-gg-01', name: '고양시', level: 'city' },
  ]);
});

await runTest('caps the breadcrumb when a district node is deep-linked', async () => {
  const { repository } = createRepositoryHarness({
    users: [{ id: 'user-me', name: '민병희' }],
    sessions: [{ token: 'token-me', userId: 'user-me' }],
    regionTree: createCappedRegionTree(),
  });

  const districtResult = await repository.getRegions({ token: 'token-me', nodeId: 'kr-gg-01-01' });

  // A deep-linked district collapses back to its 시/군 ancestor.
  assert.equal(districtResult.currentNode.id, 'kr-gg-01');
  assert.deepEqual(districtResult.children, []);
  assert.deepEqual(
    districtResult.breadcrumb.map((entry) => entry.id),
    ['region-root', 'kr-gg', 'kr-gg-01'],
  );
});

await runTest('aggregates a city ranking across all of its districts', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '민병희', provinceName: '경기도', cityName: '고양시', districtName: '덕양구' },
      { id: 'user-a', name: '가영', provinceName: '경기도', cityName: '고양시', districtName: '일산동구' },
      { id: 'user-b', name: '준호', provinceName: '경기도', cityName: '고양시', districtName: '일산서구' },
      { id: 'user-other', name: '수원러너', provinceName: '경기도', cityName: '수원시', districtName: '팔달구' },
    ],
    sessions: [{ token: 'token-me', userId: 'user-me' }],
    regionTree: createCappedRegionTree(),
  }, {
    'user-me': { currentWeekDistanceKm: 10, currentWeekPoints: 15, currentMonthDistanceKm: 40 },
    'user-a': { currentWeekDistanceKm: 12, currentWeekPoints: 20, currentMonthDistanceKm: 30 },
    'user-b': { currentWeekDistanceKm: 8, currentWeekPoints: 11, currentMonthDistanceKm: 55 },
    'user-other': { currentWeekDistanceKm: 50, currentWeekPoints: 80, currentMonthDistanceKm: 99 },
  });

  const result = await repository.getDistrictPersonal({ token: 'token-me', nodeId: 'kr-gg-01' });

  // Everyone in 고양시 rolls up regardless of their 구; 수원시 is excluded.
  assert.equal(result.districtName, '고양시');
  assert.deepEqual(result.ranks.map((entry) => entry.name), ['가영', '민병희', '준호']);
  assert.equal(result.ranks.length, 3);
});

await runTest('district ranks carry both rank score and monthly distance', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      {
        id: 'user-me',
        name: '민병희',
        provinceName: '경기도',
        cityName: '고양시',
        districtName: '덕양구',
        rankState: { tier: '페이서', lp: 40 },
      },
    ],
    sessions: [{ token: 'token-me', userId: 'user-me' }],
    regionTree: createCappedRegionTree(),
  }, {
    'user-me': { currentWeekDistanceKm: 10, currentWeekPoints: 15, currentMonthDistanceKm: 42 },
  });

  const result = await repository.getDistrictPersonal({ token: 'token-me', nodeId: 'kr-gg-01' });
  const me = result.ranks[0];

  // rankScore = tierIndex(페이서=2) * LP_PER_TIER(200) + lp(40) = 440.
  assert.equal(me.rankScore, 440);
  assert.equal(me.monthlyDistanceKm, 42);
});
