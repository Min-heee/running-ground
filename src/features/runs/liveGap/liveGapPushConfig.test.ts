import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLiveGapPushConfig,
  resetLiveGapPushConfigForTests,
  resolveLiveGapIntervalMs,
  setLiveGapInterval,
  subscribeLiveGapPushConfig,
  toggleLiveGapGroupTarget,
} from './liveGapPushConfig';

test('resolveLiveGapIntervalMs maps interval keys to milliseconds', () => {
  assert.equal(resolveLiveGapIntervalMs('off'), null);
  assert.equal(resolveLiveGapIntervalMs('30s'), 30_000);
  assert.equal(resolveLiveGapIntervalMs('1m'), 60_000);
  assert.equal(resolveLiveGapIntervalMs('3m'), 180_000);
  assert.equal(resolveLiveGapIntervalMs('5m'), 300_000);
});

test('default config is off with sensible default group targets', () => {
  resetLiveGapPushConfigForTests();
  const config = getLiveGapPushConfig();
  assert.equal(config.interval, 'off');
  assert.deepEqual(config.groupTargets, ['ahead1', 'rank1']);
});

test('setLiveGapInterval updates the store and notifies subscribers', () => {
  resetLiveGapPushConfigForTests();
  let notifications = 0;
  const unsubscribe = subscribeLiveGapPushConfig(() => {
    notifications += 1;
  });

  setLiveGapInterval('1m');
  assert.equal(getLiveGapPushConfig().interval, '1m');
  assert.equal(notifications, 1);

  // Setting the same value is a no-op (no extra notification).
  setLiveGapInterval('1m');
  assert.equal(notifications, 1);

  unsubscribe();
});

test('toggleLiveGapGroupTarget adds and removes while keeping canonical order', () => {
  resetLiveGapPushConfigForTests();
  // Start from a clean target set.
  toggleLiveGapGroupTarget('ahead1');
  toggleLiveGapGroupTarget('rank1');
  assert.deepEqual(getLiveGapPushConfig().groupTargets, []);

  // Toggle on out of order — stored order should still follow option order.
  toggleLiveGapGroupTarget('rank2');
  toggleLiveGapGroupTarget('ahead2');
  toggleLiveGapGroupTarget('ahead1');
  assert.deepEqual(getLiveGapPushConfig().groupTargets, ['ahead1', 'ahead2', 'rank2']);

  toggleLiveGapGroupTarget('ahead2');
  assert.deepEqual(getLiveGapPushConfig().groupTargets, ['ahead1', 'rank2']);
});

test('subscribers stop receiving updates after unsubscribe', () => {
  resetLiveGapPushConfigForTests();
  let notifications = 0;
  const unsubscribe = subscribeLiveGapPushConfig(() => {
    notifications += 1;
  });

  setLiveGapInterval('30s');
  assert.equal(notifications, 1);

  unsubscribe();
  setLiveGapInterval('3m');
  assert.equal(notifications, 1);
});
