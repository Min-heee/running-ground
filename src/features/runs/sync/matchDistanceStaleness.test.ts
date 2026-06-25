import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MY_MATCH_DISTANCE_STALE_THRESHOLD_MS,
  isMyMatchDistanceStale,
} from '@/features/runs/sync/matchDistanceStaleness';
import { LIVE_MATCH_SERVER_SYNC_INTERVAL_MS } from '@/features/runs/sync/liveMatchCadence';

const NOW = 1_000_000;

test('threshold is the 12s floor (4x the 2.5s sync cadence is below the floor)', () => {
  assert.equal(MY_MATCH_DISTANCE_STALE_THRESHOLD_MS, 12_000);
  // The floor wins because 4 * 2500 = 10000 < 12000.
  assert.ok(MY_MATCH_DISTANCE_STALE_THRESHOLD_MS >= LIVE_MATCH_SERVER_SYNC_INTERVAL_MS * 4);
});

test('fresh update within one sync cadence is NOT stale', () => {
  assert.equal(
    isMyMatchDistanceStale({ lastUpdatedAtMs: NOW - LIVE_MATCH_SERVER_SYNC_INTERVAL_MS, nowMs: NOW }),
    false,
  );
});

test('a brief multi-cadence GPS gap just under the threshold is NOT stale', () => {
  assert.equal(
    isMyMatchDistanceStale({ lastUpdatedAtMs: NOW - (MY_MATCH_DISTANCE_STALE_THRESHOLD_MS - 1), nowMs: NOW }),
    false,
  );
});

test('exactly at the threshold is NOT yet stale (boundary is strict)', () => {
  assert.equal(
    isMyMatchDistanceStale({ lastUpdatedAtMs: NOW - MY_MATCH_DISTANCE_STALE_THRESHOLD_MS, nowMs: NOW }),
    false,
  );
});

test('one ms past the threshold IS stale', () => {
  assert.equal(
    isMyMatchDistanceStale({ lastUpdatedAtMs: NOW - (MY_MATCH_DISTANCE_STALE_THRESHOLD_MS + 1), nowMs: NOW }),
    true,
  );
});

test('a long freeze (screen-off background) IS stale', () => {
  assert.equal(
    isMyMatchDistanceStale({ lastUpdatedAtMs: NOW - 60_000, nowMs: NOW }),
    true,
  );
});

test('no recorded timestamp is NOT stale (early run / pre-first-sync renders normal not-ready path)', () => {
  assert.equal(isMyMatchDistanceStale({ lastUpdatedAtMs: null, nowMs: NOW }), false);
  assert.equal(isMyMatchDistanceStale({ lastUpdatedAtMs: undefined, nowMs: NOW }), false);
  assert.equal(isMyMatchDistanceStale({ lastUpdatedAtMs: Number.NaN, nowMs: NOW }), false);
});

test('a future / clock-skew timestamp is treated as fresh, not stale', () => {
  assert.equal(isMyMatchDistanceStale({ lastUpdatedAtMs: NOW + 5_000, nowMs: NOW }), false);
});

test('custom threshold override is honoured (for callers/tests)', () => {
  assert.equal(isMyMatchDistanceStale({ lastUpdatedAtMs: NOW - 5_000, nowMs: NOW, thresholdMs: 4_000 }), true);
  assert.equal(isMyMatchDistanceStale({ lastUpdatedAtMs: NOW - 5_000, nowMs: NOW, thresholdMs: 6_000 }), false);
});
