import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoomResponse } from '@/lib/api/types';
import {
  getActiveRoomCheckResultSkipReason,
  mapCompletedActiveRoomCheckForCaller,
} from './activeRoomCheckResultPolicy';
import type { CompletedActiveRoomCheck } from './activeRoomCheckTypes';

function payload(roomId: string, linkedMatchId?: string): RunningMatchRoomResponse {
  return {
    room: {
      canStart: false,
      distanceKm: 5,
      hostName: 'Host',
      hostUserId: 'host',
      inviteLink: 'runningground://running?roomInviteToken=ABC123',
      inviteToken: 'ABC123',
      invitedFriendIds: [],
      isHost: true,
      linkedMatchId,
      maxParticipants: 2,
      minParticipants: 2,
      mode: 'duel',
      participants: [],
      roomId,
      slotLabel: '지금',
      slotStartAt: new Date().toISOString(),
      startMode: 'host',
      state: 'waiting',
    },
    serverNow: new Date().toISOString(),
    success: true,
  };
}

function completedCheck(overrides: Partial<CompletedActiveRoomCheck> = {}): CompletedActiveRoomCheck {
  return {
    aborted: false,
    completedAtMs: 200,
    durationMs: 100,
    generation: 1,
    payload: payload('room-1'),
    requestId: 'match-room-snapshot-1',
    routeKey: 'track-run:duel:room-1:no-match:page-0',
    source: 'match-room snapshot',
    stale: false,
    startedAtMs: 100,
    ...overrides,
  };
}

test('active room check result mapper returns timed-out stale result after abort', () => {
  const result = mapCompletedActiveRoomCheckForCaller(completedCheck({
    aborted: true,
    payload: null,
    stale: true,
  }), {
    reused: true,
    skipped: false,
    uiTimeoutMs: 3_000,
  });

  assert.equal(result.payload, null);
  assert.equal(result.reused, true);
  assert.equal(result.stale, true);
  assert.equal(result.timedOut, true);
});

test('active room check stale policy ignores route key mismatches', () => {
  const result = mapCompletedActiveRoomCheckForCaller(completedCheck(), {
    reused: false,
    skipped: false,
    uiTimeoutMs: 3_000,
  });

  assert.equal(getActiveRoomCheckResultSkipReason({
    currentRouteKey: 'track-run:duel:room-2:match-1:arena',
    result,
  }), 'route-changed');
});

test('active room check stale policy ignores waiting room result after live mount', () => {
  const result = mapCompletedActiveRoomCheckForCaller(completedCheck({
    payload: payload('room-1', 'match-1'),
    routeKey: 'track-run:duel:room-1:match-1:arena',
  }), {
    reused: false,
    skipped: false,
    uiTimeoutMs: 3_000,
  });

  assert.equal(getActiveRoomCheckResultSkipReason({
    currentMatchId: 'match-1',
    currentRouteKey: 'track-run:duel:room-1:match-1:arena',
    isLiveMatchMounted: true,
    result,
  }), 'live-match-mounted');
});
