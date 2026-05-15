import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFriendInviteSelectionState } from './roomInviteSelection';

test('friend invite selection allows new selected users', () => {
  const result = buildFriendInviteSelectionState({
    existingInviteIds: ['existing-user'],
    selectedFriendIds: ['existing-user', 'new-user'],
  });

  assert.equal(result.shouldSend, true);
  assert.equal(result.selectedInviteCount, 2);
  assert.deepEqual(result.newInviteIds, ['new-user']);
  assert.equal(result.invitedUserIdLog, 'existing-user,new-user');
});

test('friend invite selection skips API when no user is selected', () => {
  const result = buildFriendInviteSelectionState({
    existingInviteIds: [],
    selectedFriendIds: [],
  });

  assert.equal(result.shouldSend, false);
  assert.equal(result.selectedInviteCount, 0);
  assert.deepEqual(result.newInviteIds, []);
  assert.equal(result.invitedUserIdLog, null);
  assert.equal(result.skippedReason, 'no-selected-user');
});

test('friend invite selection skips API when selected users are already invited', () => {
  const result = buildFriendInviteSelectionState({
    existingInviteIds: ['guest-user'],
    selectedFriendIds: ['guest-user'],
  });

  assert.equal(result.shouldSend, false);
  assert.equal(result.selectedInviteCount, 1);
  assert.deepEqual(result.newInviteIds, []);
  assert.equal(result.invitedUserIdLog, 'guest-user');
  assert.equal(result.skippedReason, 'no-new-invite');
});
