import { buildFriendInviteSelectionState } from '../roomInviteSelection';

export type FriendInviteSubmitGuardResult = ReturnType<typeof buildFriendInviteSelectionState> & {
  canSubmit: boolean;
};

export function buildFriendInviteSubmitGuard({
  existingInviteIds,
  selectedFriendIds,
}: {
  existingInviteIds: string[];
  selectedFriendIds: string[];
}): FriendInviteSubmitGuardResult {
  const selection = buildFriendInviteSelectionState({
    existingInviteIds,
    selectedFriendIds,
  });

  return {
    ...selection,
    canSubmit: Boolean(
      selection.shouldSend
      && selection.selectedInviteCount > 0
      && selection.invitedUserIdLog
      && selection.newInviteIds.length > 0
    ),
  };
}

export function useInviteSelectionGuard() {
  return {
    buildFriendInviteSubmitGuard,
  };
}
