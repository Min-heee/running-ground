import assert from 'node:assert/strict';
import test from 'node:test';

import type { RegionDrilldownNode } from '@/domain';
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
