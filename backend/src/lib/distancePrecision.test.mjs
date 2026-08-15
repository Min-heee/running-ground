import assert from 'node:assert/strict';
import test from 'node:test';

import { DISTANCE_DECIMALS, roundDistanceKm } from './distancePrecision.mjs';
import { validateDistanceKm } from './validators.mjs';
import { buildUserRunMetrics } from './points.mjs';

// 2026-08-15 사건: 회원G·회원J가 8.15km를 정확히 뛰었는데 저장이 소수 1자리로
// 반올림해 8.2 / 8.1로 남았다. 815런처럼 소수점이 곧 의미인 행사에서 기록이 어긋난다.
// 되돌리면(1자리로 회귀) 아래 단언이 전부 깨진다.

test('저장 길목이 8.15를 그대로 보존한다', () => {
  assert.equal(DISTANCE_DECIMALS, 2);
  assert.equal(validateDistanceKm(8.15, '거리 오류'), 8.15);
  // GPS가 주는 잉여 자리는 2자리로 정리한다.
  assert.equal(validateDistanceKm(8.1534, '거리 오류'), 8.15);
  assert.equal(validateDistanceKm(8.156, '거리 오류'), 8.16);
  // 정수는 정수로 남는다 — 화면이 값을 그대로 찍기 때문에 10.00이 되면 안 된다.
  assert.equal(validateDistanceKm(10, '거리 오류'), 10);
});

test('roundDistanceKm: 비정상 입력은 0, 유한값은 2자리', () => {
  assert.equal(roundDistanceKm(8.149), 8.15);
  assert.equal(roundDistanceKm(0.004), 0);
  assert.equal(roundDistanceKm(Number.NaN), 0);
  assert.equal(roundDistanceKm('8.15'), 8.15);
});

test('집계도 2자리 — 오늘/친구 보드가 8.15를 8.2로 뭉개지 않는다', () => {
  const run = {
    id: 'run-815', userId: 'u', date: '2026-08-15', distanceKm: 8.15,
    pace: '06:41/km', durationSeconds: 3272, source: 'RunningGround', sourceType: 'runningground',
  };
  const metrics = buildUserRunMetrics([run], new Date('2026-08-15T12:00:00.000Z'));

  assert.equal(metrics.currentWeekDistanceKm, 8.15);
  assert.equal(metrics.currentMonthDistanceKm, 8.15);
});
