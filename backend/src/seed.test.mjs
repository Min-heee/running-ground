import assert from 'node:assert/strict';

import { createRegionTree } from './seed.mjs';

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`[seed] ok - ${name}`);
  } catch (error) {
    console.error(`[seed] failed - ${name}`);
    throw error;
  }
}

// createRegionTree dates weekly distance off `new Date()` internally, so the test runs must
// land in the current week — use today.
function todayDateKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function findNodeByName(node, name) {
  if (!node) {
    return null;
  }
  if (node.name === name) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNodeByName(child, name);
    if (found) {
      return found;
    }
  }
  return null;
}

const PROVINCE = '서울특별시';
const today = todayDateKey();
// provinceName + a real 서울 district so the user's weekly distance lands on a tree node.
const user = { id: 'u1', provinceName: PROVINCE, districtName: '강남구' };

runTest('region-tree rollup counts an in-app run', () => {
  const tree = createRegionTree({
    users: [user],
    runs: [{ userId: 'u1', distanceKm: 10, date: today, sourceType: 'runningground' }],
  });
  const node = findNodeByName(tree, PROVINCE);
  assert.ok(node, 'province node exists');
  assert.equal(node.totalDistanceKm, 10);
});

runTest('region-tree rollup includes imported runs (표시 기준 2026-07-31)', () => {
  // 가져온 기록도 지역 총거리에 포함 — 랭킹 화면의 멤버 목록 합과 같은 기준.
  const tree = createRegionTree({
    users: [user],
    runs: [
      { userId: 'u1', distanceKm: 10, date: today, sourceType: 'runningground' },
      { userId: 'u1', distanceKm: 100, date: today, sourceType: 'apple_health' },
    ],
  });
  const node = findNodeByName(tree, PROVINCE);
  assert.equal(node.totalDistanceKm, 110);
  assert.equal(node.averageDistanceKm, 110);
});

runTest('region-tree rollup ranks on the combined distance (imports included)', () => {
  // 가져온 기록이 많은 지역이 그만큼 위로 올라간다 — 표시 기준이 전체 거리이기 때문.
  const seoulUser = { id: 'a', provinceName: '서울특별시', districtName: '강남구' };
  const busanUser = { id: 'b', provinceName: '부산광역시', districtName: '해운대구' };
  const tree = createRegionTree({
    users: [seoulUser, busanUser],
    runs: [
      { userId: 'a', distanceKm: 12, date: today, sourceType: 'runningground' },
      { userId: 'b', distanceKm: 3, date: today, sourceType: 'runningground' },
      // Busan user pads 200km of imports — must stay ranked below Seoul.
      { userId: 'b', distanceKm: 200, date: today, sourceType: 'strava' },
    ],
  });
  const seoul = findNodeByName(tree, '서울특별시');
  const busan = findNodeByName(tree, '부산광역시');
  assert.equal(seoul.totalDistanceKm, 12);
  assert.equal(busan.totalDistanceKm, 203);
  assert.ok(busan.totalDistanceKm > seoul.totalDistanceKm);
});

runTest('region-tree rollup counts a match-result run', () => {
  const tree = createRegionTree({
    users: [user],
    runs: [
      {
        userId: 'u1',
        distanceKm: 7,
        date: today,
        sourceType: 'apple_health',
        matchResult: { mode: 'duel', source: 'official' },
      },
    ],
  });
  const node = findNodeByName(tree, PROVINCE);
  assert.equal(node.totalDistanceKm, 7, 'a run carrying a match result counts even if sourceType is imported');
});
