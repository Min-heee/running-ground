import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_MATCH_NAVIGATION_MAX_ROUTE_STATE_RETRIES,
  shouldSuppressRouteStateRecoveryRetry,
} from '@/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchRecoveryPolicy';
import type { LiveMatchNavigationRecord } from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';

function createRecoveringRecord(failedCount: number): LiveMatchNavigationRecord {
  return {
    failedCount,
    key: 'duel:match-1',
    mode: 'duel',
    owner: 'test',
    preferArena: true,
    status: 'recovering',
    updatedAtMs: 1000,
  };
}

test('allows the configured route-state recovery retry before suppressing navigation', () => {
  assert.equal(
    shouldSuppressRouteStateRecoveryRetry(
      createRecoveringRecord(LIVE_MATCH_NAVIGATION_MAX_ROUTE_STATE_RETRIES),
    ),
    false,
  );
});

test('suppresses route-state recovery after the retry budget is exhausted', () => {
  assert.equal(
    shouldSuppressRouteStateRecoveryRetry(
      createRecoveringRecord(LIVE_MATCH_NAVIGATION_MAX_ROUTE_STATE_RETRIES + 1),
    ),
    true,
  );
});
