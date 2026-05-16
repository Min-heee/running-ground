import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveNonDeletedActiveRoomId,
  resolveTrackRunIdleActiveRoomCheckPolicy,
} from './useTrackRunIdleViewModel';
import {
  markMatchRoomDeleted,
  resetMatchRoomDeletionTombstonesForTest,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';

test('idle active room check is skipped without local active room or match hint', () => {
  const policy = resolveTrackRunIdleActiveRoomCheckPolicy({
    forceOpenActiveMatch: false,
    hasInviteToken: false,
    hasLocalActiveHint: false,
    hasPendingAction: false,
    mode: 'tab',
    trackingStatus: 'idle',
  });

  assert.equal(policy.activeRoomCheckPriority, 'low-priority');
  assert.equal(policy.isIdleTabRuntime, true);
  assert.equal(policy.shouldRunActiveRoomCheck, false);
});

test('idle active room check runs only when a local active hint exists', () => {
  const policy = resolveTrackRunIdleActiveRoomCheckPolicy({
    forceOpenActiveMatch: false,
    hasInviteToken: false,
    hasLocalActiveHint: true,
    hasPendingAction: false,
    mode: 'tab',
    trackingStatus: 'idle',
  });

  assert.equal(policy.activeRoomCheckPriority, 'low-priority');
  assert.equal(policy.isIdleTabRuntime, false);
  assert.equal(policy.shouldRunActiveRoomCheck, true);
});

test('idle active room check is suppressed while user actions are pending', () => {
  const policy = resolveTrackRunIdleActiveRoomCheckPolicy({
    forceOpenActiveMatch: false,
    hasInviteToken: false,
    hasLocalActiveHint: true,
    hasPendingAction: true,
    mode: 'tab',
    trackingStatus: 'idle',
  });

  assert.equal(policy.activeRoomCheckPriority, 'normal');
  assert.equal(policy.shouldRunActiveRoomCheck, false);
});

test('idle local active hint ignores a deleted room id', () => {
  resetMatchRoomDeletionTombstonesForTest();
  markMatchRoomDeleted('room-deleted', 'test delete');

  assert.equal(resolveNonDeletedActiveRoomId('room-deleted'), null);
  assert.equal(resolveNonDeletedActiveRoomId('room-deleted', 'room-new'), 'room-new');
});
