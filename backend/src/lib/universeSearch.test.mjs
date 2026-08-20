import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSearchText,
  searchUniverse,
  UNIVERSE_SEARCH_LIMIT,
  UNIVERSE_SEARCH_MIN_LENGTH,
} from './universeSearch.mjs';

// 검색 계약: 누른 결과로 반드시 갈 수 있어야 하고(목적지 은하 존재), 짧은 질의로 명부가
// 통째로 새 나가지 않아야 하며, 순서가 예측 가능해야 한다.

const regionTree = {
  id: 'country',
  name: '대한민국',
  level: 'country',
  children: [
    {
      id: 'seoul',
      name: '서울특별시',
      level: 'province',
      children: [{ id: 'songpa', name: '송파구', level: 'district', children: [] }],
    },
    {
      id: 'gyeonggi',
      name: '경기도',
      level: 'province',
      children: [{ id: 'goyang', name: '고양시', level: 'city', children: [] }],
    },
  ],
};

function buildStore(users) {
  return { regionTree, users };
}

const metrics = new Map();
const getUserMetrics = (_store, userId) => metrics.get(userId) ?? { currentMonthDistanceKm: 0 };

test('정규화는 공백·대소문자를 지운다', () => {
  assert.equal(normalizeSearchText('  Member K '), 'memberk');
  assert.equal(normalizeSearchText(null), '');
});

test('짧은 질의는 아무것도 내려보내지 않는다 — 명부 통째 유출 방지', () => {
  const store = buildStore([
    { id: 'u1', name: '민병희', provinceName: '서울특별시', districtName: '송파구' },
  ]);

  assert.equal(UNIVERSE_SEARCH_MIN_LENGTH, 2);
  assert.deepEqual(searchUniverse({ store, query: '민', getUserMetrics }).results, []);
  assert.deepEqual(searchUniverse({ store, query: '  ', getUserMetrics }).results, []);
});

test('결과는 반드시 갈 수 있는 은하를 가진다 — 지역 미설정 러너는 빠진다', () => {
  const store = buildStore([
    { id: 'u1', name: '민병희', provinceName: '서울특별시', districtName: '송파구' },
    { id: 'u2', name: '민병희2', provinceName: '' },
  ]);

  const { results } = searchUniverse({ store, query: '민병희', getUserMetrics });

  assert.deepEqual(results.map((result) => result.userId), ['u1']);
  assert.equal(results[0].galaxyNodeId, 'songpa');
  assert.equal(results[0].regionPath, '서울특별시 · 송파구');
});

test('정확 일치 → 앞부분 → 포함 순, 같은 등급은 이번 달 거리 순', () => {
  const store = buildStore([
    { id: 'exact', name: '회원G', provinceName: '경기도', cityName: '고양시' },
    { id: 'prefix', name: '회원G이', provinceName: '경기도', cityName: '고양시' },
    { id: 'contains', name: '슈퍼회원G', provinceName: '경기도', cityName: '고양시' },
    { id: 'prefix-far', name: '회원G짱', provinceName: '경기도', cityName: '고양시' },
  ]);

  metrics.set('prefix', { currentMonthDistanceKm: 3 });
  metrics.set('prefix-far', { currentMonthDistanceKm: 30 });

  const { results } = searchUniverse({ store, query: '회원G', getUserMetrics });

  assert.deepEqual(
    results.map((result) => result.userId),
    ['exact', 'prefix-far', 'prefix', 'contains'],
  );

  metrics.clear();
});

test('결과 수에는 상한이 있다', () => {
  const store = buildStore(
    Array.from({ length: UNIVERSE_SEARCH_LIMIT + 5 }, (_, index) => ({
      id: `u${index}`,
      name: `러너${index}`,
      provinceName: '경기도',
      cityName: '고양시',
    })),
  );

  assert.equal(searchUniverse({ store, query: '러너', getUserMetrics }).results.length, UNIVERSE_SEARCH_LIMIT);
});

test('내 행성은 표시가 붙는다', () => {
  const store = buildStore([
    { id: 'me', name: '회원F', provinceName: '서울특별시', districtName: '송파구' },
  ]);

  const { results } = searchUniverse({ store, query: '회원F', currentUserId: 'me', getUserMetrics });

  assert.equal(results[0].isMine, true);
});
