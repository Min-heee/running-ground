import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKGROUND_MATCH_PROGRESS_TIMER_MS,
  startBackgroundMatchProgressTimer,
  stopBackgroundMatchProgressTimer,
} from '@/features/runs/tracking/background/backgroundMatchProgressTimer';

type FakeTimer = { id: number; callback: () => void; intervalMs: number };

function createFakeTimerHarness() {
  const timers: FakeTimer[] = [];
  const cleared: FakeTimer[] = [];

  return {
    timers,
    cleared,
    setIntervalFn: ((callback: () => void, intervalMs: number) => {
      const timer = { id: timers.length + 1, callback, intervalMs };
      timers.push(timer);
      return timer;
    }) as unknown as typeof setInterval,
    clearIntervalFn: ((timer: FakeTimer) => {
      cleared.push(timer);
    }) as unknown as typeof clearInterval,
  };
}

test('android background match progress timer starts one 3s timer and flushes on tick', async () => {
  const harness = createFakeTimerHarness();
  let flushCount = 0;

  stopBackgroundMatchProgressTimer(harness.clearIntervalFn);
  assert.equal(startBackgroundMatchProgressTimer({
    flush: async () => {
      flushCount += 1;
    },
    platformOS: 'android',
    setIntervalFn: harness.setIntervalFn,
    clearIntervalFn: harness.clearIntervalFn,
  }), true);
  assert.equal(startBackgroundMatchProgressTimer({
    platformOS: 'android',
    setIntervalFn: harness.setIntervalFn,
    clearIntervalFn: harness.clearIntervalFn,
  }), false);
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].intervalMs, BACKGROUND_MATCH_PROGRESS_TIMER_MS);

  harness.timers[0].callback();
  await Promise.resolve();
  assert.equal(flushCount, 1);

  assert.equal(stopBackgroundMatchProgressTimer(harness.clearIntervalFn), true);
  assert.equal(harness.cleared.length, 1);
});

// Fix A.1 — iOS now ALSO gets the time-based flush cadence (it was the only GPS-independent
// trigger and was Android-only, which is what stalled the iOS screen-off opponent sync).
test('background match progress timer now also starts on ios', () => {
  const harness = createFakeTimerHarness();

  stopBackgroundMatchProgressTimer(harness.clearIntervalFn);
  assert.equal(startBackgroundMatchProgressTimer({
    platformOS: 'ios',
    setIntervalFn: harness.setIntervalFn,
    clearIntervalFn: harness.clearIntervalFn,
  }), true);
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].intervalMs, BACKGROUND_MATCH_PROGRESS_TIMER_MS);

  assert.equal(stopBackgroundMatchProgressTimer(harness.clearIntervalFn), true);
});

test('background match progress timer stays stopped on web or when disabled', () => {
  const harness = createFakeTimerHarness();

  stopBackgroundMatchProgressTimer(harness.clearIntervalFn);
  assert.equal(startBackgroundMatchProgressTimer({
    platformOS: 'web',
    setIntervalFn: harness.setIntervalFn,
    clearIntervalFn: harness.clearIntervalFn,
  }), false);
  assert.equal(startBackgroundMatchProgressTimer({
    enabled: false,
    platformOS: 'android',
    setIntervalFn: harness.setIntervalFn,
    clearIntervalFn: harness.clearIntervalFn,
  }), false);
  assert.equal(harness.timers.length, 0);
});
