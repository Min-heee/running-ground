import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePaceSecondsPerKm, resolveRunDurationSeconds } from './runDuration';

test('parsePaceSecondsPerKm reads MM:SS/km and rejects garbage', () => {
  assert.equal(parsePaceSecondsPerKm('06:00/km'), 360);
  assert.equal(parsePaceSecondsPerKm('6:20/km'), 380);
  assert.equal(parsePaceSecondsPerKm('--:--/km'), null);
  assert.equal(parsePaceSecondsPerKm('00:00/km'), null);
  assert.equal(parsePaceSecondsPerKm(undefined), null);
  assert.equal(parsePaceSecondsPerKm('6분/km'), null);
});

test('resolveRunDurationSeconds prefers stored duration, derives from pace otherwise', () => {
  // 저장된 시간이 있으면 그대로.
  assert.equal(resolveRunDurationSeconds({ durationSeconds: 1_805, pace: '06:00/km', distanceKm: 5 }), 1_805);
  // 없으면 페이스 × 거리 (홈 시간 0:00 버그의 수동 기록 케이스): 6:00/km × 5km = 30분.
  assert.equal(resolveRunDurationSeconds({ pace: '06:00/km', distanceKm: 5 }), 1_800);
  assert.equal(resolveRunDurationSeconds({ durationSeconds: 0, pace: '05:30/km', distanceKm: 10.5 }), 3_465);
  // 도출 재료가 없으면 null.
  assert.equal(resolveRunDurationSeconds({ pace: '--:--/km', distanceKm: 5 }), null);
  assert.equal(resolveRunDurationSeconds({ pace: '06:00/km', distanceKm: 0 }), null);
  assert.equal(resolveRunDurationSeconds({}), null);
});
