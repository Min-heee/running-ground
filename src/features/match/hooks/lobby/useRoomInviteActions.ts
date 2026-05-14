import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Alert, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import {
  joinRunningMatchRoom,
  leaveRunningMatchRoom,
} from '@/services/matchService';
import { getApiErrorMessage } from '@/services/apiError';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { MatchRoomUxModel } from '@/features/runs/lifecycle/matchRoomFlow';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { UpdateRoomSettingsInput } from '@/features/runs/types/matchRoom';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type UseRoomInviteActionsInput = {
  room: RunningMatchRoom | null;
  roomUxModel: MatchRoomUxModel;
  selectedFriendIds: string[];
  latestRoomServerNowMsRef: MutableRefObject<number>;
  commitRoom: (room: RunningMatchRoom | null) => void;
  syncServerClock: (serverNow?: string) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  saveRoomSettings: (overrides?: UpdateRoomSettingsInput) => Promise<void>;
};

export function useRoomInviteActions({
  room,
  roomUxModel,
  selectedFriendIds,
  latestRoomServerNowMsRef,
  commitRoom,
  syncServerClock,
  setError,
  setSaving,
  saveRoomSettings,
}: UseRoomInviteActionsInput) {
  const handleAcceptInvite = async () => {
    rgPerfMark('invite code input submit', {
      hasToken: Boolean(room?.inviteToken),
      roomId: room?.roomId ?? null,
      source: 'match-room invite accept',
    });

    if (!room || !roomUxModel.invite.canAccept) {
      return;
    }

    setSaving(true);
    setError(null);

    const endJoinApiTrace = rgPerfMeasureStart('room join API', {
      roomId: room.roomId,
      source: 'match-room invite accept',
    });

    try {
      const payload = await joinRunningMatchRoom({ inviteToken: room.inviteToken });
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
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
    } catch (roomError) {
      endJoinApiTrace({ success: false });
      const message = getApiErrorMessage(roomError, '초대를 수락하지 못했어.');
      rgPerfMark('room join API error', {
        message,
        roomId: room.roomId,
        source: 'match-room invite accept',
      });
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeclineInvite = async () => {
    rgPerfMark('room leave button press', {
      roomId: room?.roomId ?? null,
      source: 'match-room invite decline',
    });

    if (!room || !roomUxModel.invite.canDecline) {
      return;
    }

    setSaving(true);
    setError(null);

    const endLeaveApiTrace = rgPerfMeasureStart('room leave API', {
      roomId: room.roomId,
      source: 'match-room invite decline',
    });

    try {
      const payload = await leaveRunningMatchRoom({ roomId: room.roomId });
      endLeaveApiTrace({
        roomId: room.roomId,
        success: true,
      });
      if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
        return;
      }

      syncServerClock(payload.serverNow);
      commitRoom(payload.room);
      rgPerfMark('local room state cleared', {
        roomId: room.roomId,
        source: 'match-room invite decline',
      });
      router.replace('/(tabs)/running');
    } catch (roomError) {
      endLeaveApiTrace({ success: false });
      const message = getApiErrorMessage(roomError, '초대를 거절하지 못했어.');
      rgPerfMark('room leave API error', {
        message,
        roomId: room.roomId,
        source: 'match-room invite decline',
      });
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendFriendInvites = async () => {
    if (!room?.isHost || room.linkedMatchId) {
      return;
    }

    await saveRoomSettings({ invitedFriendIds: selectedFriendIds });
  };

  const handleCopyCode = async () => {
    if (!room) {
      return;
    }

    await Clipboard.setStringAsync(room.inviteToken);
    Alert.alert('복사 완료', `방 코드 ${room.inviteToken}를 복사했어요.`);
  };

  const handleInviteFriends = async () => {
    if (!room) {
      return;
    }

    try {
      await Share.share({
        message: `${room.mode === 'duel' ? '1대1 대결' : '그룹 대결'} 방에 같이 들어와요.\n초대 코드: ${room.inviteToken}\n링크: ${room.inviteLink}`,
      });
    } catch {
      Alert.alert('공유 실패', '지금은 친구 초대를 열지 못했어.');
    }
  };

  return {
    handleAcceptInvite,
    handleDeclineInvite,
    handleSendFriendInvites,
    handleCopyCode,
    handleInviteFriends,
  };
}
