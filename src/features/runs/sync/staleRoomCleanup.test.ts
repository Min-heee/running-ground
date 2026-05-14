import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoomCleanupResponse } from '@/lib/api/types';
import { ApiError } from '@/services/apiError';
import {
  getRunningMatchBlockerFromError,
  runStaleRoomCleanupWithTimeout,
  shouldRunBlockingStaleRoomCleanupForError,
} from './staleRoomCleanup';

const emptyCleanup: RunningMatchRoomCleanupResponse = {
  cleaned: false,
  cleanedItems: [],
  room: null,
  success: true,
};

test('running match blocker details are detected from API errors', () => {
  const error = new ApiError('request', '이미 참여 중인 방이 있어요.', {
    details: {
      blocker: 'activeRoom',
      blockerSource: 'matchRooms.participant',
      message: '이미 참여 중인 방이 있어요.',
    },
  });

  assert.deepEqual(getRunningMatchBlockerFromError(error), {
    blocker: 'activeRoom',
    blockerSource: 'matchRooms.participant',
    code: null,
    message: '이미 참여 중인 방이 있어요.',
  });
});

test('non-blocker API errors do not trigger stale cleanup retry', () => {
  const error = new ApiError('request', '참여할 방을 찾지 못했어.', {
    details: {
      message: '참여할 방을 찾지 못했어.',
    },
  });

  assert.equal(getRunningMatchBlockerFromError(error), null);
});

test('blocking stale cleanup is only selected for blocker errors', () => {
  const blockerError = new ApiError('request', '이미 참여 중인 방이 있어요.', {
    details: {
      blocker: 'activeRoom',
      blockerSource: 'matchSessions.activeParticipant',
      code: 'already_joined',
    },
  });
  const validationError = new ApiError('request', '초대 코드를 확인해줘.', {
    details: {
      code: 'invalid_invite_token',
    },
  });

  assert.equal(shouldRunBlockingStaleRoomCleanupForError(blockerError), true);
  assert.equal(shouldRunBlockingStaleRoomCleanupForError(validationError), false);
});

test('stale room cleanup timeout returns without waiting forever', async () => {
  const outcome = await runStaleRoomCleanupWithTimeout({
    cleanup: () => new Promise<RunningMatchRoomCleanupResponse>((resolve) => {
      setTimeout(() => resolve(emptyCleanup), 50);
    }),
    source: 'test cleanup timeout',
    timeoutMs: 1,
  });

  assert.equal(outcome.status, 'timeout');
});
