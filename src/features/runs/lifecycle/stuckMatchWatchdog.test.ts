import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldAutoEndStuckMatch,
  STUCK_MATCH_NO_PROGRESS_MS,
} from '@/features/runs/lifecycle/stuckMatchWatchdog';

test('stuck match watchdog stays off outside real active matches', () => {
  assert.equal(shouldAutoEndStuckMatch({
    isRealMatchActive: false,
    lastProgressAtMs: 0,
    nowMs: STUCK_MATCH_NO_PROGRESS_MS,
  }), false);
});

test('stuck match watchdog requires a known last progress timestamp', () => {
  assert.equal(shouldAutoEndStuckMatch({
    isRealMatchActive: true,
    lastProgressAtMs: null,
    nowMs: STUCK_MATCH_NO_PROGRESS_MS,
  }), false);
});

test('stuck match watchdog fires after the no-progress threshold', () => {
  assert.equal(shouldAutoEndStuckMatch({
    isRealMatchActive: true,
    lastProgressAtMs: 1_000,
    nowMs: 1_000 + STUCK_MATCH_NO_PROGRESS_MS,
  }), true);
});

test('stuck match watchdog stays armed before the no-progress threshold', () => {
  assert.equal(shouldAutoEndStuckMatch({
    isRealMatchActive: true,
    lastProgressAtMs: 1_000,
    nowMs: 1_000 + STUCK_MATCH_NO_PROGRESS_MS - 1,
  }), false);
});
