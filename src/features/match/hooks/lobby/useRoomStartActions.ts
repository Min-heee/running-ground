import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Alert } from 'react-native';
import { type Href, router } from 'expo-router';
import {
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchRoomReady,
} from '@/services/matchService';
import { getApiErrorMessage } from '@/services/apiError';
import { verifyDeletedRoomServerMembership } from '@/features/match/hooks/lobby/roomDeleteVerification';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { MatchRoomUxModel } from '@/features/runs/lifecycle/matchRoomFlow';
import {
  clearMatchRoomExitGuard,
  markMatchRoomExiting,
} from '@/features/runs/lifecycle/matchRoomExitGuard';
import {
  clearMatchRoomDeletedTombstone,
  markMatchRoomDeleted,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { hydrateLiveMatchRouteState } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import { beginRgInputTrace, waitForRgInputFeedbackFrame } from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type RoomExitState = 'idle' | 'leaving' | 'deleting';

function navigateAwayFromRoom() {
  const navigationRouter = router as typeof router & { canGoBack?: () => boolean };
  if (navigationRouter.canGoBack?.()) {
    router.back();
    return;
  }

  router.replace('/(tabs)/running');
}

function navigateToStartedRoomMatch(room: RunningMatchRoom) {
  if (!room.linkedMatchId) {
    return;
  }

  router.replace({
    pathname: '/(tabs)/running',
    params: {
      focusMatchMode: room.mode,
      focusMatchId: room.linkedMatchId,
      focusMatchDistanceKm: String(room.linkedMatchDistanceKm ?? room.distanceKm),
      focusMatchSlotStartAt: room.linkedMatchSlotStartAt ?? room.slotStartAt,
      focusRoomId: room.roomId,
      ...(room.state === 'active' ? { forceMatchArena: '1' } : {}),
      focusMatchNonce: `room-start-${Date.now()}`,
    },
  } as Href);
}

type UseRoomStartActionsInput = {
  room: RunningMatchRoom | null;
  roomUxModel: MatchRoomUxModel;
  isReady: boolean;
  latestRoomServerNowMsRef: MutableRefObject<number>;
  commitRoom: (room: RunningMatchRoom | null) => void;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
  pauseRoomPolling: () => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
};

export function useRoomStartActions({
  room,
  roomUxModel,
  isReady,
  latestRoomServerNowMsRef,
  commitRoom,
  syncServerClock,
  pauseRoomPolling,
  setError,
  setSaving,
}: UseRoomStartActionsInput) {
  const isMountedRef = useRef(true);
  const roomExitInFlightRef = useRef(false);
  const roomReadyInFlightRef = useRef(false);
  const roomStartInFlightRef = useRef(false);
  const [roomExitState, setRoomExitState] = useState<RoomExitState>('idle');

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const handleToggleReady = async () => {
    if (!room || !roomUxModel.readyAction.canToggle) {
      return;
    }

    if (roomReadyInFlightRef.current) {
      return;
    }

    const inputTrace = beginRgInputTrace('room ready toggle button press', {
      nextReady: !isReady,
      roomId: room.roomId,
      source: 'match-room ready action',
    });

    roomReadyInFlightRef.current = true;
    setSaving(true);
    setError(null);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'match-room ready action',
    });

    try {
      const payload = await updateRunningMatchRoomReady({
        roomId: room.roomId,
        ready: !isReady,
      });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow, payload);
      commitRoom(payload.room);
    } catch (roomError) {
      setError(getApiErrorMessage(roomError, '준비 상태를 바꾸지 못했어.'));
    } finally {
      roomReadyInFlightRef.current = false;
      setSaving(false);
    }
  };

  const handleStart = async () => {
    const inputTrace = beginRgInputTrace('room start button press', {
      canStart: roomUxModel.startAction.canStart,
      roomId: room?.roomId ?? null,
      source: 'match-room start action',
    });

    rgPerfMark('room start button press', {
      canStart: roomUxModel.startAction.canStart,
      roomId: room?.roomId ?? null,
    });

    if (!room || !roomUxModel.startAction.canStart) {
      if (roomUxModel.startAction.visible && roomUxModel.startAction.helperText) {
        setError(roomUxModel.startAction.helperText);
      }
      return;
    }

    if (roomStartInFlightRef.current) {
      return;
    }

    roomStartInFlightRef.current = true;
    setSaving(true);
    setError(null);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'match-room start action',
    });

    const endStartApiTrace = rgPerfMeasureStart('room start API', {
      roomId: room.roomId,
    });

    try {
      const payload = await startRunningMatchRoom({ roomId: room.roomId });
      endStartApiTrace({
        linkedMatchId: payload.room?.linkedMatchId ?? null,
        success: true,
      });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow, payload);
      commitRoom(payload.room);
      if (payload.room?.linkedMatchId) {
        pauseRoomPolling();
        rgPerfMark('match lifecycle owner handoff to live match', {
          matchId: payload.room.linkedMatchId,
          roomId: payload.room.roomId,
          source: 'room start API',
          state: payload.room.state,
        });
        rgPerfMark('match-room polling stopped after handoff', {
          matchId: payload.room.linkedMatchId,
          roomId: payload.room.roomId,
          source: 'room start API',
          state: payload.room.state,
        });
        hydrateLiveMatchRouteState({
          distanceKm: payload.room.linkedMatchDistanceKm ?? payload.room.distanceKm,
          matchId: payload.room.linkedMatchId,
          mode: payload.room.mode,
          preferArena: payload.room.state === 'active',
          room: payload.room,
          roomId: payload.room.roomId,
          slotStartAt: payload.room.linkedMatchSlotStartAt ?? payload.room.slotStartAt,
          source: 'room start API',
        });
        rgPerfMark('live match route state hydrated', {
          matchId: payload.room.linkedMatchId,
          roomId: payload.room.roomId,
          source: 'room start API',
          state: payload.room.state,
        });
        navigateToStartedRoomMatch(payload.room);
      }
    } catch (roomError) {
      endStartApiTrace({ success: false });
      setError(getApiErrorMessage(roomError, '방을 시작하지 못했어.'));
    } finally {
      roomStartInFlightRef.current = false;
      setSaving(false);
    }
  };

  const handleLeave = () => {
    if (!room) {
      navigateAwayFromRoom();
      return;
    }

    if (roomExitInFlightRef.current) {
      return;
    }

    const exitRoom = room;
    const nextExitState: RoomExitState = exitRoom.isHost ? 'deleting' : 'leaving';
    const exitTraceLabel = exitRoom.isHost ? 'room delete API' : 'room leave API';
    const failureTitle = exitRoom.isHost ? '방 삭제 실패' : '방 나가기 실패';
    const failureMessage = exitRoom.isHost
      ? '방을 삭제하지 못했어.'
      : '방에서 나가지 못했어.';

    rgPerfMark(exitRoom.isHost ? 'room delete button press' : 'room leave button press', {
      roomId: exitRoom.roomId,
    });
    const inputTrace = beginRgInputTrace(
      exitRoom.isHost ? 'room delete button press' : 'room leave button press',
      {
        roomId: exitRoom.roomId,
        source: 'match-room exit',
      },
    );

    roomExitInFlightRef.current = true;
    markMatchRoomExiting(exitRoom.roomId);
    if (exitRoom.isHost) {
      markMatchRoomDeleted(exitRoom.roomId, 'match-room delete button press');
    }
    setSaving(true);
    setRoomExitState(nextExitState);
    setError(null);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    pauseRoomPolling();
    commitRoom(null);
    rgPerfMark('local room state cleared', {
      exitState: nextExitState,
      roomId: exitRoom.roomId,
      source: 'match-room exit',
    });
    if (exitRoom.isHost) {
      rgPerfMark('room delete local state fully cleared', {
        roomId: exitRoom.roomId,
        source: 'match-room exit',
      });
    }
    navigateAwayFromRoom();

    void waitForRgInputFeedbackFrame()
      .then(async () => {
        inputTrace.markApiStarted({
          source: 'match-room exit',
        });
        const endExitApiTrace = rgPerfMeasureStart(exitTraceLabel, {
          roomId: exitRoom.roomId,
        });
        try {
          await leaveRunningMatchRoom({ roomId: exitRoom.roomId });
          endExitApiTrace({ success: true });
          if (exitRoom.isHost) {
            await verifyDeletedRoomServerMembership({
              roomId: exitRoom.roomId,
            });
          }
          clearMatchRoomExitGuard(exitRoom.roomId);
        } catch (roomError) {
          endExitApiTrace({ success: false });
          const message = getApiErrorMessage(roomError, failureMessage);
          rgPerfMark(exitRoom.isHost ? 'room delete API error' : 'room leave API error', {
            message,
            roomId: exitRoom.roomId,
            source: 'match-room exit',
          });
          clearMatchRoomExitGuard(exitRoom.roomId);
          if (exitRoom.isHost) {
            clearMatchRoomDeletedTombstone(exitRoom.roomId, 'room delete failure');
          }
          if (isMountedRef.current) {
            setError(message);
          }
          Alert.alert(failureTitle, message);
        }
      })
      .finally(() => {
        roomExitInFlightRef.current = false;
        if (isMountedRef.current) {
          setSaving(false);
          setRoomExitState('idle');
        }
      });
  };

  return {
    roomExitState,
    handleToggleReady,
    handleStart,
    handleLeave,
  };
}
