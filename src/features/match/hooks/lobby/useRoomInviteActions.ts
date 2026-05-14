import { useRef } from 'react';
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
import { ensureRunningMatchRoomFriendInviteRecords } from '@/lib/api/services/runningRoomResponseGuards';
import type { MatchRoomUxModel } from '@/features/runs/lifecycle/matchRoomFlow';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { UpdateRoomSettingsInput } from '@/features/runs/types/matchRoom';
import { beginRgInputTrace, waitForRgInputFeedbackFrame } from '@/utils/rgInputTrace';
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
  saveRoomSettings: (overrides?: UpdateRoomSettingsInput) => Promise<RunningMatchRoom | null>;
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
  const acceptInviteInFlightRef = useRef(false);
  const declineInviteInFlightRef = useRef(false);
  const sendFriendInvitesInFlightRef = useRef(false);

  const handleAcceptInvite = async () => {
    rgPerfMark('invite code input submit', {
      hasToken: Boolean(room?.inviteToken),
      roomId: room?.roomId ?? null,
      source: 'match-room invite accept',
    });

    if (!room || !roomUxModel.invite.canAccept) {
      return;
    }

    if (acceptInviteInFlightRef.current) {
      return;
    }

    const inputTrace = beginRgInputTrace('invite code input submit', {
      hasToken: Boolean(room.inviteToken),
      roomId: room.roomId,
      source: 'match-room invite accept',
    });

    acceptInviteInFlightRef.current = true;
    setSaving(true);
    setError(null);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'match-room invite accept',
    });

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
      acceptInviteInFlightRef.current = false;
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

    if (declineInviteInFlightRef.current) {
      return;
    }

    const inputTrace = beginRgInputTrace('room leave button press', {
      roomId: room.roomId,
      source: 'match-room invite decline',
    });

    declineInviteInFlightRef.current = true;
    setSaving(true);
    setError(null);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'match-room invite decline',
    });

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
      declineInviteInFlightRef.current = false;
      setSaving(false);
    }
  };

  const handleSendFriendInvites = async () => {
    if (!room?.isHost || room.linkedMatchId) {
      return;
    }

    if (sendFriendInvitesInFlightRef.current) {
      return;
    }

    const existingInviteIds = new Set(room.invitedFriendIds);
    const newInviteIds = selectedFriendIds.filter((friendId) => !existingInviteIds.has(friendId));
    const invitedUserIdLog = selectedFriendIds.join(',');
    const inputTrace = beginRgInputTrace('friend invite button press', {
      invitedUserId: invitedUserIdLog || null,
      newInviteCount: newInviteIds.length,
      roomId: room.roomId,
      selectedInviteCount: selectedFriendIds.length,
    });

    rgPerfMark('friend invite button press', {
      invitedUserId: invitedUserIdLog || null,
      newInviteCount: newInviteIds.length,
      roomId: room.roomId,
      selectedInviteCount: selectedFriendIds.length,
    });
    selectedFriendIds.forEach((invitedUserId) => {
      rgPerfMark('friend invite button press', {
        invitedUserId,
        isNewInvite: !existingInviteIds.has(invitedUserId),
        roomId: room.roomId,
      });
    });

    sendFriendInvitesInFlightRef.current = true;
    setSaving(true);
    setError(null);
    inputTrace.markFeedbackCommitted({
      disabled: true,
      loading: true,
    });
    await waitForRgInputFeedbackFrame();
    inputTrace.markApiStarted({
      source: 'match-room friend invite',
    });

    const endInviteApiTrace = rgPerfMeasureStart('friend invite API', {
      hasInviteToken: Boolean(room.inviteToken),
      hasRoomId: Boolean(room.roomId),
      invitedUserId: invitedUserIdLog || null,
      newInviteCount: newInviteIds.length,
      roomId: room.roomId,
    });

    try {
      const nextRoom = await saveRoomSettings({ invitedFriendIds: selectedFriendIds });
      if (!nextRoom) {
        endInviteApiTrace({
          reason: 'missing room response',
          success: false,
        });
        rgPerfMark('friend invite API error', {
          invitedUserId: invitedUserIdLog || null,
          reason: 'missing room response',
          roomId: room.roomId,
        });
        setError('친구 초대 정보를 확인하지 못했습니다. 다시 시도해주세요.');
        return;
      }

      const inviteRecords = ensureRunningMatchRoomFriendInviteRecords(nextRoom, selectedFriendIds);
      inviteRecords.forEach((record) => {
        rgPerfMark('friend invite API end', {
          inviteId: record.inviteId,
          inviteTokenGenerated: Boolean(record.inviteToken),
          invitedUserId: record.invitedUserId,
          roomId: record.roomId,
          success: true,
        });
      });
      endInviteApiTrace({
        inviteCount: inviteRecords.length,
        success: true,
      });
    } catch (inviteError) {
      const message = getApiErrorMessage(inviteError, '친구 초대를 보내지 못했어.');
      endInviteApiTrace({
        message,
        success: false,
      });
      rgPerfMark('friend invite API error', {
        invitedUserId: invitedUserIdLog || null,
        message,
        roomId: room.roomId,
      });
      setError(message);
    } finally {
      sendFriendInvitesInFlightRef.current = false;
      setSaving(false);
    }
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
