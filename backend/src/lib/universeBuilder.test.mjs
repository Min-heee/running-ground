import assert from 'node:assert/strict';
import test from 'node:test';

import { buildUniverse, pickStarUserId } from './universeBuilder.mjs';

// 우주 페이로드: 지역 트리 3단이 은하단→은하군→은하로 그대로 읽히는지, 항성(누적 거리
// 1등)이 은하마다 하나뿐인지, 화면 숫자가 리그 보드와 같은 원값인지.

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

test('은하(송파구)를 열면 행성과 항성이 나온다 — 항성은 누적 거리 1등이다', () => {
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

  const star = universe.galaxy.planets.find((planet) => planet.userId === 'u-star');
  const runner = universe.galaxy.planets.find((planet) => planet.userId === 'u-runner');

  // 평생 1200km > 300km — 누적 1등이 태양으로 점화한다.
  assert.equal(star.isStar, true);
  assert.equal(runner.isStar, false);
  assert.equal(runner.isMine, true);
  // 이번 달 42km로 앞서도 항성이 되지는 않는다 — 이 사이트에 실시간 순위 개념은 없다.
  assert.equal('isProtostar' in runner, false);
  // 봉인 우승 명단 페이로드도 없다 — ★ 배지 개수로만 남는다.
  assert.equal('star' in universe.galaxy, false);
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

test('누적 거리가 동률이어도 항성은 은하에 하나뿐이다', () => {
  const { store, getUserMetrics } = buildStore({
    users: BASE_USERS,
    metrics: {
      'u-star': { lifetimeDistanceKm: 500, currentMonthDistanceKm: 10 },
      'u-runner': { lifetimeDistanceKm: 500, currentMonthDistanceKm: 42 },
    },
  });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-runner',
    nodeId: 'songpa',
    getUserMetrics,
    createError,
  });

  assert.equal(universe.galaxy.planets.filter((planet) => planet.isStar).length, 1);
});

test('봉인 우승 원장이 없어도 항성은 뜬다 — 누적 1등이므로', () => {
  const { store, getUserMetrics } = buildStore({ users: BASE_USERS, metrics: BASE_METRICS });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-runner',
    nodeId: 'songpa',
    getUserMetrics,
    createError,
  });

  assert.equal(
    universe.galaxy.planets.find((planet) => planet.userId === 'u-star').isStar,
    true,
  );
});

test('아무도 달린 적 없는 은하에는 태양이 없다', () => {
  const { store, getUserMetrics } = buildStore({
    users: BASE_USERS,
    metrics: {
      'u-star': { lifetimeDistanceKm: 0, currentMonthDistanceKm: 0 },
      'u-runner': { lifetimeDistanceKm: 0, currentMonthDistanceKm: 0 },
    },
  });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-runner',
    nodeId: 'songpa',
    getUserMetrics,
    createError,
  });

  assert.equal(universe.galaxy.planets.some((planet) => planet.isStar), false);
});

test('회원은 전원 자기 행성으로 뜬다 — 인당 정확히 하나, 접기 없음', () => {
  const crowd = Array.from({ length: 80 }, (_, index) => songpaUser(`u-${index}`, `러너${index}`));
  const metrics = Object.fromEntries(
    crowd.map((user, index) => [user.id, { lifetimeDistanceKm: 100 + index, currentMonthDistanceKm: 0 }]),
  );

  // 평생 거리 꼴찌도 자기 행성이 있어야 한다 — 예전 상한(60) 접기에서 묻히던 사람.
  metrics['u-1'] = { lifetimeDistanceKm: 2, currentMonthDistanceKm: 0 };

  const { store, getUserMetrics } = buildStore({ users: crowd, metrics });
  const universe = buildUniverse({
    store,
    currentUserId: 'u-1',
    nodeId: 'songpa',
    getUserMetrics,
    createError,
  });

  assert.equal(universe.galaxy.planets.length, 80);
  assert.equal(universe.galaxy.nebula, null);

  // 인당 정확히 1개 — 중복도 누락도 없다.
  const ids = universe.galaxy.planets.map((planet) => planet.userId);
  assert.equal(new Set(ids).size, 80);
  assert.ok(ids.includes('u-1'), '꼴찌의 행성이 사라졌다');
  // 항성(누적 1등 = u-79)은 정확히 하나다.
  const suns = universe.galaxy.planets.filter((planet) => planet.isStar);
  assert.deepEqual(suns.map((planet) => planet.userId), ['u-79']);
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

test('pickStarUserId: 누적 거리 1등 하나 — 동률은 id, 전원 0km면 없음', () => {
  assert.equal(
    pickStarUserId([
      { userId: 'a', lifetimeDistanceKm: 300 },
      { userId: 'b', lifetimeDistanceKm: 1200 },
      { userId: 'c', lifetimeDistanceKm: 800 },
    ]),
    'b',
  );
  // 동률은 id — 렌더마다 태양이 바뀌면 안 된다.
  assert.equal(
    pickStarUserId([
      { userId: 'f', lifetimeDistanceKm: 500 },
      { userId: 'e', lifetimeDistanceKm: 500 },
    ]),
    'e',
  );
  assert.equal(pickStarUserId([{ userId: 'a', lifetimeDistanceKm: 0 }]), null);
  assert.equal(pickStarUserId([]), null);
});
