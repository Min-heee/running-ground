import type { RunningMatchRoom } from '@/lib/api/types';
import {
  ensureRunningMatchRoomFriendInviteRecords,
} from '@/lib/api/services/runningRoomResponseGuards';

export function ensureFriendInvitePayload(
  room: RunningMatchRoom | null,
  invitedUserIds: string[],
) {
  return ensureRunningMatchRoomFriendInviteRecords(room, invitedUserIds);
}
