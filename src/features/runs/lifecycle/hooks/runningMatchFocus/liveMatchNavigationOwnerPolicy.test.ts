import assert from 'node:assert/strict';
import test from 'node:test';
import type { MutableRefObject } from 'react';
import type { LiveMatchNavigationRecord } from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';
import {
  LIVE_MATCH_NAVIGATION_MAX_ROUTE_STATE_RETRIES,
} from '@/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchRecoveryPolicy';
import {
  resolveExistingNavigationRecord,
} from '@/features/runs/lifecycle/hooks/runningMatchFocus/liveMatchNavigationOwnerPolicy';

function createRecoveringRecord(
  overrides: Partial<LiveMatchNavigationRecord> = {},
): LiveMatchNavigationRecord {
  return {
    failedCount: 1,
    key: 'duel:match:duel-match-route-state',
    mode: 'duel',
    nextRetryAtMs: Date.now() + 10_000,
    owner: 'test',
    preferArena: false,
    requestId: 'live-nav-test',
    status: 'recovering',
    updatedAtMs: Date.now(),
    ...overrides,
  };
}

test('recovering route-state-only navigation promotes arena on card press without final failure', () => {
  let promotedCount = 0;
  const currentRecord = createRecoveringRecord();
  const navigationRecordRef = {
    current: currentRecord,
  } as MutableRefObject<LiveMatchNavigationRecord | null>;

  const result = resolveExistingNavigationRecord({
    currentRecord,
    isInFailedBackoff: () => false,
    isWaitingForMountSignal: () => true,
    matchId: 'duel-match-route-state',
    mode: 'duel',
    navigationKey: currentRecord.key,
    navigationRecordRef,
    promoteLiveArena: () => {
      promotedCount += 1;
    },
    requestedPreferArena: true,
    shouldSuppressRecoveryRetry: () => false,
    source: 'test card press',
  });

  assert.equal(result.handled, true);
  assert.equal(promotedCount, 1);
  assert.equal(currentRecord.preferArena, true);
  assert.equal(navigationRecordRef.current?.status, 'recovering');
});

test('route-state-only navigation finalizes failure only after retry budget is exhausted', () => {
  const currentRecord = createRecoveringRecord({
    failedCount: LIVE_MATCH_NAVIGATION_MAX_ROUTE_STATE_RETRIES + 1,
    nextRetryAtMs: Date.now() - 1,
  });
  const navigationRecordRef = {
    current: currentRecord,
  } as MutableRefObject<LiveMatchNavigationRecord | null>;

  const result = resolveExistingNavigationRecord({
    currentRecord,
    isInFailedBackoff: () => false,
    isWaitingForMountSignal: () => false,
    matchId: 'duel-match-route-state',
    mode: 'duel',
    navigationKey: currentRecord.key,
    navigationRecordRef,
    promoteLiveArena: () => {},
    requestedPreferArena: true,
    shouldSuppressRecoveryRetry: () => true,
    source: 'test retry exhausted',
  });

  assert.equal(result.handled, true);
  assert.equal(navigationRecordRef.current?.status, 'failed');
  assert.equal(navigationRecordRef.current?.failedCount, LIVE_MATCH_NAVIGATION_MAX_ROUTE_STATE_RETRIES + 1);
});
