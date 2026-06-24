import assert from 'node:assert/strict';

import { buildUserRunMetrics } from '../points.mjs';
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

runTest('distance ranking ignores imported runs', () => {
  const runsByUserId = new Map([
    ['user-me', [trackedRun({ id: 'run-me-1', distanceKm: 5, pace: '5:00/km' })]],
    // A huge imported run that would top the board if it leaked.
    ['user-importer', [importedRun({ id: 'run-imp-1', distanceKm: 99, pace: '4:00/km' })]],
  ]);

  const ranking = buildRanking('distance', runsByUserId);
  const importerEntry = ranking.entries.find((entry) => entry.userId === 'user-importer');

  assert.equal(importerEntry, undefined, 'imported-only runner must not appear on the distance leaderboard');
  assert.equal(ranking.entries[0]?.userId, 'user-me');
  assert.equal(ranking.entries[0]?.value, '5km');
});

runTest('pace ranking ignores imported runs', () => {
  const runsByUserId = new Map([
    ['user-me', [trackedRun({ id: 'run-me-1', distanceKm: 5, pace: '5:00/km' })]],
    // A fast imported run that would top the pace board if it leaked.
    ['user-importer', [importedRun({ id: 'run-imp-1', distanceKm: 10, pace: '3:00/km' })]],
  ]);

  const ranking = buildRanking('pace', runsByUserId);
  const importerEntry = ranking.entries.find((entry) => entry.userId === 'user-importer');

  assert.equal(importerEntry, undefined, 'imported-only runner must not appear on the pace leaderboard');
  assert.equal(ranking.entries[0]?.userId, 'user-me');
  assert.equal(ranking.entries[0]?.value, '5:00/km');
});

runTest('streak ranking does not count imported runs toward a streak', () => {
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

  assert.equal(importerEntry, undefined, 'imported-only streak must not appear on the streak leaderboard');
  assert.equal(myEntry?.value, '2일', 'tracked streak should still be counted');
});

runTest('a runner mixing imported runs only ranks on their tracked distance', () => {
  const runsByUserId = new Map([
    ['user-me', [
      trackedRun({ id: 'run-me-1', distanceKm: 3, pace: '5:00/km' }),
      importedRun({ id: 'run-me-import', distanceKm: 40, pace: '4:00/km' }),
    ]],
    ['user-importer', [trackedRun({ id: 'run-imp-1', distanceKm: 6, pace: '5:30/km' })]],
  ]);

  const ranking = buildRanking('distance', runsByUserId);
  const myEntry = ranking.entries.find((entry) => entry.userId === 'user-me');

  // 3km tracked, NOT 43km — the 40km import is excluded competitively.
  assert.equal(myEntry?.value, '3km');
  assert.equal(ranking.entries[0]?.userId, 'user-importer', 'tracked 6km should outrank tracked 3km');
});

// Belt-and-suspenders: match-result runs (always in-app) stay competitive.
runTest('match-result runs remain competitive even without runningground sourceType', () => {
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

  assert.equal(ranking.entries[0]?.userId, 'user-me');
  assert.equal(ranking.entries[0]?.value, '7km');
});

console.log('[todayRankingBuilder] all tests passed');
