import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  buildRecipientInviteInboxFetchKey,
  RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS,
  getRecipientInviteInboxFetchSkipReason,
  getRecipientInviteInboxOwnerState,
} from '@/features/runs/sync/roomInviteInbox';
import {
  buildRecipientInviteInboxAlreadyBusyTraceEvent,
  buildRecipientInviteInboxBlockTraceEvents,
  buildRecipientInviteInboxFetchSkipTraceEvent,
  applyRecipientInviteFetchSuccess,
  fetchRecipientInviteInboxWithTimeout,
  RECIPIENT_INVITE_INBOX_FETCH_TIMEOUT_MS,
  type RecipientInviteInboxRuntimeState,
  type RecipientInviteInboxTraceEvent,
} from '@/features/runs/sync/recipientInviteInbox';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  getApiErrorMessage,
} from '@/services';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { useRecipientInviteInboxFocusPolling } from './useRecipientInviteInboxFocusPolling';
import { useRecipientInviteInboxRetryScheduler } from './useRecipientInviteInboxRetryScheduler';

type UseTrackRunRuntimeRecipientInviteInboxInput = {
  activeRoomId?: string | null;
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  currentRoom?: RunningMatchRoom | null;
  currentUserId: string;
  isCreatingMatchRoom: boolean;
  isJoiningMatchRoom: boolean;
  isLeavingMatchRoom: boolean;
  isLiveMatchMounted?: boolean;
  lastDisplayedRecipientInviteKeyRef: MutableRefObject<string | null>;
  latestMatchRoomServerNowMsRef: MutableRefObject<number>;
  linkedMatchId?: string | null;
  liveMatchKey?: string | null;
  recipientInviteFetchInFlightRef: MutableRefObject<boolean>;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
};

function markRecipientInviteTraceEvents(events: RecipientInviteInboxTraceEvent[]) {
  events.forEach(({ name, payload }) => {
    rgPerfMark(name, payload);
  });
}

export function useTrackRunRuntimeRecipientInviteInbox({
  activeRoomId,
  commitMatchRoom,
  currentRoom,
  currentUserId,
  isCreatingMatchRoom,
  isJoiningMatchRoom,
  isLeavingMatchRoom,
  isLiveMatchMounted,
  lastDisplayedRecipientInviteKeyRef,
  latestMatchRoomServerNowMsRef,
  linkedMatchId,
  liveMatchKey,
  recipientInviteFetchInFlightRef,
  syncServerClock,
}: UseTrackRunRuntimeRecipientInviteInboxInput) {
  const currentRoomRef = useRef<RunningMatchRoom | null>(currentRoom ?? null);
  const runtimeStateRef = useRef<RecipientInviteInboxRuntimeState>({
    activeRoomId: activeRoomId ?? currentRoom?.roomId ?? null,
    isLiveMatchMounted: Boolean(isLiveMatchMounted),
    linkedMatchId: linkedMatchId ?? currentRoom?.linkedMatchId ?? null,
    liveMatchKey: liveMatchKey ?? null,
  });
  const fetchRecipientInviteInboxRef = useRef<((source: string) => Promise<void | undefined>) | null>(null);
  const lastAlreadyJoinedSkipKeyRef = useRef<string | null>(null);
  const lastCompletedFetchAtRef = useRef(0);
  const lastTimedOutFetchAtRef = useRef(0);
  const lastFocusPauseKeyRef = useRef<string | null>(null);
  const lastLiveFocusDisabledKeyRef = useRef<string | null>(null);
  currentRoomRef.current = currentRoom ?? null;
  runtimeStateRef.current = {
    activeRoomId: activeRoomId ?? currentRoom?.roomId ?? null,
    isLiveMatchMounted: Boolean(isLiveMatchMounted),
    linkedMatchId: linkedMatchId ?? currentRoom?.linkedMatchId ?? null,
    liveMatchKey: liveMatchKey ?? null,
  };
  const {
    fetchGenerationRef,
    inFlightFetchRef,
    invalidateNoRoomInFlight,
    retryTimeoutRef,
    scheduleTimeoutRetry,
  } = useRecipientInviteInboxRetryScheduler({
    currentRoomRef,
    currentUserId,
    fetchRecipientInviteInboxRef,
    recipientInviteFetchInFlightRef,
    runtimeStateRef,
  });

  const fetchRecipientInviteInbox = useCallback(async (source: string) => {
    const roomAtStart = currentRoomRef.current;
    const runtimeStateAtStart = runtimeStateRef.current;
    const ownerStateAtStart = getRecipientInviteInboxOwnerState({
      activeRoomId: runtimeStateAtStart.activeRoomId,
      currentRoom: roomAtStart,
      isLiveMatchMounted: runtimeStateAtStart.isLiveMatchMounted,
      linkedMatchId: runtimeStateAtStart.linkedMatchId,
      liveMatchKey: runtimeStateAtStart.liveMatchKey,
    });
    const blockReason = ownerStateAtStart.blockReason;

    if (!ownerStateAtStart.isActive && blockReason) {
      invalidateNoRoomInFlight({
        reason: blockReason,
        runtimeState: runtimeStateAtStart,
        source,
      });
      markRecipientInviteTraceEvents(buildRecipientInviteInboxBlockTraceEvents({
        blockReason,
        currentUserId,
        room: roomAtStart,
        runtimeState: runtimeStateAtStart,
        source,
      }));
      return;
    }

    const fetchKey = buildRecipientInviteInboxFetchKey({
      currentUserId,
      ownerKey: ownerStateAtStart.key ?? 'receiver-paused',
      source,
    });
    const nowMs = Date.now();
    const skipReason = getRecipientInviteInboxFetchSkipReason({
      currentRoom: roomAtStart,
      lastCompletedAtMs: lastCompletedFetchAtRef.current,
      lastTimedOutAtMs: lastTimedOutFetchAtRef.current,
      nowMs,
    });

    if (skipReason) {
      markRecipientInviteTraceEvents([buildRecipientInviteInboxFetchSkipTraceEvent({
        currentUserId,
        lastCompletedAtMs: lastCompletedFetchAtRef.current,
        nowMs,
        room: roomAtStart,
        skipReason,
        source,
      })]);
      return;
    }

    if (inFlightFetchRef.current?.key === fetchKey) {
      rgPerfMark('invite inbox fetch reused in-flight', {
        key: fetchKey,
        roomId: roomAtStart?.roomId ?? null,
        source,
        userId: currentUserId,
      });
      return inFlightFetchRef.current.promise;
    }

    if (recipientInviteFetchInFlightRef.current) {
      markRecipientInviteTraceEvents([buildRecipientInviteInboxAlreadyBusyTraceEvent({
        currentUserId,
        reason: 'in-flight',
        source,
      })]);
      return;
    }

    if (isCreatingMatchRoom || isJoiningMatchRoom || isLeavingMatchRoom) {
      markRecipientInviteTraceEvents([buildRecipientInviteInboxAlreadyBusyTraceEvent({
        currentUserId,
        reason: 'room-action-pending',
        source,
      })]);
      return;
    }

    recipientInviteFetchInFlightRef.current = true;
    const requestGeneration = fetchGenerationRef.current + 1;
    fetchGenerationRef.current = requestGeneration;
    const endRecipientInviteFetchTrace = rgPerfMeasureStart('invite inbox fetch for recipient', {
      source,
      userId: currentUserId,
    });
    rgPerfMark('invite inbox query key', {
      queryUserId: currentUserId,
      queryUserTag: currentUserId,
      source,
    });
    rgPerfMark('invite inbox fetch for recipient begin', {
      source,
      userId: currentUserId,
    });
    if (lastTimedOutFetchAtRef.current > lastCompletedFetchAtRef.current) {
      rgPerfMark('invite inbox receiver fetch retry after timeout', {
        elapsedMs: Date.now() - lastTimedOutFetchAtRef.current,
        retryAfterMs: RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS,
        source,
      });
    }

    let didTimeout = false;
    const requestPromise = (async () => {
      try {
        const fetchResult = await fetchRecipientInviteInboxWithTimeout();
        if (fetchGenerationRef.current !== requestGeneration) {
          rgPerfMark('invite inbox fetch stale ignored', {
            reason: 'invalidated-generation',
            source,
            userId: currentUserId,
          });
          return;
        }

        if (fetchResult.timedOut) {
          didTimeout = true;
          lastTimedOutFetchAtRef.current = Date.now();
          endRecipientInviteFetchTrace({
            reason: 'timeout',
            success: false,
          });
          rgPerfMark('invite inbox fetch stale ignored', {
            reason: 'timeout',
            source,
            timeoutMs: RECIPIENT_INVITE_INBOX_FETCH_TIMEOUT_MS,
            userId: currentUserId,
          });
          rgPerfMark('invite inbox receiver timeout will retry', {
            retryAfterMs: RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS,
            source,
            timeoutMs: RECIPIENT_INVITE_INBOX_FETCH_TIMEOUT_MS,
          });
          scheduleTimeoutRetry(source);
          return;
        }

        const { payload } = fetchResult;
        applyRecipientInviteFetchSuccess({
          commitMatchRoom,
          currentRoomRef,
          currentUserId,
          endRecipientInviteFetchTrace,
          lastAlreadyJoinedSkipKeyRef,
          lastDisplayedRecipientInviteKeyRef,
          latestMatchRoomServerNowMsRef,
          payload,
          roomAtStart,
          runtimeStateRef,
          source,
          syncServerClock,
        });
      } catch (inviteError) {
        endRecipientInviteFetchTrace({ success: false });
        rgPerfMark('invite inbox fetch for recipient end', {
          message: getApiErrorMessage(inviteError, '초대함을 불러오지 못했어요.'),
          source,
          success: false,
          userId: currentUserId,
        });
      } finally {
        if (fetchGenerationRef.current === requestGeneration) {
          recipientInviteFetchInFlightRef.current = false;
          if (!didTimeout) {
            lastCompletedFetchAtRef.current = Date.now();
          }
        }
        if (fetchGenerationRef.current === requestGeneration && inFlightFetchRef.current?.key === fetchKey) {
          inFlightFetchRef.current = null;
        }
      }
    })();
    inFlightFetchRef.current = {
      key: fetchKey,
      promise: requestPromise,
    };

    return requestPromise;
  }, [
    commitMatchRoom,
    currentUserId,
    currentRoomRef,
    fetchGenerationRef,
    invalidateNoRoomInFlight,
    isCreatingMatchRoom,
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    inFlightFetchRef,
    lastAlreadyJoinedSkipKeyRef,
    lastDisplayedRecipientInviteKeyRef,
    lastCompletedFetchAtRef,
    lastTimedOutFetchAtRef,
    latestMatchRoomServerNowMsRef,
    recipientInviteFetchInFlightRef,
    runtimeStateRef,
    scheduleTimeoutRetry,
    syncServerClock,
  ]);
  fetchRecipientInviteInboxRef.current = fetchRecipientInviteInbox;

  useRecipientInviteInboxFocusPolling({
    activeRoomId,
    currentRoom,
    fetchRecipientInviteInbox,
    invalidateNoRoomInFlight,
    isLiveMatchMounted,
    lastFocusPauseKeyRef,
    lastLiveFocusDisabledKeyRef,
    linkedMatchId,
    liveMatchKey,
    retryTimeoutRef,
    runtimeStateRef,
  });

  return fetchRecipientInviteInbox;
}
