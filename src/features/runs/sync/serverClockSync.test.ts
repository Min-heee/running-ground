import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySharedServerClock,
  getSharedServerClockOffsetMs,
  parseServerNowMs,
  resetSharedServerClockForTest,
  resolveServerClockOffsetSample,
  resolveStableServerClockOffset,
  shouldAcceptServerSnapshot,
  subscribeSharedServerClock,
} from './serverClockSync';

test('server clock parser ignores invalid timestamps', () => {
  assert.equal(parseServerNowMs(undefined), null);
  assert.equal(parseServerNowMs('not-a-date'), null);
  assert.equal(parseServerNowMs('2026-05-12T00:00:00.000Z'), Date.parse('2026-05-12T00:00:00.000Z'));
});

test('server clock offset stabilization snaps cold, fast-converges large gaps, holds jitter', () => {
  // Below 500ms apply threshold → treated as no offset (NTP jitter range).
  assert.equal(resolveStableServerClockOffset(0, 200), 0);

  // Cold acquisition (first sample) snaps straight onto the offset so the first
  // countdown can't lock a not-yet-converged multi-second clock.
  assert.equal(resolveStableServerClockOffset(0, 3000, true), 3000);
  assert.equal(resolveStableServerClockOffset(0, 200, true), 0);

  // Small gaps still move gently (≤400ms) so the measurement clock never twitches.
  assert.equal(resolveStableServerClockOffset(400, 1200), 800);
  assert.equal(resolveStableServerClockOffset(800, 1200), 800);

  // Large gaps (a real multi-second clock difference) converge in one or two
  // snapshots (≤2000ms/step) instead of crawling 400ms at a time.
  assert.equal(resolveStableServerClockOffset(0, 1200), 1200);
  assert.equal(resolveStableServerClockOffset(0, 4000), 2000);
  assert.equal(resolveStableServerClockOffset(4000, 8000), 6000);

  // Once near a stable offset, small deltas within jitter tolerance are kept.
  assert.equal(resolveStableServerClockOffset(4000, 4300), 4000);
  assert.equal(resolveStableServerClockOffset(400, 200), 0);
});

test('server clock offset sample compensates for normal round-trip latency', () => {
  const requestStartedAtMs = Date.parse('2026-05-12T00:00:00.000Z');
  const responseReceivedAtMs = Date.parse('2026-05-12T00:00:01.000Z');
  const serverNow = '2026-05-12T00:00:00.500Z';

  assert.deepEqual(resolveServerClockOffsetSample(serverNow, {
    clientRequestStartedAtMs: requestStartedAtMs,
    clientResponseReceivedAtMs: responseReceivedAtMs,
  }), {
    serverNowMs: Date.parse(serverNow),
    offsetMs: 0,
  });
});

test('server clock offset sample falls back to provisional offset for abnormal round-trip latency', () => {
  const requestStartedAtMs = Date.parse('2026-05-12T00:00:00.000Z');
  const responseReceivedAtMs = Date.parse('2026-05-12T00:00:04.000Z');

  assert.deepEqual(resolveServerClockOffsetSample('2026-05-12T00:00:02.000Z', {
    clientRequestStartedAtMs: requestStartedAtMs,
    clientResponseReceivedAtMs: responseReceivedAtMs,
  }), {
    serverNowMs: Date.parse('2026-05-12T00:00:02.000Z'),
    offsetMs: -2000,
  });
});

test('server snapshot guard rejects older server snapshots', () => {
  const latestRef = { current: 0 };

  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:02.000Z'), true);
  assert.equal(latestRef.current, Date.parse('2026-05-12T00:00:02.000Z'));
  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:01.000Z'), false);
  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:03.000Z'), true);
});

test('shared server clock snaps onto the first accepted offset so the countdown locks an accurate clock', () => {
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

test('shared server clock applies RTT-corrected offsets from API timing metadata', () => {
  resetSharedServerClockForTest();
  const requestStartedAtMs = Date.parse('2026-05-12T00:00:00.000Z');
  const responseReceivedAtMs = Date.parse('2026-05-12T00:00:01.000Z');

  assert.equal(applySharedServerClock('2026-05-12T00:00:00.500Z', {
    clientRequestStartedAtMs: requestStartedAtMs,
    clientResponseReceivedAtMs: responseReceivedAtMs,
  }), 0);

  resetSharedServerClockForTest();
});

test('shared server clock accepts a provisional offset when RTT timing is abnormal', () => {
  resetSharedServerClockForTest();
  const originalDateNow = Date.now;
  Date.now = () => Date.parse('2026-05-12T00:00:00.000Z');

  try {
    // First sample snaps onto the 4s offset.
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.000Z'), 4000);
    // Abnormal RTT (>3s) falls back to a provisional offset (3999) that is held as
    // jitter since it is within tolerance of the already-converged 4000.
    assert.equal(applySharedServerClock('2026-05-12T00:00:08.000Z', {
      clientRequestStartedAtMs: Date.parse('2026-05-12T00:00:00.000Z'),
      clientResponseReceivedAtMs: Date.parse('2026-05-12T00:00:04.001Z'),
    }), 4000);
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

test('shared server clock snaps the first sample then steps large newer jumps with the fast-converge cap', () => {
  resetSharedServerClockForTest();
  const originalDateNow = Date.now;
  Date.now = () => Date.parse('2026-05-12T00:00:00.000Z');

  try {
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.000Z'), 4000);
    // Within jitter tolerance of 4000 → held.
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.300Z'), 4000);
    // A fresh 8s jump is large → moves one fast step (2000) toward it, capped.
    assert.equal(applySharedServerClock('2026-05-12T00:00:08.000Z'), 6000);
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
    // First sample is sub-threshold → snaps to 0 → no change → no notify.
    applySharedServerClock('2026-05-12T00:00:00.200Z');
    applySharedServerClock('2026-05-12T00:00:04.000Z');
    applySharedServerClock('2026-05-12T00:00:04.300Z');
    applySharedServerClock('2026-05-12T00:00:08.000Z');

    assert.deepEqual(observedOffsets, [2000, 4000, 6000]);
  } finally {
    unsubscribe();
    Date.now = originalDateNow;
    resetSharedServerClockForTest();
  }
});
