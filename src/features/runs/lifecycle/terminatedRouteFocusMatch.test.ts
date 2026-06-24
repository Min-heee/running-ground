import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearRouteFocusMatchTerminated,
  isRouteFocusMatchTerminated,
  markRouteFocusMatchTerminated,
  resetTerminatedRouteFocusMatchesForTest,
} from '@/features/runs/lifecycle/terminatedRouteFocusMatch';

test('marks and reads a terminated route-focus match id', () => {
  resetTerminatedRouteFocusMatchesForTest();
  assert.equal(isRouteFocusMatchTerminated('match-1'), false);

  markRouteFocusMatchTerminated('match-1');
  assert.equal(isRouteFocusMatchTerminated('match-1'), true);
  assert.equal(isRouteFocusMatchTerminated('match-2'), false);

  resetTerminatedRouteFocusMatchesForTest();
});

test('null/undefined match ids are no-ops', () => {
  resetTerminatedRouteFocusMatchesForTest();
  markRouteFocusMatchTerminated(null);
  markRouteFocusMatchTerminated(undefined);
  assert.equal(isRouteFocusMatchTerminated(null), false);
  assert.equal(isRouteFocusMatchTerminated(undefined), false);
  resetTerminatedRouteFocusMatchesForTest();
});

test('the tombstone expires after its TTL', () => {
  resetTerminatedRouteFocusMatchesForTest();
  const base = 1_000_000;
  markRouteFocusMatchTerminated('match-ttl', base);

  // Still within TTL.
  assert.equal(isRouteFocusMatchTerminated('match-ttl', base + 60_000), true);
  // Past the 10-minute TTL.
  assert.equal(isRouteFocusMatchTerminated('match-ttl', base + 11 * 60 * 1000), false);

  resetTerminatedRouteFocusMatchesForTest();
});

test('clearRouteFocusMatchTerminated removes one id, or all when omitted', () => {
  resetTerminatedRouteFocusMatchesForTest();
  markRouteFocusMatchTerminated('a');
  markRouteFocusMatchTerminated('b');

  clearRouteFocusMatchTerminated('a');
  assert.equal(isRouteFocusMatchTerminated('a'), false);
  assert.equal(isRouteFocusMatchTerminated('b'), true);

  clearRouteFocusMatchTerminated();
  assert.equal(isRouteFocusMatchTerminated('b'), false);

  resetTerminatedRouteFocusMatchesForTest();
});
