import type { RunningMatchRoom, RunningMatchRoomInvitee } from '@/lib/api/types';

export type RoomInviteInboxRecipientMatchType =
  | 'internal-id'
  | 'invited-friend-id'
  | 'public-tag';

export type RoomInviteInboxQueryIdentity = {
  currentUserId: string;
  currentUserTag?: string | null;
};

export type RoomInviteInboxRawPendingIds = {
  invitedFriendIds: string[];
  invitedUserIds: string[];
  inviteeTags: string[];
};

export type RoomInviteInboxRecipientMatch = {
  invitee: RunningMatchRoomInvitee | null;
  matchType: RoomInviteInboxRecipientMatchType | null;
};

function normalizeIdentityValues(...values: (string | null | undefined)[]) {
  return [...new Set(values
    .flatMap((value) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return [];
      }

      return [trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()];
    }))];
}

function getInviteIdentityAliases({ currentUserId, currentUserTag }: RoomInviteInboxQueryIdentity) {
  return normalizeIdentityValues(currentUserId, currentUserTag);
}

function matchesInviteIdentityAlias(value: string | null | undefined, aliases: string[]) {
  return normalizeIdentityValues(value).some((alias) => aliases.includes(alias));
}

export function getRoomInviteInboxRawPendingIds(room: RunningMatchRoom | null | undefined): RoomInviteInboxRawPendingIds {
  return {
    invitedFriendIds: room?.invitedFriendIds ?? [],
    invitedUserIds: room?.invitedFriends?.map((invitee) => invitee.invitedUserId ?? invitee.userId).filter(Boolean) ?? [],
    inviteeTags: room?.invitedFriends?.map((invitee) => invitee.tag).filter((tag): tag is string => Boolean(tag)) ?? [],
  };
}

export function getRoomInviteInboxInviteeForUser(
  room: RunningMatchRoom,
  identity: RoomInviteInboxQueryIdentity,
) {
  const aliases = getInviteIdentityAliases(identity);

  return room.invitedFriends?.find((invitee) => (
    matchesInviteIdentityAlias(invitee.userId, aliases)
    || matchesInviteIdentityAlias(invitee.invitedUserId, aliases)
    || matchesInviteIdentityAlias(invitee.tag, aliases)
  )) ?? null;
}

export function resolveRoomInviteInboxRecipientMatch(
  room: RunningMatchRoom | null | undefined,
  identity: RoomInviteInboxQueryIdentity,
): RoomInviteInboxRecipientMatch {
  if (!room) {
    return {
      invitee: null,
      matchType: null,
    };
  }

  const aliases = getInviteIdentityAliases(identity);
  const invitee = getRoomInviteInboxInviteeForUser(room, identity);

  if (matchesInviteIdentityAlias(invitee?.tag, aliases)) {
    return {
      invitee,
      matchType: 'public-tag',
    };
  }

  if (
    matchesInviteIdentityAlias(invitee?.userId, aliases)
    || matchesInviteIdentityAlias(invitee?.invitedUserId, aliases)
  ) {
    return {
      invitee,
      matchType: 'internal-id',
    };
  }

  if (room.invitedFriendIds.some((userId) => matchesInviteIdentityAlias(userId, aliases))) {
    return {
      invitee,
      matchType: 'invited-friend-id',
    };
  }

  return {
    invitee: null,
    matchType: null,
  };
}

export function hasPendingRoomInviteForUser(room: RunningMatchRoom, identity: RoomInviteInboxQueryIdentity) {
  const aliases = getInviteIdentityAliases(identity);
  return Boolean(resolveRoomInviteInboxRecipientMatch(room, identity).matchType
    || room.invitedFriendIds.some((userId) => matchesInviteIdentityAlias(userId, aliases)));
}

export function getRoomInviteInboxRecipientMatchType(
  room: RunningMatchRoom | null | undefined,
  identity: RoomInviteInboxQueryIdentity,
): RoomInviteInboxRecipientMatchType | null {
  if (!room) {
    return null;
  }

  return resolveRoomInviteInboxRecipientMatch(room, identity).matchType;
}

export function hasRoomInviteInboxRecipientIdMismatch({
  currentUserId,
  currentUserTag,
  room,
}: RoomInviteInboxQueryIdentity & {
  room: RunningMatchRoom | null | undefined;
}) {
  if (!room || room.joined !== false) {
    return false;
  }

  const rawPendingIds = getRoomInviteInboxRawPendingIds(room);
  const hasPendingInvite = rawPendingIds.invitedFriendIds.length > 0
    || rawPendingIds.invitedUserIds.length > 0
    || rawPendingIds.inviteeTags.length > 0;

  return hasPendingInvite && !hasPendingRoomInviteForUser(room, { currentUserId, currentUserTag });
}
