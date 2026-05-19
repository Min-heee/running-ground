import type { RunningMatchRoom } from '@/lib/api/types';
import type {
  RecipientInviteInboxFetchSkipReason,
  RecipientInviteInboxFocusBlockReason,
  RecipientInviteInboxOwnerState,
  RecipientInviteInboxStaleReason,
  RecipientRoomInviteInboxResult,
  RoomInviteInboxEvent,
} from '@/features/runs/sync/roomInviteInbox.types';
import {
  getRoomInviteInboxInviteeForUser,
  getRoomInviteInboxRawPendingIds,
  getRoomInviteInboxRecipientMatchType,
  hasPendingRoomInviteForUser,
  hasRoomInviteInboxRecipientIdMismatch,
  resolveRoomInviteInboxRecipientMatch,
  type RoomInviteInboxQueryIdentity,
  type RoomInviteInboxRawPendingIds,
  type RoomInviteInboxRecipientMatch,
  type RoomInviteInboxRecipientMatchType,
} from '@/features/runs/sync/roomInviteInboxRecipientMatcher';

export {
  getRoomInviteInboxRawPendingIds,
  getRoomInviteInboxRecipientMatchType,
  hasRoomInviteInboxRecipientIdMismatch,
  resolveRoomInviteInboxRecipientMatch,
};
export type {
  RoomInviteInboxQueryIdentity,
  RoomInviteInboxRawPendingIds,
  RoomInviteInboxRecipientMatch,
  RoomInviteInboxRecipientMatchType,
};
export type {
  RecipientInviteInboxFetchSkipReason,
  RecipientInviteInboxFocusBlockReason,
  RecipientInviteInboxOwnerMode,
  RecipientInviteInboxOwnerState,
  RecipientInviteInboxStaleReason,
  RecipientRoomInviteInboxResult,
  RoomInviteCardDisplaySkipReason,
  RoomInviteInboxEvent,
} from './roomInviteInbox.types';

export const RECIPIENT_INVITE_INBOX_FETCH_THROTTLE_MS = 5000;
export const RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS = 1000;

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

export function getRecipientInviteInboxTimeoutRetryDelayMs({
  retryMs = RECIPIENT_INVITE_INBOX_TIMEOUT_RETRY_MS,
  ...input
}: Parameters<typeof shouldScheduleRecipientInviteInboxTimeoutRetry>[0] & {
  retryMs?: number;
}) {
  return shouldScheduleRecipientInviteInboxTimeoutRetry(input) ? retryMs : null;
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

export function getRecipientInviteInboxOwnerState(input: Parameters<typeof getRecipientInviteInboxFocusBlockReason>[0]): RecipientInviteInboxOwnerState {
  const blockReason = getRecipientInviteInboxFocusBlockReason(input);
  if (blockReason) {
    return {
      blockReason,
      isActive: false,
      key: null,
      mode: 'paused',
    };
  }

  const roomId = input.currentRoom?.roomId ?? null;
  if (roomId && input.currentRoom?.joined === false) {
    return {
      blockReason: null,
      isActive: true,
      key: `receiver-pre-lobby:${roomId}`,
      mode: 'receiver-pre-lobby',
    };
  }

  return {
    blockReason: null,
    isActive: true,
    key: 'receiver-idle:no-room',
    mode: 'receiver-idle',
  };
}

export function buildRecipientInviteInboxFetchKey({
  currentUserId,
  ownerKey,
  source,
}: {
  currentUserId: string;
  ownerKey: string;
  source: string;
}) {
  return [
    currentUserId,
    ownerKey,
    source,
  ].join(':');
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
  const invitee = getRoomInviteInboxInviteeForUser(room, identity);
  const isCurrentUserInvited = hasPendingRoomInviteForUser(room, identity);
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
