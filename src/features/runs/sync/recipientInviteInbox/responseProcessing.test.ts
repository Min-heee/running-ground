import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom, RunningMatchRoomResponse } from '@/lib/api/types';
import {
  buildRecipientInviteInboxDisplayedTraceEvents,
  buildRecipientInviteInboxDuplicateTraceEvent,
  buildRecipientInviteInboxNoEventTraceEvents,
  buildRecipientInviteInboxSuccessTraceEvents,
  processRecipientInviteResponse,
  shouldCommitRecipientInviteRoom,
} from './responseProcessing';

function room(overrides: Partial<RunningMatchRoom> = {}): RunningMatchRoom {
  return {
    roomId: 'room-1',
    inviteToken: 'ABC123',
    inviteLink: 'runningground://running?roomInviteToken=ABC123',
    mode: 'duel',
    state: 'waiting',
    startMode: 'host',
    distanceKm: 5,
    slotStartAt: new Date().toISOString(),
    slotLabel: '방장 시작',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: false,
    joined: false,
    hostUserId: 'host-user',
    hostName: '방장',
    participants: [],
    invitedFriendIds: ['guest-user'],
    invitedFriends: [{
      averagePace: '06:20/km',
      districtName: '일산서구',
      inviteId: 'invite-1',
      invitedUserId: 'guest-user',
      inviteToken: 'ABC123',
      levelLabel: 'Lv.1',
      name: '초대친구',
      roomId: 'room-1',
      status: 'pending',
      tag: '#GUEST',
      userId: 'guest-user',
    }],
    ...overrides,
  };
}

function response(nextRoom: RunningMatchRoom | null): RunningMatchRoomResponse {
  return {
    room: nextRoom,
    serverNow: new Date().toISOString(),
    success: true,
  };
}

test('recipient invite response processing builds commit and display model for pending invite', () => {
  const payload = response(room());
  const model = processRecipientInviteResponse({
    currentUserId: 'guest-user',
    payload,
    previousInviteKey: null,
    source: 'focus',
  });

  assert.equal(model.inviteResult.pendingCount, 1);
  assert.equal(model.inviteResult.shouldDisplay, true);
  assert.equal(model.recipientMatchType, 'internal-id');
  assert.equal(shouldCommitRecipientInviteRoom(model), true);

  const successEvents = buildRecipientInviteInboxSuccessTraceEvents({
    currentUserId: 'guest-user',
    model,
    payload,
    source: 'focus',
  });
  assert.ok(successEvents.some((event) => event.name === 'invite inbox pending count'));
  assert.ok(successEvents.some((event) => event.name === 'invite inbox receiver pending invite found'));

  assert.deepEqual(buildRecipientInviteInboxDisplayedTraceEvents(model).map((event) => event.name), [
    'invite received',
    'invite card displayed',
    'invite card displayed from receiver fallback',
  ]);
});

test('recipient invite response processing preserves duplicate skip without committing different semantics', () => {
  const payload = response(room());
  const firstModel = processRecipientInviteResponse({
    currentUserId: 'guest-user',
    payload,
    previousInviteKey: null,
    source: 'focus',
  });
  const duplicateModel = processRecipientInviteResponse({
    currentUserId: 'guest-user',
    payload,
    previousInviteKey: firstModel.inviteResult.event?.key ?? null,
    source: 'focus',
  });

  assert.equal(duplicateModel.inviteResult.shouldDisplay, false);
  assert.equal(duplicateModel.inviteResult.skippedReason, 'duplicate-invite');
  assert.equal(shouldCommitRecipientInviteRoom(duplicateModel), true);

  const duplicateTrace = buildRecipientInviteInboxDuplicateTraceEvent({
    currentUserId: 'guest-user',
    model: duplicateModel,
    source: 'focus',
  });

  assert.equal(duplicateTrace?.name, 'invite card display skipped reason');
  assert.equal(duplicateTrace?.payload.reason, 'duplicate-invite');
});

test('recipient invite response processing suppresses repeated already-joined logs by caller decision', () => {
  const payload = response(room({ joined: true }));
  const model = processRecipientInviteResponse({
    currentUserId: 'guest-user',
    payload,
    previousInviteKey: null,
    source: 'focus',
  });

  assert.equal(model.inviteResult.event, null);
  assert.equal(model.alreadyJoinedSkipKey, 'room-1:focus:guest-user');
  assert.equal(shouldCommitRecipientInviteRoom(model), false);

  assert.deepEqual(buildRecipientInviteInboxNoEventTraceEvents({
    currentUserId: 'guest-user',
    isAlreadyJoinedSuppressed: false,
    model,
    payload,
    source: 'focus',
  }).map((event) => event.name), [
    'invite card skipped already joined',
    'invite card display skipped reason',
  ]);

  assert.deepEqual(buildRecipientInviteInboxNoEventTraceEvents({
    currentUserId: 'guest-user',
    isAlreadyJoinedSuppressed: true,
    model,
    payload,
    source: 'focus',
  }).map((event) => event.name), [
    'invite inbox already joined check suppressed',
    'invite card display skipped reason',
  ]);
});
