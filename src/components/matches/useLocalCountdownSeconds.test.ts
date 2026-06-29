import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceLocalCountdownMountState,
  createLocalCountdownMountState,
  isCountdownKeyFinished,
  markCountdownKeyFinished,
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

test('a finished countdown key stays finished so it can never re-show', () => {
  assert.equal(isCountdownKeyFinished('match-finish-A'), false);

  markCountdownKeyFinished('match-finish-A');

  // Survives a remount / the room -> fallback handoff of the same match.
  assert.equal(isCountdownKeyFinished('match-finish-A'), true);
  // A different match (or no key) is unaffected.
  assert.equal(isCountdownKeyFinished('match-finish-B'), false);
  assert.equal(isCountdownKeyFinished(null), false);
  assert.equal(isCountdownKeyFinished(undefined), false);

  // Empty keys are ignored (never latched).
  markCountdownKeyFinished('');
  assert.equal(isCountdownKeyFinished(''), false);
});

// ---------------------------------------------------------------------------
// D-part-2: a countdownKey change within ONE persisted mount must reset the per-mount
// floor/ended state. The pure reducer the hook drives encodes this.
// ---------------------------------------------------------------------------

test('rotate-BEFORE-zero re-seeds the new key fresh (no leak of the old key floor/ended)', () => {
  let state = createLocalCountdownMountState('keyA');

  // Count keyA down a bit (floor 10 -> 8).
  let r = advanceLocalCountdownMountState(state, { key: 'keyA', candidate: 10 });
  state = r.state;
  assert.equal(r.displayedSeconds, 10);
  r = advanceLocalCountdownMountState(state, { key: 'keyA', candidate: 8 });
  state = r.state;
  assert.equal(r.displayedSeconds, 8);

  // Key rotates to keyB BEFORE keyA reached zero (e.g. the room re-queued mid-countdown). The
  // new key must re-seed high (25), NOT be floored to keyA's 8.
  r = advanceLocalCountdownMountState(state, { key: 'keyB', candidate: 25 });
  state = r.state;
  assert.equal(r.displayedSeconds, 25, 'new key must re-seed, not inherit the old floor');
  assert.equal(r.tombstoneKey, null, 'rotation before zero does not tombstone the old key');
  assert.equal(state.ended, false);

  // keyB then counts down normally.
  r = advanceLocalCountdownMountState(state, { key: 'keyB', candidate: 24 });
  assert.equal(r.displayedSeconds, 24);
});

test('rotate-AFTER-zero keeps the OLD key gone but counts the NEW key fresh', () => {
  let state = createLocalCountdownMountState('keyOld');

  // keyOld shows a positive digit then reaches zero → tombstone keyOld.
  let r = advanceLocalCountdownMountState(state, { key: 'keyOld', candidate: 3 });
  state = r.state;
  assert.equal(r.displayedSeconds, 3);
  r = advanceLocalCountdownMountState(state, { key: 'keyOld', candidate: null });
  state = r.state;
  assert.equal(r.displayedSeconds, null);
  assert.equal(r.tombstoneKey, 'keyOld', 'a counted-down key is tombstoned on finish');
  assert.equal(state.ended, true);

  // The same persisted mount is re-used for keyNew. The OLD key stays gone (its tombstone was
  // returned above), but THIS mount must NOT remain terminal — keyNew counts fresh.
  r = advanceLocalCountdownMountState(state, { key: 'keyNew', candidate: 30 });
  state = r.state;
  assert.equal(r.displayedSeconds, 30, 'new key counts fresh even though the old key ended');
  assert.equal(state.ended, false);
  assert.equal(r.tombstoneKey, null);

  r = advanceLocalCountdownMountState(state, { key: 'keyNew', candidate: 29 });
  assert.equal(r.displayedSeconds, 29);
});

test('a finish WITHOUT ever showing a positive digit does NOT tombstone the key', () => {
  // A mount that reaches candidate=null without ever displaying a positive digit never counted
  // down (e.g. the slot read <=0 on a momentarily-stale clock). Tombstoning it would wrongly
  // suppress a countdown that should still be able to appear.
  const state = createLocalCountdownMountState('keyNeverShown');
  const r = advanceLocalCountdownMountState(state, { key: 'keyNeverShown', candidate: null });
  assert.equal(r.displayedSeconds, null);
  assert.equal(r.tombstoneKey, null, 'a mount that never counted down must not tombstone');
  assert.equal(r.state.ended, true);
});
