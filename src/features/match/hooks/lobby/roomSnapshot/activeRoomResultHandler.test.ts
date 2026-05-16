import assert from 'node:assert/strict';
import test from 'node:test';
import type { MutableRefObject } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  markMatchRoomDeleted,
  resetMatchRoomDeletionTombstonesForTest,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { handleMatchRoomActiveRoomResult } from './activeRoomResultHandler';

function createRoom(roomId: string): RunningMatchRoom {
  return {
    roomId,
    inviteToken: 'ABC123',
    inviteLink: 'https://example.com/ABC123',
    mode: 'duel',
    state: 'waiting',
    startMode: 'host',
    distanceKm: 3,
    slotStartAt: '2026-05-15T12:00:00.000Z',
    slotLabel: '오늘 12:00',
    maxParticipants: 2,
    minParticipants: 2,
    canStart: false,
    isHost: true,
    hostUserId: 'user-a',
    hostName: 'host',
    participants: [],
    invitedFriendIds: [],
  };
}

function ref<T>(current: T): MutableRefObject<T> {
  return { current };
}

type HandlerInput = Parameters<typeof handleMatchRoomActiveRoomResult>[0];

test('late match-room snapshot result does not restore a deleted room', async () => {
  resetMatchRoomDeletionTombstonesForTest();
  const deletedRoom = createRoom('room-deleted');
  markMatchRoomDeleted(deletedRoom.roomId, 'test delete');
  const commits: (RunningMatchRoom | null)[] = [];
  const errors: (string | null)[] = [];

  const result = await handleMatchRoomActiveRoomResult({
    activeRoomCheckResult: {
      completedAtMs: 1_200,
      generation: 1,
      payload: {
        room: deletedRoom,
        serverNow: '2026-05-15T12:00:01.000Z',
        success: true,
      },
      requestId: 'snapshot-1',
      routeKey: 'match-room:room-deleted',
      reused: false,
      skipped: false,
      stale: false,
      startedAtMs: 1_000,
      timedOut: false,
    },
    buildRouteKey: () => 'match-room:room-deleted',
    commitRoom: (nextRoom) => {
      commits.push(nextRoom);
    },
    currentUserTag: 'user-a',
    handleRecipientInviteInbox: () => undefined,
    lastHandledActiveRoomSnapshotKeyRef: ref<string | null>(null),
    latestRoomServerNowMsRef: ref(0),
    liveMatchHandoffRef: ref(null),
    markLiveMatchHandoff: () => undefined,
    mountedRef: ref(true),
    pollingPausedRef: ref(false),
    roomRef: ref<RunningMatchRoom | null>(null),
    setError: (value) => {
      errors.push(typeof value === 'function' ? value(null) : value);
    },
    syncServerClock: () => undefined,
  } satisfies HandlerInput);

  assert.equal(result, null);
  assert.deepEqual(commits, [null]);
  assert.deepEqual(errors, [null]);
});
