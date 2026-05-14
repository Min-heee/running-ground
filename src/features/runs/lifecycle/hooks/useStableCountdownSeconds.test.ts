import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStableCountdownRemainingSeconds } from './useStableCountdownSeconds';

test('stable countdown follows local time when server value jitters upward', () => {
  const tracker = { current: null };

  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 30, 0), 30);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 30, 1000), 29);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 31, 2000), 28);
});

test('stable countdown accepts lower server value and resets by key', () => {
  const tracker = { current: null };

  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 30, 0), 30);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 20, 1000), 20);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-2', 40, 2000), 40);
});

test('stable countdown ignores small lower server jitter to avoid visual skips', () => {
  const tracker = { current: null };

  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 30, 0), 30);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 27, 1000), 29);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 26, 2000), 28);
});

test('stable countdown clears itself when no countdown key exists', () => {
  const tracker = { current: null };

  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 5, 0), 5);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, null, null, 1000), null);
  assert.equal(tracker.current, null);
});
