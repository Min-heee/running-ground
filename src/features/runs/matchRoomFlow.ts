import type { FriendRank } from '@/domain/types';
import type {
  RunningMatchRoom,
  RunningMatchRoomInvitee,
} from '@/lib/api/types';

export type MatchRoomInviteAcceptanceState = {
  isInvitedOnly: boolean;
  isAlreadyJoined: boolean;
  canAccept: boolean;
  canDecline: boolean;
};

export function areAllMatchRoomGuestsReady(room: Pick<RunningMatchRoom, 'participants'> | null | undefined) {
  if (!room) {
    return false;
  }

  const guests = room.participants.filter((participant) => !participant.isHost);
  return guests.length > 0 && guests.every((participant) => participant.isReady);
}

export function canHostStartMatchRoom(
  room: Pick<RunningMatchRoom, 'startMode' | 'isHost' | 'participants' | 'minParticipants'> | null | undefined,
) {
  if (!room) {
    return false;
  }

  return (
    room.startMode === 'host'
    && room.isHost
    && room.participants.length >= room.minParticipants
    && areAllMatchRoomGuestsReady(room)
  );
}

export function buildMatchRoomInviteAcceptanceState(
  room: Pick<RunningMatchRoom, 'joined' | 'participants'> | null | undefined,
  currentUserId: string,
): MatchRoomInviteAcceptanceState {
  const isAlreadyJoined = Boolean(
    room?.participants.some((participant) => participant.userId === currentUserId || participant.tag === currentUserId),
  );
  const isInvitedOnly = Boolean(room && room.joined === false);

  return {
    isInvitedOnly,
    isAlreadyJoined,
    canAccept: isInvitedOnly && !isAlreadyJoined,
    canDecline: isInvitedOnly && !isAlreadyJoined,
  };
}

export function buildPendingMatchRoomInvitees(
  room: Pick<RunningMatchRoom, 'participants' | 'invitedFriendIds' | 'invitedFriends'> | null | undefined,
  friendRanks: FriendRank[] = [],
): RunningMatchRoomInvitee[] {
  if (!room) {
    return [];
  }

  const joinedIds = new Set(room.participants.map((participant) => participant.userId));
  const serverInvitees = room.invitedFriends ?? [];
  const serverInviteeIds = new Set(serverInvitees.map((invitee) => invitee.userId));
  const fallbackInvitees = room.invitedFriendIds
    .filter((friendId) => !joinedIds.has(friendId) && !serverInviteeIds.has(friendId))
    .map((friendId) => {
      const friend = friendRanks.find((rank) => rank.id === friendId);

      return {
        userId: friendId,
        name: friend?.name ?? '초대한 친구',
        tag: friend?.tag,
        districtName: friend?.liveLocationLabel ?? '친구',
        averagePace: '페이스 준비 중',
        levelLabel: '',
        status: 'pending' as const,
      };
    });

  return [
    ...serverInvitees.filter((invitee) => !joinedIds.has(invitee.userId)),
    ...fallbackInvitees,
  ];
}
