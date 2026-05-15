import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  buildLiveMatchNavigationKey,
} from '@/features/runs/lifecycle/liveMatchNavigationGate';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import type {
  ActiveLiveMatchNavigation,
  CompletedLiveMatchNavigation,
  LiveMatchNavigationRecord,
  MarkLiveMatchMountedInput,
} from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';

export function useLiveMatchMountSignalBridge({
  activeNavigationRef,
  completedNavigationRef,
  navigationRecordRef,
  setIsResolvingFocusedMatch,
}: {
  activeNavigationRef: MutableRefObject<ActiveLiveMatchNavigation | null>;
  completedNavigationRef: MutableRefObject<CompletedLiveMatchNavigation | null>;
  navigationRecordRef: MutableRefObject<LiveMatchNavigationRecord | null>;
  setIsResolvingFocusedMatch: Dispatch<SetStateAction<boolean>>;
}) {
  return useCallback(({
    mode,
    matchId,
    source = 'live match screen mount',
  }: MarkLiveMatchMountedInput) => {
    if (!matchId) {
      return;
    }

    const navigationKey = buildLiveMatchNavigationKey({ matchId, mode });
    const activeNavigation = activeNavigationRef.current;
    const currentRecord = navigationRecordRef.current;
    const matchedRecord = currentRecord?.key === navigationKey ? currentRecord : null;
    const matchedActiveNavigation = activeNavigation?.key === navigationKey ? activeNavigation : null;

    if (!matchedRecord && !matchedActiveNavigation) {
      return;
    }

    if (matchedRecord?.status === 'mounted') {
      rgPerfMark('live match navigation skipped already mounted', {
        matchId,
        mode,
        navigationKey,
        owner: matchedRecord.owner,
        reason: 'screen-mount-duplicate',
        source,
      });
      rgPerfMark('live match navigation suppressed because mounted', {
        matchId,
        mode,
        navigationKey,
        owner: matchedRecord.owner,
        reason: 'screen-mount-duplicate',
        source,
      });
      return;
    }

    const preferArena = matchedRecord?.preferArena ?? matchedActiveNavigation?.preferArena ?? true;
    const owner = matchedRecord?.owner ?? source;
    const requestId = matchedRecord?.requestId ?? matchedActiveNavigation?.requestId;
    const wasRecovering = matchedRecord?.status === 'recovering' || Boolean((matchedRecord?.failedCount ?? 0) > 0);

    completedNavigationRef.current = {
      completedAtMs: Date.now(),
      key: navigationKey,
      preferArena,
      result: matchedRecord?.result ?? null,
    };
    navigationRecordRef.current = {
      failedCount: 0,
      key: navigationKey,
      mode,
      owner,
      preferArena,
      requestId,
      result: matchedRecord?.result ?? null,
      status: 'mounted',
      updatedAtMs: Date.now(),
    };

    if (matchedActiveNavigation) {
      activeNavigationRef.current = null;
      setIsResolvingFocusedMatch(false);
      rgPerfMark('live match navigation owner cleaned up after mount', {
        matchId,
        mode,
        navigationKey,
        owner,
        requestId,
        source,
      });
    }

    if (wasRecovering) {
      rgPerfMark('live match navigation recovered by retry', {
        failedCount: matchedRecord?.failedCount ?? 0,
        matchId,
        mode,
        navigationKey,
        owner,
        requestId,
        source,
      });
    }

    rgPerfMark('live match navigation marked mounted by screen mount', {
      matchId,
      mode,
      navigationKey,
      owner,
      requestId,
      source,
    });
    rgPerfMark('live match navigation confirmed by screen mount', {
      matchId,
      mode,
      navigationKey,
      owner,
      requestId,
      source,
    });
    rgPerfMark('live match navigation completed by mount signal', {
      matchId,
      mode,
      navigationKey,
      owner,
      requestId,
      source,
    });
    rgPerfMark('live match navigation success detached from gps start', {
      matchId,
      mode,
      navigationKey,
      source,
    });
  }, [
    activeNavigationRef,
    completedNavigationRef,
    navigationRecordRef,
    setIsResolvingFocusedMatch,
  ]);
}
