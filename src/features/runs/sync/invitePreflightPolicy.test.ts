import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearMatchRoomDeletedTombstone,
  markMatchRoomDeleted,
  resetMatchRoomDeletionTombstonesForTest,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import {
  MANUAL_INVITE_JOIN_PREFLIGHT_SOURCE,
  MANUAL_INVITE_JOIN_RETRY_PREFLIGHT_SOURCE,
  resolveManualInviteJoinPreflightDecision,
  runManualInviteJoinPreflight,
  runManualInviteJoinRetryPreflight,
} from './invitePreflightPolicy';

test('manual invite preflight skips cleanup blocker when no local active room exists', () => {
  resetMatchRoomDeletionTombstonesForTest();

  const decision = resolveManualInviteJoinPreflightDecision({
    inviteToken: ' ab12cd ',
    matchRoom: null,
    visibleMatchRoom: null,
  });

  assert.equal(decision.hasLocalBlocker, false);
  assert.equal(decision.shouldLogDeferredCleanup, true);
  assert.equal(decision.inviteTokenLength, 6);
  assert.equal(decision.source, MANUAL_INVITE_JOIN_PREFLIGHT_SOURCE);
});

test('manual invite preflight treats active room result as a blocker', () => {
  resetMatchRoomDeletionTombstonesForTest();

  const decision = resolveManualInviteJoinPreflightDecision({
    inviteToken: 'ROOM77',
    matchRoom: {
      roomId: 'duel-room-active',
    },
    visibleMatchRoom: null,
  });

  assert.equal(decision.hasLocalBlocker, true);
  assert.equal(decision.shouldLogDeferredCleanup, false);
});

test('manual invite preflight ignores deleted blocker room ids', () => {
  resetMatchRoomDeletionTombstonesForTest();
  markMatchRoomDeleted('duel-room-deleted', 'test deleted blocker');

  const decision = resolveManualInviteJoinPreflightDecision({
    inviteToken: 'ROOM88',
    matchRoom: {
      roomId: 'duel-room-deleted',
    },
    visibleMatchRoom: null,
  });

  assert.equal(decision.hasLocalBlocker, false);
  assert.equal(decision.shouldLogDeferredCleanup, true);

  clearMatchRoomDeletedTombstone('duel-room-deleted', 'test cleanup');
});

test('manual invite preflight returns a structured failure result for active blockers', async () => {
  resetMatchRoomDeletionTombstonesForTest();
  const calls: { inviteToken?: string; source: string; forceCleanup?: boolean }[] = [];

  const result = await runManualInviteJoinPreflight({
    inviteToken: 'BLOCK1',
    matchRoom: {
      roomId: 'duel-room-active',
    },
    prepareMatchRoomMutation: async (input) => {
      calls.push(input);
      return false;
    },
    visibleMatchRoom: null,
  });

  assert.equal(result.canProceed, false);
  assert.equal(result.source, MANUAL_INVITE_JOIN_PREFLIGHT_SOURCE);
  assert.equal(result.decision.hasLocalBlocker, true);
  assert.deepEqual(calls, [{
    inviteToken: 'BLOCK1',
    source: MANUAL_INVITE_JOIN_PREFLIGHT_SOURCE,
  }]);
});

test('manual invite retry preflight models cleanup retry contract explicitly', async () => {
  const calls: { inviteToken?: string; source: string; forceCleanup?: boolean }[] = [];

  const result = await runManualInviteJoinRetryPreflight({
    inviteToken: 'retry1',
    prepareMatchRoomMutation: async (input) => {
      calls.push(input);
      return true;
    },
  });

  assert.equal(result.canRetry, true);
  assert.equal(result.source, MANUAL_INVITE_JOIN_RETRY_PREFLIGHT_SOURCE);
  assert.deepEqual(calls, [{
    forceCleanup: true,
    inviteToken: 'retry1',
    source: MANUAL_INVITE_JOIN_RETRY_PREFLIGHT_SOURCE,
  }]);
});
