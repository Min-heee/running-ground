import assert from 'node:assert/strict';
import test from 'node:test';

import type { MyRunRecord } from '@/domain';
import { buildRunPeriodOptions, resolveCurrentPeriodKey } from './runPeriodSummary';
import {
  buildRunPeriodBars,
  buildRunPeriodChartModel,
  resolveChartTickStepKm,
} from './runPeriodBars';

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

test('월 모드: 선택한 달의 일별 막대 (나이키 월 탭과 동일)', () => {
  const bars = buildRunPeriodBars(RUNS, 'month', currentOption('month'), NOW_MS);

  // 2026년 8월 = 31일.
  assert.equal(bars.length, 31);
  assert.equal(bars[0].distanceKm, 10);       // 8/1
  assert.equal(bars[0].isCurrent, true);
  assert.equal(bars[1].distanceKm, 0);
  // x축 라벨은 눈금 날짜(1/5/12/19/26)와 말일에만.
  assert.deepEqual(
    bars.filter((bar) => bar.label !== '').map((bar) => bar.label),
    ['1', '5', '12', '19', '26', '31'],
  );
});

test('년 모드: 선택한 해의 1~12월 (나이키 년 탭과 동일)', () => {
  const bars = buildRunPeriodBars(RUNS, 'year', currentOption('year'), NOW_MS);

  assert.equal(bars.length, 12);
  assert.equal(bars[0].distanceKm, 4);           // 1월
  assert.equal(bars[5].distanceKm, 7);           // 6월
  assert.equal(Number(bars[6].distanceKm.toFixed(1)), 8.2); // 7월 = 3 + 5.2
  assert.equal(bars[7].distanceKm, 10);          // 8월
  assert.equal(bars[7].isCurrent, true);
  assert.equal(bars[0].label, '1월');
});

test('점선 평균 = 총거리 ÷ 기록 있는 칸 수 (나이키 검증 값)', () => {
  // 나이키 실측: 주 9.9km/2회 → 5.0.
  const week = buildRunPeriodChartModel(
    [buildRun('2026-07-28', 5.6), buildRun('2026-07-29', 4.3)],
    'week',
    currentOption('week'),
    NOW_MS,
  );
  assert.equal(week.averageKm, 5.0);

  const empty = buildRunPeriodChartModel([], 'week', currentOption('week'), NOW_MS);
  assert.equal(empty.averageKm, null);
});

test('y축 눈금: 1·2·3·5 계열에서 3칸이 최댓값을 덮는 최소값, 빈 그래프는 3', () => {
  assert.equal(resolveChartTickStepKm(0), 3);      // 빈 그래프 → 0/3/6/9km (나이키와 동일)
  assert.equal(resolveChartTickStepKm(5.6), 2);    // 최대 5.6 → 2/4/6
  assert.equal(resolveChartTickStepKm(10), 5);     // 최대 10 → 5/10/15
  assert.equal(resolveChartTickStepKm(104), 50);   // 나이키 년 탭(최대 ~104) → 50/100/150
  assert.equal(resolveChartTickStepKm(2.9), 1);
});

test('기록이 없어도 그래프는 칸 구조를 유지한다', () => {
  const weekBars = buildRunPeriodBars([], 'week', currentOption('week'), NOW_MS);
  assert.equal(weekBars.length, 7);
  assert.ok(weekBars.every((bar) => bar.distanceKm === 0));

  const yearBars = buildRunPeriodBars([], 'year', currentOption('year'), NOW_MS);
  assert.equal(yearBars.length, 12);
});
