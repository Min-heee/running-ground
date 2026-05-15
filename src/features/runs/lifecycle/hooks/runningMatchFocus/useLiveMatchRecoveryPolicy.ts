import { useCallback } from 'react';
import type {
  LiveMatchNavigationRecord,
} from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';

export const LIVE_MATCH_NAVIGATION_FAILED_BACKOFF_MS = 10_000;
export const LIVE_MATCH_NAVIGATION_MOUNT_WAIT_MS = 3_000;
export const LIVE_MATCH_NAVIGATION_MAX_ROUTE_STATE_RETRIES = 1;

export function shouldSuppressRouteStateRecoveryRetry(record: LiveMatchNavigationRecord | null) {
  return Boolean(
    record
    && record.status === 'recovering'
    && record.failedCount > LIVE_MATCH_NAVIGATION_MAX_ROUTE_STATE_RETRIES
  );
}

export function useLiveMatchRecoveryPolicy() {
  const isInFailedBackoff = useCallback((record: LiveMatchNavigationRecord | null, nowMs = Date.now()) => Boolean(
    record
    && (record.status === 'failed' || record.status === 'suppressed')
    && typeof record.nextRetryAtMs === 'number'
    && nowMs < record.nextRetryAtMs
  ), []);

  const isWaitingForMountSignal = useCallback((record: LiveMatchNavigationRecord | null, nowMs = Date.now()) => Boolean(
    record
    && record.status === 'recovering'
    && typeof record.nextRetryAtMs === 'number'
    && nowMs < record.nextRetryAtMs
  ), []);

  const shouldSuppressRecoveryRetry = useCallback(
    (record: LiveMatchNavigationRecord | null) => shouldSuppressRouteStateRecoveryRetry(record),
    [],
  );

  const getFailedRetryAtMs = useCallback((failedCount: number, nowMs = Date.now()) => (
    nowMs + LIVE_MATCH_NAVIGATION_FAILED_BACKOFF_MS * failedCount
  ), []);

  const getMountWaitRetryAtMs = useCallback((nowMs = Date.now()) => (
    nowMs + LIVE_MATCH_NAVIGATION_MOUNT_WAIT_MS
  ), []);

  return {
    getFailedRetryAtMs,
    getMountWaitRetryAtMs,
    isInFailedBackoff,
    isWaitingForMountSignal,
    shouldSuppressRecoveryRetry,
  };
}
