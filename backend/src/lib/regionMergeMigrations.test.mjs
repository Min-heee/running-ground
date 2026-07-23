import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_MERGED_PROVINCE_NAMES,
  MERGED_REGION_PROVINCE_NAME,
  migrateRegionMergeStore,
} from './regionMergeMigrations.mjs';

const buildStore = () => ({
  users: [
    // 광주 구 유저 — 광역시 의미론 (cityName '')은 그대로 남아야 한다.
    { id: 'u-gwangju', provinceName: '광주광역시', cityName: '', districtName: '동구' },
    // 전남 시 유저 — 도 리프 의미론 (cityName === districtName)도 그대로.
    { id: 'u-jeonnam', provinceName: '전라남도', cityName: '순천시', districtName: '순천시' },
    // 통합과 무관한 유저는 건드리지 않는다.
    { id: 'u-seoul', provinceName: '서울특별시', cityName: '', districtName: '강남구' },
    // 소셜 가입 직후 (지역 미설정) 유저도 그대로.
    { id: 'u-social', provinceName: '', cityName: '', districtName: '' },
  ],
  runs: [],
});

test('legacy 광주/전남 provinceName is rewritten to the merged province, city/district untouched', () => {
  const store = buildStore();
  const changed = migrateRegionMergeStore(store);

  assert.equal(changed, true);
  assert.equal(store.users[0].provinceName, MERGED_REGION_PROVINCE_NAME);
  assert.equal(store.users[0].cityName, '');
  assert.equal(store.users[0].districtName, '동구');
  assert.equal(store.users[1].provinceName, MERGED_REGION_PROVINCE_NAME);
  assert.equal(store.users[1].cityName, '순천시');
  assert.equal(store.users[1].districtName, '순천시');
  assert.equal(store.users[2].provinceName, '서울특별시');
  assert.equal(store.users[3].provinceName, '');
});

test('regionTree is rebuilt in place: merged province present with both user styles, legacy provinces gone', () => {
  const store = buildStore();
  migrateRegionMergeStore(store);

  const provinces = store.regionTree.children.map((node) => node.name);
  assert.ok(provinces.includes(MERGED_REGION_PROVINCE_NAME), '통합시 노드가 트리에 없어요');
  for (const legacyName of LEGACY_MERGED_PROVINCE_NAMES) {
    assert.ok(!provinces.includes(legacyName), `폐지된 시·도(${legacyName})가 트리에 남아 있어요`);
  }

  const merged = store.regionTree.children.find((node) => node.name === MERGED_REGION_PROVINCE_NAME);
  const donggu = merged.children.find((node) => node.name === '동구');
  const suncheon = merged.children.find((node) => node.name === '순천시');
  assert.equal(donggu.level, 'district');
  assert.equal(donggu.participants, 1, '광주 구 유저가 통합시 트리 롤업에서 빠졌어요');
  assert.equal(suncheon.level, 'city');
  assert.equal(suncheon.participants, 1, '전남 시 유저가 통합시 트리 롤업에서 빠졌어요');
  assert.equal(merged.participants, 2);
});

test('second run is a no-op (idempotent)', () => {
  const store = buildStore();
  migrateRegionMergeStore(store);
  const snapshot = JSON.stringify(store);

  const changedAgain = migrateRegionMergeStore(store);

  assert.equal(changedAgain, false);
  assert.equal(JSON.stringify(store), snapshot);
});

test('a stale regionTree is rebuilt even when no user needs rewriting', () => {
  // 유저는 이미 이관됐는데 (postgres 블롭에서) 트리만 폐지된 시·도를 담은 채 남은 경우.
  const store = buildStore();
  migrateRegionMergeStore(store);
  store.regionTree = {
    id: 'kr',
    name: '대한민국',
    level: 'country',
    children: [{ id: 'kr-05', name: '광주광역시', level: 'province', children: [] }],
  };

  const changed = migrateRegionMergeStore(store);

  assert.equal(changed, true);
  const provinces = store.regionTree.children.map((node) => node.name);
  assert.ok(provinces.includes(MERGED_REGION_PROVINCE_NAME));
  assert.ok(!provinces.includes('광주광역시'));
});

test('store without users/regionTree stays untouched', () => {
  const store = { runs: [] };
  assert.equal(migrateRegionMergeStore(store), false);
  assert.equal(store.regionTree, undefined);
});
