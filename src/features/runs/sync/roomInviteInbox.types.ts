import type { RunningMatchRoom } from '@/lib/api/types';

export type RoomInviteInboxEvent = {
  inviteId: string;
  inviteToken: string;
  invitedUserId: string;
  key: string;
  roomId: string;
  roomState: RunningMatchRoom['state'];
};

export type RoomInviteCardDisplaySkipReason =
  | 'duplicate-invite'
  | 'already-joined'
  | 'no-pending-invite';

export type RecipientRoomInviteInboxResult = {
  event: RoomInviteInboxEvent | null;
  pendingCount: number;
  shouldDisplay: boolean;
  skippedReason: RoomInviteCardDisplaySkipReason | null;
};

export type RecipientInviteInboxFetchSkipReason =
  | 'active-match'
  | 'joined-room'
  | 'throttled';

export type RecipientInviteInboxFocusBlockReason =
  | 'active-match'
  | 'active-room'
  | 'joined-room'
  | 'live-match-mounted';

export type RecipientInviteInboxStaleReason =
  | 'active-match'
  | 'joined-room'
  | 'room-changed';

export type RecipientInviteInboxOwnerMode =
  | 'paused'
  | 'receiver-idle'
  | 'receiver-pre-lobby';

export type RecipientInviteInboxOwnerState = {
  blockReason: RecipientInviteInboxFocusBlockReason | null;
  isActive: boolean;
  key: string | null;
  mode: RecipientInviteInboxOwnerMode;
};
