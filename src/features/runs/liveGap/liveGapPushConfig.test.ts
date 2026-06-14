import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLiveGapPushConfig,
  hydrateLiveGapPushConfig,
  normalizeLiveGapPushConfig,
  resetLiveGapPushConfigForTests,
  resolveLiveGapIntervalMs,
  setLiveGapDeliveryMode,
  setLiveGapInterval,
  setLiveGapRemember,
  subscribeLiveGapPushConfig,
  toggleLiveGapGroupTarget,
  toggleLiveGapMetric,
} from './liveGapPushConfig';

test('resolveLiveGapIntervalMs maps interval keys to milliseconds', () => {
  assert.equal(resolveLiveGapIntervalMs('off'), null);
  assert.equal(resolveLiveGapIntervalMs('30s'), 30_000);
  assert.equal(resolveLiveGapIntervalMs('1m'), 60_000);
  assert.equal(resolveLiveGapIntervalMs('3m'), 180_000);
  assert.equal(resolveLiveGapIntervalMs('5m'), 300_000);
});

test('default config is off with sensible default metrics and notification delivery', () => {
  resetLiveGapPushConfigForTests();
  const config = getLiveGapPushConfig();
  assert.equal(config.interval, 'off');
  assert.deepEqual(config.groupTargets, ['ahead1', 'rank1']);
  assert.deepEqual(config.metrics, ['remainingDistance', 'opponentDistance', 'opponentPace']);
  assert.equal(config.deliveryMode, 'notification');
  assert.equal(config.remember, false);
});

test('setLiveGapRemember toggles the persistence flag and notifies once per change', () => {
  resetLiveGapPushConfigForTests();
  let notifications = 0;
  const unsubscribe = subscribeLiveGapPushConfig(() => {
    notifications += 1;
  });

  setLiveGapRemember(true);
  assert.equal(getLiveGapPushConfig().remember, true);
  assert.equal(notifications, 1);

  // No-op when unchanged.
  setLiveGapRemember(true);
  assert.equal(notifications, 1);

  setLiveGapRemember(false);
  assert.equal(getLiveGapPushConfig().remember, false);
  assert.equal(notifications, 2);

  unsubscribe();
});

test('normalizeLiveGapPushConfig coerces a stored payload and drops unknown values', () => {
  // A clean, fully-valid payload round-trips unchanged (canonical array order enforced).
  assert.deepEqual(
    normalizeLiveGapPushConfig({
      interval: '3m',
      groupTargets: ['rank1', 'ahead1'],
      metrics: ['opponentPace', 'remainingDistance'],
      deliveryMode: 'both',
      remember: true,
    }),
    {
      interval: '3m',
      groupTargets: ['ahead1', 'rank1'],
      metrics: ['remainingDistance', 'opponentPace'],
      deliveryMode: 'both',
      remember: true,
    },
  );

  // Unknown enum values fall back to defaults; bogus array entries are filtered out.
  assert.deepEqual(
    normalizeLiveGapPushConfig({
      interval: '99m',
      groupTargets: ['ahead1', 'nope'],
      metrics: ['remainingDistance', 'garbage'],
      deliveryMode: 'telepathy',
      remember: 'yes',
    }),
    {
      interval: 'off',
      groupTargets: ['ahead1'],
      metrics: ['remainingDistance'],
      deliveryMode: 'notification',
      remember: false,
    },
  );

  // Non-object input degrades to the default config.
  assert.deepEqual(normalizeLiveGapPushConfig(null), {
    interval: 'off',
    groupTargets: ['ahead1', 'rank1'],
    metrics: ['remainingDistance', 'opponentDistance', 'opponentPace'],
    deliveryMode: 'notification',
    remember: false,
  });
});

test('hydrateLiveGapPushConfig replaces the store from a payload and notifies', () => {
  resetLiveGapPushConfigForTests();
  let notifications = 0;
  const unsubscribe = subscribeLiveGapPushConfig(() => {
    notifications += 1;
  });

  hydrateLiveGapPushConfig({
    interval: '1m',
    groupTargets: ['rank1'],
    metrics: ['currentPace'],
    deliveryMode: 'voice',
    remember: true,
  });

  const config = getLiveGapPushConfig();
  assert.equal(config.interval, '1m');
  assert.deepEqual(config.groupTargets, ['rank1']);
  assert.deepEqual(config.metrics, ['currentPace']);
  assert.equal(config.deliveryMode, 'voice');
  assert.equal(config.remember, true);
  assert.equal(notifications, 1);

  unsubscribe();
});

test('setLiveGapDeliveryMode switches mode and notifies once per change', () => {
  resetLiveGapPushConfigForTests();
  let notifications = 0;
  const unsubscribe = subscribeLiveGapPushConfig(() => {
    notifications += 1;
  });

  setLiveGapDeliveryMode('voice');
  assert.equal(getLiveGapPushConfig().deliveryMode, 'voice');
  assert.equal(notifications, 1);

  // Setting the same value is a no-op.
  setLiveGapDeliveryMode('voice');
  assert.equal(notifications, 1);

  setLiveGapDeliveryMode('both');
  assert.equal(getLiveGapPushConfig().deliveryMode, 'both');
  assert.equal(notifications, 2);

  unsubscribe();
});

test('toggleLiveGapMetric adds and removes while keeping canonical order', () => {
  resetLiveGapPushConfigForTests();
  // Clear the default selection.
  toggleLiveGapMetric('remainingDistance');
  toggleLiveGapMetric('opponentDistance');
  toggleLiveGapMetric('opponentPace');
  assert.deepEqual(getLiveGapPushConfig().metrics, []);

  // Toggle on out of order — stored order should still follow option order.
  toggleLiveGapMetric('opponentPace');
  toggleLiveGapMetric('avgPace');
  toggleLiveGapMetric('remainingDistance');
  assert.deepEqual(getLiveGapPushConfig().metrics, ['remainingDistance', 'avgPace', 'opponentPace']);

  toggleLiveGapMetric('avgPace');
  assert.deepEqual(getLiveGapPushConfig().metrics, ['remainingDistance', 'opponentPace']);
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
