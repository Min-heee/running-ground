import assert from 'node:assert/strict';
import test from 'node:test';

import type { MyRunRecord } from '@/domain';
import { buildRunPeriodOptions, resolveCurrentPeriodKey } from './runPeriodSummary';
import { buildRunPeriodBars } from './runPeriodBars';

// 2026-08-01은 토요일 — 이번 주는 7/27(월)~8/2(일).
const NOW_MS = new Date(2026, 7, 1, 12, 0, 0).getTime();

function buildRun(date: string, distanceKm: number): MyRunRecord {
  return { id: `run-${date}-${distanceKm}`, date, distanceKm, pace: '06:00/km', source: '러닝그라운드' };
}

const RUNS = [
  buildRun('2026-07-27', 3),
  buildRun('2026-07-31', 5.2),
  buildRun('2026-08-01', 10),
  buildRun('2026-06-15', 7),
  buildRun('2026-01-10', 4),
];

function currentOption(mode: 'week' | 'month' | 'year') {
  const options = buildRunPeriodOptions(RUNS, mode, NOW_MS);
  const key = resolveCurrentPeriodKey(mode, NOW_MS);
  const option = options.find((entry) => entry.key === key);
  assert.ok(option, `current ${mode} option missing`);
  return option;
}

test('주 모드: 선택한 주의 요일별 거리, 오늘 칸 표시', () => {
  const bars = buildRunPeriodBars(RUNS, 'week', currentOption('week'), NOW_MS);

  assert.equal(bars.length, 7);
  assert.deepEqual(bars.map((bar) => bar.distanceKm), [3, 0, 0, 0, 5.2, 10, 0]);
  // 8/1은 토요일 — 여섯 번째 칸이 오늘.
  assert.deepEqual(bars.map((bar) => bar.isCurrent), [false, false, false, false, false, true, false]);
});

test('월 모드: 선택한 달이 속한 해의 1~12월', () => {
  const bars = buildRunPeriodBars(RUNS, 'month', currentOption('month'), NOW_MS);

  assert.equal(bars.length, 12);
  assert.equal(bars[0].distanceKm, 4);          // 1월
  assert.equal(bars[5].distanceKm, 7);          // 6월
  assert.equal(Number(bars[6].distanceKm.toFixed(1)), 8.2); // 7월 = 3 + 5.2
  assert.equal(bars[7].distanceKm, 10);         // 8월
  assert.equal(bars[7].isCurrent, true);
  assert.equal(bars[6].isCurrent, false);
});

test('년 모드: 첫 기록 연도부터 올해까지 — 첫해에는 한 칸', () => {
  const bars = buildRunPeriodBars(RUNS, 'year', currentOption('year'), NOW_MS);

  assert.equal(bars.length, 1);
  assert.equal(bars[0].label, '2026');
  assert.equal(Number(bars[0].distanceKm.toFixed(1)), 29.2);
  assert.equal(bars[0].isCurrent, true);
});

test('작년 기록이 생기면 년 모드 칸이 늘어난다', () => {
  const withLastYear = [...RUNS, buildRun('2025-11-03', 6)];
  const bars = buildRunPeriodBars(withLastYear, 'year', currentOption('year'), NOW_MS);

  assert.deepEqual(bars.map((bar) => bar.label), ['2025', '2026']);
  assert.equal(bars[0].distanceKm, 6);
  assert.equal(bars[0].isCurrent, false);
});

test('기록이 없어도 그래프는 빈 칸으로 성립한다', () => {
  const weekBars = buildRunPeriodBars([], 'week', currentOption('week'), NOW_MS);
  assert.equal(weekBars.length, 7);
  assert.ok(weekBars.every((bar) => bar.distanceKm === 0));

  const yearBars = buildRunPeriodBars([], 'year', null, NOW_MS);
  assert.equal(yearBars.length, 1);
});
