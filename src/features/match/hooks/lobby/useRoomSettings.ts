import { useLayoutEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { updateRunningMatchRoom } from '@/services/matchService';
import { getApiErrorMessage } from '@/services/apiError';
import type { RunningMatchRoom } from '@/lib/api/types';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { UpdateRoomSettingsInput } from '@/features/runs/types/matchRoom';

function areSameIdSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);
  return right.every((id) => leftSet.has(id));
}

type UseRoomSettingsInput = {
  room: RunningMatchRoom | null;
  latestRoomServerNowMsRef: MutableRefObject<number>;
  commitRoom: (room: RunningMatchRoom | null) => void;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
};

export function useRoomSettings({
  room,
  latestRoomServerNowMsRef,
  commitRoom,
  syncServerClock,
  setError,
  setSaving,
}: UseRoomSettingsInput) {
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [customDistanceText, setCustomDistanceText] = useState('5');

  const roomInvitedFriendIds = room?.invitedFriendIds;
  const roomDistanceKm = room?.distanceKm;
  const roomId = room?.roomId;

  useLayoutEffect(() => {
    if (!roomInvitedFriendIds || roomDistanceKm === undefined) {
      return;
    }

    setSelectedFriendIds(roomInvitedFriendIds);
    setCustomDistanceText(String(roomDistanceKm));
  }, [roomDistanceKm, roomId, roomInvitedFriendIds]);

  const hasInviteDraftChanges = room ? !areSameIdSet(selectedFriendIds, room.invitedFriendIds) : false;

  const saveRoomSettings = async (overrides: UpdateRoomSettingsInput = {}) => {
    if (!room || !room.isHost || room.linkedMatchId) {
      return null;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await updateRunningMatchRoom({
        roomId: room.roomId,
        distanceKm: overrides.distanceKm ?? room.distanceKm,
        // Party runs are always host-start now; the scheduled chooser is gone,
        // so every settings save normalizes the room onto host mode.
        startMode: 'host',
        maxParticipants: room.mode === 'group'
          ? overrides.maxParticipants ?? room.maxParticipants
          : 2,
        invitedFriendIds: overrides.invitedFriendIds ?? selectedFriendIds,
      });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return null;
      }

      syncServerClock(payload.serverNow, payload);
      commitRoom(payload.room);
      return payload.room;
    } catch (roomError) {
      setError(getApiErrorMessage(roomError, '대기실 설정을 저장하지 못했어요.'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleApplyCustomDistance = async () => {
    if (!room?.isHost) {
      return;
    }

    const nextDistanceKm = Number.parseFloat(customDistanceText);
    if (!Number.isFinite(nextDistanceKm) || nextDistanceKm < 0.5) {
      setError('거리 값을 다시 확인해주세요. 0.5km 이상 숫자로 입력하면 돼요.');
      return;
    }

    await saveRoomSettings({ distanceKm: Number(nextDistanceKm.toFixed(1)) });
  };

  return {
    selectedFriendIds,
    setSelectedFriendIds,
    customDistanceText,
    setCustomDistanceText,
    hasInviteDraftChanges,
    saveRoomSettings,
    handleApplyCustomDistance,
  };
}
