import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStableCountdownRemainingSeconds } from './useStableCountdownSeconds';

test('stable countdown follows local time when server value jitters upward within threshold', () => {
  const tracker = { current: null };

  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 30, 0), 30);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 30, 1000), 29);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 29, 2000), 28);
});

test('stable countdown re-baselines upward when raw exceeds modeled by more than threshold', () => {
  const tracker = { current: null };

  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 28, 0), 28);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 30, 1000), 30);
});

test('stable countdown does not re-baseline upward when raw is within threshold', () => {
  const tracker = { current: null };

  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 28, 0), 28);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 28, 1000), 27);
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

test('stable countdown still re-baselines downward when server value is far lower', () => {
  const tracker = { current: null };

  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 30, 0), 30);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 25, 1000), 25);
});

test('stable countdown clears itself when no countdown key exists', () => {
  const tracker = { current: null };

  assert.equal(resolveStableCountdownRemainingSeconds(tracker, 'match-1', 5, 0), 5);
  assert.equal(resolveStableCountdownRemainingSeconds(tracker, null, null, 1000), null);
  assert.equal(tracker.current, null);
});
