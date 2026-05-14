import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseServerNowMs,
  resolveStableServerClockOffset,
  shouldAcceptServerSnapshot,
} from './serverClockSync';

test('server clock parser ignores invalid timestamps', () => {
  assert.equal(parseServerNowMs(undefined), null);
  assert.equal(parseServerNowMs('not-a-date'), null);
  assert.equal(parseServerNowMs('2026-05-12T00:00:00.000Z'), Date.parse('2026-05-12T00:00:00.000Z'));
});

test('server clock offset smoothing ignores small local jitter and smooths large jumps', () => {
  assert.equal(resolveStableServerClockOffset(0, 1200), 0);
  assert.equal(resolveStableServerClockOffset(0, 4000), 4000);
  assert.equal(resolveStableServerClockOffset(4000, 4300), 4000);
  assert.equal(resolveStableServerClockOffset(4000, 8000), 5000);
});

test('server snapshot guard rejects older server snapshots', () => {
  const latestRef = { current: 0 };

  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:02.000Z'), true);
  assert.equal(latestRef.current, Date.parse('2026-05-12T00:00:02.000Z'));
  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:01.000Z'), false);
  assert.equal(shouldAcceptServerSnapshot(latestRef, '2026-05-12T00:00:03.000Z'), true);
});
