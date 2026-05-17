import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunningMatchRoom, RunningMatchRoomResponse } from '@/lib/api/types';
import { verifyDeletedRoomServerMembership } from './roomDeleteVerification';

function room(roomId: string): RunningMatchRoom {
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

function activeRoomResponse(nextRoom: RunningMatchRoom | null): RunningMatchRoomResponse {
  return {
    room: nextRoom,
    success: true,
  };
}

test('delete verification does not cleanup when server membership is already cleared', async () => {
  let cleanupCalls = 0;

  const result = await verifyDeletedRoomServerMembership({
    cleanup: async () => {
      cleanupCalls += 1;
      return { status: 'timeout' };
    },
    fetchActiveRoom: async () => activeRoomResponse(null),
    roomId: 'room-deleted',
    trace: () => undefined,
  });

  assert.equal(result.status, 'cleared');
  assert.equal(cleanupCalls, 0);
});

test('delete verification runs cleanup recovery when deleted room is still active on server', async () => {
  const cleanupSources: string[] = [];
  const traceLabels: string[] = [];

  const result = await verifyDeletedRoomServerMembership({
    cleanup: async ({ source }) => {
      cleanupSources.push(source);
      return {
        payload: {
          cleaned: true,
          cleanedItems: ['matchRooms.participant'],
          room: null,
          success: true,
        },
        status: 'completed',
      };
    },
    fetchActiveRoom: async () => activeRoomResponse(room('room-deleted')),
    roomId: 'room-deleted',
    trace: (label) => {
      traceLabels.push(label);
    },
  });

  assert.equal(result.status, 'cleanup-attempted');
  assert.deepEqual(cleanupSources, ['room delete verification cleanup']);
  assert.deepEqual(traceLabels, [
    'room delete verification begin',
    'room delete verification end',
    'room delete server membership still active',
    'room delete active blocker cleanup begin',
    'room delete active blocker cleanup end',
  ]);
});

test('delete verification reports fetch errors without throwing', async () => {
  const result = await verifyDeletedRoomServerMembership({
    fetchActiveRoom: async () => {
      throw new Error('network down');
    },
    roomId: 'room-deleted',
    trace: () => undefined,
  });

  assert.equal(result.status, 'verification-error');
});
