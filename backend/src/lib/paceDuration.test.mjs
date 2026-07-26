import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveDurationSecondsFromPace, parsePaceSecondsPerKm } from './paceDuration.mjs';

test('parsePaceSecondsPerKm reads MM:SS/km and rejects garbage', () => {
  assert.equal(parsePaceSecondsPerKm('06:00/km'), 360);
  assert.equal(parsePaceSecondsPerKm('6:20/km'), 380);
  assert.equal(parsePaceSecondsPerKm('--:--/km'), null);
  assert.equal(parsePaceSecondsPerKm('00:00/km'), null);
  assert.equal(parsePaceSecondsPerKm(null), null);
});

test('deriveDurationSecondsFromPace multiplies pace by distance', () => {
  // 6:00/km × 5km = 30분 — 수동 기록의 시간 도출 (홈 시간 합계 0:00 근치).
  assert.equal(deriveDurationSecondsFromPace('06:00/km', 5), 1_800);
  assert.equal(deriveDurationSecondsFromPace('05:30/km', 10.5), 3_465);
  assert.equal(deriveDurationSecondsFromPace('06:00/km', 0), null);
  assert.equal(deriveDurationSecondsFromPace('bad', 5), null);
});
