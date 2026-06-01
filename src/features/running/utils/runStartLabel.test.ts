import assert from 'node:assert/strict';
import test from 'node:test';

import { formatRunStartLabel } from './runStartLabel';

test('run start label falls back to date and weekday without a start time', () => {
  assert.equal(formatRunStartLabel({ date: '2026-06-02' }), '2026-06-02 화요일');
});

test('run start label includes a localized time when startedAt is available', () => {
  const label = formatRunStartLabel({
    date: '2026-06-02',
    startedAt: '2026-06-02T07:09:00+09:00',
  });

  assert.ok(label.startsWith('2026-06-02 화요일 '));
  assert.match(label, /오전|오후/);
});

test('run start label ignores malformed startedAt values', () => {
  assert.equal(
    formatRunStartLabel({ date: '2026-06-02', startedAt: 'not-a-date' }),
    '2026-06-02 화요일',
  );
});
