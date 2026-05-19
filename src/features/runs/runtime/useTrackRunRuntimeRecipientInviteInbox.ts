import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  buildRecipientInviteInboxFetchKey,
  RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS,
  getRecipientInviteInboxFocusBlockReason,
  getRecipientInviteInboxFetchSkipReason,
  getRecipientInviteInboxOwnerState,
  getRecipientInviteInboxTimeoutRetryDelayMs,
  getRecipientInviteInboxStaleResultReason,
  shouldScheduleRecipientInviteInboxTimeoutRetry,
} from '@/features/runs/sync/roomInviteInbox';
import {
  buildRecipientInviteInboxAlreadyBusyTraceEvent,
  buildRecipientInviteInboxBlockTraceEvents,
  buildRecipientInviteInboxDisplayedTraceEvents,
  buildRecipientInviteInboxDuplicateTraceEvent,
  buildRecipientInviteInboxFetchSkipTraceEvent,
  buildRecipientInviteInboxNoEventTraceEvents,
  buildRecipientInviteInboxSuccessTraceEvents,
  fetchRecipientInviteInboxWithTimeout,
  processRecipientInviteResponse,
  RECIPIENT_INVITE_INBOX_FETCH_TIMEOUT_MS,
  shouldCommitRecipientInviteRoom,
  type RecipientInviteInboxRuntimeState,
  type RecipientInviteInboxTraceEvent,
} from '@/features/runs/sync/recipientInviteInbox';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  getApiErrorMessage,
} from '@/services';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { useRecipientInviteInboxFocusPolling } from './useRecipientInviteInboxFocusPolling';

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
  syncServerClock: (serverNow?: string) => void;
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
  const inFlightFetchRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const fetchGenerationRef = useRef(0);
  const lastAlreadyJoinedSkipKeyRef = useRef<string | null>(null);
  const lastCompletedFetchAtRef = useRef(0);
  const lastTimedOutFetchAtRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusPauseKeyRef = useRef<string | null>(null);
  const lastLiveFocusDisabledKeyRef = useRef<string | null>(null);
  currentRoomRef.current = currentRoom ?? null;
  runtimeStateRef.current = {
    activeRoomId: activeRoomId ?? currentRoom?.roomId ?? null,
    isLiveMatchMounted: Boolean(isLiveMatchMounted),
    linkedMatchId: linkedMatchId ?? currentRoom?.linkedMatchId ?? null,
    liveMatchKey: liveMatchKey ?? null,
  };

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
  }, []);

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
        const latestRuntimeState = runtimeStateRef.current;
        const latestBlockReason = getRecipientInviteInboxFocusBlockReason({
          activeRoomId: latestRuntimeState.activeRoomId,
          currentRoom: currentRoomRef.current,
          isLiveMatchMounted: latestRuntimeState.isLiveMatchMounted,
          linkedMatchId: latestRuntimeState.linkedMatchId,
          liveMatchKey: latestRuntimeState.liveMatchKey,
        });
        if (latestBlockReason) {
          endRecipientInviteFetchTrace({
            reason: latestBlockReason,
            roomId: payload.room?.roomId ?? null,
            success: false,
          });
          rgPerfMark('invite inbox fetch stale ignored', {
            currentLinkedMatchId: latestRuntimeState.linkedMatchId,
            currentRoomId: currentRoomRef.current?.roomId ?? latestRuntimeState.activeRoomId,
            reason: latestBlockReason,
            roomId: payload.room?.roomId ?? null,
            source,
            userId: currentUserId,
          });
          return;
        }

        const staleReason = getRecipientInviteInboxStaleResultReason({
          currentRoom: currentRoomRef.current,
          startedRoomId: roomAtStart?.roomId ?? null,
        });
        if (staleReason) {
          endRecipientInviteFetchTrace({
            reason: staleReason,
            roomId: payload.room?.roomId ?? null,
            success: false,
          });
          rgPerfMark('invite inbox fetch stale ignored', {
            currentLinkedMatchId: currentRoomRef.current?.linkedMatchId ?? null,
            currentRoomId: currentRoomRef.current?.roomId ?? null,
            reason: staleReason,
            roomId: payload.room?.roomId ?? null,
            source,
            userId: currentUserId,
          });
          return;
        }

        endRecipientInviteFetchTrace({
          roomId: payload.room?.roomId ?? null,
          success: true,
        });

        if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
          rgPerfMark('invite inbox fetch stale ignored', {
            reason: 'server-snapshot',
            roomId: payload.room?.roomId ?? null,
            source,
            userId: currentUserId,
          });
          rgPerfMark('invite card display skipped reason', {
            reason: 'stale-result',
            roomId: payload.room?.roomId ?? null,
            source,
            userId: currentUserId,
          });
          return;
        }

        const responseModel = processRecipientInviteResponse({
          currentUserId,
          payload,
          previousInviteKey: lastDisplayedRecipientInviteKeyRef.current,
          source,
        });
        markRecipientInviteTraceEvents(buildRecipientInviteInboxSuccessTraceEvents({
          currentUserId,
          model: responseModel,
          payload,
          source,
        }));

        if (!responseModel.inviteResult.event) {
          const isAlreadyJoinedSuppressed = Boolean(
            responseModel.alreadyJoinedSkipKey
            && lastAlreadyJoinedSkipKeyRef.current === responseModel.alreadyJoinedSkipKey,
          );
          if (responseModel.alreadyJoinedSkipKey && !isAlreadyJoinedSuppressed) {
            lastAlreadyJoinedSkipKeyRef.current = responseModel.alreadyJoinedSkipKey;
          }
          markRecipientInviteTraceEvents(buildRecipientInviteInboxNoEventTraceEvents({
            currentUserId,
            isAlreadyJoinedSuppressed,
            model: responseModel,
            payload,
            source,
          }));
          return;
        }

        if (shouldCommitRecipientInviteRoom(responseModel)) {
          syncServerClock(payload.serverNow);
          commitMatchRoom(payload.room);
        }

        if (!responseModel.inviteResult.shouldDisplay) {
          const duplicateTraceEvent = buildRecipientInviteInboxDuplicateTraceEvent({
            currentUserId,
            model: responseModel,
            source,
          });
          if (duplicateTraceEvent) {
            markRecipientInviteTraceEvents([duplicateTraceEvent]);
          }
          return;
        }

        lastDisplayedRecipientInviteKeyRef.current = responseModel.inviteResult.event.key;
        markRecipientInviteTraceEvents(buildRecipientInviteInboxDisplayedTraceEvents(responseModel));
      } catch (inviteError) {
        endRecipientInviteFetchTrace({ success: false });
        rgPerfMark('invite inbox fetch for recipient end', {
          message: getApiErrorMessage(inviteError, '초대함을 불러오지 못했어.'),
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
