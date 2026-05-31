import assert from 'node:assert/strict';
import test from 'node:test';
import type { MyRunRecord } from '@/domain';
import { selectRecentRuns } from './homeRecentRuns';

function run(id: string): MyRunRecord {
  return {
    id,
    date: `2026-06-${id}`,
    distanceKm: Number(id),
    pace: '06:00/km',
    source: 'RunningGround',
    sourceType: 'runningground',
  };
}

test('selectRecentRuns keeps API order and applies the limit', () => {
  const runs = [run('01'), run('02'), run('03'), run('04'), run('05')];

  assert.deepEqual(selectRecentRuns(runs, 3).map((entry) => entry.id), ['01', '02', '03']);
});

test('selectRecentRuns defaults to four records', () => {
  const runs = [run('01'), run('02'), run('03'), run('04'), run('05')];

  assert.deepEqual(selectRecentRuns(runs).map((entry) => entry.id), ['01', '02', '03', '04']);
});

test('selectRecentRuns is safe for empty or missing input', () => {
  assert.deepEqual(selectRecentRuns([]), []);
  assert.deepEqual(selectRecentRuns(null), []);
  assert.deepEqual(selectRecentRuns(undefined), []);
});

test('selectRecentRuns normalizes invalid limits', () => {
  const runs = [run('01'), run('02')];

  assert.deepEqual(selectRecentRuns(runs, -1), []);
  assert.deepEqual(selectRecentRuns(runs, Number.NaN).map((entry) => entry.id), ['01', '02']);
});
