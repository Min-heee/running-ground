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

test('active room check reuses an in-flight request for duplicate callers from the same owner', async () => {
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
  const secondPromise = runActiveRoomCheck({ fetcher, source: 'track-run experience' });

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

test('active room check keeps track-run and snapshot owners separate', async () => {
  resetActiveRoomCheckForTest();

  const resolvers: ((value: RunningMatchRoomResponse) => void)[] = [];
  let fetchCount = 0;
  const fetcher = () => {
    fetchCount += 1;
    return new Promise<RunningMatchRoomResponse>((resolve) => {
      resolvers.push(resolve);
    });
  };

  const trackRunPromise = runActiveRoomCheck({ fetcher, source: 'track-run experience' });
  const snapshotPromise = runActiveRoomCheck({ fetcher, source: 'match-room snapshot' });

  await Promise.resolve();
  assert.equal(fetchCount, 2);
  assert.equal(resolvers.length, 2);
  resolvers[0]?.(response('track-run-room'));
  resolvers[1]?.(response('snapshot-room'));

  const [trackRunResult, snapshotResult] = await Promise.all([trackRunPromise, snapshotPromise]);

  assert.notEqual(trackRunResult.requestId, snapshotResult.requestId);
  assert.equal(trackRunResult.payload?.room?.roomId, 'track-run-room');
  assert.equal(snapshotResult.payload?.room?.roomId, 'snapshot-room');
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
  const signals: AbortSignal[] = [];
  const result = await runActiveRoomCheck({
    fetcher: (signal) => {
      fetchCount += 1;
      if (signal) {
        signals.push(signal);
      }
      return new Promise<RunningMatchRoomResponse>((resolve) => {
        setTimeout(() => resolve(response('late-room')), 20);
      });
    },
    hardTimeoutMs: 1,
    routeKey: 'track-run:duel:no-room:no-match:page-0',
    source: 'track-run experience',
  });

  assert.equal(fetchCount, 1);
  assert.equal(signals[0]?.aborted, true);
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

test('active room check timeout aborts and releases the owner for retry', async () => {
  resetActiveRoomCheckForTest();

  const lateFetchResolvers: ((value: RunningMatchRoomResponse) => void)[] = [];
  const signals: AbortSignal[] = [];
  let fetchCount = 0;

  const first = await runActiveRoomCheck({
    fetcher: (signal) => {
      fetchCount += 1;
      if (signal) {
        signals.push(signal);
      }
      return new Promise<RunningMatchRoomResponse>((resolve) => {
        lateFetchResolvers.push(resolve);
      });
    },
    hardTimeoutMs: 1,
    source: 'track-run experience',
    throttleMs: 10_000,
  });

  assert.equal(first.timedOut, true);
  assert.equal(signals[0]?.aborted, true);

  const second = await runActiveRoomCheck({
    fetcher: (signal) => {
      fetchCount += 1;
      if (signal) {
        signals.push(signal);
      }
      return Promise.resolve(response('fresh-room'));
    },
    source: 'track-run experience',
    throttleMs: 10_000,
  });

  assert.equal(fetchCount, 2);
  assert.equal(second.timedOut, false);
  assert.equal(second.payload?.room?.roomId, 'fresh-room');
  assert.notEqual(first.requestId, second.requestId);

  lateFetchResolvers[0]?.(response('late-room'));
  await Promise.resolve();
});

test('active room check does NOT mark a slow-but-completed result stale (slow bodies still commit)', async () => {
  resetActiveRoomCheckForTest();

  // Duration says nothing about body validity — freshness is arbitrated downstream by the
  // monotonic serverNow guard, tombstones and snapshot-key dedup. Stamping slow completions
  // stale made the guest LOBBY fetch-and-discard every /rooms/my carrying the host-start on a
  // congested device, stranding the guest in the 대기실 while the host counted down.
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
  assert.equal(result.stale, false);
  assert.equal(getActiveRoomCheckResultSkipReason({
    currentRouteKey: 'track-run:duel:room-1:no-match:page-0',
    result,
  }), null);
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

test('stale active room result is not cached for throttled callers', async () => {
  resetActiveRoomCheckForTest();

  let fetchCount = 0;
  const first = await runActiveRoomCheck({
    fetcher: () => new Promise<RunningMatchRoomResponse>((resolve) => {
      fetchCount += 1;
      setTimeout(() => resolve(response('stale-room')), 8);
    }),
    hardTimeoutMs: 50,
    source: 'track-run experience',
    staleResultMs: 1,
    throttleMs: 10_000,
  });

  assert.equal(first.stale, true);
  assert.equal(first.payload?.room?.roomId, 'stale-room');

  const second = await runActiveRoomCheck({
    fetcher: async () => {
      fetchCount += 1;
      return response('fresh-room');
    },
    source: 'track-run experience',
    throttleMs: 10_000,
  });

  assert.equal(fetchCount, 2);
  assert.equal(second.skipped, false);
  assert.equal(second.stale, false);
  assert.equal(second.payload?.room?.roomId, 'fresh-room');
});
