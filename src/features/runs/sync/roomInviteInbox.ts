import type { RunningMatchRoom, RunningMatchRoomInvitee } from '@/lib/api/types';

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

export type RoomInviteInboxRecipientMatchType =
  | 'internal-id'
  | 'invited-friend-id'
  | 'public-tag';

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

export const RECIPIENT_INVITE_INBOX_FETCH_THROTTLE_MS = 5000;
export const RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS = 1000;

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
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value)))];
}

function getInviteIdentityAliases({ currentUserId, currentUserTag }: RoomInviteInboxQueryIdentity) {
  return normalizeIdentityValues(currentUserId, currentUserTag);
}

export function getRoomInviteInboxRawPendingIds(room: RunningMatchRoom | null | undefined): RoomInviteInboxRawPendingIds {
  return {
    invitedFriendIds: room?.invitedFriendIds ?? [],
    invitedUserIds: room?.invitedFriends?.map((invitee) => invitee.invitedUserId ?? invitee.userId).filter(Boolean) ?? [],
    inviteeTags: room?.invitedFriends?.map((invitee) => invitee.tag).filter((tag): tag is string => Boolean(tag)) ?? [],
  };
}

function getInviteeForUser(room: RunningMatchRoom, identity: RoomInviteInboxQueryIdentity) {
  const aliases = getInviteIdentityAliases(identity);

  return room.invitedFriends?.find((invitee) => (
    aliases.includes(invitee.userId)
    || (invitee.invitedUserId ? aliases.includes(invitee.invitedUserId) : false)
    || (invitee.tag ? aliases.includes(invitee.tag) : false)
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
  const invitee = getInviteeForUser(room, identity);

  if (invitee?.tag && aliases.includes(invitee.tag)) {
    return {
      invitee,
      matchType: 'public-tag',
    };
  }

  if (
    (invitee?.userId && aliases.includes(invitee.userId))
    || (invitee?.invitedUserId && aliases.includes(invitee.invitedUserId))
  ) {
    return {
      invitee,
      matchType: 'internal-id',
    };
  }

  if (room.invitedFriendIds.some((userId) => aliases.includes(userId))) {
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

function isPendingInviteForUser(room: RunningMatchRoom, identity: RoomInviteInboxQueryIdentity) {
  const aliases = getInviteIdentityAliases(identity);
  return Boolean(resolveRoomInviteInboxRecipientMatch(room, identity).matchType
    || room.invitedFriendIds.some((userId) => aliases.includes(userId)));
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

  return hasPendingInvite && !isPendingInviteForUser(room, { currentUserId, currentUserTag });
}

export function getRecipientInviteInboxFetchSkipReason({
  currentRoom,
  lastCompletedAtMs,
  lastTimedOutAtMs = 0,
  nowMs,
  throttleMs = RECIPIENT_INVITE_INBOX_FETCH_THROTTLE_MS,
}: {
  currentRoom?: RunningMatchRoom | null;
  lastCompletedAtMs: number;
  lastTimedOutAtMs?: number;
  nowMs: number;
  throttleMs?: number;
}): RecipientInviteInboxFetchSkipReason | null {
  if (currentRoom?.linkedMatchId) {
    return 'active-match';
  }

  if (currentRoom?.roomId && currentRoom.joined === true) {
    return 'joined-room';
  }

  const hasNewerTimeout = lastTimedOutAtMs > lastCompletedAtMs;
  if (!hasNewerTimeout && lastCompletedAtMs > 0 && nowMs - lastCompletedAtMs < throttleMs) {
    return 'throttled';
  }

  return null;
}

export function shouldScheduleRecipientInviteInboxTimeoutRetry({
  activeRoomId,
  currentRoom,
  isLiveMatchMounted,
  linkedMatchId,
  liveMatchKey,
}: {
  activeRoomId?: string | null;
  currentRoom?: RunningMatchRoom | null;
  isLiveMatchMounted?: boolean;
  linkedMatchId?: string | null;
  liveMatchKey?: string | null;
}) {
  return getRecipientInviteInboxFocusBlockReason({
    activeRoomId,
    currentRoom,
    isLiveMatchMounted,
    linkedMatchId,
    liveMatchKey,
  }) === null;
}

export function getRecipientInviteInboxFocusBlockReason({
  activeRoomId,
  currentRoom,
  isLiveMatchMounted,
  linkedMatchId,
  liveMatchKey,
}: {
  activeRoomId?: string | null;
  currentRoom?: RunningMatchRoom | null;
  isLiveMatchMounted?: boolean;
  linkedMatchId?: string | null;
  liveMatchKey?: string | null;
}): RecipientInviteInboxFocusBlockReason | null {
  if (isLiveMatchMounted) {
    return 'live-match-mounted';
  }

  if (currentRoom?.linkedMatchId || linkedMatchId || liveMatchKey) {
    return 'active-match';
  }

  if (currentRoom?.roomId && currentRoom.joined === true) {
    return 'joined-room';
  }

  if (!currentRoom?.roomId && activeRoomId) {
    return 'active-room';
  }

  return null;
}

export function getRecipientInviteInboxStaleResultReason({
  currentRoom,
  startedRoomId,
}: {
  currentRoom?: RunningMatchRoom | null;
  startedRoomId?: string | null;
}): RecipientInviteInboxStaleReason | null {
  if (currentRoom?.linkedMatchId) {
    return 'active-match';
  }

  if (currentRoom?.roomId && currentRoom.joined === true) {
    return 'joined-room';
  }

  if (startedRoomId && currentRoom?.roomId && startedRoomId !== currentRoom.roomId) {
    return 'room-changed';
  }

  return null;
}

export function buildRoomInviteInboxEvent(
  room: RunningMatchRoom | null | undefined,
  currentUserId: string,
  currentUserTag?: string | null,
): RoomInviteInboxEvent | null {
  if (!room || room.joined !== false || !currentUserId) {
    return null;
  }

  const identity = { currentUserId, currentUserTag };
  const invitee = getInviteeForUser(room, identity);
  const isCurrentUserInvited = isPendingInviteForUser(room, identity);
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
  currentUserTag,
  previousInviteKey,
  room,
}: {
  currentUserId: string;
  currentUserTag?: string | null;
  previousInviteKey: string | null;
  room: RunningMatchRoom | null | undefined;
}): RecipientRoomInviteInboxResult {
  const event = buildRoomInviteInboxEvent(room, currentUserId, currentUserTag);
  const pendingCount = event ? 1 : 0;

  if (!event) {
    return {
      event: null,
      pendingCount,
      shouldDisplay: false,
      skippedReason: room?.joined === true ? 'already-joined' : 'no-pending-invite',
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
