import { myProfile, weeklySummary } from '@/data/mock';
import { getCurrentUserProfile } from '@/lib/session';
import type {
  CreateRunningMatchRoomInput,
  RunningMatchRoom,
  RunningMatchRoomInvitee,
  RunningMatchRoomParticipant,
  RunningMatchRoomResponse,
  UpdateRunningMatchRoomInput,
} from '../../types';
import { buildLevelLabel, formatDuelSlotLabel } from './matches';
import { mockApiState } from './state';
export {
  ensureJoinedRunningMatchRoomResponse,
  shouldFallbackToLocalRunningRoomApi,
} from '../runningRoomResponseGuards';

export function buildMockRunningMatchRoomResponse(room: RunningMatchRoom | null): RunningMatchRoomResponse {
  return {
    success: true,
    serverNow: new Date().toISOString(),
    room,
  };
}

export function recalculateMockRunningMatchRoomCanStart(room: RunningMatchRoom | null) {
  if (!room) {
    return room;
  }

  const allGuestsReady = room.participants
    .filter((participant) => !participant.isHost)
    .every((participant) => participant.isReady);

  return {
    ...room,
    canStart: room.startMode === 'host'
      && room.isHost
      && room.participants.length >= room.minParticipants
      && allGuestsReady,
  };
}

export function countMockRunningMatchRoomCountdownReady(room: RunningMatchRoom | null) {
  if (!room) {
    return { readyCount: 0, requiredCount: 0 };
  }

  return {
    readyCount: room.participants.filter((participant) => participant.isCountdownReady).length,
    requiredCount: room.participants.length,
  };
}

export function buildMockRunningMatchRoomInvitees(room: RunningMatchRoom): RunningMatchRoomInvitee[] {
  const joinedIds = new Set(room.participants.map((participant) => participant.userId));

  return room.invitedFriendIds
    .filter((friendId) => !joinedIds.has(friendId))
    .map((friendId) => {
      const friend = mockApiState.friendRanks.find((rank) => rank.id === friendId);

      return {
        userId: friendId,
        name: friend?.name ?? '초대한 친구',
        tag: friend?.tag,
        districtName: friend?.liveLocationLabel ?? '친구',
        averagePace: '06:20/km',
        levelLabel: 'Lv.1',
        status: 'pending' as const,
        invitedAt: new Date().toISOString(),
      };
    });
}

export function decorateMockRunningMatchRoom(room: RunningMatchRoom | null): RunningMatchRoom | null {
  if (!room) {
    return room;
  }

  const { readyCount, requiredCount } = countMockRunningMatchRoomCountdownReady(room);
  return {
    ...room,
    invitedFriends: buildMockRunningMatchRoomInvitees(room),
    countdownReadyCount: readyCount,
    countdownReadyRequiredCount: requiredCount,
  };
}

export function createMockRunningMatchRoomState(input: CreateRunningMatchRoomInput) {
  const profile = getCurrentUserProfile() ?? myProfile;
  const now = new Date();
  const slotStartAt = input.startMode === 'host'
    ? now.toISOString()
    : input.slotStartAt ?? now.toISOString();
  const roomId = `mock-room-${Date.now()}`;
  const inviteToken = `ROOM${String(Date.now()).slice(-4)}`;
  const invitedFriendIds = [...new Set((input.invitedFriendIds ?? []).filter(Boolean))];
  const participants: RunningMatchRoomParticipant[] = [{
    userId: profile.publicTag || 'mock-current-user',
    name: profile.name,
    tag: profile.publicTag,
    districtName: profile.districtName,
    averagePace: '06:20/km',
    levelLabel: buildLevelLabel(profile.lifetimeDistanceKm ?? weeklySummary.totalDistanceKm),
    isHost: true,
    isReady: false,
    isCountdownReady: false,
    invited: false,
    joinedAt: now.toISOString(),
  }];

  mockApiState.runningMatchRoom = {
    roomId,
    inviteToken,
    inviteLink: `runningground://running?roomInviteToken=${inviteToken}`,
    mode: input.mode,
    state: 'waiting',
    startMode: input.startMode,
    distanceKm: Number(input.distanceKm.toFixed(1)),
    slotStartAt,
    slotLabel: input.startMode === 'host' ? '방장 시작' : formatDuelSlotLabel(slotStartAt),
    maxParticipants: input.mode === 'duel' ? 2 : Math.max(2, Math.min(30, Math.round(input.maxParticipants ?? 10))),
    minParticipants: input.mode === 'duel' ? 2 : 2,
    canStart: false,
    isHost: true,
    hostUserId: participants[0].userId,
    hostName: participants[0].name,
    participants,
    invitedFriendIds,
  };

  mockApiState.runningMatchRoom = recalculateMockRunningMatchRoomCanStart(mockApiState.runningMatchRoom);
  return mockApiState.runningMatchRoom;
}

export function applyMockRunningMatchRoomUpdate(input: UpdateRunningMatchRoomInput) {
  if (!mockApiState.runningMatchRoom) {
    return mockApiState.runningMatchRoom;
  }

  const slotStartAt = input.startMode === 'host'
    ? mockApiState.runningMatchRoom.slotStartAt
    : input.slotStartAt ?? mockApiState.runningMatchRoom.slotStartAt;
  mockApiState.runningMatchRoom = {
    ...mockApiState.runningMatchRoom,
    startMode: input.startMode,
    distanceKm: Number(input.distanceKm.toFixed(1)),
    slotStartAt,
    slotLabel: input.startMode === 'host' ? '방장 시작' : formatDuelSlotLabel(slotStartAt),
    maxParticipants: mockApiState.runningMatchRoom.mode === 'duel'
      ? 2
      : Math.max(2, Math.min(30, Math.round(input.maxParticipants ?? mockApiState.runningMatchRoom.maxParticipants))),
    invitedFriendIds: [...new Set((input.invitedFriendIds ?? []).filter(Boolean))],
  };

  mockApiState.runningMatchRoom = recalculateMockRunningMatchRoomCanStart(mockApiState.runningMatchRoom);
  return mockApiState.runningMatchRoom;
}
