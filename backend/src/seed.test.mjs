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

runTest('region-tree rollup counts a competitive run', () => {
  const tree = createRegionTree({
    users: [user],
    runs: [{ userId: 'u1', distanceKm: 10, date: today, sourceType: 'runningground' }],
  });
  const node = findNodeByName(tree, PROVINCE);
  assert.ok(node, 'province node exists');
  assert.equal(node.totalDistanceKm, 10);
});

runTest('region-tree rollup excludes an imported run (display-only policy)', () => {
  // The same user adds a 100km imported run — it must NOT inflate the region rollup.
  const tree = createRegionTree({
    users: [user],
    runs: [
      { userId: 'u1', distanceKm: 10, date: today, sourceType: 'runningground' },
      { userId: 'u1', distanceKm: 100, date: today, sourceType: 'apple_health' },
    ],
  });
  const node = findNodeByName(tree, PROVINCE);
  assert.equal(node.totalDistanceKm, 10, 'imported run must not inflate the region total');
  assert.equal(node.averageDistanceKm, 10);
});

runTest('region-tree rollup keeps region order unchanged by imports', () => {
  // Two users in different provinces: the import-heavy one must not outrank the tracked one.
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
  assert.equal(busan.totalDistanceKm, 3, 'imported runs must not pad the region total');
  assert.ok(seoul.totalDistanceKm > busan.totalDistanceKm, 'Seoul outranks Busan on competitive distance');
});

runTest('region-tree rollup still counts a match-result run as competitive', () => {
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
