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
      blockerDetails: {
        roomId: 'duel-room-deleted',
      },
      blockerSource: 'matchRooms.participant',
      message: '이미 참여 중인 방이 있어요.',
    },
  });

  assert.deepEqual(getRunningMatchBlockerFromError(error), {
    blocker: 'activeRoom',
    blockerSource: 'matchRooms.participant',
    code: null,
    isPartyRun: false,
    matchId: null,
    message: '이미 참여 중인 방이 있어요.',
    roomId: 'duel-room-deleted',
  });

  // 파티런 예약이 막는 경우(2026-09-10): 자동 복구가 강제 이탈하지 않도록 표시가 살아 온다.
  const partyError = new ApiError('request', '이미 예약된 파티런이 있어요.', {
    details: {
      blocker: 'matchSession',
      blockerDetails: { sessionId: 'party-match-1', isPartyRun: true },
      blockerSource: 'matchSessions.activeParticipant',
      message: '이미 예약된 파티런이 있어요.',
    },
  });
  const partyBlocker = getRunningMatchBlockerFromError(partyError);
  assert.equal(partyBlocker?.isPartyRun, true);
  assert.equal(partyBlocker?.matchId, 'party-match-1');
});

test('running match blocker extracts match ids from blocker details', () => {
  const sessionError = new ApiError('request', '이미 참여 중인 매치가 있어요.', {
    details: {
      blocker: 'matchSession',
      blockerDetails: {
        sessionId: 'match-session-1',
      },
      blockerSource: 'matchSessions.activeParticipant',
      message: '이미 참여 중인 매치가 있어요.',
    },
  });
  const linkedRoomError = new ApiError('request', '이미 참여 중인 방이 있어요.', {
    details: {
      blocker: 'activeRoom',
      blockerDetails: {
        linkedMatchId: 'linked-match-1',
        roomId: 'room-1',
      },
      blockerSource: 'matchRooms.participant',
      message: '이미 참여 중인 방이 있어요.',
    },
  });

  assert.equal(getRunningMatchBlockerFromError(sessionError)?.matchId, 'match-session-1');
  assert.equal(getRunningMatchBlockerFromError(linkedRoomError)?.matchId, 'linked-match-1');
});

test('non-blocker API errors do not trigger stale cleanup retry', () => {
  const error = new ApiError('request', '참여할 방을 찾지 못했어요.', {
    details: {
      message: '참여할 방을 찾지 못했어요.',
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
  const validationError = new ApiError('request', '초대 코드를 확인해주세요.', {
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
