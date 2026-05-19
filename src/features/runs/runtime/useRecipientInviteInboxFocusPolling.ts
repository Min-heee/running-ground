import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getRecipientInviteInboxOwnerState,
} from '@/features/runs/sync/roomInviteInbox';
import type { RecipientInviteInboxRuntimeState } from '@/features/runs/sync/recipientInviteInbox';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

const INVITE_INBOX_RECEIVER_POLL_MS = 5000;

type UseRecipientInviteInboxFocusPollingInput = {
  activeRoomId?: string | null;
  currentRoom?: RunningMatchRoom | null;
  fetchRecipientInviteInbox: (source: string) => Promise<void | undefined>;
  invalidateNoRoomInFlight: (input: {
    reason: string;
    runtimeState: RecipientInviteInboxRuntimeState;
    source: string;
  }) => void;
  isLiveMatchMounted?: boolean;
  lastFocusPauseKeyRef: MutableRefObject<string | null>;
  lastLiveFocusDisabledKeyRef: MutableRefObject<string | null>;
  linkedMatchId?: string | null;
  liveMatchKey?: string | null;
  retryTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  runtimeStateRef: MutableRefObject<RecipientInviteInboxRuntimeState>;
};

export function useRecipientInviteInboxFocusPolling({
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
}: UseRecipientInviteInboxFocusPollingInput) {
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
    lastFocusPauseKeyRef,
    lastLiveFocusDisabledKeyRef,
    retryTimeoutRef,
    runtimeStateRef,
  ]));
}
