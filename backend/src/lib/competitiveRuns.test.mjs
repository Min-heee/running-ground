import assert from 'node:assert/strict';

import { buildUserRunMetrics } from '../points.mjs';
import {
  buildCompetitiveRunsByUserId,
  filterCompetitiveRuns,
  isCompetitiveRun,
} from './competitiveRuns.mjs';

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`[competitiveRuns] ok - ${name}`);
  } catch (error) {
    console.error(`[competitiveRuns] failed - ${name}`);
    throw error;
  }
}

runTest('runningground runs are competitive', () => {
  assert.equal(isCompetitiveRun({ sourceType: 'runningground' }), true);
});

runTest('imported brand and platform sources are not competitive', () => {
  for (const sourceType of ['apple_health', 'health_connect', 'nrc', 'strava', 'garmin', 'mynb']) {
    assert.equal(isCompetitiveRun({ sourceType }), false, `${sourceType} must not be competitive`);
  }
});

runTest('manual in-app entries are not competitive (no GPS verification)', () => {
  assert.equal(isCompetitiveRun({ sourceType: 'manual' }), false);
});

runTest('source-less legacy runs are not competitive', () => {
  assert.equal(isCompetitiveRun({}), false);
  assert.equal(isCompetitiveRun(null), false);
});

runTest('any run carrying a match result is competitive (in-app match record)', () => {
  assert.equal(
    isCompetitiveRun({ sourceType: 'apple_health', matchResult: { mode: 'duel', source: 'official' } }),
    true,
  );
});

runTest('filterCompetitiveRuns drops imported runs', () => {
  const runs = [
    { id: '1', sourceType: 'runningground', distanceKm: 5 },
    { id: '2', sourceType: 'apple_health', distanceKm: 99 },
    { id: '3', sourceType: 'manual', distanceKm: 10 },
  ];

  assert.deepEqual(filterCompetitiveRuns(runs).map((run) => run.id), ['1']);
});

runTest('buildCompetitiveRunsByUserId narrows every user list', () => {
  const input = new Map([
    ['a', [{ id: 'a1', sourceType: 'runningground' }, { id: 'a2', sourceType: 'strava' }]],
    ['b', [{ id: 'b1', sourceType: 'garmin' }]],
  ]);

  const result = buildCompetitiveRunsByUserId(input);

  assert.deepEqual(result.get('a').map((run) => run.id), ['a1']);
  assert.deepEqual(result.get('b').map((run) => run.id), []);
});

// (b) imported runs STILL count toward personal stats. Personal stats are built
// from the FULL run list via buildUserRunMetrics (never via the competitive
// filter), so imports must appear in lifetime / weekly / monthly distance.
runTest('personal metrics still include imported runs', () => {
  const today = new Date('2026-06-25T09:00:00');
  const allRuns = [
    { id: 'r1', sourceType: 'runningground', date: '2026-06-25', distanceKm: 5, pace: '5:00/km' },
    { id: 'r2', sourceType: 'apple_health', date: '2026-06-25', distanceKm: 8, pace: '4:30/km' },
    { id: 'r3', sourceType: 'manual', date: '2026-06-24', distanceKm: 7, pace: '6:00/km' },
  ];

  const personalMetrics = buildUserRunMetrics(allRuns, today);
  const competitiveMetrics = buildUserRunMetrics(filterCompetitiveRuns(allRuns), today);

  // Personal totals include every source (5 + 8 + 7 = 20).
  assert.equal(personalMetrics.lifetimeDistanceKm, 20);
  // Competitive totals only count the tracked run (5).
  assert.equal(competitiveMetrics.lifetimeDistanceKm, 5);
  assert.ok(
    personalMetrics.currentWeekDistanceKm > competitiveMetrics.currentWeekDistanceKm,
    'personal weekly distance must include imports',
  );
});

console.log('[competitiveRuns] all tests passed');
