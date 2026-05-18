import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  buildRecipientInviteInboxFetchKey,
  buildRecipientRoomInviteInboxResult,
  RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS,
  getRecipientInviteInboxFocusBlockReason,
  getRecipientInviteInboxFetchSkipReason,
  getRecipientInviteInboxOwnerState,
  getRecipientInviteInboxTimeoutRetryDelayMs,
  getRoomInviteInboxRawPendingIds,
  getRoomInviteInboxRecipientMatchType,
  getRecipientInviteInboxStaleResultReason,
  hasRoomInviteInboxRecipientIdMismatch,
  shouldScheduleRecipientInviteInboxTimeoutRetry,
} from '@/features/runs/sync/roomInviteInbox';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  fetchRunningMatchRoomInviteInbox,
  getApiErrorMessage,
} from '@/services';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

const INVITE_INBOX_FETCH_TIMEOUT_MS = 5000;
const INVITE_INBOX_RECEIVER_POLL_MS = 5000;

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

async function fetchInviteInboxWithTimeout() {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve({ timedOut: true });
    }, INVITE_INBOX_FETCH_TIMEOUT_MS);
  });

  const requestPromise = fetchRunningMatchRoomInviteInbox({ signal: controller.signal })
    .then((payload) => ({ payload, timedOut: false as const }))
    .catch((error) => {
      if (controller.signal.aborted) {
        return { timedOut: true as const };
      }

      throw error;
    });

  const result = await Promise.race([
    requestPromise,
    timeoutPromise,
  ]);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  return result;
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
  const runtimeStateRef = useRef({
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
    runtimeState: typeof runtimeStateRef.current;
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

      if (blockReason === 'live-match-mounted') {
        rgPerfMark('invite inbox fetch skipped live match mounted', {
          matchId: runtimeStateAtStart.linkedMatchId ?? null,
          roomId: roomAtStart?.roomId ?? runtimeStateAtStart.activeRoomId,
          source,
          userId: currentUserId,
        });
        rgPerfMark('invite inbox focus disabled while live once', {
          liveMatchKey: runtimeStateAtStart.liveMatchKey,
          source,
        });
        return;
      }

      if (blockReason === 'active-match') {
        rgPerfMark('invite inbox fetch skipped active match', {
          linkedMatchId: roomAtStart?.linkedMatchId ?? runtimeStateAtStart.linkedMatchId,
          liveMatchKey: runtimeStateAtStart.liveMatchKey,
          roomId: roomAtStart?.roomId ?? runtimeStateAtStart.activeRoomId,
          source,
          userId: currentUserId,
        });
        rgPerfMark('invite inbox focus disabled while live once', {
          liveMatchKey: runtimeStateAtStart.liveMatchKey,
          source,
        });
        return;
      }

      if (blockReason === 'active-room') {
        rgPerfMark('invite inbox no-room key blocked by active room', {
          activeRoomId: runtimeStateAtStart.activeRoomId,
          source,
          userId: currentUserId,
        });
        return;
      }

      rgPerfMark('invite inbox fetch skipped joined room', {
        roomId: roomAtStart?.roomId ?? runtimeStateAtStart.activeRoomId,
        source,
        userId: currentUserId,
      });
      return;
    }

    const fetchKey = buildRecipientInviteInboxFetchKey({
      currentUserId,
      ownerKey: ownerStateAtStart.key ?? 'receiver-paused',
      source,
    });
    const skipReason = getRecipientInviteInboxFetchSkipReason({
      currentRoom: roomAtStart,
      lastCompletedAtMs: lastCompletedFetchAtRef.current,
      lastTimedOutAtMs: lastTimedOutFetchAtRef.current,
      nowMs: Date.now(),
    });

    if (skipReason === 'joined-room') {
      rgPerfMark('invite inbox fetch skipped joined room', {
        roomId: roomAtStart?.roomId ?? null,
        source,
        userId: currentUserId,
      });
      return;
    }

    if (skipReason === 'active-match') {
      rgPerfMark('invite inbox fetch skipped active match', {
        linkedMatchId: roomAtStart?.linkedMatchId ?? null,
        roomId: roomAtStart?.roomId ?? null,
        source,
        userId: currentUserId,
      });
      return;
    }

    if (skipReason === 'throttled') {
      rgPerfMark('invite inbox fetch throttled', {
        elapsedMs: Date.now() - lastCompletedFetchAtRef.current,
        roomId: roomAtStart?.roomId ?? null,
        source,
        userId: currentUserId,
      });
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
      rgPerfMark('invite inbox fetch for recipient begin', {
        skipped: true,
        reason: 'in-flight',
        source,
        userId: currentUserId,
      });
      return;
    }

    if (isCreatingMatchRoom || isJoiningMatchRoom || isLeavingMatchRoom) {
      rgPerfMark('invite inbox fetch for recipient begin', {
        skipped: true,
        reason: 'room-action-pending',
        source,
        userId: currentUserId,
      });
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
        retryAfterMs: INVITE_INBOX_RECEIVER_POLL_MS,
        source,
      });
    }

    let didTimeout = false;
    const requestPromise = (async () => {
      try {
        const fetchResult = await fetchInviteInboxWithTimeout();
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
            timeoutMs: INVITE_INBOX_FETCH_TIMEOUT_MS,
            userId: currentUserId,
          });
          rgPerfMark('invite inbox receiver timeout will retry', {
            retryAfterMs: RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS,
            source,
            timeoutMs: INVITE_INBOX_FETCH_TIMEOUT_MS,
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

      const rawPendingIds = getRoomInviteInboxRawPendingIds(payload.room);
      endRecipientInviteFetchTrace({
        roomId: payload.room?.roomId ?? null,
        success: true,
      });
      rgPerfMark('invite inbox fetch for recipient end', {
        joined: payload.room?.joined ?? null,
        roomId: payload.room?.roomId ?? null,
        source,
        success: true,
        userId: currentUserId,
      });
      rgPerfMark('invite inbox raw pending ids', {
        inviteeTags: rawPendingIds.inviteeTags.join(','),
        invitedFriendIds: rawPendingIds.invitedFriendIds.join(','),
        invitedUserIds: rawPendingIds.invitedUserIds.join(','),
        roomId: payload.room?.roomId ?? null,
        source,
        userId: currentUserId,
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

      const inviteResult = buildRecipientRoomInviteInboxResult({
        currentUserId,
        currentUserTag: currentUserId,
        previousInviteKey: lastDisplayedRecipientInviteKeyRef.current,
        room: payload.room,
      });
      const recipientMatchType = getRoomInviteInboxRecipientMatchType(payload.room, {
        currentUserId,
        currentUserTag: currentUserId,
      });
      if (recipientMatchType === 'public-tag') {
        rgPerfMark('invite inbox receiver matched by tag', {
          roomId: payload.room?.roomId ?? null,
          source,
        });
      } else if (recipientMatchType === 'internal-id' || recipientMatchType === 'invited-friend-id') {
        rgPerfMark('invite inbox receiver matched by internal id', {
          matchType: recipientMatchType,
          roomId: payload.room?.roomId ?? null,
          source,
        });
      }
      if (hasRoomInviteInboxRecipientIdMismatch({
        currentUserId,
        currentUserTag: currentUserId,
        room: payload.room,
      })) {
        rgPerfMark('invite inbox recipient id mismatch', {
          inviteeTags: rawPendingIds.inviteeTags.join(','),
          invitedFriendIds: rawPendingIds.invitedFriendIds.join(','),
          invitedUserIds: rawPendingIds.invitedUserIds.join(','),
          queryUserId: currentUserId,
          queryUserTag: currentUserId,
          roomId: payload.room?.roomId ?? null,
          source,
        });
      }
      rgPerfMark('invite inbox pending count', {
        pendingCount: inviteResult.pendingCount,
        roomId: inviteResult.event?.roomId ?? payload.room?.roomId ?? null,
        source,
        userId: currentUserId,
      });
      if (inviteResult.pendingCount > 0) {
        rgPerfMark('invite inbox receiver pending invite found', {
          pendingCount: inviteResult.pendingCount,
          roomId: inviteResult.event?.roomId ?? payload.room?.roomId ?? null,
          source,
        });
      }

      if (!inviteResult.event) {
        if (inviteResult.skippedReason === 'already-joined') {
          const alreadyJoinedSkipKey = [
            payload.room?.roomId ?? 'no-room',
            source,
            currentUserId,
          ].join(':');
          if (lastAlreadyJoinedSkipKeyRef.current !== alreadyJoinedSkipKey) {
            lastAlreadyJoinedSkipKeyRef.current = alreadyJoinedSkipKey;
            rgPerfMark('invite card skipped already joined', {
              roomId: payload.room?.roomId ?? null,
              source,
              userId: currentUserId,
            });
          } else {
            rgPerfMark('invite inbox already joined check suppressed', {
              roomId: payload.room?.roomId ?? null,
              source,
              userId: currentUserId,
            });
          }
        }
        rgPerfMark('invite card display skipped reason', {
          reason: inviteResult.skippedReason,
          roomId: payload.room?.roomId ?? null,
          source,
          userId: currentUserId,
        });
        return;
      }

      if (payload.room) {
        syncServerClock(payload.serverNow);
        commitMatchRoom(payload.room);
      }

      if (!inviteResult.shouldDisplay) {
        rgPerfMark('invite card display skipped reason', {
          inviteId: inviteResult.event.inviteId,
          invitedUserId: inviteResult.event.invitedUserId,
          reason: inviteResult.skippedReason,
          roomId: inviteResult.event.roomId,
          source,
          userId: currentUserId,
        });
        return;
      }

      lastDisplayedRecipientInviteKeyRef.current = inviteResult.event.key;
      rgPerfMark('invite received', {
        inviteId: inviteResult.event.inviteId,
        invitedUserId: inviteResult.event.invitedUserId,
        roomId: inviteResult.event.roomId,
        source: 'recipient invite inbox fetch',
        state: inviteResult.event.roomState,
      });
      rgPerfMark('invite card displayed', {
        inviteId: inviteResult.event.inviteId,
        invitedUserId: inviteResult.event.invitedUserId,
        roomId: inviteResult.event.roomId,
        source: 'recipient invite inbox fetch',
        state: inviteResult.event.roomState,
      });
      rgPerfMark('invite card displayed from receiver fallback', {
        inviteId: inviteResult.event.inviteId,
        invitedUserId: inviteResult.event.invitedUserId,
        roomId: inviteResult.event.roomId,
        source: 'recipient invite inbox fetch',
        state: inviteResult.event.roomState,
      });
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

  const focusOwnerState = getRecipientInviteInboxOwnerState({
    activeRoomId: activeRoomId ?? currentRoom?.roomId ?? null,
    currentRoom,
    isLiveMatchMounted: Boolean(isLiveMatchMounted),
    linkedMatchId: linkedMatchId ?? currentRoom?.linkedMatchId ?? null,
    liveMatchKey,
  });
  const focusBlockReason = focusOwnerState.blockReason;
  const focusBlockKey = focusBlockReason
    ? [
      focusBlockReason,
      activeRoomId ?? currentRoom?.roomId ?? 'no-room',
      linkedMatchId ?? currentRoom?.linkedMatchId ?? liveMatchKey ?? 'no-match',
    ].join(':')
    : null;

  useFocusEffect(useCallback(() => {
    const source = 'track-run recipient inbox focus';
    if (focusBlockReason && focusBlockKey) {
      const runtimeState = runtimeStateRef.current;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      invalidateNoRoomInFlight({
        reason: focusBlockReason,
        runtimeState,
        source,
      });

      if (lastFocusPauseKeyRef.current !== focusBlockKey) {
        rgPerfMark('invite inbox focus effect paused', {
          activeRoomId: runtimeState.activeRoomId,
          linkedMatchId: runtimeState.linkedMatchId,
          liveMatchKey: runtimeState.liveMatchKey,
          reason: focusBlockReason,
          source,
        });
      }

      if (
        (focusBlockReason === 'live-match-mounted' || focusBlockReason === 'active-match')
        && lastLiveFocusDisabledKeyRef.current !== focusBlockKey
      ) {
        lastLiveFocusDisabledKeyRef.current = focusBlockKey;
        rgPerfMark('invite inbox focus disabled while live once', {
          liveMatchKey: runtimeState.liveMatchKey,
          reason: focusBlockReason,
          source,
        });
      }

      lastFocusPauseKeyRef.current = focusBlockKey;
      return undefined;
    }

    if (lastFocusPauseKeyRef.current) {
      rgPerfMark('invite inbox focus effect resumed idle', {
        previousPauseKey: lastFocusPauseKeyRef.current,
        source,
      });
      lastFocusPauseKeyRef.current = null;
      lastLiveFocusDisabledKeyRef.current = null;
    }

    rgPerfMark('invite inbox receiver polling active', {
      intervalMs: INVITE_INBOX_RECEIVER_POLL_MS,
      ownerKey: focusOwnerState.key,
      ownerMode: focusOwnerState.mode,
      source,
    });
    void fetchRecipientInviteInbox(source);
    const intervalId = setInterval(() => {
      void fetchRecipientInviteInbox(source);
    }, INVITE_INBOX_RECEIVER_POLL_MS);

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      clearInterval(intervalId);
    };
  }, [
    fetchRecipientInviteInbox,
    focusBlockKey,
    focusBlockReason,
    focusOwnerState.key,
    focusOwnerState.mode,
    invalidateNoRoomInFlight,
  ]));

  return fetchRecipientInviteInbox;
}
