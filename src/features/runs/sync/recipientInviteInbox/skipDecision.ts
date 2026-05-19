import type { RunningMatchRoom } from '@/lib/api/types';
import type {
  RecipientInviteInboxFetchSkipReason,
  RecipientInviteInboxFocusBlockReason,
} from '@/features/runs/sync/roomInviteInbox';
import type {
  RecipientInviteInboxRuntimeState,
  RecipientInviteInboxTraceEvent,
} from './types';

export function buildRecipientInviteInboxBlockTraceEvents({
  blockReason,
  currentUserId,
  room,
  runtimeState,
  source,
}: {
  blockReason: RecipientInviteInboxFocusBlockReason;
  currentUserId: string;
  room: RunningMatchRoom | null | undefined;
  runtimeState: RecipientInviteInboxRuntimeState;
  source: string;
}): RecipientInviteInboxTraceEvent[] {
  if (blockReason === 'live-match-mounted') {
    return [
      {
        name: 'invite inbox fetch skipped live match mounted',
        payload: {
          matchId: runtimeState.linkedMatchId ?? null,
          roomId: room?.roomId ?? runtimeState.activeRoomId,
          source,
          userId: currentUserId,
        },
      },
      {
        name: 'invite inbox focus disabled while live once',
        payload: {
          liveMatchKey: runtimeState.liveMatchKey,
          source,
        },
      },
    ];
  }

  if (blockReason === 'active-match') {
    return [
      {
        name: 'invite inbox fetch skipped active match',
        payload: {
          linkedMatchId: room?.linkedMatchId ?? runtimeState.linkedMatchId,
          liveMatchKey: runtimeState.liveMatchKey,
          roomId: room?.roomId ?? runtimeState.activeRoomId,
          source,
          userId: currentUserId,
        },
      },
      {
        name: 'invite inbox focus disabled while live once',
        payload: {
          liveMatchKey: runtimeState.liveMatchKey,
          source,
        },
      },
    ];
  }

  if (blockReason === 'active-room') {
    return [{
      name: 'invite inbox no-room key blocked by active room',
      payload: {
        activeRoomId: runtimeState.activeRoomId,
        source,
        userId: currentUserId,
      },
    }];
  }

  return [{
    name: 'invite inbox fetch skipped joined room',
    payload: {
      roomId: room?.roomId ?? runtimeState.activeRoomId,
      source,
      userId: currentUserId,
    },
  }];
}

export function buildRecipientInviteInboxFetchSkipTraceEvent({
  currentUserId,
  lastCompletedAtMs,
  nowMs,
  room,
  skipReason,
  source,
}: {
  currentUserId: string;
  lastCompletedAtMs: number;
  nowMs: number;
  room: RunningMatchRoom | null | undefined;
  skipReason: RecipientInviteInboxFetchSkipReason;
  source: string;
}): RecipientInviteInboxTraceEvent {
  if (skipReason === 'active-match') {
    return {
      name: 'invite inbox fetch skipped active match',
      payload: {
        linkedMatchId: room?.linkedMatchId ?? null,
        roomId: room?.roomId ?? null,
        source,
        userId: currentUserId,
      },
    };
  }

  if (skipReason === 'throttled') {
    return {
      name: 'invite inbox fetch throttled',
      payload: {
        elapsedMs: nowMs - lastCompletedAtMs,
        roomId: room?.roomId ?? null,
        source,
        userId: currentUserId,
      },
    };
  }

  return {
    name: 'invite inbox fetch skipped joined room',
    payload: {
      roomId: room?.roomId ?? null,
      source,
      userId: currentUserId,
    },
  };
}

export function buildRecipientInviteInboxAlreadyBusyTraceEvent({
  currentUserId,
  reason,
  source,
}: {
  currentUserId: string;
  reason: 'in-flight' | 'room-action-pending';
  source: string;
}): RecipientInviteInboxTraceEvent {
  return {
    name: 'invite inbox fetch for recipient begin',
    payload: {
      skipped: true,
      reason,
      source,
      userId: currentUserId,
    },
  };
}
