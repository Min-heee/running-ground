export type FriendInviteSelectionState = {
  invitedUserIdLog: string | null;
  newInviteIds: string[];
  normalizedSelectedFriendIds: string[];
  selectedInviteCount: number;
  shouldSend: boolean;
  skippedReason: 'no-selected-user' | 'no-new-invite' | null;
};

function normalizeUserIds(userIds: string[]) {
  return [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))];
}

export function buildFriendInviteSelectionState({
  existingInviteIds,
  selectedFriendIds,
}: {
  existingInviteIds: string[];
  selectedFriendIds: string[];
}): FriendInviteSelectionState {
  const normalizedSelectedFriendIds = normalizeUserIds(selectedFriendIds);
  const existingInviteIdSet = new Set(normalizeUserIds(existingInviteIds));
  const newInviteIds = normalizedSelectedFriendIds.filter((friendId) => !existingInviteIdSet.has(friendId));
  const selectedInviteCount = normalizedSelectedFriendIds.length;

  if (selectedInviteCount === 0) {
    return {
      invitedUserIdLog: null,
      newInviteIds,
      normalizedSelectedFriendIds,
      selectedInviteCount,
      shouldSend: false,
      skippedReason: 'no-selected-user',
    };
  }

  if (newInviteIds.length === 0) {
    return {
      invitedUserIdLog: normalizedSelectedFriendIds.join(','),
      newInviteIds,
      normalizedSelectedFriendIds,
      selectedInviteCount,
      shouldSend: false,
      skippedReason: 'no-new-invite',
    };
  }

  return {
    invitedUserIdLog: normalizedSelectedFriendIds.join(','),
    newInviteIds,
    normalizedSelectedFriendIds,
    selectedInviteCount,
    shouldSend: true,
    skippedReason: null,
  };
}
