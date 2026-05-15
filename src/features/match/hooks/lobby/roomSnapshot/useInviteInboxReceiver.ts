import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  buildRecipientRoomInviteInboxResult,
  getRoomInviteInboxRawPendingIds,
  hasRoomInviteInboxRecipientIdMismatch,
} from '@/features/runs/sync/roomInviteInbox';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export type InviteInboxReceiver = (room: RunningMatchRoom | null, source?: string) => void;

export function useInviteInboxReceiver({
  currentUserTag,
  lastDisplayedInviteKeyRef,
}: {
  currentUserTag: string;
  lastDisplayedInviteKeyRef: MutableRefObject<string | null>;
}): InviteInboxReceiver {
  return useCallback((room, source = 'invite inbox polling') => {
    const rawPendingIds = getRoomInviteInboxRawPendingIds(room);
    rgPerfMark('invite inbox query key', {
      queryUserId: currentUserTag,
      queryUserTag: currentUserTag,
      source,
    });
    rgPerfMark('invite inbox raw pending ids', {
      inviteeTags: rawPendingIds.inviteeTags.join(','),
      invitedFriendIds: rawPendingIds.invitedFriendIds.join(','),
      invitedUserIds: rawPendingIds.invitedUserIds.join(','),
      roomId: room?.roomId ?? null,
      source,
      userId: currentUserTag,
    });

    const inviteInboxResult = buildRecipientRoomInviteInboxResult({
      currentUserId: currentUserTag,
      currentUserTag,
      previousInviteKey: lastDisplayedInviteKeyRef.current,
      room,
    });
    if (hasRoomInviteInboxRecipientIdMismatch({
      currentUserId: currentUserTag,
      currentUserTag,
      room,
    })) {
      rgPerfMark('invite inbox recipient id mismatch', {
        inviteeTags: rawPendingIds.inviteeTags.join(','),
        invitedFriendIds: rawPendingIds.invitedFriendIds.join(','),
        invitedUserIds: rawPendingIds.invitedUserIds.join(','),
        queryUserId: currentUserTag,
        queryUserTag: currentUserTag,
        roomId: room?.roomId ?? null,
        source,
      });
    }

    rgPerfMark('invite inbox pending count', {
      pendingCount: inviteInboxResult.pendingCount,
      roomId: inviteInboxResult.event?.roomId ?? room?.roomId ?? null,
      source,
      userId: currentUserTag,
    });

    if (!inviteInboxResult.event) {
      if (inviteInboxResult.skippedReason === 'already-joined') {
        rgPerfMark('invite card skipped already joined', {
          roomId: room?.roomId ?? null,
          source,
          userId: currentUserTag,
        });
      }
      rgPerfMark('invite card display skipped reason', {
        reason: inviteInboxResult.skippedReason,
        roomId: room?.roomId ?? null,
        source,
        userId: currentUserTag,
      });
      return;
    }

    if (inviteInboxResult.shouldDisplay) {
      lastDisplayedInviteKeyRef.current = inviteInboxResult.event.key;
      rgPerfMark('invite received', {
        inviteId: inviteInboxResult.event.inviteId,
        invitedUserId: inviteInboxResult.event.invitedUserId,
        roomId: inviteInboxResult.event.roomId,
        source,
        state: inviteInboxResult.event.roomState,
      });
      rgPerfMark('invite card displayed', {
        inviteId: inviteInboxResult.event.inviteId,
        invitedUserId: inviteInboxResult.event.invitedUserId,
        roomId: inviteInboxResult.event.roomId,
        source,
        state: inviteInboxResult.event.roomState,
      });
      return;
    }

    rgPerfMark('invite card display skipped duplicate', {
      inviteId: inviteInboxResult.event.inviteId,
      invitedUserId: inviteInboxResult.event.invitedUserId,
      roomId: inviteInboxResult.event.roomId,
      source,
      state: inviteInboxResult.event.roomState,
    });
    rgPerfMark('invite card display skipped reason', {
      inviteId: inviteInboxResult.event.inviteId,
      invitedUserId: inviteInboxResult.event.invitedUserId,
      reason: inviteInboxResult.skippedReason,
      roomId: inviteInboxResult.event.roomId,
      source,
      state: inviteInboxResult.event.roomState,
    });
  }, [currentUserTag, lastDisplayedInviteKeyRef]);
}
