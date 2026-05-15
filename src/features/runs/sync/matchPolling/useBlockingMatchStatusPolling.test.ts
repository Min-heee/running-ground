import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireRgPollingSlot,
  getActiveRgPollingSlotCount,
  resetRgPollingRegistryForTest,
  startRgPollingInterval,
} from '@/utils/rgPollingRegistry';
import { buildBlockingMatchStatusPollingKey } from './useBlockingMatchStatusPolling';

test('blocking match status recovery polling stays singleton for the same matchId', () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-singleton');
  const first = acquireRgPollingSlot(pollingKey, 'blocking match status polling', {
    matchId: 'duel-match-singleton',
    source: 'test recovery start',
  });
  const duplicate = acquireRgPollingSlot(pollingKey, 'blocking match status polling', {
    matchId: 'duel-match-singleton',
    source: 'test duplicate recovery start',
  });

  assert.equal(first.acquired, true);
  assert.equal(duplicate.acquired, false);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  duplicate.release();
  assert.equal(getActiveRgPollingSlotCount(), 1);

  first.release();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('blocking match status recovery polling can restart after fallback success cleanup', () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-fallback');
  const recovery = acquireRgPollingSlot(pollingKey, 'blocking match status polling');
  assert.equal(recovery.acquired, true);

  recovery.release();
  assert.equal(getActiveRgPollingSlotCount(), 0);

  const restarted = acquireRgPollingSlot(pollingKey, 'blocking match status polling');
  assert.equal(restarted.acquired, true);

  restarted.release();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('blocking match status recovery polling cleanup releases on unmount', () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-unmount');
  const mountedPolling = acquireRgPollingSlot(pollingKey, 'blocking match status polling');

  assert.equal(mountedPolling.acquired, true);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  mountedPolling.release();

  assert.equal(getActiveRgPollingSlotCount(), 0);
});

test('blocking match status interval keeps one active polling owner per matchId', () => {
  resetRgPollingRegistryForTest();
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-interval-singleton');
  let tickCount = 0;

  const first = startRgPollingInterval({
    intervalMs: 10_000,
    key: pollingKey,
    label: 'blocking match status polling',
    onTick: () => {
      tickCount += 1;
    },
  });
  const duplicate = startRgPollingInterval({
    intervalMs: 10_000,
    key: pollingKey,
    label: 'blocking match status polling',
    onTick: () => {
      tickCount += 1;
    },
  });

  assert.equal(first.acquired, true);
  assert.equal(duplicate.acquired, false);
  assert.equal(getActiveRgPollingSlotCount(), 1);
  assert.equal(tickCount, 0);

  duplicate.stop();
  assert.equal(getActiveRgPollingSlotCount(), 1);

  first.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);

  const restarted = startRgPollingInterval({
    intervalMs: 10_000,
    key: pollingKey,
    label: 'blocking match status polling',
    onTick: () => {
      tickCount += 1;
    },
  });

  assert.equal(restarted.acquired, true);
  assert.equal(getActiveRgPollingSlotCount(), 1);
  restarted.stop();
  assert.equal(getActiveRgPollingSlotCount(), 0);
});
