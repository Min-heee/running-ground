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
  | 'no-pending-invite';

export type RecipientRoomInviteInboxResult = {
  event: RoomInviteInboxEvent | null;
  pendingCount: number;
  shouldDisplay: boolean;
  skippedReason: RoomInviteCardDisplaySkipReason | null;
};

function getInviteeForUser(room: RunningMatchRoom, userId: string) {
  return room.invitedFriends?.find((invitee) => (
    invitee.userId === userId || invitee.invitedUserId === userId
  )) ?? null;
}

function isPendingInviteForUser(room: RunningMatchRoom, userId: string) {
  return Boolean(
    getInviteeForUser(room, userId)
    || room.invitedFriendIds.includes(userId),
  );
}

export function buildRoomInviteInboxEvent(
  room: RunningMatchRoom | null | undefined,
  currentUserId: string,
): RoomInviteInboxEvent | null {
  if (!room || room.joined !== false || !currentUserId) {
    return null;
  }

  const invitee = getInviteeForUser(room, currentUserId);
  const isCurrentUserInvited = isPendingInviteForUser(room, currentUserId);
  if (!isCurrentUserInvited || !room.roomId || !room.inviteToken) {
    return null;
  }

  const invitedUserId = invitee?.invitedUserId ?? invitee?.userId ?? currentUserId;
  const inviteId = invitee?.inviteId ?? `${room.roomId}:${invitedUserId}`;

  return {
    inviteId,
    inviteToken: invitee?.inviteToken ?? room.inviteToken,
    invitedUserId,
    key: [
      invitedUserId,
      room.roomId,
      room.inviteToken,
      room.state,
      room.linkedMatchId ?? 'no-match',
    ].join(':'),
    roomId: invitee?.roomId ?? room.roomId,
    roomState: room.state,
  };
}

export function shouldDisplayRoomInviteCard(
  previousInviteKey: string | null,
  nextInvite: RoomInviteInboxEvent | null,
) {
  return Boolean(nextInvite && previousInviteKey !== nextInvite.key);
}

export function buildRecipientRoomInviteInboxResult({
  currentUserId,
  previousInviteKey,
  room,
}: {
  currentUserId: string;
  previousInviteKey: string | null;
  room: RunningMatchRoom | null | undefined;
}): RecipientRoomInviteInboxResult {
  const event = buildRoomInviteInboxEvent(room, currentUserId);
  const pendingCount = event ? 1 : 0;

  if (!event) {
    return {
      event: null,
      pendingCount,
      shouldDisplay: false,
      skippedReason: 'no-pending-invite',
    };
  }

  const shouldDisplay = shouldDisplayRoomInviteCard(previousInviteKey, event);
  return {
    event,
    pendingCount,
    shouldDisplay,
    skippedReason: shouldDisplay ? null : 'duplicate-invite',
  };
}
