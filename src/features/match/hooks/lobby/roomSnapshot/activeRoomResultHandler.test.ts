import assert from 'node:assert/strict';
import test from 'node:test';
import type { MutableRefObject } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  isMatchRoomDeleted,
  markMatchRoomDeleted,
  resetMatchRoomDeletionTombstonesForTest,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { handleMatchRoomActiveRoomResult } from './activeRoomResultHandler';

function participant(userId: string, overrides: Partial<RunningMatchRoom['participants'][number]> = {}) {
  return {
    averagePace: '06:00/km',
    districtName: 'Test',
    invited: false,
    isCountdownReady: false,
    isHost: false,
    isReady: false,
    joinedAt: '2026-05-15T12:00:00.000Z',
    levelLabel: 'Lv.1',
    name: userId,
    tag: userId,
    userId,
    ...overrides,
  } satisfies RunningMatchRoom['participants'][number];
}

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

test('host transfer followed by no active room tombstones the transferred room', async () => {
  resetMatchRoomDeletionTombstonesForTest();
  const originalRoom = createRoom('room-transfer');
  const promotedRoom = {
    ...originalRoom,
    hostName: 'new host',
    hostUserId: 'user-b',
    isHost: true,
    participants: [
      participant('user-a', { isHost: false, isReady: true, name: 'old host' }),
      participant('user-b', { isHost: true, isReady: true, name: 'new host' }),
    ],
  } satisfies RunningMatchRoom;
  const commits: (RunningMatchRoom | null)[] = [];
  const errors: (string | null)[] = [];
  const roomRef = ref<RunningMatchRoom | null>(originalRoom);
  const latestRoomServerNowMsRef = ref(0);

  const baseInput = {
    buildRouteKey: () => 'match-room:room-transfer',
    commitRoom: (nextRoom: RunningMatchRoom | null) => {
      roomRef.current = nextRoom;
      commits.push(nextRoom);
    },
    currentUserTag: 'user-b',
    handleRecipientInviteInbox: () => undefined,
    lastHandledActiveRoomSnapshotKeyRef: ref<string | null>(null),
    latestRoomServerNowMsRef,
    liveMatchHandoffRef: ref(null),
    markLiveMatchHandoff: () => undefined,
    mountedRef: ref(true),
    pollingPausedRef: ref(false),
    roomRef,
    setError: (value: string | null | ((current: string | null) => string | null)) => {
      errors.push(typeof value === 'function' ? value(null) : value);
    },
    syncServerClock: () => undefined,
  } satisfies Omit<HandlerInput, 'activeRoomCheckResult'>;

  const transferResult = await handleMatchRoomActiveRoomResult({
    ...baseInput,
    activeRoomCheckResult: {
      completedAtMs: 1_200,
      generation: 1,
      payload: {
        room: promotedRoom,
        serverNow: '2026-05-15T12:00:01.000Z',
        success: true,
      },
      requestId: 'snapshot-transfer',
      routeKey: 'match-room:room-transfer',
      reused: false,
      skipped: false,
      stale: false,
      startedAtMs: 1_000,
      timedOut: false,
    },
  });

  assert.equal(transferResult?.hostUserId, 'user-b');
  assert.equal(roomRef.current?.hostUserId, 'user-b');

  const deletedResult = await handleMatchRoomActiveRoomResult({
    ...baseInput,
    activeRoomCheckResult: {
      completedAtMs: 1_400,
      generation: 2,
      payload: {
        room: null,
        serverNow: '2026-05-15T12:00:02.000Z',
        success: true,
      },
      requestId: 'snapshot-deleted',
      routeKey: 'match-room:room-transfer',
      reused: false,
      skipped: false,
      stale: false,
      startedAtMs: 1_300,
      timedOut: false,
    },
  });

  assert.equal(deletedResult, null);
  assert.equal(roomRef.current, null);
  assert.equal(isMatchRoomDeleted('room-transfer'), true);
  assert.deepEqual(commits.map((commit) => commit?.roomId ?? null), ['room-transfer', null]);
  assert.deepEqual(errors, [null, null]);
});

// 예약 파티런(2026-09-09): 수락 순간 링크돼 며칠을 산다 — 그동안 핸드오프(폴링 정지)를 걸면 상대의
// 이탈·취소가 열린 대기실에 영영 안 보인다. 카운트다운 창 밖의 예약 방은 핸드오프하지 않는다.
test('a linked scheduled room days before its slot is committed without a live-match handoff; a linked host-start room still hands off', async () => {
  resetMatchRoomDeletionTombstonesForTest();
  const farSlot = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const reservedRoom = {
    ...createRoom('room-reserved'),
    startMode: 'scheduled' as const,
    slotStartAt: farSlot,
    linkedMatchId: 'party-match-1',
    linkedMatchStatus: 'matched' as const,
    linkedMatchSlotStartAt: farSlot,
    participants: [participant('user-a', { isHost: true }), participant('user-b', { isReady: true })],
  } satisfies RunningMatchRoom;
  const handoffs: string[] = [];
  const roomRef = ref<RunningMatchRoom | null>(null);

  const baseInput = {
    buildRouteKey: () => 'match-room:room-reserved',
    commitRoom: (nextRoom: RunningMatchRoom | null) => {
      roomRef.current = nextRoom;
    },
    currentUserTag: 'user-a',
    handleRecipientInviteInbox: () => undefined,
    lastHandledActiveRoomSnapshotKeyRef: ref<string | null>(null),
    latestRoomServerNowMsRef: ref(0),
    liveMatchHandoffRef: ref(null),
    markLiveMatchHandoff: (nextRoom: RunningMatchRoom) => {
      handoffs.push(nextRoom.roomId);
    },
    mountedRef: ref(true),
    pollingPausedRef: ref(false),
    roomRef,
    setError: () => undefined,
    syncServerClock: () => undefined,
  } satisfies Omit<HandlerInput, 'activeRoomCheckResult'>;

  const snapshot = (room: RunningMatchRoom, requestId: string) => ({
    completedAtMs: 1_200,
    generation: 1,
    payload: { room, serverNow: new Date().toISOString(), success: true },
    requestId,
    routeKey: 'match-room:room-reserved',
    reused: false,
    skipped: false,
    stale: false,
    startedAtMs: 1_000,
    timedOut: false,
  });

  await handleMatchRoomActiveRoomResult({ ...baseInput, activeRoomCheckResult: snapshot(reservedRoom, 'snapshot-reserved') });
  assert.equal(roomRef.current?.linkedMatchId, 'party-match-1');
  assert.deepEqual(handoffs, [], '예약 방은 핸드오프하지 않는다');

  const hostStartLinked = {
    ...reservedRoom,
    roomId: 'room-host-linked',
    startMode: 'host' as const,
    state: 'arming' as const,
    linkedMatchId: 'host-match-1',
    linkedMatchSlotStartAt: new Date(Date.now() + 24_000).toISOString(),
  } satisfies RunningMatchRoom;
  await handleMatchRoomActiveRoomResult({
    ...baseInput,
    buildRouteKey: () => 'match-room:room-host-linked',
    activeRoomCheckResult: { ...snapshot(hostStartLinked, 'snapshot-host'), routeKey: 'match-room:room-host-linked' },
  });
  assert.deepEqual(handoffs, ['room-host-linked'], '방장 시작 방은 예전처럼 핸드오프');
});
