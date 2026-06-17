import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySharedServerClock,
  getSharedServerClockOffsetMs,
  parseServerNowMs,
  resetSharedServerClockForTest,
  resolveServerClockOffsetSample,
  resolveStableServerClockOffset,
  selectBestServerClockOffsetMs,
  shouldAcceptServerSnapshot,
  subscribeSharedServerClock,
} from './serverClockSync';

test('server clock parser ignores invalid timestamps', () => {
  assert.equal(parseServerNowMs(undefined), null);
  assert.equal(parseServerNowMs('not-a-date'), null);
  assert.equal(parseServerNowMs('2026-05-12T00:00:00.000Z'), Date.parse('2026-05-12T00:00:00.000Z'));
});

test('server clock offset stabilization ignores small local jitter and steps large jumps', () => {
  // Below the 100ms apply threshold → treated as no offset (residual jitter range).
  assert.equal(resolveStableServerClockOffset(0, 80), 0);
  // A real ~200ms device bias now APPLIES (it was zeroed under the old 250ms
  // dead zone), so two opposite-bias phones converge toward true server time
  // instead of both suppressing to 0 and locking the countdown ~1s apart.
  assert.equal(resolveStableServerClockOffset(0, 200), 200);
  assert.equal(resolveStableServerClockOffset(0, 300), 300);
  // Large offsets converge in bounded steps so an in-flight countdown never jumps
  // forward by multiple seconds from a late server snapshot.
  assert.equal(resolveStableServerClockOffset(0, 1200), 400);
  assert.equal(resolveStableServerClockOffset(400, 1200), 800);
  // A 400ms delta exceeds the 150ms jitter band so it steps (was held under 450).
  assert.equal(resolveStableServerClockOffset(800, 1200), 1200);
  assert.equal(resolveStableServerClockOffset(0, 4000), 400);
  // A ~300ms residual delta now exceeds the tightened 150ms jitter band, so the
  // crawl keeps converging toward the true offset instead of freezing ~300ms off.
  assert.equal(resolveStableServerClockOffset(4000, 4300), 4300);
  assert.equal(resolveStableServerClockOffset(4000, 8000), 4400);
  // A genuine 200ms offset still applies even while shrinking toward it.
  assert.equal(resolveStableServerClockOffset(400, 200), 200);
  // Deltas inside the 150ms jitter band are still held so the digit doesn't twitch.
  assert.equal(resolveStableServerClockOffset(4000, 4100), 4000);
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
    rttMs: 1000,
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
    rttMs: null,
  });
});

test('server snapshot guard rejects older server snapshots', () => {
  const latestRef = { current: 0 };

  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:02.000Z'), true);
  assert.equal(latestRef.current, Date.parse('2026-05-12T00:00:02.000Z'));
  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:01.000Z'), false);
  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:03.000Z'), true);
});

test('shared server clock steps the first accepted offset instead of jumping', () => {
  resetSharedServerClockForTest();
  const originalDateNow = Date.now;
  Date.now = () => Date.parse('2026-05-12T00:00:00.000Z');

  try {
    assert.equal(getSharedServerClockOffsetMs(), 0);
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.000Z'), 400);
    assert.equal(getSharedServerClockOffsetMs(), 400);
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

test('optimistic-room seed sample is RTT-corrected when API timing is threaded through', () => {
  // The optimistic-room seed now forwards the API timing fields (A1). A single
  // seed sample must therefore land the RTT/2-compensated offset immediately
  // instead of the uncompensated one-way fallback that biased each device.
  resetSharedServerClockForTest();
  const originalDateNow = Date.now;
  // Response landed at +200ms; the untimed fallback would read offset = serverNow - now.
  Date.now = () => Date.parse('2026-05-12T00:00:00.200Z');

  try {
    // serverNow=+300, request=+0, response=+200 → rtt=200, RTT-corrected offset
    // = 300 + 100 - 200 = 200. The untimed one-way fallback would have read only
    // 300 - 200 = 100, so the timed seed path is what produces 200 here.
    assert.equal(applySharedServerClock('2026-05-12T00:00:00.300Z', {
      clientRequestStartedAtMs: Date.parse('2026-05-12T00:00:00.000Z'),
      clientResponseReceivedAtMs: Date.parse('2026-05-12T00:00:00.200Z'),
    }), 200);
  } finally {
    Date.now = originalDateNow;
    resetSharedServerClockForTest();
  }
});

test('shared server clock keeps converging with a provisional offset when RTT timing is abnormal', () => {
  resetSharedServerClockForTest();
  const originalDateNow = Date.now;
  Date.now = () => Date.parse('2026-05-12T00:00:00.000Z');

  try {
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.000Z'), 400);
    assert.equal(applySharedServerClock('2026-05-12T00:00:08.000Z', {
      clientRequestStartedAtMs: Date.parse('2026-05-12T00:00:00.000Z'),
      clientResponseReceivedAtMs: Date.parse('2026-05-12T00:00:04.001Z'),
    }), 800);
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
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.000Z'), 400);
    assert.equal(applySharedServerClock('2026-05-12T00:00:03.000Z'), 400);
    assert.equal(getSharedServerClockOffsetMs(), 400);
  } finally {
    Date.now = originalDateNow;
    resetSharedServerClockForTest();
  }
});

test('shared server clock steps newer snapshots with the bounded jump policy', () => {
  resetSharedServerClockForTest();
  const originalDateNow = Date.now;
  Date.now = () => Date.parse('2026-05-12T00:00:00.000Z');

  try {
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.000Z'), 400);
    assert.equal(applySharedServerClock('2026-05-12T00:00:04.300Z'), 800);
    assert.equal(applySharedServerClock('2026-05-12T00:00:08.000Z'), 1200);
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
    // First sample is within the 100ms apply threshold → suppressed, no notify.
    applySharedServerClock('2026-05-12T00:00:00.080Z');
    applySharedServerClock('2026-05-12T00:00:04.000Z');
    applySharedServerClock('2026-05-12T00:00:04.300Z');
    applySharedServerClock('2026-05-12T00:00:08.000Z');

    assert.deepEqual(observedOffsets, [400, 800, 1200]);
  } finally {
    unsubscribe();
    Date.now = originalDateNow;
    resetSharedServerClockForTest();
  }
});

test('selectBestServerClockOffsetMs prefers the lowest-RTT fresh sample', () => {
  assert.equal(selectBestServerClockOffsetMs([], 1000), null);

  assert.equal(selectBestServerClockOffsetMs([
    { serverNowMs: 1000, offsetMs: 500, rttMs: 300 },
    { serverNowMs: 2000, offsetMs: 480, rttMs: 80 },
  ], 2000), 480);

  // Tie on RTT → most recent reading wins.
  assert.equal(selectBestServerClockOffsetMs([
    { serverNowMs: 1000, offsetMs: 500, rttMs: 80 },
    { serverNowMs: 2000, offsetMs: 470, rttMs: 80 },
  ], 2000), 470);

  // A stale low-RTT sample is pruned; the fresher (if higher-RTT) sample wins.
  assert.equal(selectBestServerClockOffsetMs([
    { serverNowMs: 0, offsetMs: 500, rttMs: 40 },
    { serverNowMs: 20000, offsetMs: 460, rttMs: 250 },
  ], 20000), 460);
});

test('shared server clock ignores a high-RTT outlier in favor of the lowest-RTT samples', () => {
  resetSharedServerClockForTest();
  const base = Date.parse('2026-05-12T00:00:00.000Z');
  const timedSample = (serverNowMs: number, rttMs: number, offsetMs: number) => {
    const clientResponseReceivedAtMs = serverNowMs + rttMs / 2 - offsetMs;
    return {
      serverNow: new Date(serverNowMs).toISOString(),
      timing: {
        clientRequestStartedAtMs: clientResponseReceivedAtMs - rttMs,
        clientResponseReceivedAtMs,
      },
    };
  };

  try {
    // Six clean low-RTT samples agree the device is ~2000ms behind the server and crawl
    // the clock up to that value (the tightened 150ms jitter band lets the final 400ms
    // step land instead of freezing ~400ms short).
    for (let i = 0; i < 6; i += 1) {
      const sample = timedSample(base + i * 500, 100, 2000);
      applySharedServerClock(sample.serverNow, sample.timing);
    }
    const offsetBeforeOutlier = getSharedServerClockOffsetMs();
    assert.equal(offsetBeforeOutlier, 2000);

    // A newer but high-latency sample claims a wildly different +5000ms offset. Its RTT
    // dwarfs the clean samples', so the best-sample filter keeps trusting them and the
    // clock does not lurch toward the outlier.
    const outlier = timedSample(base + 3500, 2500, 5000);
    applySharedServerClock(outlier.serverNow, outlier.timing);
    assert.equal(getSharedServerClockOffsetMs(), offsetBeforeOutlier);
  } finally {
    resetSharedServerClockForTest();
  }
});
