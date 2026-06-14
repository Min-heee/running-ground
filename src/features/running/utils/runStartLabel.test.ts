import assert from 'node:assert/strict';
import test from 'node:test';

import { formatRunStartLabel, formatRunStartTime } from './runStartLabel';

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

test('formatRunStartTime returns a localized 12-hour clock time, not the raw UTC slice', () => {
  // The old code did startedAt.slice(11, 16) → '13:44' (UTC). The localized output always
  // carries 오전/오후, which the raw slice never would — that is the regression guard.
  const label = formatRunStartTime('2026-06-14T13:44:00.000Z');
  assert.match(label ?? '', /오전|오후/);
  assert.match(label ?? '', /\d{1,2}:\d{2}/);
});

test('formatRunStartTime returns null for missing or malformed input', () => {
  assert.equal(formatRunStartTime(null), null);
  assert.equal(formatRunStartTime(undefined), null);
  assert.equal(formatRunStartTime('not-a-date'), null);
});
