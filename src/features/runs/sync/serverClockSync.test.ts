import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySharedServerClock,
  getSharedServerClockOffsetMs,
  parseServerNowMs,
  resetSharedServerClockForTest,
  resolveStableServerClockOffset,
  shouldAcceptServerSnapshot,
  subscribeSharedServerClock,
} from './serverClockSync';

test('server clock parser ignores invalid timestamps', () => {
  assert.equal(parseServerNowMs(undefined), null);
  assert.equal(parseServerNowMs('not-a-date'), null);
  assert.equal(parseServerNowMs('2026-05-12T00:00:00.000Z'), Date.parse('2026-05-12T00:00:00.000Z'));
});

test('server clock offset smoothing ignores small local jitter and smooths large jumps', () => {
  // Below 500ms apply threshold → treated as no offset (NTP jitter range).
  assert.equal(resolveStableServerClockOffset(0, 200), 0);
  // 1200ms is above the 500ms threshold and applies immediately, so cross-device
  // countdown sync benefits from sub-second offset corrections (Step 1 fix).
  assert.equal(resolveStableServerClockOffset(0, 1200), 1200);
  assert.equal(resolveStableServerClockOffset(0, 4000), 4000);
  // Once a stable offset is applied, small deltas within jitter tolerance are kept.
  assert.equal(resolveStableServerClockOffset(4000, 4300), 4000);
  assert.equal(resolveStableServerClockOffset(4000, 8000), 5000);
});

test('server snapshot guard rejects older server snapshots', () => {
  const latestRef = { current: 0 };

  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:02.000Z'), true);
  assert.equal(latestRef.current, Date.parse('2026-05-12T00:00:02.000Z'));
  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:01.000Z'), false);
  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:03.000Z'), true);
});

test('shared server clock applies the first accepted offset', () => {
  resetSharedServerClockForTest();
  const originalDateNow = Date.now;
  Date.now = () => Date.parse('2026-05-12T00:00:00.000Z');

  try {
    assert.equal(getSharedServerClockOffsetMs(), 0);
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.000Z'), 4000);
    assert.equal(getSharedServerClockOffsetMs(), 4000);
  } finally {
    Date.now = originalDateNow;
    resetSharedServerClockForTest();
  }
});

test('shared server clock rejects older snapshots globally', () => {
  resetSharedServerClockForTest();
  const originalDateNow = Date.now;
  Date.now = () => Date.parse('2026-05-12T00:00:00.000Z');

  try {
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.000Z'), 4000);
    assert.equal(applySharedServerClock('2026-05-12T00:00:03.000Z'), 4000);
    assert.equal(getSharedServerClockOffsetMs(), 4000);
  } finally {
    Date.now = originalDateNow;
    resetSharedServerClockForTest();
  }
});

test('shared server clock smooths newer snapshots with the existing policy', () => {
  resetSharedServerClockForTest();
  const originalDateNow = Date.now;
  Date.now = () => Date.parse('2026-05-12T00:00:00.000Z');

  try {
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.000Z'), 4000);
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.300Z'), 4000);
    assert.equal(applySharedServerClock('2026-05-12T00:00:08.000Z'), 5000);
  } finally {
    Date.now = originalDateNow;
    resetSharedServerClockForTest();
  }
});

test('shared server clock notifies subscribers only when the shared offset changes', () => {
  resetSharedServerClockForTest();
  const originalDateNow = Date.now;
  Date.now = () => Date.parse('2026-05-12T00:00:00.000Z');
  const observedOffsets: number[] = [];
  const unsubscribe = subscribeSharedServerClock((offsetMs) => {
    observedOffsets.push(offsetMs);
  });

  try {
    applySharedServerClock('2026-05-12T00:00:00.200Z');
    applySharedServerClock('2026-05-12T00:00:04.000Z');
    applySharedServerClock('2026-05-12T00:00:04.300Z');
    applySharedServerClock('2026-05-12T00:00:08.000Z');

    assert.deepEqual(observedOffsets, [4000, 5000]);
  } finally {
    unsubscribe();
    Date.now = originalDateNow;
    resetSharedServerClockForTest();
  }
});
