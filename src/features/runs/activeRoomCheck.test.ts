import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoomResponse } from '@/lib/api/types';
import { resetActiveRoomCheckForTest, runActiveRoomCheck } from './activeRoomCheck';

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

  assert.equal(fetchCount, 1);
  assert.equal(first.payload.room?.roomId, 'room-1');
  assert.equal(second.payload.room?.roomId, 'room-1');
  assert.equal(second.skipped, true);
});
