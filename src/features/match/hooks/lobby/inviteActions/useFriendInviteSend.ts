import { useRef } from 'react';
import { getApiErrorMessage } from '@/services/apiError';
import { waitForRgInputFeedbackFrame } from '@/utils/rgInputTrace';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { ensureFriendInvitePayload } from './invitePayloadGuard';
import { useInviteActionTrace } from './useInviteActionTrace';
import { useInviteSelectionGuard } from './useInviteSelectionGuard';
import type { RoomInviteActionSharedInput } from './types';

export function useFriendInviteSend({
  room,
  selectedFriendIds,
  setError,
  setSaving,
  saveRoomSettings,
}: Pick<
  RoomInviteActionSharedInput,
  | 'room'
  | 'selectedFriendIds'
  | 'setError'
  | 'setSaving'
  | 'saveRoomSettings'
>) {
  const sendFriendInvitesInFlightRef = useRef(false);
  const {
    beginFriendInviteApi,
    beginFriendInvitePress,
    markSkippedFriendInvite,
  } = useInviteActionTrace();
  const {
    buildFriendInviteSubmitGuard,
  } = useInviteSelectionGuard();

  const handleSendFriendInvites = async () => {
    if (!room?.isHost || room.linkedMatchId) {
      return;
    }

    if (sendFriendInvitesInFlightRef.current) {
      return;
    }

    const inviteSelection = buildFriendInviteSubmitGuard({
      existingInviteIds: room.invitedFriendIds,
      selectedFriendIds,
    });
    const invitedUserIdLog = inviteSelection.invitedUserIdLog;

    if (!inviteSelection.canSubmit) {
      markSkippedFriendInvite(room.roomId, inviteSelection);
      return;
    }

    const existingInviteIds = new Set(room.invitedFriendIds);
    const inputTrace = beginFriendInvitePress(room.roomId, inviteSelection, existingInviteIds);

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

    const endInviteApiTrace = beginFriendInviteApi(room, inviteSelection);

    try {
      const nextRoom = await saveRoomSettings({ invitedFriendIds: inviteSelection.normalizedSelectedFriendIds });
      if (!nextRoom) {
        endInviteApiTrace({
          reason: 'missing room response',
          success: false,
        });
        rgPerfMark('friend invite API error', {
          invitedUserId: invitedUserIdLog,
          reason: 'missing room response',
          roomId: room.roomId,
        });
        // saveRoomSettings가 API 오류로 null을 줬다면 구체적인 서버 메시지(예: '친구 목록에 있는 러너만
        // 방에 초대할 수 있어요.')를 이미 띄웠다 — 일반 문구로 덮어쓰지 않는다.
        setError((current) => current ?? '친구 초대 정보를 확인하지 못했습니다. 다시 시도해주세요.');
        return;
      }

      const inviteRecords = ensureFriendInvitePayload(nextRoom, inviteSelection.normalizedSelectedFriendIds);
      inviteRecords.forEach((record) => {
        rgPerfMark('friend invite created payload', {
          inviteId: record.inviteId,
          inviteTokenGenerated: Boolean(record.inviteToken),
          invitedUserId: record.invitedUserId,
          roomId: record.roomId,
        });
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
      const message = getApiErrorMessage(inviteError, '친구 초대를 보내지 못했어요.');
      endInviteApiTrace({
        message,
        success: false,
      });
      rgPerfMark('friend invite API error', {
        invitedUserId: invitedUserIdLog,
        message,
        roomId: room.roomId,
      });
      setError(message);
    } finally {
      sendFriendInvitesInFlightRef.current = false;
      setSaving(false);
    }
  };

  return {
    handleSendFriendInvites,
  };
}
