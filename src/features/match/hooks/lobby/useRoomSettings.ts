import { useLayoutEffect, useMemo, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { updateRunningMatchRoom } from '@/services/matchService';
import { getApiErrorMessage } from '@/services/apiError';
import type { RunningMatchRoom } from '@/lib/api/types';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { MatchRoomMeridiem, UpdateRoomSettingsInput } from '@/features/runs/types/matchRoom';
import {
  MATCH_ROOM_HOUR_OPTIONS,
  MATCH_ROOM_MINUTE_OPTIONS,
  buildScheduledStartAt,
  to12HourParts,
} from '@/features/runs/utils/matchRoomScheduling';

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
  const [meridiem, setMeridiem] = useState<MatchRoomMeridiem>('오전');
  const [hourIndex, setHourIndex] = useState(0);
  const [minuteIndex, setMinuteIndex] = useState(0);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [customDistanceText, setCustomDistanceText] = useState('5');

  const roomSlotStartAt = room?.slotStartAt;
  const roomInvitedFriendIds = room?.invitedFriendIds;
  const roomDistanceKm = room?.distanceKm;
  const roomId = room?.roomId;

  useLayoutEffect(() => {
    if (!roomSlotStartAt || !roomInvitedFriendIds || roomDistanceKm === undefined) {
      return;
    }

    const nextParts = to12HourParts(roomSlotStartAt);
    setMeridiem(nextParts.meridiem);
    setHourIndex(Math.max(0, MATCH_ROOM_HOUR_OPTIONS.findIndex((value) => value === nextParts.hour12)));
    setMinuteIndex(nextParts.minute);
    setSelectedFriendIds(roomInvitedFriendIds);
    setCustomDistanceText(String(roomDistanceKm));
  }, [roomDistanceKm, roomId, roomInvitedFriendIds, roomSlotStartAt]);

  const hasInviteDraftChanges = room ? !areSameIdSet(selectedFriendIds, room.invitedFriendIds) : false;
  const scheduledStartAt = useMemo(() => buildScheduledStartAt(
    meridiem,
    MATCH_ROOM_HOUR_OPTIONS[hourIndex] ?? 12,
    MATCH_ROOM_MINUTE_OPTIONS[minuteIndex] ?? 0,
  ), [hourIndex, meridiem, minuteIndex]);

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
        startMode: overrides.startMode ?? room.startMode,
        slotStartAt: overrides.startMode === 'host'
          ? undefined
          : overrides.slotStartAt ?? (room.startMode === 'scheduled' ? room.slotStartAt : scheduledStartAt),
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
      setError(getApiErrorMessage(roomError, '대기실 설정을 저장하지 못했어.'));
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
      setError('거리 값을 다시 확인해줘. 0.5km 이상 숫자로 입력하면 돼.');
      return;
    }

    await saveRoomSettings({ distanceKm: Number(nextDistanceKm.toFixed(1)) });
  };

  return {
    meridiem,
    setMeridiem,
    hourIndex,
    setHourIndex,
    minuteIndex,
    setMinuteIndex,
    selectedFriendIds,
    setSelectedFriendIds,
    customDistanceText,
    setCustomDistanceText,
    hasInviteDraftChanges,
    scheduledStartAt,
    saveRoomSettings,
    handleApplyCustomDistance,
  };
}
