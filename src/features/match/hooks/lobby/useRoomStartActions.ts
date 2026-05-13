import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import {
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchRoomReady,
} from '@/services/matchService';
import { getApiErrorMessage } from '@/services/apiError';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { MatchRoomUxModel } from '@/features/runs/matchRoomFlow';
import {
  clearMatchRoomExitGuard,
  markMatchRoomExiting,
} from '@/features/runs/matchRoomExitGuard';
import { shouldAcceptServerSnapshot } from '@/features/runs/serverClockSync';
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

type UseRoomStartActionsInput = {
  room: RunningMatchRoom | null;
  roomUxModel: MatchRoomUxModel;
  isReady: boolean;
  latestRoomServerNowMsRef: MutableRefObject<number>;
  commitRoom: (room: RunningMatchRoom | null) => void;
  syncServerClock: (serverNow?: string) => void;
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
  const [roomExitState, setRoomExitState] = useState<RoomExitState>('idle');

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const handleToggleReady = async () => {
    if (!room || !roomUxModel.readyAction.canToggle) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await updateRunningMatchRoomReady({
        roomId: room.roomId,
        ready: !isReady,
      });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
    } catch (roomError) {
      setError(getApiErrorMessage(roomError, '준비 상태를 바꾸지 못했어.'));
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
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

    setSaving(true);
    setError(null);

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

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
    } catch (roomError) {
      endStartApiTrace({ success: false });
      setError(getApiErrorMessage(roomError, '방을 시작하지 못했어.'));
    } finally {
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

    roomExitInFlightRef.current = true;
    markMatchRoomExiting(exitRoom.roomId);
    setSaving(true);
    setRoomExitState(nextExitState);
    setError(null);
    pauseRoomPolling();
    commitRoom(null);
    rgPerfMark('local room state cleared', {
      exitState: nextExitState,
      roomId: exitRoom.roomId,
      source: 'match-room exit',
    });
    navigateAwayFromRoom();

    const endExitApiTrace = rgPerfMeasureStart(exitTraceLabel, {
      roomId: exitRoom.roomId,
    });

    void leaveRunningMatchRoom({ roomId: exitRoom.roomId })
      .then(() => {
        endExitApiTrace({ success: true });
        clearMatchRoomExitGuard(exitRoom.roomId);
      })
      .catch((roomError) => {
        endExitApiTrace({ success: false });
        const message = getApiErrorMessage(roomError, failureMessage);
        rgPerfMark(exitRoom.isHost ? 'room delete API error' : 'room leave API error', {
          message,
          roomId: exitRoom.roomId,
          source: 'match-room exit',
        });
        clearMatchRoomExitGuard(exitRoom.roomId);
        if (isMountedRef.current) {
          setError(message);
        }
        Alert.alert(failureTitle, message);
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
