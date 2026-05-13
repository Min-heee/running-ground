import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { router } from 'expo-router';
import {
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchRoomReady,
} from '@/services/matchService';
import { getApiErrorMessage } from '@/services/apiError';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { MatchRoomUxModel } from '@/features/runs/matchRoomFlow';
import { shouldAcceptServerSnapshot } from '@/features/runs/serverClockSync';

type UseRoomStartActionsInput = {
  room: RunningMatchRoom | null;
  roomUxModel: MatchRoomUxModel;
  isReady: boolean;
  latestRoomServerNowMsRef: MutableRefObject<number>;
  commitRoom: (room: RunningMatchRoom | null) => void;
  syncServerClock: (serverNow?: string) => void;
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
  setError,
  setSaving,
}: UseRoomStartActionsInput) {
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
    if (!room || !roomUxModel.startAction.canStart) {
      if (roomUxModel.startAction.visible && roomUxModel.startAction.helperText) {
        setError(roomUxModel.startAction.helperText);
      }
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await startRunningMatchRoom({ roomId: room.roomId });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
    } catch (roomError) {
      setError(getApiErrorMessage(roomError, '방을 시작하지 못했어.'));
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!room) {
      router.back();
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await leaveRunningMatchRoom({ roomId: room.roomId });
      router.back();
    } catch (roomError) {
      setError(getApiErrorMessage(roomError, '방에서 나가지 못했어.'));
    } finally {
      setSaving(false);
    }
  };

  return {
    handleToggleReady,
    handleStart,
    handleLeave,
  };
}
