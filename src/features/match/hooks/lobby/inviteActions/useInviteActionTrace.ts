import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import type { FriendInviteSelectionState } from '../roomInviteSelection';

export function useInviteActionTrace() {
  const markSkippedFriendInvite = (
    roomId: string,
    inviteSelection: FriendInviteSelectionState,
  ) => {
    rgPerfMark('friend invite skipped no selected user', {
      invitedUserId: inviteSelection.invitedUserIdLog,
      newInviteCount: inviteSelection.newInviteIds.length,
      reason: inviteSelection.skippedReason,
      roomId,
      selectedInviteCount: inviteSelection.selectedInviteCount,
    });
  };

  const beginFriendInvitePress = (
    roomId: string,
    inviteSelection: FriendInviteSelectionState,
    existingInviteIds: Set<string>,
  ) => {
    const trace = beginRgInputTrace('friend invite button press', {
      invitedUserId: inviteSelection.invitedUserIdLog,
      newInviteCount: inviteSelection.newInviteIds.length,
      roomId,
      selectedInviteCount: inviteSelection.selectedInviteCount,
    });

    rgPerfMark('friend invite button press', {
      invitedUserId: inviteSelection.invitedUserIdLog,
      newInviteCount: inviteSelection.newInviteIds.length,
      roomId,
      selectedInviteCount: inviteSelection.selectedInviteCount,
    });
    inviteSelection.normalizedSelectedFriendIds.forEach((invitedUserId) => {
      rgPerfMark('friend invite button press', {
        invitedUserId,
        isNewInvite: !existingInviteIds.has(invitedUserId),
        roomId,
      });
    });

    return trace;
  };

  const beginFriendInviteApi = (
    room: { inviteToken?: string | null; roomId: string },
    inviteSelection: FriendInviteSelectionState,
  ) => rgPerfMeasureStart('friend invite API', {
    hasInviteToken: Boolean(room.inviteToken),
    hasRoomId: Boolean(room.roomId),
    invitedUserId: inviteSelection.invitedUserIdLog,
    newInviteCount: inviteSelection.newInviteIds.length,
    roomId: room.roomId,
  });

  return {
    beginFriendInviteApi,
    beginFriendInvitePress,
    markSkippedFriendInvite,
  };
}
