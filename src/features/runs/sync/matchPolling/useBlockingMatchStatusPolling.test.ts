import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireRgPollingSlot, getActiveRgPollingSlotCount } from '@/utils/rgPollingRegistry';
import { buildBlockingMatchStatusPollingKey } from './useBlockingMatchStatusPolling';

test('blocking match status recovery polling stays singleton for the same matchId', () => {
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
  const pollingKey = buildBlockingMatchStatusPollingKey('duel-match-unmount');
  const mountedPolling = acquireRgPollingSlot(pollingKey, 'blocking match status polling');

  assert.equal(mountedPolling.acquired, true);
  assert.equal(getActiveRgPollingSlotCount(), 1);

  mountedPolling.release();

  assert.equal(getActiveRgPollingSlotCount(), 0);
});
