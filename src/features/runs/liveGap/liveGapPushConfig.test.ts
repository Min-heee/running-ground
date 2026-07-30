import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCustomLiveGapInterval,
  findNonCheckpointAlignedIntervalOption,
  getLiveGapPushConfig,
  hydrateLiveGapPushConfig,
  LIVE_GAP_CHECKPOINT_STEP_SECONDS,
  LIVE_GAP_INTERVAL_OPTIONS,
  normalizeLiveGapPushConfig,
  parseCustomIntervalMinutesInput,
  resetLiveGapPushConfigForTests,
  resolveLiveGapIntervalMs,
  setLiveGapDeliveryMode,
  setLiveGapInterval,
  setLiveGapRemember,
  subscribeLiveGapPushConfig,
  toggleLiveGapGroupTarget,
  toggleLiveGapMetric,
} from './liveGapPushConfig';

test('every live-gap interval option is a whole multiple of the checkpoint step (lossless snap invariant)', () => {
  // The opponent-gap fragment inherits the checkpoint-aligned gap; snapping is only lossless
  // if each interval lands exactly on a 10s checkpoint. All shipped options must satisfy this.
  assert.equal(findNonCheckpointAlignedIntervalOption(), null);
  for (const option of LIVE_GAP_INTERVAL_OPTIONS) {
    if (option.ms === null) {
      continue;
    }
    assert.equal((option.ms / 1000) % LIVE_GAP_CHECKPOINT_STEP_SECONDS, 0, `${option.value} not aligned`);
  }
});

test('findNonCheckpointAlignedIntervalOption flags an interval that would land between checkpoints', () => {
  // A hypothetical 25s interval is NOT a multiple of the 10s step → must be reported.
  const offending = findNonCheckpointAlignedIntervalOption([
    { value: '1m', label: '1분', ms: 60_000 },
    { value: '3m', label: '25초', ms: 25_000 },
  ]);
  assert.equal(offending?.ms, 25_000);
});

test('resolveLiveGapIntervalMs maps interval keys to milliseconds', () => {
  assert.equal(resolveLiveGapIntervalMs('off'), null);
  assert.equal(resolveLiveGapIntervalMs('1m'), 60_000);
  assert.equal(resolveLiveGapIntervalMs('3m'), 180_000);
  assert.equal(resolveLiveGapIntervalMs('5m'), 300_000);
  assert.equal(resolveLiveGapIntervalMs('10m'), 600_000);
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

  // A config persisted before the options were trimmed (currentPace metric, ahead2/rank2/
  // rank3 targets) degrades gracefully: the removed values are filtered to the surviving
  // options, the still-valid ones (behind1) are kept in canonical order.
  assert.deepEqual(
    normalizeLiveGapPushConfig({
      interval: '5m',
      groupTargets: ['rank3', 'behind1', 'ahead2', 'ahead1'],
      metrics: ['currentPace', 'opponentPace', 'remainingDistance'],
      deliveryMode: 'voice',
      remember: true,
    }),
    {
      interval: '5m',
      groupTargets: ['ahead1', 'behind1'],
      metrics: ['remainingDistance', 'opponentPace'],
      deliveryMode: 'voice',
      remember: true,
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
    metrics: ['avgPace'],
    deliveryMode: 'voice',
    remember: true,
  });

  const config = getLiveGapPushConfig();
  assert.equal(config.interval, '1m');
  assert.deepEqual(config.groupTargets, ['rank1']);
  assert.deepEqual(config.metrics, ['avgPace']);
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

  // Toggle on out of order — stored order should still follow option order
  // (앞사람 → 뒷사람 → 1등).
  toggleLiveGapGroupTarget('rank1');
  toggleLiveGapGroupTarget('behind1');
  toggleLiveGapGroupTarget('ahead1');
  assert.deepEqual(getLiveGapPushConfig().groupTargets, ['ahead1', 'behind1', 'rank1']);

  toggleLiveGapGroupTarget('behind1');
  assert.deepEqual(getLiveGapPushConfig().groupTargets, ['ahead1', 'rank1']);
});

test('subscribers stop receiving updates after unsubscribe', () => {
  resetLiveGapPushConfigForTests();
  let notifications = 0;
  const unsubscribe = subscribeLiveGapPushConfig(() => {
    notifications += 1;
  });

  setLiveGapInterval('1m');
  assert.equal(notifications, 1);

  unsubscribe();
  setLiveGapInterval('3m');
  assert.equal(notifications, 1);
});

test('직접 입력 간격: 1분 이상 정수만 허용 (소수점·0·음수 거부)', () => {
  // 오너 2026-07-31 조건.
  assert.equal(parseCustomIntervalMinutesInput('7'), 7);
  assert.equal(parseCustomIntervalMinutesInput('1'), 1);
  assert.equal(parseCustomIntervalMinutesInput(' 12 '), 12);

  assert.equal(parseCustomIntervalMinutesInput('0'), null);
  assert.equal(parseCustomIntervalMinutesInput('0.5'), null);
  assert.equal(parseCustomIntervalMinutesInput('1.5'), null);
  assert.equal(parseCustomIntervalMinutesInput('-3'), null);
  assert.equal(parseCustomIntervalMinutesInput(''), null);
  assert.equal(parseCustomIntervalMinutesInput('abc'), null);
  assert.equal(parseCustomIntervalMinutesInput('181'), null); // 상한 초과
});

test('직접 입력 간격은 밀리초로 풀리고 체크포인트(10초) 배수를 유지한다', () => {
  const interval = buildCustomLiveGapInterval(7);
  assert.equal(interval, 'custom:7');

  const ms = resolveLiveGapIntervalMs(interval!);
  assert.equal(ms, 420_000);
  // 무손실 스냅 불변식: 항상 10초의 배수여야 한다.
  assert.equal((ms! / 1000) % 10, 0);

  assert.equal(buildCustomLiveGapInterval(0), null);
  assert.equal(buildCustomLiveGapInterval(1.5), null);
});

test('저장된 직접 입력 값은 복원되고, 망가진 값은 기본값으로 떨어진다', () => {
  assert.equal(normalizeLiveGapPushConfig({ interval: 'custom:9' }).interval, 'custom:9');
  assert.equal(normalizeLiveGapPushConfig({ interval: 'custom:0' }).interval, 'off');
  assert.equal(normalizeLiveGapPushConfig({ interval: 'custom:1.5' }).interval, 'off');
  assert.equal(normalizeLiveGapPushConfig({ interval: 'custom:abc' }).interval, 'off');
});
