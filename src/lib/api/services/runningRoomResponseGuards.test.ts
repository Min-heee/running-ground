import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/services/apiError';
import {
  ensureJoinedRunningMatchRoomResponse,
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
    /참여할 방 정보를 확인하지 못했어/,
  );
});
