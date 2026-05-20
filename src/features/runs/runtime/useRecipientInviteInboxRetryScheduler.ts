import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  getRecipientInviteInboxTimeoutRetryDelayMs,
  shouldScheduleRecipientInviteInboxTimeoutRetry,
} from '@/features/runs/sync/roomInviteInbox';
import type { RecipientInviteInboxRuntimeState } from '@/features/runs/sync/recipientInviteInbox';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseRecipientInviteInboxRetrySchedulerInput = {
  currentRoomRef: MutableRefObject<RunningMatchRoom | null>;
  currentUserId: string;
  fetchRecipientInviteInboxRef: MutableRefObject<((source: string) => Promise<void | undefined>) | null>;
  recipientInviteFetchInFlightRef: MutableRefObject<boolean>;
  runtimeStateRef: MutableRefObject<RecipientInviteInboxRuntimeState>;
};

export function useRecipientInviteInboxRetryScheduler({
  currentRoomRef,
  currentUserId,
  fetchRecipientInviteInboxRef,
  recipientInviteFetchInFlightRef,
  runtimeStateRef,
}: UseRecipientInviteInboxRetrySchedulerInput) {
  const inFlightFetchRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const fetchGenerationRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidateNoRoomInFlight = useCallback(({
    reason,
    runtimeState,
    source,
  }: {
    reason: string;
    runtimeState: RecipientInviteInboxRuntimeState;
    source: string;
  }) => {
    if (!inFlightFetchRef.current?.key.includes(':no-room:')) {
      return;
    }

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    fetchGenerationRef.current += 1;
    inFlightFetchRef.current = null;
    recipientInviteFetchInFlightRef.current = false;
    rgPerfMark('invite inbox no-room in-flight aborted after join', {
      activeRoomId: runtimeState.activeRoomId,
      linkedMatchId: runtimeState.linkedMatchId,
      liveMatchKey: runtimeState.liveMatchKey,
      reason,
      source,
      userId: currentUserId,
    });
  }, [currentUserId, recipientInviteFetchInFlightRef]);

  const scheduleTimeoutRetry = useCallback((source: string) => {
    if (retryTimeoutRef.current) {
      return;
    }

    const runtimeState = runtimeStateRef.current;
    const retryDelayMs = getRecipientInviteInboxTimeoutRetryDelayMs({
      activeRoomId: runtimeState.activeRoomId,
      currentRoom: currentRoomRef.current,
      isLiveMatchMounted: runtimeState.isLiveMatchMounted,
      linkedMatchId: runtimeState.linkedMatchId,
      liveMatchKey: runtimeState.liveMatchKey,
    });
    if (retryDelayMs === null) {
      return;
    }

    rgPerfMark('invite inbox receiver retry scheduled', {
      delayMs: retryDelayMs,
      source,
    });
    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      const latestRuntimeState = runtimeStateRef.current;
      if (!shouldScheduleRecipientInviteInboxTimeoutRetry({
        activeRoomId: latestRuntimeState.activeRoomId,
        currentRoom: currentRoomRef.current,
        isLiveMatchMounted: latestRuntimeState.isLiveMatchMounted,
        linkedMatchId: latestRuntimeState.linkedMatchId,
        liveMatchKey: latestRuntimeState.liveMatchKey,
      })) {
        return;
      }

      rgPerfMark('invite inbox receiver fetch timeout retry', {
        source,
      });
      void fetchRecipientInviteInboxRef.current?.(`${source} retry`);
    }, retryDelayMs);
  }, [
    currentRoomRef,
    fetchRecipientInviteInboxRef,
    runtimeStateRef,
  ]);

  return {
    fetchGenerationRef,
    inFlightFetchRef,
    invalidateNoRoomInFlight,
    retryTimeoutRef,
    scheduleTimeoutRetry,
  };
}
