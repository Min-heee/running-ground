import assert from 'node:assert/strict';
import test from 'node:test';

import type { MyRunRecord } from '@/domain';
import { buildSoloWeekSummary, getWeekStartMs } from './soloWeekSummary';

// 2026-07-31은 금요일 — 이번 주는 7/27(월)~8/2(일).
const FRIDAY_NOON = new Date(2026, 6, 31, 12, 0, 0).getTime();

function buildRun(date: string, distanceKm: number): MyRunRecord {
  return {
    id: `run-${date}-${distanceKm}`,
    date,
    distanceKm,
    pace: '05:40/km',
    source: '러닝그라운드',
  };
}

test('주는 월요일에 시작한다', () => {
  const weekStart = new Date(getWeekStartMs(FRIDAY_NOON));

  assert.equal(weekStart.getDay(), 1);
  assert.equal(weekStart.getDate(), 27);
  assert.equal(weekStart.getHours(), 0);
});

test('일요일에도 그 주(월~일)를 유지한다', () => {
  // 일요일을 다음 주 시작으로 보면 주간 합계가 하루치만 남는다.
  const sundayNoon = new Date(2026, 7, 2, 12, 0, 0).getTime();
  const weekStart = new Date(getWeekStartMs(sundayNoon));

  assert.equal(weekStart.getDate(), 27);
  assert.equal(weekStart.getMonth(), 6);
});

test('요일별로 거리를 모으고 합계를 낸다', () => {
  const summary = buildSoloWeekSummary([
    buildRun('2026-07-27', 3),
    buildRun('2026-07-30', 5.2),
    buildRun('2026-07-31', 2.4),
    buildRun('2026-07-31', 1.6),
  ], FRIDAY_NOON);

  assert.deepEqual(summary.bars.map((bar) => bar.distanceKm), [3, 0, 0, 5.2, 4, 0, 0]);
  assert.equal(summary.runCount, 4);
  assert.equal(Number(summary.totalDistanceKm.toFixed(1)), 12.2);
  assert.equal(summary.todayDistanceKm, 4);
  assert.equal(summary.maxDistanceKm, 5.2);
});

test('오늘과 아직 오지 않은 요일을 구분한다', () => {
  const summary = buildSoloWeekSummary([], FRIDAY_NOON);

  assert.deepEqual(summary.bars.map((bar) => bar.isToday), [false, false, false, false, true, false, false]);
  // 토·일은 아직 오지 않은 날 — '안 뛴 날'과 다르게 그린다.
  assert.deepEqual(summary.bars.map((bar) => bar.isFuture), [false, false, false, false, false, true, true]);
});

test('지난 주와 다음 주 기록은 세지 않는다', () => {
  const summary = buildSoloWeekSummary([
    buildRun('2026-07-26', 9),
    buildRun('2026-08-03', 9),
    buildRun('2026-07-28', 1.5),
  ], FRIDAY_NOON);

  assert.equal(summary.totalDistanceKm, 1.5);
  assert.equal(summary.runCount, 1);
});

test('날짜나 거리가 망가진 기록은 건너뛴다', () => {
  const summary = buildSoloWeekSummary([
    { ...buildRun('2026-07-29', 4), date: 'not-a-date' },
    { ...buildRun('2026-07-29', Number.NaN) },
    buildRun('2026-07-29', 2),
  ], FRIDAY_NOON);

  assert.equal(summary.totalDistanceKm, 2);
  assert.equal(summary.runCount, 1);
});

test('startedAt만 있는 기록도 그날에 꽂힌다', () => {
  const summary = buildSoloWeekSummary([{
    ...buildRun('', 6),
    date: '',
    startedAt: new Date(2026, 6, 29, 7, 30).toISOString(),
  }], FRIDAY_NOON);

  assert.equal(summary.bars[2].distanceKm, 6);
});
