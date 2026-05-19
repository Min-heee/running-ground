import type { RunningMatchRoom, RunningMatchRoomResponse } from '@/lib/api/types';
import {
  buildRecipientRoomInviteInboxResult,
  getRoomInviteInboxRawPendingIds,
  getRoomInviteInboxRecipientMatchType,
  hasRoomInviteInboxRecipientIdMismatch,
} from '@/features/runs/sync/roomInviteInbox';
import type {
  RecipientRoomInviteInboxResult,
  RoomInviteInboxRawPendingIds,
  RoomInviteInboxRecipientMatchType,
} from '@/features/runs/sync/roomInviteInbox';
import type { RecipientInviteInboxTraceEvent } from './types';

export type RecipientInviteInboxResponseModel = {
  alreadyJoinedSkipKey: string | null;
  hasRecipientMismatch: boolean;
  inviteResult: RecipientRoomInviteInboxResult;
  rawPendingIds: RoomInviteInboxRawPendingIds;
  recipientMatchType: RoomInviteInboxRecipientMatchType | null;
  room: RunningMatchRoom | null;
};

export function processRecipientInviteResponse({
  currentUserId,
  payload,
  previousInviteKey,
  source,
}: {
  currentUserId: string;
  payload: RunningMatchRoomResponse;
  previousInviteKey: string | null;
  source: string;
}): RecipientInviteInboxResponseModel {
  const rawPendingIds = getRoomInviteInboxRawPendingIds(payload.room);
  const inviteResult = buildRecipientRoomInviteInboxResult({
    currentUserId,
    currentUserTag: currentUserId,
    previousInviteKey,
    room: payload.room,
  });
  const recipientMatchType = getRoomInviteInboxRecipientMatchType(payload.room, {
    currentUserId,
    currentUserTag: currentUserId,
  });
  const hasRecipientMismatch = hasRoomInviteInboxRecipientIdMismatch({
    currentUserId,
    currentUserTag: currentUserId,
    room: payload.room,
  });
  const alreadyJoinedSkipKey = inviteResult.skippedReason === 'already-joined'
    ? [
      payload.room?.roomId ?? 'no-room',
      source,
      currentUserId,
    ].join(':')
    : null;

  return {
    alreadyJoinedSkipKey,
    hasRecipientMismatch,
    inviteResult,
    rawPendingIds,
    recipientMatchType,
    room: payload.room,
  };
}

export function shouldCommitRecipientInviteRoom(model: RecipientInviteInboxResponseModel) {
  return Boolean(model.room && model.inviteResult.event);
}

export function buildRecipientInviteInboxSuccessTraceEvents({
  currentUserId,
  model,
  payload,
  source,
}: {
  currentUserId: string;
  model: RecipientInviteInboxResponseModel;
  payload: RunningMatchRoomResponse;
  source: string;
}): RecipientInviteInboxTraceEvent[] {
  const events: RecipientInviteInboxTraceEvent[] = [
    {
      name: 'invite inbox fetch for recipient end',
      payload: {
        joined: payload.room?.joined ?? null,
        roomId: payload.room?.roomId ?? null,
        source,
        success: true,
        userId: currentUserId,
      },
    },
    {
      name: 'invite inbox raw pending ids',
      payload: {
        inviteeTags: model.rawPendingIds.inviteeTags.join(','),
        invitedFriendIds: model.rawPendingIds.invitedFriendIds.join(','),
        invitedUserIds: model.rawPendingIds.invitedUserIds.join(','),
        roomId: payload.room?.roomId ?? null,
        source,
        userId: currentUserId,
      },
    },
  ];

  if (model.recipientMatchType === 'public-tag') {
    events.push({
      name: 'invite inbox receiver matched by tag',
      payload: {
        roomId: payload.room?.roomId ?? null,
        source,
      },
    });
  } else if (
    model.recipientMatchType === 'internal-id'
    || model.recipientMatchType === 'invited-friend-id'
  ) {
    events.push({
      name: 'invite inbox receiver matched by internal id',
      payload: {
        matchType: model.recipientMatchType,
        roomId: payload.room?.roomId ?? null,
        source,
      },
    });
  }

  if (model.hasRecipientMismatch) {
    events.push({
      name: 'invite inbox recipient id mismatch',
      payload: {
        inviteeTags: model.rawPendingIds.inviteeTags.join(','),
        invitedFriendIds: model.rawPendingIds.invitedFriendIds.join(','),
        invitedUserIds: model.rawPendingIds.invitedUserIds.join(','),
        queryUserId: currentUserId,
        queryUserTag: currentUserId,
        roomId: payload.room?.roomId ?? null,
        source,
      },
    });
  }

  events.push({
    name: 'invite inbox pending count',
    payload: {
      pendingCount: model.inviteResult.pendingCount,
      roomId: model.inviteResult.event?.roomId ?? payload.room?.roomId ?? null,
      source,
      userId: currentUserId,
    },
  });

  if (model.inviteResult.pendingCount > 0) {
    events.push({
      name: 'invite inbox receiver pending invite found',
      payload: {
        pendingCount: model.inviteResult.pendingCount,
        roomId: model.inviteResult.event?.roomId ?? payload.room?.roomId ?? null,
        source,
      },
    });
  }

  return events;
}

export function buildRecipientInviteInboxNoEventTraceEvents({
  currentUserId,
  isAlreadyJoinedSuppressed,
  model,
  payload,
  source,
}: {
  currentUserId: string;
  isAlreadyJoinedSuppressed: boolean;
  model: RecipientInviteInboxResponseModel;
  payload: RunningMatchRoomResponse;
  source: string;
}): RecipientInviteInboxTraceEvent[] {
  const events: RecipientInviteInboxTraceEvent[] = [];

  if (model.inviteResult.skippedReason === 'already-joined') {
    events.push({
      name: isAlreadyJoinedSuppressed
        ? 'invite inbox already joined check suppressed'
        : 'invite card skipped already joined',
      payload: {
        roomId: payload.room?.roomId ?? null,
        source,
        userId: currentUserId,
      },
    });
  }

  events.push({
    name: 'invite card display skipped reason',
    payload: {
      reason: model.inviteResult.skippedReason,
      roomId: payload.room?.roomId ?? null,
      source,
      userId: currentUserId,
    },
  });

  return events;
}

export function buildRecipientInviteInboxDuplicateTraceEvent({
  currentUserId,
  model,
  source,
}: {
  currentUserId: string;
  model: RecipientInviteInboxResponseModel;
  source: string;
}): RecipientInviteInboxTraceEvent | null {
  const event = model.inviteResult.event;
  if (!event) {
    return null;
  }

  return {
    name: 'invite card display skipped reason',
    payload: {
      inviteId: event.inviteId,
      invitedUserId: event.invitedUserId,
      reason: model.inviteResult.skippedReason,
      roomId: event.roomId,
      source,
      userId: currentUserId,
    },
  };
}

export function buildRecipientInviteInboxDisplayedTraceEvents(
  model: RecipientInviteInboxResponseModel,
): RecipientInviteInboxTraceEvent[] {
  const event = model.inviteResult.event;
  if (!event) {
    return [];
  }

  const payload = {
    inviteId: event.inviteId,
    invitedUserId: event.invitedUserId,
    roomId: event.roomId,
    source: 'recipient invite inbox fetch',
    state: event.roomState,
  };

  return [
    {
      name: 'invite received',
      payload,
    },
    {
      name: 'invite card displayed',
      payload,
    },
    {
      name: 'invite card displayed from receiver fallback',
      payload,
    },
  ];
}
