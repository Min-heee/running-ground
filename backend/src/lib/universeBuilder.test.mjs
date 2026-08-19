import assert from 'node:assert/strict';
import test from 'node:test';

import { PLANET_RENDER_CAP, buildUniverse, pickStarUserId } from './universeBuilder.mjs';

// 우주 페이로드: 지역 트리 3단이 은하단→은하군→은하로 그대로 읽히는지, 항성이 상한에
// 잘려나가지 않고 은하마다 하나뿐인지, 화면 숫자가 리그 보드와 같은 원값인지.

function createError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const REGION_TREE = {
  id: 'kr',
  name: '대한민국',
  level: 'country',
  children: [
    {
      id: 'seoul',
      name: '서울특별시',
      level: 'province',
      children: [
        { id: 'songpa', name: '송파구', level: 'district', children: [] },
        { id: 'gangnam', name: '강남구', level: 'district', children: [] },
      ],
    },
    {
      id: 'gyeonggi',
      name: '경기도',
      level: 'province',
      children: [
        {
          id: 'goyang',
          name: '고양시',
          level: 'city',
          children: [{ id: 'ilsanseo', name: '일산서구', level: 'district', children: [] }],
        },
      ],
    },
  ],
};

function songpaUser(id, name) {
  return { id, name, provinceName: '서울특별시', cityName: '', districtName: '송파구' };
}

function buildStore({ users, metrics, awards = [] }) {
  const store = {
    regionTree: REGION_TREE,
    users,
    runs: [],
    monthlyRankingAwards: awards,
  };

  const getUserMetrics = (_store, userId) => metrics[userId]
    ?? { lifetimeDistanceKm: 0, currentMonthDistanceKm: 0 };

  return { store, getUserMetrics };
}

const BASE_USERS = [
  songpaUser('u-star', '회원J'),
  songpaUser('u-runner', '회원G'),
  { id: 'u-goyang', name: '회원H', provinceName: '경기도', cityName: '고양시', districtName: '일산서구' },
];

const BASE_METRICS = {
  'u-star': { lifetimeDistanceKm: 1200, currentMonthDistanceKm: 30 },
  'u-runner': { lifetimeDistanceKm: 300, currentMonthDistanceKm: 42 },
  'u-goyang': { lifetimeDistanceKm: 800, currentMonthDistanceKm: 11 },
};

const SEALED_JULY = [
  {
    monthKey: '2026-07',
    memberChampions: [
      {
        regionKey: '서울특별시|송파구',
        regionName: '송파구',
        userId: 'u-star',
        userName: '회원J',
        distanceKm: 55,
      },
    ],
    regionChampions: [],
  },
];

test('은하단(대한민국)을 열면 은하군이 뜬다', () => {
  const { store, getUserMetrics } = buildStore({ users: BASE_USERS, metrics: BASE_METRICS });
  const universe = buildUniverse({ store, currentUserId: 'u-runner', getUserMetrics, createError });

  assert.equal(universe.level, 'cluster');
  assert.equal(universe.node.name, '대한민국');
  assert.deepEqual(universe.bodies.map((body) => body.name), ['서울특별시', '경기도']);
  assert.ok(universe.bodies.every((body) => body.level === 'group'));
  assert.equal(universe.galaxy, null);
});

test('은하군(서울)을 열면 은하가 뜨고, 내 소속 은하에 표식이 붙는다', () => {
  const { store, getUserMetrics } = buildStore({ users: BASE_USERS, metrics: BASE_METRICS });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-runner',
    nodeId: 'seoul',
    getUserMetrics,
    createError,
  });

  assert.equal(universe.level, 'group');
  assert.ok(universe.bodies.every((body) => body.level === 'galaxy'));

  const songpa = universe.bodies.find((body) => body.name === '송파구');
  const gangnam = universe.bodies.find((body) => body.name === '강남구');

  assert.equal(songpa.isMine, true);
  assert.equal(gangnam.isMine, false);
  // 아무도 없는 강남구는 회원 0명 — 밝기 바닥으로 꺼져 있어야 한다.
  assert.equal(gangnam.memberCount, 0);
  assert.ok(gangnam.brightness < songpa.brightness);
});

test('화면 숫자는 리그 보드와 같은 원값 — 수축 보정은 크기에만 쓴다', () => {
  const { store, getUserMetrics } = buildStore({ users: BASE_USERS, metrics: BASE_METRICS });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-runner',
    nodeId: 'seoul',
    getUserMetrics,
    createError,
  });
  const songpa = universe.bodies.find((body) => body.name === '송파구');

  // 송파구 2명 · 30 + 42 = 72km → 인당 36km (리그 보드가 보여주는 그 값)
  assert.equal(songpa.totalDistanceKm, 72);
  assert.equal(songpa.averageDistanceKm, 36);
  // 크기는 보정된 값이라 원값 비율(36/전국평균)과 달라야 한다.
  assert.notEqual(songpa.scale, 36 / universe.nationwideAverageDistanceKm);
});

test('은하(송파구)를 열면 행성과 항성이 나온다 — 원시성(이번 달 1등) 개념은 없다', () => {
  const { store, getUserMetrics } = buildStore({
    users: BASE_USERS,
    metrics: BASE_METRICS,
    awards: SEALED_JULY,
  });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-runner',
    nodeId: 'songpa',
    getUserMetrics,
    createError,
  });

  assert.equal(universe.level, 'galaxy');
  assert.equal(universe.bodies.length, 0);
  assert.equal(universe.galaxy.planets.length, 2);

  // 항성 = 7월 봉인 우승자
  assert.equal(universe.galaxy.star.monthKey, '2026-07');
  assert.deepEqual(universe.galaxy.star.champions.map((c) => c.userName), ['회원J']);

  const star = universe.galaxy.planets.find((planet) => planet.userId === 'u-star');
  const runner = universe.galaxy.planets.find((planet) => planet.userId === 'u-runner');

  assert.equal(star.isStar, true);
  assert.equal(runner.isStar, false);
  assert.equal(runner.isMine, true);
  // 이번 달 42km로 앞서도 항성이 되지는 않는다 — 이 사이트에 실시간 순위 개념은 없다.
  assert.equal('isProtostar' in runner, false);
});

test('행성 크기는 평생 거리, 밝기는 이번 달 거리를 따른다', () => {
  const { store, getUserMetrics } = buildStore({ users: BASE_USERS, metrics: BASE_METRICS });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-runner',
    nodeId: 'songpa',
    getUserMetrics,
    createError,
  });

  const star = universe.galaxy.planets.find((planet) => planet.userId === 'u-star');
  const runner = universe.galaxy.planets.find((planet) => planet.userId === 'u-runner');

  // 평생 1200km > 300km → 더 큰 행성
  assert.ok(star.scale > runner.scale);
  // 이번 달 30km < 42km → 더 어두운 행성
  assert.ok(star.brightness < runner.brightness);
});

test('봉인 우승이 동률이어도 항성은 은하에 하나뿐이다', () => {
  const awards = [
    {
      monthKey: '2026-07',
      memberChampions: [
        { regionKey: '서울특별시|송파구', regionName: '송파구', userId: 'u-star', userName: '회원J', distanceKm: 55 },
        { regionKey: '서울특별시|송파구', regionName: '송파구', userId: 'u-runner', userName: '회원G', distanceKm: 55 },
      ],
      regionChampions: [],
    },
  ];
  const { store, getUserMetrics } = buildStore({ users: BASE_USERS, metrics: BASE_METRICS, awards });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-runner',
    nodeId: 'songpa',
    getUserMetrics,
    createError,
  });

  // 원장은 동률 전원을 기록하지만, 하늘의 태양은 하나만 뜬다.
  assert.equal(universe.galaxy.star.champions.length, 2);
  assert.equal(universe.galaxy.planets.filter((planet) => planet.isStar).length, 1);
});

test('한 달 쉬어도 지난달 우승 항성은 남는다', () => {
  const { store, getUserMetrics } = buildStore({
    users: BASE_USERS,
    metrics: {
      'u-star': { lifetimeDistanceKm: 1200, currentMonthDistanceKm: 0 },
      'u-runner': { lifetimeDistanceKm: 300, currentMonthDistanceKm: 0 },
    },
    awards: SEALED_JULY,
  });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-runner',
    nodeId: 'songpa',
    getUserMetrics,
    createError,
  });

  assert.equal(universe.galaxy.star.champions[0].userName, '회원J');
  assert.equal(
    universe.galaxy.planets.find((planet) => planet.userId === 'u-star').isStar,
    true,
  );
});

test('회원이 상한을 넘으면 성운으로 접히되 항성과 나는 항상 남는다', () => {
  const crowd = Array.from({ length: 80 }, (_, index) => songpaUser(`u-${index}`, `러너${index}`));
  const metrics = Object.fromEntries(
    crowd.map((user, index) => [user.id, { lifetimeDistanceKm: 100 + index, currentMonthDistanceKm: 0 }]),
  );

  // 항성과 나는 평생 거리 꼴찌 — 크기순으로 자르면 성운에 묻힐 사람들이다.
  metrics['u-0'] = { lifetimeDistanceKm: 1, currentMonthDistanceKm: 0 };
  metrics['u-1'] = { lifetimeDistanceKm: 2, currentMonthDistanceKm: 0 };

  const awards = [
    {
      monthKey: '2026-07',
      memberChampions: [
        {
          regionKey: '서울특별시|송파구',
          regionName: '송파구',
          userId: 'u-0',
          userName: '러너0',
          distanceKm: 55,
        },
      ],
      regionChampions: [],
    },
  ];

  const { store, getUserMetrics } = buildStore({ users: crowd, metrics, awards });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-1',
    nodeId: 'songpa',
    getUserMetrics,
    createError,
  });

  assert.equal(universe.galaxy.planets.length, PLANET_RENDER_CAP);
  assert.equal(universe.galaxy.nebula.memberCount, 80 - PLANET_RENDER_CAP);

  const ids = new Set(universe.galaxy.planets.map((planet) => planet.userId));
  assert.ok(ids.has('u-0'), '항성이 성운에 묻혔다');
  assert.ok(ids.has('u-1'), '내 행성이 성운에 묻혔다');
});

test('워프 목적지는 내 소속 은하 — 지역 미설정이면 없다', () => {
  const { store, getUserMetrics } = buildStore({
    users: [...BASE_USERS, { id: 'u-none', name: '라', provinceName: '', cityName: '', districtName: '' }],
    metrics: BASE_METRICS,
  });

  const mine = buildUniverse({ store, currentUserId: 'u-goyang', getUserMetrics, createError });
  assert.equal(mine.me.galaxyNodeId, 'goyang');
  assert.equal(mine.me.galaxyName, '고양시');

  const homeless = buildUniverse({ store, currentUserId: 'u-none', getUserMetrics, createError });
  assert.equal(homeless.me.galaxyNodeId, null);
});

test('없는 지역을 열면 404', () => {
  const { store, getUserMetrics } = buildStore({ users: BASE_USERS, metrics: BASE_METRICS });

  assert.throws(
    () => buildUniverse({ store, currentUserId: 'u-runner', nodeId: 'nope', getUserMetrics, createError }),
    (error) => error.status === 404,
  );
});

test('pickStarUserId: 커리어 별 → 그 달 거리 → id 순으로 하나만 고른다', () => {
  const stars = new Map([['a', 1], ['b', 3]]);

  // 커리어 별이 많은 쪽이 이긴다.
  assert.equal(
    pickStarUserId({ champions: [{ userId: 'a', distanceKm: 55 }, { userId: 'b', distanceKm: 55 }] }, stars),
    'b',
  );
  // 커리어가 같으면 그 달 거리.
  assert.equal(
    pickStarUserId({ champions: [{ userId: 'c', distanceKm: 41 }, { userId: 'd', distanceKm: 55 }] }, new Map()),
    'd',
  );
  // 전부 같으면 id — 렌더마다 태양이 바뀌면 안 된다.
  assert.equal(
    pickStarUserId({ champions: [{ userId: 'f', distanceKm: 55 }, { userId: 'e', distanceKm: 55 }] }, new Map()),
    'e',
  );
  assert.equal(pickStarUserId(null, new Map()), null);
  assert.equal(pickStarUserId({ champions: [] }, new Map()), null);
});
