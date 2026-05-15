import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  buildRecipientRoomInviteInboxResult,
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
    const inviteInboxResult = buildRecipientRoomInviteInboxResult({
      currentUserId: currentUserTag,
      previousInviteKey: lastDisplayedInviteKeyRef.current,
      room,
    });

    rgPerfMark('invite inbox pending count', {
      pendingCount: inviteInboxResult.pendingCount,
      roomId: inviteInboxResult.event?.roomId ?? room?.roomId ?? null,
      source,
      userId: currentUserTag,
    });

    if (!inviteInboxResult.event) {
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
