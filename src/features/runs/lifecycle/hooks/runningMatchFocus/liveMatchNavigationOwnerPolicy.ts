import type { MutableRefObject } from 'react';
import {
  shouldPromoteLiveMatchArena,
  shouldReuseRecentLiveMatchNavigation,
  type LiveMatchNavigationResult,
} from '@/features/runs/lifecycle/liveMatchNavigationGate';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import type {
  ActiveLiveMatchNavigation,
  CompletedLiveMatchNavigation,
  LiveMatchNavigationRecord,
} from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

type NavigationPreflightResult = {
  handled: true;
  value: LiveMatchNavigationResult | Promise<LiveMatchNavigationResult>;
} | {
  handled: false;
};

type MatchMode = Extract<RunMatchMode, 'duel' | 'group'>;

export function resolveActiveNavigationDuplicate({
  activeNavigation,
  currentRecord,
  matchId,
  mode,
  navigationKey,
  promoteLiveArena,
  requestedPreferArena,
  source,
}: {
  activeNavigation: ActiveLiveMatchNavigation | null;
  currentRecord: LiveMatchNavigationRecord | null;
  matchId?: string;
  mode: MatchMode;
  navigationKey: string;
  promoteLiveArena: () => void;
  requestedPreferArena: boolean;
  source: string;
}): NavigationPreflightResult {
  if (activeNavigation?.key !== navigationKey) {
    return { handled: false };
  }

  if (requestedPreferArena && !activeNavigation.preferArena) {
    activeNavigation.preferArena = true;
    if (currentRecord?.key === navigationKey) {
      currentRecord.preferArena = true;
      currentRecord.updatedAtMs = Date.now();
    }
    promoteLiveArena();
    rgPerfMark('live match navigation upgraded preferArena', {
      matchId: matchId ?? null,
      mode,
      navigationKey,
      owner: currentRecord?.owner ?? null,
      requestId: activeNavigation.requestId,
      source,
    });
  }

  rgPerfMark('live match navigation skipped duplicate', {
    matchId: matchId ?? null,
    mode,
    navigationKey,
    owner: currentRecord?.owner ?? null,
    preferArena: requestedPreferArena,
    reason: 'navigating',
    requestId: activeNavigation.requestId,
    source,
  });

  return {
    handled: true,
    value: activeNavigation.promise,
  };
}

export function resolveExistingNavigationRecord({
  currentRecord,
  isInFailedBackoff,
  isWaitingForMountSignal,
  matchId,
  mode,
  navigationKey,
  navigationRecordRef,
  promoteLiveArena,
  requestedPreferArena,
  shouldSuppressRecoveryRetry,
  source,
}: {
  currentRecord: LiveMatchNavigationRecord | null;
  isInFailedBackoff: (record: LiveMatchNavigationRecord | null, nowMs?: number) => boolean;
  isWaitingForMountSignal: (record: LiveMatchNavigationRecord | null, nowMs?: number) => boolean;
  matchId?: string;
  mode: MatchMode;
  navigationKey: string;
  navigationRecordRef: MutableRefObject<LiveMatchNavigationRecord | null>;
  promoteLiveArena: () => void;
  requestedPreferArena: boolean;
  shouldSuppressRecoveryRetry: (record: LiveMatchNavigationRecord | null) => boolean;
  source: string;
}): NavigationPreflightResult {
  if (currentRecord?.key !== navigationKey) {
    return { handled: false };
  }

  if (currentRecord.status === 'mounted') {
    if (requestedPreferArena && !currentRecord.preferArena) {
      currentRecord.preferArena = true;
      currentRecord.updatedAtMs = Date.now();
      promoteLiveArena();
      rgPerfMark('live match navigation upgraded preferArena', {
        matchId: matchId ?? null,
        mode,
        navigationKey,
        owner: currentRecord.owner,
        source,
      });
    }

    rgPerfMark('live match navigation suppressed because mounted', {
      matchId: matchId ?? null,
      mode,
      navigationKey,
      owner: currentRecord.owner,
      preferArena: requestedPreferArena,
      source,
    });
    return {
      handled: true,
      value: currentRecord.result ?? null,
    };
  }

  if (isInFailedBackoff(currentRecord)) {
    const nextRetryAtMs = currentRecord.nextRetryAtMs ?? Date.now();
    currentRecord.status = 'suppressed';
    currentRecord.updatedAtMs = Date.now();
    rgPerfMark('live match navigation skipped duplicate', {
      matchId: matchId ?? null,
      mode,
      navigationKey,
      nextRetryInMs: nextRetryAtMs - Date.now(),
      owner: currentRecord.owner,
      preferArena: requestedPreferArena,
      reason: 'failed-backoff',
      source,
    });
    return {
      handled: true,
      value: currentRecord.result ?? null,
    };
  }

  if (currentRecord.status !== 'recovering') {
    return { handled: false };
  }

  const nextRetryAtMs = currentRecord.nextRetryAtMs ?? 0;
  if (isWaitingForMountSignal(currentRecord)) {
    rgPerfMark('live match navigation waiting for mount signal', {
      matchId: matchId ?? null,
      mode,
      navigationKey,
      nextRetryInMs: nextRetryAtMs - Date.now(),
      owner: currentRecord.owner,
      preferArena: requestedPreferArena,
      source,
    });
    rgPerfMark('live match recovery navigation skipped duplicate', {
      matchId: matchId ?? null,
      mode,
      navigationKey,
      nextRetryInMs: nextRetryAtMs - Date.now(),
      owner: currentRecord.owner,
      preferArena: requestedPreferArena,
      reason: 'waiting-for-mount-signal',
      source,
    });
    return {
      handled: true,
      value: currentRecord.result ?? null,
    };
  }

  if (!shouldSuppressRecoveryRetry(currentRecord)) {
    rgPerfMark('live match recovery navigation retry', {
      failedCount: currentRecord.failedCount,
      matchId: matchId ?? null,
      mode,
      navigationKey,
      owner: currentRecord.owner,
      preferArena: requestedPreferArena,
      source,
    });
    return { handled: false };
  }

  navigationRecordRef.current = {
    ...currentRecord,
    status: 'suppressed',
    updatedAtMs: Date.now(),
  };
  rgPerfMark('live match mount signal missing reason', {
    failedCount: currentRecord.failedCount,
    matchId: matchId ?? null,
    mode,
    navigationKey,
    owner: currentRecord.owner,
    reason: 'route-state-only-retry-exhausted',
    source,
  });
  rgPerfMark('live match navigation recovery failed no mount', {
    failedCount: currentRecord.failedCount,
    matchId: matchId ?? null,
    mode,
    navigationKey,
    owner: currentRecord.owner,
    source,
  });
  return {
    handled: true,
    value: currentRecord.result ?? null,
  };
}

export function resolveRecentCompletedNavigation({
  completedNavigation,
  matchId,
  mode,
  navigationKey,
  navigationRecordRef,
  nowMs,
  promoteLiveArena,
  requestedPreferArena,
  source,
}: {
  completedNavigation: CompletedLiveMatchNavigation | null;
  matchId?: string;
  mode: MatchMode;
  navigationKey: string;
  navigationRecordRef: MutableRefObject<LiveMatchNavigationRecord | null>;
  nowMs: number;
  promoteLiveArena: () => void;
  requestedPreferArena: boolean;
  source: string;
}): NavigationPreflightResult {
  if (!shouldReuseRecentLiveMatchNavigation({
    completedAtMs: completedNavigation?.completedAtMs,
    lastKey: completedNavigation?.key,
    nextKey: navigationKey,
    nowMs,
  })) {
    return { handled: false };
  }

  const shouldPromoteArena = shouldPromoteLiveMatchArena({
    currentPreferArena: completedNavigation?.preferArena,
    matchState: completedNavigation?.result?.state,
    requestedPreferArena,
  });

  if (shouldPromoteArena) {
    promoteLiveArena();
    if (completedNavigation) {
      completedNavigation.preferArena = true;
    }
  }

  if (completedNavigation) {
    navigationRecordRef.current = {
      failedCount: 0,
      key: navigationKey,
      mode,
      owner: source,
      preferArena: completedNavigation.preferArena,
      result: completedNavigation.result,
      status: 'mounted',
      updatedAtMs: nowMs,
    };
  }

  rgPerfMark('live match navigation suppressed because mounted', {
    matchId: matchId ?? null,
    mode,
    navigationKey,
    preferArena: requestedPreferArena,
    reason: 'recent-complete',
    source,
  });

  return {
    handled: true,
    value: completedNavigation?.result ?? null,
  };
}
