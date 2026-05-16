import type { RunningMatchRoomCleanupResponse } from '@/lib/api/types';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';

export function getCleanupBlockerRoomId(payload: Pick<RunningMatchRoomCleanupResponse, 'blockerDetails' | 'room'>) {
  return payload.room?.roomId ?? payload.blockerDetails?.roomId ?? null;
}

export function getDeletedCleanupBlockerRoomId(
  payload: Pick<RunningMatchRoomCleanupResponse, 'blockerDetails' | 'room'>,
) {
  const blockerRoomId = getCleanupBlockerRoomId(payload);
  return isMatchRoomDeleted(blockerRoomId) ? blockerRoomId : null;
}
