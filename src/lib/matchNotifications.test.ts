import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATCH_REMINDER_OFFSETS_MINUTES } from '@/lib/matchNotificationOffsets';

test('match reminder offsets are 10/5/1 minutes', () => {
  assert.deepEqual([...MATCH_REMINDER_OFFSETS_MINUTES], [10, 5, 1]);
});

test('match reminder offsets are strictly descending and positive', () => {
  for (const minutesBefore of MATCH_REMINDER_OFFSETS_MINUTES) {
    assert.ok(minutesBefore > 0, 'every reminder offset fires before the slot start');
  }

  for (let i = 1; i < MATCH_REMINDER_OFFSETS_MINUTES.length; i += 1) {
    assert.ok(
      MATCH_REMINDER_OFFSETS_MINUTES[i] < MATCH_REMINDER_OFFSETS_MINUTES[i - 1],
      'offsets are ordered from earliest to latest',
    );
  }
});
