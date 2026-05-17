import { getApiErrorMessage } from '@/services/apiError';
import type { RunningMatchRoomResponse } from '@/lib/api/types';
import {
  runStaleRoomCleanupWithTimeout,
  type StaleRoomCleanupOutcome,
} from '@/features/runs/sync/staleRoomCleanup';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type FetchActiveRoom = () => Promise<RunningMatchRoomResponse>;
type CleanupDeletedBlocker = (input: { source: string }) => Promise<StaleRoomCleanupOutcome>;

type VerifyDeletedRoomServerMembershipInput = {
  cleanup?: CleanupDeletedBlocker;
  fetchActiveRoom?: FetchActiveRoom;
  roomId: string;
  source?: string;
  trace?: typeof rgPerfMark;
};

async function fetchActiveRunningMatchRoom() {
  const { fetchRunningMatchRoom } = await import('@/services/matchService');
  return fetchRunningMatchRoom();
}

export type DeletedRoomServerMembershipVerificationResult =
  | {
    activeRoomId: string | null;
    roomId: string;
    status: 'cleared';
  }
  | {
    activeRoomId: string;
    cleanupStatus: StaleRoomCleanupOutcome['status'];
    roomId: string;
    status: 'cleanup-attempted';
  }
  | {
    message: string;
    roomId: string;
    status: 'verification-error';
  };

export async function verifyDeletedRoomServerMembership({
  cleanup = runStaleRoomCleanupWithTimeout,
  fetchActiveRoom = fetchActiveRunningMatchRoom,
  roomId,
  source = 'match-room delete',
  trace = rgPerfMark,
}: VerifyDeletedRoomServerMembershipInput): Promise<DeletedRoomServerMembershipVerificationResult> {
  trace('room delete verification begin', {
    roomId,
    source,
  });

  try {
    const payload = await fetchActiveRoom();
    const activeRoomId = payload.room?.roomId ?? null;
    const stillActive = activeRoomId === roomId;
    trace('room delete verification end', {
      activeRoomId,
      roomId,
      source,
      stillActive,
      success: true,
    });

    if (!stillActive) {
      return {
        activeRoomId,
        roomId,
        status: 'cleared',
      };
    }

    trace('room delete server membership still active', {
      activeRoomId,
      roomId,
      source,
    });
    trace('room delete active blocker cleanup begin', {
      roomId,
      source: 'match-room delete verification',
    });
    const cleanupOutcome = await cleanup({
      source: 'room delete verification cleanup',
    });
    trace('room delete active blocker cleanup end', {
      cleaned: cleanupOutcome.status === 'completed' ? cleanupOutcome.payload.cleaned : null,
      roomId,
      status: cleanupOutcome.status,
      source: 'match-room delete verification',
    });

    return {
      activeRoomId,
      cleanupStatus: cleanupOutcome.status,
      roomId,
      status: 'cleanup-attempted',
    };
  } catch (error) {
    const message = getApiErrorMessage(error, '삭제 후 방 상태 확인에 실패했어.');
    trace('room delete verification end', {
      message,
      roomId,
      source,
      success: false,
    });
    return {
      message,
      roomId,
      status: 'verification-error',
    };
  }
}
