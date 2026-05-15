import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  buildRecipientRoomInviteInboxResult,
  getRecipientInviteInboxFetchSkipReason,
  getRoomInviteInboxRawPendingIds,
  getRecipientInviteInboxStaleResultReason,
  hasRoomInviteInboxRecipientIdMismatch,
} from '@/features/runs/sync/roomInviteInbox';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  fetchRunningMatchRoomInviteInbox,
  getApiErrorMessage,
} from '@/services';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

const INVITE_INBOX_FETCH_TIMEOUT_MS = 5000;

type UseTrackRunRuntimeRecipientInviteInboxInput = {
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  currentRoom?: RunningMatchRoom | null;
  currentUserId: string;
  isCreatingMatchRoom: boolean;
  isJoiningMatchRoom: boolean;
  isLeavingMatchRoom: boolean;
  lastDisplayedRecipientInviteKeyRef: MutableRefObject<string | null>;
  latestMatchRoomServerNowMsRef: MutableRefObject<number>;
  recipientInviteFetchInFlightRef: MutableRefObject<boolean>;
  syncServerClock: (serverNow?: string) => void;
};

async function fetchInviteInboxWithTimeout() {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ timedOut: true }), INVITE_INBOX_FETCH_TIMEOUT_MS);
  });

  const result = await Promise.race([
    fetchRunningMatchRoomInviteInbox().then((payload) => ({ payload, timedOut: false as const })),
    timeoutPromise,
  ]);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  return result;
}

export function useTrackRunRuntimeRecipientInviteInbox({
  commitMatchRoom,
  currentRoom,
  currentUserId,
  isCreatingMatchRoom,
  isJoiningMatchRoom,
  isLeavingMatchRoom,
  lastDisplayedRecipientInviteKeyRef,
  latestMatchRoomServerNowMsRef,
  recipientInviteFetchInFlightRef,
  syncServerClock,
}: UseTrackRunRuntimeRecipientInviteInboxInput) {
  const currentRoomRef = useRef<RunningMatchRoom | null>(currentRoom ?? null);
  const inFlightFetchRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const lastCompletedFetchAtRef = useRef(0);
  currentRoomRef.current = currentRoom ?? null;

  const fetchRecipientInviteInbox = useCallback(async (source: string) => {
    const roomAtStart = currentRoomRef.current;
    const fetchKey = [
      currentUserId,
      roomAtStart?.roomId ?? 'no-room',
      source,
    ].join(':');
    const skipReason = getRecipientInviteInboxFetchSkipReason({
      currentRoom: roomAtStart,
      lastCompletedAtMs: lastCompletedFetchAtRef.current,
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

    const requestPromise = (async () => {
    try {
      const fetchResult = await fetchInviteInboxWithTimeout();
      if (fetchResult.timedOut) {
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
        return;
      }

      const { payload } = fetchResult;
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

      if (!inviteResult.event) {
        if (inviteResult.skippedReason === 'already-joined') {
          rgPerfMark('invite card skipped already joined', {
            roomId: payload.room?.roomId ?? null,
            source,
            userId: currentUserId,
          });
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
    } catch (inviteError) {
      endRecipientInviteFetchTrace({ success: false });
      rgPerfMark('invite inbox fetch for recipient end', {
        message: getApiErrorMessage(inviteError, '초대함을 불러오지 못했어.'),
        source,
        success: false,
        userId: currentUserId,
      });
    } finally {
      recipientInviteFetchInFlightRef.current = false;
      inFlightFetchRef.current = null;
      lastCompletedFetchAtRef.current = Date.now();
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
    isCreatingMatchRoom,
    isJoiningMatchRoom,
    isLeavingMatchRoom,
    inFlightFetchRef,
    lastDisplayedRecipientInviteKeyRef,
    lastCompletedFetchAtRef,
    latestMatchRoomServerNowMsRef,
    recipientInviteFetchInFlightRef,
    syncServerClock,
  ]);

  useFocusEffect(useCallback(() => {
    void fetchRecipientInviteInbox('track-run recipient inbox focus');
  }, [fetchRecipientInviteInbox]));

  return fetchRecipientInviteInbox;
}
