import assert from 'node:assert/strict';
import test from 'node:test';

import type { RegionDrilldownNode } from '@/domain';
import type { LeagueRegionNodeIdentity } from '@/features/league/types/league';
import { formatLeagueDistanceValue, getPodiumTheme, isMyRegionNode, sortRegionChildrenByRank } from '@/features/league/utils/leagueRanking';

test('league ranking helpers format distances and podium themes predictably', () => {
  assert.equal(formatLeagueDistanceValue(10), '10');
  assert.equal(formatLeagueDistanceValue(10.5), '10.5');
  assert.equal(formatLeagueDistanceValue(0), '0');
  assert.equal(formatLeagueDistanceValue(-1.25), '-1.3');
  assert.ok(getPodiumTheme(1));
  assert.equal(getPodiumTheme(4), null);
  assert.equal(getPodiumTheme(0), null);
});

test('league ranking helpers detect the current user region by node level', () => {
  const profile = {
    provinceName: '경기도',
    cityName: '고양시',
    districtName: '일산서구',
  };

  assert.equal(isMyRegionNode({ level: 'province', name: '경기도' }, profile), true);
  assert.equal(isMyRegionNode({ level: 'city', name: '고양시' }, profile), true);
  assert.equal(isMyRegionNode({ level: 'district', name: '일산동구' }, profile), false);
  assert.equal(isMyRegionNode({ level: 'country', name: '대한민국' }, profile), false);
  assert.equal(isMyRegionNode({ level: 'district', name: '일산서구' }, null), false);
});

test('league ranking helpers sort region children by official rank', () => {
  const nodes = [
    { id: 'b', name: 'B', level: 'city', rank: 2 },
    { id: 'a', name: 'A', level: 'city', rank: 1 },
  ] as RegionDrilldownNode[];

  assert.deepEqual(sortRegionChildrenByRank(nodes).map((node) => node.id), ['a', 'b']);
  assert.deepEqual(nodes.map((node) => node.id), ['b', 'a']);
});

test('league ranking helpers keep empty and tied rank inputs predictable', () => {
  const tiedNodes = [
    { id: 'first', name: 'First', level: 'city', rank: 1 },
    { id: 'second', name: 'Second', level: 'city', rank: 1 },
  ] as RegionDrilldownNode[];

  assert.deepEqual(sortRegionChildrenByRank([]), []);
  assert.deepEqual(sortRegionChildrenByRank(tiedNodes).map((node) => node.id), ['first', 'second']);
});

// ── 계층 검증 (2026-07-23 회귀): 이름만 같은 남의 지역이 내 지역이 되면 안 된다 ──

test('a same-named 구 in another metro is NOT my region', () => {
  const gwangjuDonggu = { provinceName: '광주광역시', cityName: '', districtName: '동구' };

  // 대전 트리 아래의 동구: 이름은 같아도 조상(대전광역시)이 다르므로 남의 지역.
  assert.equal(
    isMyRegionNode({ level: 'district', name: '동구' }, gwangjuDonggu, [
      { level: 'country', name: '대한민국' },
      { level: 'province', name: '대전광역시' },
    ]),
    false,
  );

  // 광주 트리 아래의 동구만 내 지역.
  assert.equal(
    isMyRegionNode({ level: 'district', name: '동구' }, gwangjuDonggu, [
      { level: 'country', name: '대한민국' },
      { level: 'province', name: '광주광역시' },
    ]),
    true,
  );
});

test('city nodes also require the province ancestor to match', () => {
  const gangwonGoseong = { provinceName: '강원특별자치도', cityName: '고성군', districtName: '고성군' };

  assert.equal(
    isMyRegionNode({ level: 'city', name: '고성군' }, gangwonGoseong, [
      { level: 'country', name: '대한민국' },
      { level: 'province', name: '경상남도' },
    ]),
    false,
  );
  assert.equal(
    isMyRegionNode({ level: 'city', name: '고성군' }, gangwonGoseong, [
      { level: 'country', name: '대한민국' },
      { level: 'province', name: '강원특별자치도' },
    ]),
    true,
  );
});

// ── 2026-07-01 행정통합: 광주광역시+전라남도 → 전남광주통합특별시 ─────────────────
// OTA/백엔드 재배포 시차 동안 프로필과 서버 트리 중 한쪽만 옛 이름일 수 있다 —
// 옛/새 어떤 조합이어도 시·도 비교가 어긋나면 안 된다.

test('merged province: a legacy-named profile still matches the new tree (and vice versa)', () => {
  const legacyProfile = { provinceName: '광주광역시', cityName: '', districtName: '동구' };
  const migratedProfile = { provinceName: '전남광주통합특별시', cityName: '', districtName: '동구' };
  const newTreeAncestors: LeagueRegionNodeIdentity[] = [
    { level: 'country', name: '대한민국' },
    { level: 'province', name: '전남광주통합특별시' },
  ];
  const oldTreeAncestors: LeagueRegionNodeIdentity[] = [
    { level: 'country', name: '대한민국' },
    { level: 'province', name: '광주광역시' },
  ];

  // 옛 프로필 × 새 트리 / 새 프로필 × 옛 트리 / 새 × 새 — 전부 내 지역.
  assert.equal(isMyRegionNode({ level: 'district', name: '동구' }, legacyProfile, newTreeAncestors), true);
  assert.equal(isMyRegionNode({ level: 'district', name: '동구' }, migratedProfile, oldTreeAncestors), true);
  assert.equal(isMyRegionNode({ level: 'district', name: '동구' }, migratedProfile, newTreeAncestors), true);
  assert.equal(isMyRegionNode({ level: 'province', name: '전남광주통합특별시' }, legacyProfile), true);
  assert.equal(isMyRegionNode({ level: 'province', name: '광주광역시' }, migratedProfile), true);

  // 다른 광역시의 동구는 여전히 남의 지역.
  assert.equal(
    isMyRegionNode({ level: 'district', name: '동구' }, migratedProfile, [
      { level: 'country', name: '대한민국' },
      { level: 'province', name: '대전광역시' },
    ]),
    false,
  );
});

test('merged province: a legacy 전라남도 city profile matches the merged tree', () => {
  const legacyJeonnam = { provinceName: '전라남도', cityName: '순천시', districtName: '순천시' };

  assert.equal(
    isMyRegionNode({ level: 'city', name: '순천시' }, legacyJeonnam, [
      { level: 'country', name: '대한민국' },
      { level: 'province', name: '전남광주통합특별시' },
    ]),
    true,
  );
  assert.equal(isMyRegionNode({ level: 'province', name: '전남광주통합특별시' }, legacyJeonnam), true);
});

test('merged province hybrid: 구 유저와 시 유저가 서로의 노드를 내 지역으로 오판하지 않는다', () => {
  const dongguUser = { provinceName: '전남광주통합특별시', cityName: '', districtName: '동구' };
  const mokpoUser = { provinceName: '전남광주통합특별시', cityName: '목포시', districtName: '목포시' };
  const mergedAncestors: LeagueRegionNodeIdentity[] = [
    { level: 'country', name: '대한민국' },
    { level: 'province', name: '전남광주통합특별시' },
  ];

  assert.equal(isMyRegionNode({ level: 'district', name: '동구' }, dongguUser, mergedAncestors), true);
  assert.equal(isMyRegionNode({ level: 'city', name: '목포시' }, dongguUser, mergedAncestors), false);
  assert.equal(isMyRegionNode({ level: 'city', name: '목포시' }, mokpoUser, mergedAncestors), true);
  assert.equal(isMyRegionNode({ level: 'district', name: '동구' }, mokpoUser, mergedAncestors), false);
});

test('a 도-tree district requires the city ancestor to match my city', () => {
  const suwonUser = { provinceName: '경기도', cityName: '수원시', districtName: '팔달구' };

  assert.equal(
    isMyRegionNode({ level: 'district', name: '팔달구' }, suwonUser, [
      { level: 'country', name: '대한민국' },
      { level: 'province', name: '경기도' },
      { level: 'city', name: '수원시' },
    ]),
    true,
  );
  // 광역시(도시 조상 없음) 아래 같은 이름: 내 cityName이 비어있지 않으므로 불일치.
  assert.equal(
    isMyRegionNode({ level: 'district', name: '팔달구' }, suwonUser, [
      { level: 'country', name: '대한민국' },
      { level: 'province', name: '광주광역시' },
    ]),
    false,
  );
});
