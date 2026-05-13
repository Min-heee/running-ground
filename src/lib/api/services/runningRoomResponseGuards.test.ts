import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/services/apiError';
import {
  ensureJoinedRunningMatchRoomResponse,
  MISSING_JOINED_ROOM_MESSAGE,
  shouldFallbackToLocalRunningRoomApi,
} from './runningRoomResponseGuards';

test('room API fallback does not mask a real missing invite room response', () => {
  const error = new ApiError('request', '참여할 방을 찾지 못했어.', {
    status: 404,
    userMessage: '참여할 방을 찾지 못했어.',
  });

  assert.equal(shouldFallbackToLocalRunningRoomApi(error), false);
});

test('room API fallback still allows legacy missing endpoint responses', () => {
  const error = new ApiError('request', '요청한 API를 찾을 수 없어.', {
    status: 404,
    userMessage: '요청한 API를 찾을 수 없어.',
  });

  assert.equal(shouldFallbackToLocalRunningRoomApi(error), true);
});

test('joined room response requires a concrete room id', () => {
  assert.throws(
    () => ensureJoinedRunningMatchRoomResponse({
      success: true,
      serverNow: new Date().toISOString(),
      room: null,
    }),
    new RegExp(MISSING_JOINED_ROOM_MESSAGE),
  );
});

test('joined room response treats success without roomId as a failed response', () => {
  assert.throws(
    () => ensureJoinedRunningMatchRoomResponse({
      success: true,
      serverNow: new Date().toISOString(),
      room: {
        roomId: null,
        inviteToken: 'ABC123',
        inviteLink: 'runningground://running?roomInviteToken=ABC123',
        mode: 'duel',
        state: 'waiting',
        startMode: 'host',
        distanceKm: 5,
        slotStartAt: new Date().toISOString(),
        slotLabel: '지금',
        maxParticipants: 2,
        minParticipants: 2,
        canStart: false,
        isHost: false,
        joined: true,
        hostUserId: 'host-user',
        hostName: '테스트',
        participants: [],
        invitedFriendIds: [],
      } as unknown as NonNullable<Parameters<typeof ensureJoinedRunningMatchRoomResponse>[0]['room']>,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.userMessage, MISSING_JOINED_ROOM_MESSAGE);
      assert.equal((error.details as { success?: boolean; invalidReason?: string }).success, false);
      assert.equal((error.details as { success?: boolean; invalidReason?: string }).invalidReason, 'missingRoomId');
      return true;
    },
  );
});
