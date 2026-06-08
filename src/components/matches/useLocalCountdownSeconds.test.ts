import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveLocalCountdownSeconds,
  resolveMonotonicCountdownFloor,
} from '@/components/matches/useLocalCountdownSeconds';

test('local countdown seconds are derived from the locked target time', () => {
  const targetMs = 10_000;

  assert.equal(resolveLocalCountdownSeconds({ nowMs: 0, targetMs }), 10);
  assert.equal(resolveLocalCountdownSeconds({ nowMs: 1, targetMs }), 10);
  assert.equal(resolveLocalCountdownSeconds({ nowMs: 1_000, targetMs }), 9);
  assert.equal(resolveLocalCountdownSeconds({ nowMs: 9_001, targetMs }), 1);
  assert.equal(resolveLocalCountdownSeconds({ nowMs: 10_000, targetMs }), null);
});

test('local countdown clamps to the host visible window', () => {
  assert.equal(resolveLocalCountdownSeconds({
    maxSeconds: 10,
    nowMs: 0,
    targetMs: 15_000,
  }), 10);
});

test('local countdown holds the same whole second across a full sub-second sweep', () => {
  const targetMs = 10_000;

  // Every poll within the same second window must return the same digit, so the
  // per-frame ticker re-renders exactly once per boundary (uniform cadence).
  for (let nowMs = 5_000; nowMs <= 5_999; nowMs += 1) {
    assert.equal(resolveLocalCountdownSeconds({ nowMs, targetMs }), 5);
  }

  assert.equal(resolveLocalCountdownSeconds({ nowMs: 6_000, targetMs }), 4);
});

test('monotonic floor lets the digit count down but never back up', () => {
  assert.equal(resolveMonotonicCountdownFloor(null, 5), 5); // seed
  assert.equal(resolveMonotonicCountdownFloor(5, 4), 4); // step down
  assert.equal(resolveMonotonicCountdownFloor(2, 1), 1); // step down to the last second
  assert.equal(resolveMonotonicCountdownFloor(1, 2), 1); // suppress a backwards jump (the bug)
  assert.equal(resolveMonotonicCountdownFloor(1, 1), 1); // hold at one
});
