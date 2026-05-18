import type { RunningMatchRoom } from '@/lib/api/types';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export const MANUAL_INVITE_JOIN_PREFLIGHT_SOURCE = 'invite code join preflight';
export const MANUAL_INVITE_JOIN_RETRY_PREFLIGHT_SOURCE = 'invite code join retry after blocker';

type PrepareInviteJoinPreflightMutation = (input: {
  forceCleanup?: boolean;
  inviteToken?: string;
  source: string;
}) => Promise<boolean>;

function hasActiveRoom(room?: Pick<RunningMatchRoom, 'roomId'> | null) {
  return Boolean(room?.roomId && !isMatchRoomDeleted(room.roomId));
}

export function resolveManualInviteJoinPreflightDecision({
  inviteToken,
  matchRoom,
  visibleMatchRoom,
}: {
  inviteToken: string;
  matchRoom?: Pick<RunningMatchRoom, 'roomId'> | null;
  visibleMatchRoom?: Pick<RunningMatchRoom, 'roomId'> | null;
}) {
  const hasLocalBlocker = hasActiveRoom(matchRoom) || hasActiveRoom(visibleMatchRoom);

  return {
    hasLocalBlocker,
    inviteTokenLength: inviteToken.trim().length,
    shouldLogDeferredCleanup: !hasLocalBlocker,
    source: MANUAL_INVITE_JOIN_PREFLIGHT_SOURCE,
  };
}

export async function runManualInviteJoinPreflight({
  inviteToken,
  matchRoom,
  prepareMatchRoomMutation,
  visibleMatchRoom,
}: {
  inviteToken: string;
  matchRoom?: Pick<RunningMatchRoom, 'roomId'> | null;
  prepareMatchRoomMutation: PrepareInviteJoinPreflightMutation;
  visibleMatchRoom?: Pick<RunningMatchRoom, 'roomId'> | null;
}) {
  const decision = resolveManualInviteJoinPreflightDecision({
    inviteToken,
    matchRoom,
    visibleMatchRoom,
  });

  if (decision.shouldLogDeferredCleanup) {
    rgPerfMark('stale cleanup deferred', {
      reason: 'join-first-no-local-blocker',
      source: decision.source,
    });
  }

  const startedAt = Date.now();
  const canProceed = await prepareMatchRoomMutation({
    inviteToken,
    source: decision.source,
  });
  const durationMs = Date.now() - startedAt;

  rgPerfMark('room join preflight duration', {
    canProceed,
    durationMs,
    inviteTokenLength: decision.inviteTokenLength,
    source: decision.source,
  });

  return {
    canProceed,
    decision,
    durationMs,
    source: decision.source,
  };
}

export async function runManualInviteJoinRetryPreflight({
  inviteToken,
  prepareMatchRoomMutation,
}: {
  inviteToken: string;
  prepareMatchRoomMutation: PrepareInviteJoinPreflightMutation;
}) {
  const startedAt = Date.now();
  const canRetry = await prepareMatchRoomMutation({
    forceCleanup: true,
    inviteToken,
    source: MANUAL_INVITE_JOIN_RETRY_PREFLIGHT_SOURCE,
  });
  const durationMs = Date.now() - startedAt;

  rgPerfMark('room join preflight duration', {
    canProceed: canRetry,
    durationMs,
    inviteTokenLength: inviteToken.trim().length,
    source: MANUAL_INVITE_JOIN_RETRY_PREFLIGHT_SOURCE,
  });

  return {
    canRetry,
    durationMs,
    source: MANUAL_INVITE_JOIN_RETRY_PREFLIGHT_SOURCE,
  };
}
