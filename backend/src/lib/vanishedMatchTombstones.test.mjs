import assert from 'node:assert/strict';
import test from 'node:test';

import { VANISHED_MATCH_TOMBSTONE_TTL_MS } from '../config.mjs';
import {
  clearVanishedMatchTombstones,
  countVanishedMatchTombstones,
  isMatchTombstoned,
  recordVanishedMatch,
} from './vanishedMatchTombstones.mjs';

test('recordVanishedMatch marks the matchId tombstoned and ignores invalid ids', () => {
  clearVanishedMatchTombstones();

  recordVanishedMatch('duel-match-1');
  assert.equal(isMatchTombstoned('duel-match-1'), true);
  assert.equal(isMatchTombstoned('duel-match-other'), false);

  recordVanishedMatch('');
  recordVanishedMatch(null);
  recordVanishedMatch(undefined);
  recordVanishedMatch(123);
  assert.equal(countVanishedMatchTombstones(), 1);
  assert.equal(isMatchTombstoned(''), false);
  assert.equal(isMatchTombstoned(null), false);
});

test('tombstone expires after the TTL — lookups fall back to "unknown" (404 path)', () => {
  clearVanishedMatchTombstones();

  const recordedAt = new Date('2026-07-01T00:00:00.000Z');
  recordVanishedMatch('duel-match-ttl', recordedAt);

  const justBeforeExpiry = new Date(recordedAt.getTime() + VANISHED_MATCH_TOMBSTONE_TTL_MS - 1);
  assert.equal(isMatchTombstoned('duel-match-ttl', justBeforeExpiry), true);

  const atExpiry = new Date(recordedAt.getTime() + VANISHED_MATCH_TOMBSTONE_TTL_MS);
  assert.equal(isMatchTombstoned('duel-match-ttl', atExpiry), false);
  // The expired entry is dropped on access, so it stays gone even for earlier "now"s.
  assert.equal(isMatchTombstoned('duel-match-ttl', recordedAt), false);
  assert.equal(countVanishedMatchTombstones(), 0);
});

test('expired entries are pruned when a new tombstone is recorded', () => {
  clearVanishedMatchTombstones();

  const recordedAt = new Date('2026-07-01T00:00:00.000Z');
  recordVanishedMatch('duel-match-old', recordedAt);

  const afterExpiry = new Date(recordedAt.getTime() + VANISHED_MATCH_TOMBSTONE_TTL_MS + 1);
  recordVanishedMatch('duel-match-new', afterExpiry);

  assert.equal(countVanishedMatchTombstones(), 1);
  assert.equal(isMatchTombstoned('duel-match-new', afterExpiry), true);
});

test('the map stays bounded — the oldest entry is evicted at the cap', () => {
  clearVanishedMatchTombstones();

  const recordedAt = new Date('2026-07-01T00:00:00.000Z');

  for (let index = 0; index < 10_000; index += 1) {
    recordVanishedMatch(`match-${index}`, recordedAt);
  }

  assert.equal(countVanishedMatchTombstones(), 10_000);
  assert.equal(isMatchTombstoned('match-0', recordedAt), true);

  recordVanishedMatch('match-overflow', recordedAt);
  assert.equal(countVanishedMatchTombstones(), 10_000);
  assert.equal(isMatchTombstoned('match-0', recordedAt), false);
  assert.equal(isMatchTombstoned('match-1', recordedAt), true);
  assert.equal(isMatchTombstoned('match-overflow', recordedAt), true);
});

test('re-recording refreshes the TTL and does not duplicate the entry', () => {
  clearVanishedMatchTombstones();

  const firstRecordedAt = new Date('2026-07-01T00:00:00.000Z');
  recordVanishedMatch('duel-match-refresh', firstRecordedAt);

  const refreshedAt = new Date(firstRecordedAt.getTime() + VANISHED_MATCH_TOMBSTONE_TTL_MS - 1000);
  recordVanishedMatch('duel-match-refresh', refreshedAt);

  assert.equal(countVanishedMatchTombstones(), 1);
  const afterOriginalExpiry = new Date(firstRecordedAt.getTime() + VANISHED_MATCH_TOMBSTONE_TTL_MS + 1);
  assert.equal(isMatchTombstoned('duel-match-refresh', afterOriginalExpiry), true);
});
