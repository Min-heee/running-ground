import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWeeklyHourlySlots,
  getWeeklyHourlySlotsForNow,
  resetWeeklyHourlySlotsCacheForTest,
} from '@/features/runs/utils/matchScheduling';

test('getWeeklyHourlySlotsForNow returns the SAME array reference within an hour', () => {
  resetWeeklyHourlySlotsCacheForTest();

  const first = getWeeklyHourlySlotsForNow();
  const second = getWeeklyHourlySlotsForNow();

  // Same reference — the queue hook can build once and share for both call sites
  // instead of two full 8-day×24-hour rebuilds per render.
  assert.equal(first, second);
  assert.ok(first.length > 0);
});

test('the raw builder is unaffected and still returns fresh arrays', () => {
  const a = buildWeeklyHourlySlots();
  const b = buildWeeklyHourlySlots();
  assert.notEqual(a, b);
  assert.deepEqual(
    a.map((slot) => slot.startsAt),
    b.map((slot) => slot.startsAt),
  );
});

test('resetWeeklyHourlySlotsCacheForTest forces a rebuild (new reference)', () => {
  const before = getWeeklyHourlySlotsForNow();
  resetWeeklyHourlySlotsCacheForTest();
  const after = getWeeklyHourlySlotsForNow();
  assert.notEqual(before, after);
});
