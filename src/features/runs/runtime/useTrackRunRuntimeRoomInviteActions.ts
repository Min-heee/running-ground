import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { clearMatchRoomDeletedTombstone } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { useTrackRunRoomCreateAction } from '@/features/runs/runtime/useTrackRunRoomCreateAction';
import { useTrackRunRoomJoinAction } from '@/features/runs/runtime/useTrackRunRoomJoinAction';
import { getRunningMatchBlockerFromError } from '@/features/runs/sync/staleRoomCleanup';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  getApiErrorMessage,
  joinRunningMatchRoom,
  leaveRunningMatchRoom,
} from '@/services';
import {
  beginRgInputTrace,
  waitForRgInputFeedbackFrame,
} from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type UseTrackRunRuntimeRoomInviteActionsInput = {
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  isJoiningMatchRoom: boolean;
  isLeavingMatchRoom: boolean;
  joinMatchRoomInFlightRef: MutableRefObject<boolean>;
  latestMatchRoomServerNowMsRef: MutableRefObject<number>;
  leaveMatchRoomInFlightRef: MutableRefObject<boolean>;
  navigateToMatchRoomWithTrace: Parameters<typeof useTrackRunRoomCreateAction>[0]['navigateToMatchRoomWithTrace'];
  prepareMatchRoomMutation: Parameters<typeof useTrackRunRoomJoinAction>[0]['prepareMatchRoomMutation'];
  setError: Dispatch<SetStateAction<string | null>>;
  setIsJoiningMatchRoom: Dispatch<SetStateAction<boolean>>;
  setIsLeavingMatchRoom: Dispatch<SetStateAction<boolean>>;
  setSelectedRoomFriendIds: Dispatch<SetStateAction<string[]>>;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
  visibleMatchRoom: RunningMatchRoom | null;
};

export function useTrackRunRuntimeRoomInviteActions({
  commitMatchRoom,
  isJoiningMatchRoom,
  isLeavingMatchRoom,
  joinMatchRoomInFlightRef,
  latestMatchRoomServerNowMsRef,
  leaveMatchRoomInFlightRef,
  navigateToMatchRoomWithTrace,
  prepareMatchRoomMutation,
  setError,
  setIsJoiningMatchRoom,
  setIsLeavingMatchRoom,
  setSelectedRoomFriendIds,
  syncServerClock,
  visibleMatchRoom,
}: UseTrackRunRuntimeRoomInviteActionsInput) {
  const handleAcceptRoomInviteFromRunning = useCallback(async () => {
    if (!visibleMatchRoom) {
      return;
    }

    if (joinMatchRoomInFlightRef.current || isJoiningMatchRoom) {
      return;
    }

    const inputTrace = beginRgInputTrace('invite code input submit', {
      hasToken: Boolean(visibleMatchRoom.inviteToken),
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card accept',
    });

    joinMatchRoomInFlightRef.current = true;
    setIsJoiningMatchRoom(true);
    setError(null);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });

    rgPerfMark('invite code input submit', {
      hasToken: Boolean(visibleMatchRoom.inviteToken),
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card accept',
    });
    rgPerfMark('invite card accept fast join', {
      hasRoomId: Boolean(visibleMatchRoom.roomId),
      hasToken: Boolean(visibleMatchRoom.inviteToken),
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card accept',
    });
    rgPerfMark('stale cleanup deferred for invite accept', {
      reason: 'join-first-room-id-present',
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card accept',
    });
    let endJoinApiTrace: ReturnType<typeof rgPerfMeasureStart> | null = null;
    await waitForRgInputFeedbackFrame();
    const joinStartDelayMs = inputTrace.markApiStarted({
      source: 'track-run invite card accept',
    });

    try {
      rgPerfMark('room join API started without cleanup wait', {
        delayMs: joinStartDelayMs,
        roomId: visibleMatchRoom.roomId,
        source: 'track-run invite card accept',
      });
      endJoinApiTrace = rgPerfMeasureStart('room join API', {
        roomId: visibleMatchRoom.roomId,
        source: 'track-run invite card accept',
      });
      const payload = await joinRunningMatchRoom({ inviteToken: visibleMatchRoom.inviteToken });
      if (!payload.room?.roomId) {
        endJoinApiTrace({
          reason: 'missing roomId',
          success: false,
        });
        throw new Error('방 정보를 불러오지 못했습니다. 다시 시도해주세요.');
      }
      endJoinApiTrace({
        roomId: payload.room.roomId,
        success: true,
      });
      // Accepting an invite enters a FRESH room — re-baseline the never-reset shared
      // room-snapshot high-water mark so a previous party-run's late timestamp can't drop
      // this room or its later countdown-ready ACK (the most common friend party-run join
      // path; see useTrackRunRoomCreateAction for the full rationale).
      latestMatchRoomServerNowMsRef.current = 0;
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow, payload);
      clearMatchRoomDeletedTombstone(payload.room.roomId, 'invite card accept');
      commitMatchRoom(payload.room);
      navigateToMatchRoomWithTrace('invite card accept', payload.room, payload.serverNow);
    } catch (roomError) {
      endJoinApiTrace?.({ success: false });
      const blocker = getRunningMatchBlockerFromError(roomError);
      if (blocker) {
        rgPerfMark('stale cleanup deferred for invite accept', {
          blocker: blocker.blocker ?? null,
          blockerSource: blocker.blockerSource ?? null,
          reason: 'join-blocker',
          roomId: visibleMatchRoom.roomId,
          source: 'track-run invite card accept',
        });
        void prepareMatchRoomMutation({
          forceCleanup: true,
          inviteToken: visibleMatchRoom.inviteToken,
          source: 'invite card accept deferred cleanup',
        }).catch((cleanupError: unknown) => {
          rgPerfMark('stale room cleanup error', {
            message: getApiErrorMessage(cleanupError, '이전 방 상태를 정리하지 못했어.'),
            source: 'invite card accept deferred cleanup',
          });
        });
      }
      const message = getApiErrorMessage(roomError, '초대를 수락하지 못했어.');
      rgPerfMark('room join API error', {
        message,
        roomId: visibleMatchRoom.roomId,
        source: 'track-run invite card accept',
      });
      setError(message);
    } finally {
      joinMatchRoomInFlightRef.current = false;
      setIsJoiningMatchRoom(false);
      rgPerfMark('invite accept pending action released', {
        roomId: visibleMatchRoom.roomId,
        source: 'track-run invite card accept',
      });
    }
  }, [
    commitMatchRoom,
    isJoiningMatchRoom,
    joinMatchRoomInFlightRef,
    latestMatchRoomServerNowMsRef,
    navigateToMatchRoomWithTrace,
    prepareMatchRoomMutation,
    setError,
    setIsJoiningMatchRoom,
    syncServerClock,
    visibleMatchRoom,
  ]);

  const handleDeclineRoomInviteFromRunning = useCallback(async () => {
    if (!visibleMatchRoom) {
      return;
    }

    if (leaveMatchRoomInFlightRef.current || isLeavingMatchRoom) {
      return;
    }

    const inputTrace = beginRgInputTrace('room leave button press', {
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card decline',
    });

    leaveMatchRoomInFlightRef.current = true;
    setIsLeavingMatchRoom(true);
    setError(null);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });

    rgPerfMark('room leave button press', {
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card decline',
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'track-run invite card decline',
    });
    const endLeaveApiTrace = rgPerfMeasureStart('room leave API', {
      roomId: visibleMatchRoom.roomId,
      source: 'track-run invite card decline',
    });

    try {
      const payload = await leaveRunningMatchRoom({ roomId: visibleMatchRoom.roomId });
      endLeaveApiTrace({
        roomId: visibleMatchRoom.roomId,
        success: true,
      });
      if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow, payload);
      commitMatchRoom(payload.room);
      rgPerfMark('local room state cleared', {
        roomId: visibleMatchRoom.roomId,
        source: 'track-run invite card decline',
      });
      setSelectedRoomFriendIds([]);
    } catch (roomError) {
      endLeaveApiTrace({ success: false });
      const message = getApiErrorMessage(roomError, '초대를 거절하지 못했어.');
      rgPerfMark('room leave API error', {
        message,
        roomId: visibleMatchRoom.roomId,
        source: 'track-run invite card decline',
      });
      setError(message);
    } finally {
      leaveMatchRoomInFlightRef.current = false;
      setIsLeavingMatchRoom(false);
    }
  }, [
    commitMatchRoom,
    isLeavingMatchRoom,
    latestMatchRoomServerNowMsRef,
    leaveMatchRoomInFlightRef,
    setError,
    setIsLeavingMatchRoom,
    setSelectedRoomFriendIds,
    syncServerClock,
    visibleMatchRoom,
  ]);

  return {
    handleAcceptRoomInviteFromRunning,
    handleDeclineRoomInviteFromRunning,
  };
}
