import { strict as assert } from 'node:assert';
import test from 'node:test';
import { isOnTheHourSlot } from './useLiveMatchNavigationExecutor';

test('isOnTheHourSlot returns true for exact hourly slot times', () => {
  assert.equal(isOnTheHourSlot('2026-05-20T10:00:00.000Z'), true);
  assert.equal(isOnTheHourSlot('2026-05-20T10:00:00Z'), true);
  assert.equal(isOnTheHourSlot('2026-05-20T19:00:00+09:00'), true);
});

test('isOnTheHourSlot returns false for room-linked arbitrary start times', () => {
  assert.equal(isOnTheHourSlot('2026-05-20T09:39:21.482Z'), false);
  assert.equal(isOnTheHourSlot('2026-05-20T10:15:00.000Z'), false);
  assert.equal(isOnTheHourSlot('not-a-date'), false);
});
