import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoomResponse } from '@/lib/api/types';
import {
  getActiveRoomCheckResultSkipReason,
  resetActiveRoomCheckForTest,
  runActiveRoomCheck,
} from './activeRoomCheck';

function response(roomId: string | null): RunningMatchRoomResponse {
  return {
    success: true,
    serverNow: new Date().toISOString(),
    room: roomId
      ? {
          canStart: false,
          distanceKm: 5,
          hostName: '테스트',
          hostUserId: 'host',
          inviteLink: 'runningground://running?roomInviteToken=ABC123',
          inviteToken: 'ABC123',
          invitedFriendIds: [],
          isHost: true,
          maxParticipants: 2,
          minParticipants: 2,
          mode: 'duel',
          participants: [],
          roomId,
          slotLabel: '지금',
          slotStartAt: new Date().toISOString(),
          startMode: 'host',
          state: 'waiting',
        }
      : null,
  };
}

test('active room check reuses an in-flight request for duplicate callers', async () => {
  resetActiveRoomCheckForTest();

  let resolveFetch: ((value: RunningMatchRoomResponse) => void) | null = null;
  let fetchCount = 0;
  const fetcher = () => {
    fetchCount += 1;
    return new Promise<RunningMatchRoomResponse>((resolve) => {
      resolveFetch = resolve;
    });
  };

  const firstPromise = runActiveRoomCheck({ fetcher, source: 'track-run experience' });
  const secondPromise = runActiveRoomCheck({ fetcher, source: 'match-room snapshot' });

  await Promise.resolve();
  assert.equal(fetchCount, 1);
  assert.ok(resolveFetch);
  const resolveActiveFetch = resolveFetch as (value: RunningMatchRoomResponse) => void;
  resolveActiveFetch(response('room-1'));

  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  assert.ok(first.payload);
  assert.ok(second.payload);
  assert.equal(first.payload.room?.roomId, 'room-1');
  assert.equal(second.payload.room?.roomId, 'room-1');
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.requestId, second.requestId);
});

test('active room check throttles repeated source calls after a completed request', async () => {
  resetActiveRoomCheckForTest();

  let fetchCount = 0;
  const fetcher = async () => {
    fetchCount += 1;
    return response(`room-${fetchCount}`);
  };

  const first = await runActiveRoomCheck({
    fetcher,
    source: 'track-run experience',
    throttleMs: 10_000,
  });
  const second = await runActiveRoomCheck({
    fetcher,
    source: 'track-run experience',
    throttleMs: 10_000,
  });

  assert.ok(first.payload);
  assert.ok(second.payload);
  assert.equal(fetchCount, 1);
  assert.equal(first.payload.room?.roomId, 'room-1');
  assert.equal(second.payload.room?.roomId, 'room-1');
  assert.equal(second.skipped, true);
});

test('active room check hard timeout returns no payload for UI state updates', async () => {
  resetActiveRoomCheckForTest();

  let fetchCount = 0;
  const result = await runActiveRoomCheck({
    fetcher: () => {
      fetchCount += 1;
      return new Promise<RunningMatchRoomResponse>((resolve) => {
        setTimeout(() => resolve(response('late-room')), 20);
      });
    },
    hardTimeoutMs: 1,
    routeKey: 'track-run:duel:no-room:no-match:page-0',
    source: 'track-run experience',
  });

  assert.equal(fetchCount, 1);
  assert.equal(result.payload, null);
  assert.equal(result.timedOut, true);
  assert.equal(result.stale, true);
  assert.equal(result.routeKey, 'track-run:duel:no-room:no-match:page-0');
  assert.equal(getActiveRoomCheckResultSkipReason({
    currentRouteKey: 'track-run:duel:no-room:no-match:page-0',
    result,
  }), 'timed-out');

  await new Promise((resolve) => {
    setTimeout(resolve, 25);
  });
});

test('active room check marks slow completed results as stale generation', async () => {
  resetActiveRoomCheckForTest();

  const result = await runActiveRoomCheck({
    fetcher: () => new Promise<RunningMatchRoomResponse>((resolve) => {
      setTimeout(() => resolve(response('slow-room')), 8);
    }),
    hardTimeoutMs: 50,
    routeKey: 'track-run:duel:room-1:no-match:page-0',
    source: 'track-run experience',
    uiTimeoutMs: 1,
  });

  assert.equal(result.payload?.room?.roomId, 'slow-room');
  assert.equal(result.timedOut, false);
  assert.equal(result.stale, true);
  assert.equal(getActiveRoomCheckResultSkipReason({
    currentRouteKey: 'track-run:duel:room-1:no-match:page-0',
    result,
  }), 'stale-generation');
});

test('active room check result is ignored after route changes or live match mount', async () => {
  resetActiveRoomCheckForTest();

  const routeResult = await runActiveRoomCheck({
    fetcher: async () => response('room-1'),
    routeKey: 'track-run:duel:room-1:no-match:page-0',
    source: 'track-run experience',
  });

  assert.equal(getActiveRoomCheckResultSkipReason({
    currentRouteKey: 'track-run:duel:room-2:match-1:arena',
    result: routeResult,
  }), 'route-changed');

  const waitingResult = await runActiveRoomCheck({
    fetcher: async () => response('waiting-room'),
    routeKey: 'track-run:duel:waiting-room:match-1:arena',
    source: 'match-room snapshot',
  });

  assert.equal(getActiveRoomCheckResultSkipReason({
    currentMatchId: 'match-1',
    currentRouteKey: waitingResult.routeKey,
    isLiveMatchMounted: true,
    result: waitingResult,
  }), 'live-match-mounted');
});
