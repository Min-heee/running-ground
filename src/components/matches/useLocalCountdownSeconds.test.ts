import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveLocalCountdownSeconds,
  resolveLocalCountdownTickerDelayMs,
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

test('local countdown schedules the next tick at the next second boundary', () => {
  const targetMs = 10_000;

  assert.equal(resolveLocalCountdownTickerDelayMs({ nowMs: 5_000, targetMs }), 1_000);
  assert.equal(resolveLocalCountdownTickerDelayMs({ nowMs: 5_400, targetMs }), 600);
  assert.equal(resolveLocalCountdownTickerDelayMs({ nowMs: 9_990, targetMs }), 50);
  assert.equal(resolveLocalCountdownTickerDelayMs({ nowMs: 10_000, targetMs }), null);
});
