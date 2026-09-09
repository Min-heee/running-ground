import assert from 'node:assert/strict';

import { buildUserRunMetrics } from '../lib/points.mjs';
import { buildTodayRanking } from './todayRankingBuilder.mjs';

const RANKED_AT = new Date('2026-06-25T09:00:00');
const TODAY = '2026-06-25';
const YESTERDAY = '2026-06-24';

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`[todayRankingBuilder] ok - ${name}`);
  } catch (error) {
    console.error(`[todayRankingBuilder] failed - ${name}`);
    throw error;
  }
}

function trackedRun(overrides) {
  return { sourceType: 'runningground', date: TODAY, ...overrides };
}

function importedRun(overrides) {
  return { sourceType: 'apple_health', date: TODAY, importedAt: '2026-06-25T08:00:00Z', ...overrides };
}

const users = [
  { id: 'user-me', name: '민병희', publicTag: '#0001' },
  { id: 'user-importer', name: '임포터', publicTag: '#0002' },
];

function buildRanking(category, runsByUserId) {
  return buildTodayRanking({
    category,
    currentUserId: 'user-me',
    buildUserMetrics: buildUserRunMetrics,
    rankedAt: RANKED_AT,
    runsByUserId,
    users,
  });
}

// (a) imported runs are excluded from each competitive aggregation.

runTest('distance ranking includes imported runs (표시 기준 2026-07-31)', () => {
  const runsByUserId = new Map([
    ['user-me', [trackedRun({ id: 'run-me-1', distanceKm: 5, pace: '5:00/km' })]],
    ['user-importer', [importedRun({ id: 'run-imp-1', distanceKm: 99, pace: '4:00/km' })]],
  ]);

  const ranking = buildRanking('distance', runsByUserId);
  const importerEntry = ranking.entries.find((entry) => entry.userId === 'user-importer');

  // 가져온 기록만 있는 러너도 보드에 오른다 — 친구/지역 보드와 같은 기준.
  assert.equal(importerEntry?.value, '99km');
  assert.equal(ranking.entries[0]?.userId, 'user-importer');
});

runTest('pace ranking includes imported runs (표시 기준 2026-07-31)', () => {
  const runsByUserId = new Map([
    ['user-me', [trackedRun({ id: 'run-me-1', distanceKm: 5, pace: '5:00/km' })]],
    ['user-importer', [importedRun({ id: 'run-imp-1', distanceKm: 10, pace: '3:00/km' })]],
  ]);

  const ranking = buildRanking('pace', runsByUserId);

  assert.equal(ranking.entries[0]?.userId, 'user-importer');
  assert.equal(ranking.entries[0]?.value, '3:00/km');
});

runTest('streak ranking counts imported days (홈 연속 기록 카드와 같은 기준)', () => {
  const runsByUserId = new Map([
    // Real two-day tracked streak (each day >= 3km minimum).
    ['user-me', [
      trackedRun({ id: 'run-me-1', distanceKm: 4, pace: '5:00/km', date: YESTERDAY }),
      trackedRun({ id: 'run-me-2', distanceKm: 4, pace: '5:00/km', date: TODAY }),
    ]],
    // Importer logged the same two days but ONLY via imports.
    ['user-importer', [
      importedRun({ id: 'run-imp-1', distanceKm: 9, pace: '4:00/km', date: YESTERDAY }),
      importedRun({ id: 'run-imp-2', distanceKm: 9, pace: '4:00/km', date: TODAY }),
    ]],
  ]);

  const ranking = buildRanking('streak', runsByUserId);
  const importerEntry = ranking.entries.find((entry) => entry.userId === 'user-importer');
  const myEntry = ranking.entries.find((entry) => entry.userId === 'user-me');

  // 홈 카드의 '연속 기록'은 임포트 포함 스트릭이므로 이 보드도 같은 값이어야 한다.
  // (연속 러닝 '포인트'는 여전히 경쟁 러닝 전용 — points.mjs.)
  assert.equal(importerEntry?.value, '2일');
  assert.equal(myEntry?.value, '2일');
});

runTest('a runner mixing imported runs ranks on the combined distance', () => {
  const runsByUserId = new Map([
    ['user-me', [
      trackedRun({ id: 'run-me-1', distanceKm: 3, pace: '5:00/km' }),
      importedRun({ id: 'run-me-import', distanceKm: 40, pace: '4:00/km' }),
    ]],
    ['user-importer', [trackedRun({ id: 'run-imp-1', distanceKm: 6, pace: '5:30/km' })]],
  ]);

  const ranking = buildRanking('distance', runsByUserId);
  const myEntry = ranking.entries.find((entry) => entry.userId === 'user-me');

  // 3km 측정 + 40km 임포트 = 43km (홈 기록 카드가 보여주는 것과 같은 값).
  assert.equal(myEntry?.value, '43km');
  assert.equal(ranking.entries[0]?.userId, 'user-me');
});

// 매치 러닝(sourceType 없이 matchResult만 있는 기록)도 보드에 정상 집계된다.
runTest('match-result runs rank on the board like any other run', () => {
  const runsByUserId = new Map([
    ['user-me', [{
      id: 'run-me-match',
      date: TODAY,
      distanceKm: 7,
      pace: '5:00/km',
      matchResult: { mode: 'duel', source: 'official', resultTone: 'win' },
    }]],
    ['user-importer', [importedRun({ id: 'run-imp-1', distanceKm: 99, pace: '4:00/km' })]],
  ]);

  const ranking = buildRanking('distance', runsByUserId);
  const myEntry = ranking.entries.find((entry) => entry.userId === 'user-me');

  assert.equal(myEntry?.value, '7km');
  // 임포트 99km가 1위인 건 새 표시 기준상 정상 — 매치 러닝도 자기 값 그대로 오른다.
  assert.equal(ranking.entries[0]?.userId, 'user-importer');
});

// ── 차량 판정 러닝 제외 (오너 2026-09-09): 차량 속도 기록이 판정을 받고도 1위였다 ──

function vehicleRun(overrides) {
  return trackedRun({
    integrity: { verdict: 'vehicle', reason: 'speed', checkedAt: '2026-06-25T08:30:00.000Z' },
    ...overrides,
  });
}

runTest('a vehicle-flagged run is dropped from the distance board (the same user\'s honest runs still count)', () => {
  const runsByUserId = new Map([
    ['user-me', [trackedRun({ id: 'run-me-1', distanceKm: 5, pace: '5:00/km' })]],
    ['user-importer', [
      vehicleRun({ id: 'run-car', distanceKm: 29.7, pace: '1:51/km' }),
      trackedRun({ id: 'run-imp-honest', distanceKm: 3, pace: '6:00/km' }),
    ]],
  ]);

  const ranking = buildRanking('distance', runsByUserId);

  assert.equal(ranking.entries[0]?.userId, 'user-me');
  assert.equal(ranking.entries.find((entry) => entry.userId === 'user-importer')?.value, '3km');
});

runTest('a vehicle-flagged run is dropped from the pace board; a runner with only that run is absent', () => {
  const runsByUserId = new Map([
    ['user-me', [trackedRun({ id: 'run-me-1', distanceKm: 5, pace: '5:00/km' })]],
    ['user-importer', [vehicleRun({ id: 'run-car', distanceKm: 29.7, pace: '1:51/km' })]],
  ]);

  const ranking = buildRanking('pace', runsByUserId);

  assert.equal(ranking.entries.length, 1);
  assert.equal(ranking.entries[0]?.userId, 'user-me');
  assert.equal(ranking.totalCount, 1);
});

runTest('a vehicle-flagged run does not extend the streak board either', () => {
  const runsByUserId = new Map([
    ['user-me', [
      trackedRun({ id: 'run-me-1', distanceKm: 4, pace: '5:00/km', date: YESTERDAY }),
      vehicleRun({ id: 'run-car', distanceKm: 20, pace: '2:00/km', date: TODAY }),
    ]],
    ['user-importer', [importedRun({ id: 'run-imp-1', distanceKm: 9, pace: '4:00/km' })]],
  ]);

  const ranking = buildRanking('streak', runsByUserId);

  // 어제 4km만 자격 — 오늘의 차량 기록은 스트릭을 2일로 늘리지 못한다.
  assert.equal(ranking.entries.find((entry) => entry.userId === 'user-me')?.value, '1일');
});

runTest('suspect verdicts (telemetry only) stay on the board', () => {
  const runsByUserId = new Map([
    ['user-me', [trackedRun({
      id: 'run-me-1',
      distanceKm: 5,
      pace: '5:00/km',
      integrity: { verdict: 'suspect', checkedAt: '2026-06-25T08:30:00.000Z' },
    })]],
  ]);

  const ranking = buildRanking('distance', runsByUserId);

  assert.equal(ranking.entries[0]?.value, '5km');
});

console.log('[todayRankingBuilder] all tests passed');
