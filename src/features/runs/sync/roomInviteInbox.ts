import type { RunningMatchRoom } from '@/lib/api/types';

export type RoomInviteInboxEvent = {
  inviteId: string;
  inviteToken: string;
  invitedUserId: string;
  key: string;
  roomId: string;
  roomState: RunningMatchRoom['state'];
};

function getInviteeForUser(room: RunningMatchRoom, userId: string) {
  return room.invitedFriends?.find((invitee) => (
    invitee.userId === userId || invitee.invitedUserId === userId
  )) ?? null;
}

export function buildRoomInviteInboxEvent(
  room: RunningMatchRoom | null | undefined,
  currentUserId: string,
): RoomInviteInboxEvent | null {
  if (!room || room.joined !== false || !currentUserId) {
    return null;
  }

  const invitee = getInviteeForUser(room, currentUserId)
    ?? (room.invitedFriends?.length === 1 ? room.invitedFriends[0] : null);
  const isCurrentUserInvited = room.joined === false || room.invitedFriendIds.includes(currentUserId) || Boolean(invitee);
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
