import assert from 'node:assert/strict';
import test from 'node:test';
import type { MyRunRecord } from '@/domain';
import {
  buildRunPeriodOptions,
  formatRunPeriodDistanceKm,
  formatRunPeriodDurationLabel,
  parseRunDateMs,
  resolveCurrentPeriodKey,
  summarizeRunsForPeriod,
} from './runPeriodSummary';

function run(overrides: Partial<MyRunRecord>): MyRunRecord {
  return {
    id: overrides.id ?? 'run',
    date: overrides.date ?? '2026-06-01',
    distanceKm: overrides.distanceKm ?? 1,
    pace: '06:00/km',
    source: 'RunningGround',
    sourceType: 'runningground',
    durationSeconds: overrides.durationSeconds,
    startedAt: overrides.startedAt,
  };
}

test('parseRunDateMs prefers YYYY-MM-DD date values at local midnight', () => {
  const result = parseRunDateMs(run({ date: '2026-06-02', startedAt: '2026-06-03T10:00:00.000Z' }));
  const expected = new Date(2026, 5, 2).getTime();

  assert.equal(result, expected);
});

test('parseRunDateMs falls back to startedAt when date is not parseable', () => {
  const result = parseRunDateMs(run({ date: '어제', startedAt: '2026-06-03T10:00:00.000Z' }));

  assert.equal(result, new Date(2026, 5, 3).getTime());
});

test('weekly options start on Monday and include the current period', () => {
  const nowMs = new Date(2026, 5, 7, 12).getTime();
  const options = buildRunPeriodOptions([run({ date: '2026-05-20' })], 'week', nowMs);

  assert.equal(options.at(-1)?.key, resolveCurrentPeriodKey('week', nowMs));
  assert.equal(options.at(-1)?.label, '이번 주');
  assert.equal(options.at(-2)?.label, '지난주');
  assert.equal(new Date(options.at(-1)!.startMs).getDay(), 1);
});

test('monthly and yearly options keep chronological order', () => {
  const nowMs = new Date(2026, 5, 15).getTime();
  const monthOptions = buildRunPeriodOptions([run({ date: '2026-04-02' })], 'month', nowMs);
  const yearOptions = buildRunPeriodOptions([run({ date: '2024-04-02' })], 'year', nowMs);

  assert.deepEqual(monthOptions.map((option) => option.label), ['2026년 4월', '2026년 5월', '2026년 6월']);
  assert.deepEqual(yearOptions.map((option) => option.label), ['2024년', '2025년', '2026년']);
});

test('empty runs still produce recent selectable periods', () => {
  const nowMs = new Date(2026, 5, 15).getTime();

  assert.equal(buildRunPeriodOptions([], 'week', nowMs).length, 8);
  assert.equal(buildRunPeriodOptions([], 'month', nowMs).length, 6);
  assert.equal(buildRunPeriodOptions([], 'year', nowMs).length, 3);
});

test('period options are capped to avoid oversized wheels', () => {
  const nowMs = new Date(2026, 5, 15).getTime();

  assert.equal(buildRunPeriodOptions([run({ date: '2020-01-01' })], 'week', nowMs).length, 26);
  assert.equal(buildRunPeriodOptions([run({ date: '2020-01-01' })], 'month', nowMs).length, 36);
  assert.equal(buildRunPeriodOptions([run({ date: '2010-01-01' })], 'year', nowMs).length, 10);
});

test('summarizeRunsForPeriod totals distance, count, and duration in the selected period', () => {
  const nowMs = new Date(2026, 5, 15).getTime();
  const option = buildRunPeriodOptions([], 'week', nowMs).at(-1)!;
  const summary = summarizeRunsForPeriod([
    run({ id: 'a', date: '2026-06-15', distanceKm: 3.2, durationSeconds: 1_200 }),
    run({ id: 'b', date: '2026-06-16', distanceKm: 4.1, durationSeconds: 1_500 }),
    run({ id: 'c', date: '2026-06-08', distanceKm: 9.9, durationSeconds: 9_999 }),
  ], option);

  assert.equal(summary.runCount, 2);
  assert.equal(summary.distanceKm, 7.3);
  assert.equal(summary.durationSeconds, 2_700);
});

test('period summary formatters keep home labels compact', () => {
  assert.equal(formatRunPeriodDistanceKm(7.34), '7.3');
  assert.equal(formatRunPeriodDurationLabel(0), '0:00');
  assert.equal(formatRunPeriodDurationLabel(3_900), '1:05');
});
