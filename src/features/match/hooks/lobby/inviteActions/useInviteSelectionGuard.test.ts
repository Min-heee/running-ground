import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFriendInviteSubmitGuard } from './useInviteSelectionGuard';

test('friend invite submit guard blocks API when no user is selected', () => {
  const guard = buildFriendInviteSubmitGuard({
    existingInviteIds: [],
    selectedFriendIds: [],
  });

  assert.equal(guard.canSubmit, false);
  assert.equal(guard.selectedInviteCount, 0);
  assert.equal(guard.invitedUserIdLog, null);
  assert.equal(guard.skippedReason, 'no-selected-user');
});

test('friend invite submit guard blocks API when invitedUserId log is null', () => {
  const guard = buildFriendInviteSubmitGuard({
    existingInviteIds: [],
    selectedFriendIds: [' ', ''],
  });

  assert.equal(guard.canSubmit, false);
  assert.equal(guard.selectedInviteCount, 0);
  assert.equal(guard.invitedUserIdLog, null);
});

test('friend invite submit guard allows only new selected invitees', () => {
  const guard = buildFriendInviteSubmitGuard({
    existingInviteIds: ['already-invited'],
    selectedFriendIds: ['already-invited', 'new-user', 'new-user'],
  });

  assert.equal(guard.canSubmit, true);
  assert.equal(guard.selectedInviteCount, 2);
  assert.deepEqual(guard.newInviteIds, ['new-user']);
  assert.equal(guard.invitedUserIdLog, 'already-invited,new-user');
});
