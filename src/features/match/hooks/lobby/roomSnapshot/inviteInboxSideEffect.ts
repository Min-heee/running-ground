import type { MutableRefObject } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  buildRecipientRoomInviteInboxResult,
} from '@/features/runs/sync/roomInviteInbox';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export function applyRecipientInviteInboxSideEffect({
  currentUserTag,
  lastDisplayedInviteKeyRef,
  room,
}: {
  currentUserTag: string;
  lastDisplayedInviteKeyRef: MutableRefObject<string | null>;
  room: RunningMatchRoom | null;
}) {
  const inviteInboxResult = buildRecipientRoomInviteInboxResult({
    currentUserId: currentUserTag,
    previousInviteKey: lastDisplayedInviteKeyRef.current,
    room,
  });

  if (!inviteInboxResult.event) {
    return;
  }

  if (inviteInboxResult.shouldDisplay) {
    lastDisplayedInviteKeyRef.current = inviteInboxResult.event.key;
    rgPerfMark('invite received', {
      inviteId: inviteInboxResult.event.inviteId,
      invitedUserId: inviteInboxResult.event.invitedUserId,
      roomId: inviteInboxResult.event.roomId,
      source: 'invite inbox polling',
      state: inviteInboxResult.event.roomState,
    });
    rgPerfMark('invite card displayed', {
      inviteId: inviteInboxResult.event.inviteId,
      invitedUserId: inviteInboxResult.event.invitedUserId,
      roomId: inviteInboxResult.event.roomId,
      source: 'invite inbox polling',
      state: inviteInboxResult.event.roomState,
    });
    return;
  }

  rgPerfMark('invite card display skipped duplicate', {
    inviteId: inviteInboxResult.event.inviteId,
    invitedUserId: inviteInboxResult.event.invitedUserId,
    roomId: inviteInboxResult.event.roomId,
    source: 'invite inbox polling',
    state: inviteInboxResult.event.roomState,
  });
  rgPerfMark('invite card display skipped reason', {
    inviteId: inviteInboxResult.event.inviteId,
    invitedUserId: inviteInboxResult.event.invitedUserId,
    reason: inviteInboxResult.skippedReason,
    roomId: inviteInboxResult.event.roomId,
    source: 'invite inbox polling',
    state: inviteInboxResult.event.roomState,
  });
}
