import assert from 'node:assert/strict';
import test from 'node:test';

import { buildActivityMonthGroups, buildAveragePaceLabel, formatActivityRunDayLabel } from './activityMonthGroups';

const NOW = new Date(2026, 8, 14, 10, 0, 0).getTime(); // 2026-09-14 (local)

function run(date: string, distanceKm: number, pace: string) {
  return { id: `run-${date}-${distanceKm}`, date, distanceKm, pace, source: 'RunningGround' };
}

test('runs are grouped by month, newest month first, in server order', () => {
  const groups = buildActivityMonthGroups([
    run('2026-09-12', 8.2, '5:34/km'),
    run('2026-09-10', 6.4, '5:41/km'),
    run('2026-08-30', 9.1, '5:08/km'),
  ], NOW);

  assert.deepEqual(groups.map((group) => group.key), ['2026-09', '2026-08']);
  assert.deepEqual(groups[0].runs.map((entry) => entry.date), ['2026-09-12', '2026-09-10']);
  assert.equal(groups[0].isCurrentMonth, true);
  assert.equal(groups[0].distanceKm, 14.6);
  assert.equal(groups[1].label, '8월');
  assert.equal(groups[1].metaLine, '9.1km · 1회');
});

test('the current month still gets a heading when it has no runs yet', () => {
  const groups = buildActivityMonthGroups([run('2026-08-30', 9.1, '5:08/km')], NOW);

  assert.deepEqual(groups.map((group) => group.key), ['2026-09', '2026-08']);
  assert.equal(groups[0].label, '이번 달');
  assert.equal(groups[0].runCount, 0);
  assert.equal(groups[0].distanceKm, 0);
  assert.equal(groups[0].metaLine, '0km · 0회');
  assert.equal(groups[0].runs.length, 0);
});

test('a month from an earlier year carries the year in its label', () => {
  const groups = buildActivityMonthGroups([run('2025-12-24', 5, '6:00/km')], NOW);

  assert.equal(groups[1].label, '2025년 12월');
});

test('every month header reads distance · count, the current month included', () => {
  const groups = buildActivityMonthGroups([
    run('2026-09-12', 10, '5:00/km'),
    run('2026-09-11', 10, '6:00/km'),
    run('2026-09-10', 5, '00:00/km'),
    run('2026-09-09', 5, '--:--/km'),
  ], NOW);

  assert.equal(groups[0].runCount, 4);
  assert.equal(groups[0].distanceKm, 30);
  assert.equal(groups[0].metaLine, '30km · 4회');
});

test('average pace ignores runs whose pace was never measured', () => {
  // '00:00/km'(기권·정지 저장)와 '--:--/km'(측정 불가)는 평균에서 빠진다.
  assert.equal(buildAveragePaceLabel([
    run('2026-09-12', 10, '5:00/km'),
    run('2026-09-11', 10, '6:00/km'),
    run('2026-09-10', 5, '00:00/km'),
    run('2026-09-09', 5, '--:--/km'),
  ]), '5:30/km');
});

test('average pace is null when no run has a usable pace', () => {
  assert.equal(buildAveragePaceLabel([run('2026-09-12', 5, '00:00/km')]), null);
  assert.equal(buildAveragePaceLabel([]), null);
});

test('day labels carry the weekday and never shift a day', () => {
  assert.equal(formatActivityRunDayLabel('2026-09-12'), '12일 (토)');
  assert.equal(formatActivityRunDayLabel('2026-09-01'), '1일 (화)');
  assert.equal(formatActivityRunDayLabel(''), '');
});
