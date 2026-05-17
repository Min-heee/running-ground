import type { RunningMatchRoomCleanupResponse } from '@/lib/api/types';
import type { StaleRoomCleanupOutcome } from '@/features/runs/sync/staleRoomCleanup';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type CreateRoomBlocker = {
  blocker?: string | null;
  blockerSource?: string | null;
  roomId?: string | null;
};

type DeletedRoomCreateBlockerRecoveryInput = {
  actionSource?: string;
  blocker: CreateRoomBlocker;
  cleanup: (input: { source: string }) => Promise<StaleRoomCleanupOutcome>;
  cleanupSource?: string;
  trace?: typeof rgPerfMark;
};

export function getCleanupBlockerRoomId(payload: Pick<RunningMatchRoomCleanupResponse, 'blockerDetails' | 'room'>) {
  return payload.room?.roomId ?? payload.blockerDetails?.roomId ?? null;
}

export function getDeletedCleanupBlockerRoomId(
  payload: Pick<RunningMatchRoomCleanupResponse, 'blockerDetails' | 'room'>,
) {
  const blockerRoomId = getCleanupBlockerRoomId(payload);
  return isMatchRoomDeleted(blockerRoomId) ? blockerRoomId : null;
}

export function getDeletedCreateBlockerRoomId(blocker: CreateRoomBlocker) {
  return isMatchRoomDeleted(blocker.roomId) ? blocker.roomId ?? null : null;
}

export async function recoverDeletedRoomCreateBlocker({
  actionSource = 'track-run ready action',
  blocker,
  cleanup,
  cleanupSource = 'room create deleted blocker recovery',
  trace = rgPerfMark,
}: DeletedRoomCreateBlockerRecoveryInput) {
  const blockerRoomId = getDeletedCreateBlockerRoomId(blocker);
  if (!blockerRoomId) {
    return {
      blockerRoomId: null,
      handled: false,
      shouldRetry: false,
      status: null,
    } as const;
  }

  trace('room create blocker ignored deleted room', {
    blocker: blocker.blocker ?? null,
    blockerRoomId,
    blockerSource: blocker.blockerSource ?? null,
    source: actionSource,
  });
  trace('room delete active blocker cleanup begin', {
    blocker: blocker.blocker ?? null,
    blockerRoomId,
    blockerSource: blocker.blockerSource ?? null,
    source: cleanupSource,
  });
  const cleanupOutcome = await cleanup({
    source: cleanupSource,
  });
  trace('room delete active blocker cleanup end', {
    blockerRoomId,
    cleaned: cleanupOutcome.status === 'completed' ? cleanupOutcome.payload.cleaned : null,
    status: cleanupOutcome.status,
    source: cleanupSource,
  });

  return {
    blockerRoomId,
    handled: true,
    shouldRetry: cleanupOutcome.status === 'completed',
    status: cleanupOutcome.status,
  } as const;
}
