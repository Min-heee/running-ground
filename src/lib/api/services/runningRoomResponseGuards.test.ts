import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/services/apiError';
import type { RunningMatchRoom } from '../types';
import {
  ensureRunningMatchRoomFriendInviteRecords,
  ensureRunningMatchRoomCleanupResponse,
  ensureRunningMatchRoomResponse,
  ensureJoinedRunningMatchRoomResponse,
  INVALID_FRIEND_INVITE_RESPONSE_MESSAGE,
  INVALID_CLEANUP_RESPONSE_MESSAGE,
  INVALID_ROOM_RESPONSE_MESSAGE,
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
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.userMessage, MISSING_JOINED_ROOM_MESSAGE);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingRequiredRoom');
      return true;
    },
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
      assert.equal((error.details as { code?: string; invalidReason?: string }).code, 'invalid_room_response');
      assert.equal((error.details as { code?: string; invalidReason?: string }).invalidReason, 'missingRoomId');
      return true;
    },
  );
});

test('created room response requires room id and invite token', () => {
  const validRoom = {
    roomId: 'room-1',
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
    isHost: true,
    joined: true,
    hostUserId: 'host-user',
    hostName: '테스트',
    participants: [],
    invitedFriendIds: [],
  } as NonNullable<Parameters<typeof ensureRunningMatchRoomFriendInviteRecords>[0]>;

  assert.throws(
    () => ensureRunningMatchRoomResponse({
      success: true,
      room: {
        ...validRoom,
        inviteToken: '',
      },
    } as unknown as Parameters<typeof ensureRunningMatchRoomResponse>[0], {
      action: 'create-room',
      requireRoom: true,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.userMessage, INVALID_ROOM_RESPONSE_MESSAGE);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingInviteToken');
      return true;
    },
  );
});

test('room response requires participant and invitee user ids', () => {
  const validRoom = {
    roomId: 'room-1',
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
    isHost: true,
    joined: true,
    hostUserId: 'host-user',
    hostName: '테스트',
    participants: [{
      averagePace: '5:30/km',
      districtName: '일산서구',
      invited: false,
      isHost: true,
      joinedAt: new Date().toISOString(),
      levelLabel: 'Lv.1',
      name: '방장',
      userId: 'host-user',
    }],
    invitedFriendIds: ['guest-user'],
    invitedFriends: [{
      averagePace: '5:40/km',
      districtName: '일산서구',
      levelLabel: 'Lv.1',
      name: '게스트',
      status: 'pending',
      userId: 'guest-user',
    }],
  } as NonNullable<Parameters<typeof ensureRunningMatchRoomFriendInviteRecords>[0]>;

  assert.throws(
    () => ensureRunningMatchRoomResponse({
      success: true,
      room: {
        ...validRoom,
        participants: [{
          ...validRoom.participants[0],
          userId: '',
        }],
      },
    } as unknown as Parameters<typeof ensureRunningMatchRoomResponse>[0], {
      action: 'fetch-active-room',
      requireRoom: true,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingParticipantUserId');
      return true;
    },
  );

  assert.throws(
    () => ensureRunningMatchRoomResponse({
      success: true,
      room: {
        ...validRoom,
        invitedFriends: [{
          ...validRoom.invitedFriends![0],
          userId: '',
        }],
      },
    } as unknown as Parameters<typeof ensureRunningMatchRoomResponse>[0], {
      action: 'fetch-active-room',
      requireRoom: true,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingInviteeUserId');
      return true;
    },
  );
});

test('friend invite guard returns required invite fields on success', () => {
  const room: RunningMatchRoom = {
    roomId: 'room-1',
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
    isHost: true,
    joined: true,
    hostUserId: 'host-user',
    hostName: '테스트',
    participants: [],
    invitedFriendIds: ['guest-user'],
    invitedFriends: [{
      averagePace: '5:40/km',
      districtName: '일산서구',
      inviteId: 'invite-1',
      invitedUserId: 'guest-user',
      inviteToken: 'ABC123',
      levelLabel: 'Lv.1',
      name: '게스트',
      roomId: 'room-1',
      status: 'pending',
      userId: 'guest-user',
    }],
  };

  assert.deepEqual(ensureRunningMatchRoomFriendInviteRecords(room, ['guest-user']), [{
    inviteId: 'invite-1',
    roomId: 'room-1',
    inviteToken: 'ABC123',
    invitedUserId: 'guest-user',
  }]);
});

test('friend invite guard fails when a selected friend is missing from room response', () => {
  const room: RunningMatchRoom = {
    roomId: 'room-1',
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
    isHost: true,
    joined: true,
    hostUserId: 'host-user',
    hostName: '테스트',
    participants: [],
    invitedFriendIds: [],
  };

  assert.throws(
    () => ensureRunningMatchRoomFriendInviteRecords(room, ['guest-user']),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.userMessage, INVALID_FRIEND_INVITE_RESPONSE_MESSAGE);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingFriendInvite');
      return true;
    },
  );
});

test('leave room response allows null room but still requires success true', () => {
  assert.deepEqual(
    ensureRunningMatchRoomResponse({
      success: true,
      room: null,
    }, { action: 'leave-room' }),
    {
      success: true,
      room: null,
    },
  );

  assert.throws(
    () => ensureRunningMatchRoomResponse({
      success: false,
      room: null,
    }, { action: 'leave-room' }),
    /Invalid running match room response/,
  );
});

test('cleanup-stale response requires cleanup fields and validates optional room', () => {
  assert.throws(
    () => ensureRunningMatchRoomCleanupResponse({
      success: true,
      cleaned: true,
      cleanedItems: null,
      room: null,
    } as unknown as Parameters<typeof ensureRunningMatchRoomCleanupResponse>[0]),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.userMessage, INVALID_CLEANUP_RESPONSE_MESSAGE);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingCleanupFields');
      return true;
    },
  );
});
