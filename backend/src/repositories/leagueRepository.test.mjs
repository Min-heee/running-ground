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
        throw new TestApiError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
      }

      return store.users.find((entry) => entry.id === session.userId);
    },
    getUserMetrics: (_store, userId) => ({
      currentWeekDistanceKm: 0,
      competitiveWeekDistanceKm: 0,
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
    // FULL weekly distance is import-inflated for everyone; the competitive
    // weekly distance is the real ranking driver. The district board must rank
    // by AND show competitive distance, so imports cannot reorder it.
    'user-me': { currentWeekDistanceKm: 90, competitiveWeekDistanceKm: 10, currentWeekPoints: 15 },
    'user-a': { currentWeekDistanceKm: 11, competitiveWeekDistanceKm: 12, currentWeekPoints: 20 },
    'user-b': { currentWeekDistanceKm: 70, competitiveWeekDistanceKm: 8, currentWeekPoints: 11 },
    'user-other': { currentWeekDistanceKm: 50, competitiveWeekDistanceKm: 50, currentWeekPoints: 80 },
  });

  const result = await repository.getDistrictPersonal({ token: 'token-me' });

  assert.equal(result.districtName, '강남구');
  assert.equal(result.myRank.rank, 2);
  assert.equal(result.myPoints, 15);
  // Competitive weekly distance, not the import-inflated full 90.
  assert.equal(result.weeklyDistanceKm, 10);
  assert.equal(result.myRank.distanceKm, 10);
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
    'user-me': { currentWeekDistanceKm: 10, competitiveWeekDistanceKm: 10, currentWeekPoints: 15, currentMonthDistanceKm: 40 },
    'user-a': { currentWeekDistanceKm: 12, competitiveWeekDistanceKm: 12, currentWeekPoints: 20, currentMonthDistanceKm: 30 },
    'user-b': { currentWeekDistanceKm: 8, competitiveWeekDistanceKm: 8, currentWeekPoints: 11, currentMonthDistanceKm: 55 },
    'user-other': { currentWeekDistanceKm: 50, competitiveWeekDistanceKm: 50, currentWeekPoints: 80, currentMonthDistanceKm: 99 },
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

// ── 광역시 구 direct-under-province lookup (2026-07-21 회귀) ─────────────────────
// Metro trees have no city level; their 구 nodes hang straight off the province.
// The resolver used to fall through to the REQUESTER's own region for these
// nodes, so every metro 구 section showed the same (my own) member board.

function createMetroRegionTree() {
  return {
    id: 'region-root',
    name: '대한민국',
    level: 'country',
    children: [
      {
        id: 'kr-dj',
        name: '대전광역시',
        level: 'province',
        children: [
          { id: 'kr-dj-01', name: '동구', level: 'district', children: [] },
          { id: 'kr-dj-02', name: '중구', level: 'district', children: [] },
        ],
      },
      {
        id: 'kr-dg',
        name: '대구광역시',
        level: 'province',
        children: [
          { id: 'kr-dg-01', name: '동구', level: 'district', children: [] },
        ],
      },
    ],
  };
}

await runTest('a metro 구 node lists THAT 구 — not the requester\'s own region', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '동구주민', provinceName: '대전광역시', cityName: '', districtName: '동구' },
      { id: 'user-junggu', name: '중구주민', provinceName: '대전광역시', cityName: '', districtName: '중구' },
      { id: 'user-daegu', name: '대구동구주민', provinceName: '대구광역시', cityName: '', districtName: '동구' },
    ],
    sessions: [{ token: 'token-me', userId: 'user-me' }],
    regionTree: createMetroRegionTree(),
  }, {
    'user-me': { currentWeekDistanceKm: 10, competitiveWeekDistanceKm: 10, currentWeekPoints: 15, currentMonthDistanceKm: 40 },
    'user-junggu': { currentWeekDistanceKm: 5, competitiveWeekDistanceKm: 5, currentWeekPoints: 8, currentMonthDistanceKm: 20 },
    'user-daegu': { currentWeekDistanceKm: 30, competitiveWeekDistanceKm: 30, currentWeekPoints: 50, currentMonthDistanceKm: 90 },
  });

  // Browsing 대전 중구 as a 대전 동구 resident → 중구 members only.
  const junggu = await repository.getDistrictPersonal({ token: 'token-me', nodeId: 'kr-dj-02' });
  assert.equal(junggu.districtName, '중구');
  assert.deepEqual(junggu.ranks.map((entry) => entry.name), ['중구주민']);

  // 대전 동구 must NOT include the 대구 동구 runner (same 구 name, other metro).
  const dongguDaejeon = await repository.getDistrictPersonal({ token: 'token-me', nodeId: 'kr-dj-01' });
  assert.equal(dongguDaejeon.districtName, '동구');
  assert.deepEqual(dongguDaejeon.ranks.map((entry) => entry.name), ['동구주민']);

  // 대구 동구 shows only its own runner.
  const dongguDaegu = await repository.getDistrictPersonal({ token: 'token-me', nodeId: 'kr-dg-01' });
  assert.deepEqual(dongguDaegu.ranks.map((entry) => entry.name), ['대구동구주민']);
});

// ── 통합시 하이브리드 (2026-07-01 행정통합): 구와 시가 한 시·도의 형제 노드 ────────
// 전남광주통합특별시는 광주 5구(district, cityName '')와 전남 22시군(city)이 같은
// province 아래 공존하는 유일한 하이브리드 — 두 종류의 리프 보드가 섞이면 안 된다.

await runTest('hybrid merged province: 구 board and 시 board stay disjoint under ONE province', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-donggu', name: '동구주민', provinceName: '전남광주통합특별시', cityName: '', districtName: '동구' },
      { id: 'user-mokpo', name: '목포주민', provinceName: '전남광주통합특별시', cityName: '목포시', districtName: '목포시' },
    ],
    sessions: [{ token: 'token-me', userId: 'user-donggu' }],
    regionTree: {
      id: 'region-root',
      name: '대한민국',
      level: 'country',
      children: [
        {
          id: 'kr-gj',
          name: '전남광주통합특별시',
          level: 'province',
          children: [
            { id: 'kr-gj-01', name: '동구', level: 'district', children: [] },
            { id: 'kr-gj-06', name: '목포시', level: 'city', children: [] },
          ],
        },
      ],
    },
  }, {
    'user-donggu': { currentWeekDistanceKm: 10, competitiveWeekDistanceKm: 10, currentWeekPoints: 15, currentMonthDistanceKm: 40 },
    'user-mokpo': { currentWeekDistanceKm: 5, competitiveWeekDistanceKm: 5, currentWeekPoints: 8, currentMonthDistanceKm: 20 },
  });

  const donggu = await repository.getDistrictPersonal({ token: 'token-me', nodeId: 'kr-gj-01' });
  assert.equal(donggu.districtName, '동구');
  assert.deepEqual(donggu.ranks.map((entry) => entry.name), ['동구주민']);

  const mokpo = await repository.getDistrictPersonal({ token: 'token-me', nodeId: 'kr-gj-06' });
  assert.equal(mokpo.districtName, '목포시');
  assert.deepEqual(mokpo.ranks.map((entry) => entry.name), ['목포주민']);
});

await runTest('region board stats are LIVE sums of member weekly competitive distance (박제 시드값 무시)', async () => {
  const { repository } = createRepositoryHarness({
    users: [
      { id: 'user-me', name: '회원G', provinceName: '경기도', cityName: '고양시', districtName: '주엽동' },
      { id: 'user-2', name: '이웃', provinceName: '경기도', cityName: '고양시', districtName: '덕양구' },
      { id: 'user-3', name: '무활동', provinceName: '경기도', cityName: '고양시', districtName: '주엽동' },
    ],
    sessions: [
      { token: 'token-me', userId: 'user-me' },
    ],
    regionTree: createCappedRegionTree(),
  }, {
    'user-me': { competitiveMonthDistanceKm: 10.5 },
    'user-2': { competitiveMonthDistanceKm: 2 },
  });

  // 경기도 보드: 고양시 노드의 총거리는 시드값(880)이 아니라 멤버 이번 달 합(12.5)이어야 한다.
  const province = await repository.getRegions({ token: 'token-me', nodeId: 'kr-gg' });
  const goyang = province.children.find((entry) => entry.name === '고양시');
  assert.equal(goyang.totalDistanceKm, 12.5);
  assert.equal(goyang.participants, 3); // 클라 라벨 '회원수' = 지역 소속 인원
  assert.equal(goyang.memberCount, 3);
  assert.equal(goyang.averageDistanceKm, 4.2); // 12.5/3
  assert.equal(goyang.participationRate, 67); // 이번 달 달린 2/3

  // 루트 보드: 경기도 노드도 실시간 합.
  const root = await repository.getRegions({ token: 'token-me' });
  const gyeonggi = root.children.find((entry) => entry.name === '경기도');
  assert.equal(gyeonggi.totalDistanceKm, 12.5);
});
