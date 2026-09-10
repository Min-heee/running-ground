import { myProfile, weeklySummary } from '@/data/mock';
import { getCurrentUserProfile } from '@/lib/session';
import type {
  CreateRunningMatchRoomInput,
  RunningMatchRoom,
  RunningMatchRoomInvitee,
  RunningMatchRoomParticipant,
  RunningMatchRoomResponse,
  UpcomingRunningMatchItem,
  UpdateRunningMatchRoomInput,
} from '../../types';
import { CREATE_ROOM_GROUP_MIN_PARTICIPANTS } from '@/features/runs/runtime/resolveCreateRoomMaxParticipants';
import { buildLevelLabel, formatDuelSlotLabel, formatMockMatchSlotDateLabel } from './matches';
import { mockApiState } from './state';
export {
  ensureJoinedRunningMatchRoomResponse,
  ensureRunningMatchRoomCleanupResponse,
  ensureRunningMatchRoomResponse,
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
        inviteId: `${room.roomId}:${friendId}`,
        roomId: room.roomId,
        inviteToken: room.inviteToken,
        invitedUserId: friendId,
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
    maxParticipants: input.mode === 'duel' ? 2 : Math.max(CREATE_ROOM_GROUP_MIN_PARTICIPANTS, Math.min(30, Math.round(input.maxParticipants ?? 10))),
    minParticipants: input.mode === 'duel' ? 2 : CREATE_ROOM_GROUP_MIN_PARTICIPANTS,
    canStart: false,
    isHost: true,
    hostUserId: participants[0].userId,
    hostName: participants[0].name,
    participants,
    invitedFriendIds,
  };

  mockApiState.runningMatchRoom = recalculateMockRunningMatchRoomCanStart(mockApiState.runningMatchRoom);
  scheduleMockInvitedFriendAutoJoin();
  return mockApiState.runningMatchRoom;
}

export function applyMockRunningMatchRoomUpdate(input: UpdateRunningMatchRoomInput) {
  if (!mockApiState.runningMatchRoom) {
    return mockApiState.runningMatchRoom;
  }

  // 계약 C1: 세션이 묶인(예약 확정) 방은 시작 방식/시간을 바꿀 수 없다 — 서버와 같은 400 카피.
  const currentRoom = mockApiState.runningMatchRoom;
  const changesStartMode = input.startMode !== currentRoom.startMode
    || (input.startMode === 'scheduled' && Boolean(input.slotStartAt) && input.slotStartAt !== currentRoom.slotStartAt);
  if (currentRoom.linkedMatchId && changesStartMode) {
    throw new Error('예약이 확정된 방은 시간을 바꿀 수 없어요.');
  }

  const slotStartAt = input.startMode === 'host'
    ? mockApiState.runningMatchRoom.slotStartAt
    : input.slotStartAt ?? mockApiState.runningMatchRoom.slotStartAt;
  // 서버와 같은 규칙: 시작 방식/시간이 바뀌면 게스트의 수락(isReady)은 풀린다 — 수락은 '그 시간'에
  // 대한 것이라, 방장의 저장만으로 예약이 잠기지 않는다.
  const participants = changesStartMode
    ? currentRoom.participants.map((participant) => (
      participant.isHost ? participant : { ...participant, isReady: false, isCountdownReady: false }
    ))
    : currentRoom.participants;
  mockApiState.runningMatchRoom = {
    ...mockApiState.runningMatchRoom,
    startMode: input.startMode,
    distanceKm: Number(input.distanceKm.toFixed(1)),
    slotStartAt,
    participants,
    slotLabel: input.startMode === 'host' ? '방장 시작' : formatDuelSlotLabel(slotStartAt),
    maxParticipants: mockApiState.runningMatchRoom.mode === 'duel'
      ? 2
      : Math.max(CREATE_ROOM_GROUP_MIN_PARTICIPANTS, Math.min(30, Math.round(input.maxParticipants ?? mockApiState.runningMatchRoom.maxParticipants))),
    invitedFriendIds: [...new Set((input.invitedFriendIds ?? []).filter(Boolean))],
  };

  mockApiState.runningMatchRoom = recalculateMockRunningMatchRoomCanStart(mockApiState.runningMatchRoom);
  scheduleMockInvitedFriendAutoJoin();
  return mockApiState.runningMatchRoom;
}

// ---------------------------------------------------------------------------
// 파티런 예약 (오너 2026-09-09) — 웹 목에서 흐름을 끝까지 볼 수 있게 서버 계약 C2/C3/C4를 흉내낸다.
//  · 예약 방(startMode 'scheduled')에 최소 인원이 모이면 그 즉시 세션을 묶는다(linkedMatchId).
//  · 목에는 사용자가 한 명뿐이라 '친구가 수락'을 볼 수 없다 — 방장이 예약 시간을 고르면 초대한
//    친구가 몇 초 뒤 자동으로 들어온 것으로 시뮬레이션한다(예약 방에서만, 방장 시작 방은 그대로).
//  · 예약 세션은 다가오는 매치 목록에 roomId를 달고 올라가고, 카드의 취소가 방을 통째로 지운다.
// ---------------------------------------------------------------------------

const MOCK_INVITED_FRIEND_AUTO_JOIN_DELAY_MS = 4_000;
let mockInvitedFriendAutoJoinTimer: ReturnType<typeof setTimeout> | null = null;

function isMockRoomSlotInFuture(room: RunningMatchRoom) {
  const slotStartMs = Date.parse(room.slotStartAt);
  return Number.isFinite(slotStartMs) && slotStartMs > Date.now();
}

function haveAllMockGuestsAccepted(room: RunningMatchRoom) {
  const guests = room.participants.filter((participant) => !participant.isHost);
  return guests.length > 0 && guests.every((participant) => participant.isReady);
}

export function syncMockScheduledRunningMatchRoomLink() {
  const room = mockApiState.runningMatchRoom;

  // 서버 syncScheduledMatchRoom과 같은 조건: 최소 인원 + 게스트 전원 수락(isReady) + 미래 슬롯.
  if (
    !room
    || room.startMode !== 'scheduled'
    || room.linkedMatchId
    || room.participants.length < room.minParticipants
    || !haveAllMockGuestsAccepted(room)
    || !isMockRoomSlotInFuture(room)
  ) {
    return room;
  }

  mockApiState.runningMatchRoom = recalculateMockRunningMatchRoomCanStart({
    ...room,
    state: 'waiting',
    slotLabel: formatDuelSlotLabel(room.slotStartAt),
    linkedMatchId: `mock-party-match-${Date.now()}`,
    linkedMatchStatus: 'matched',
    linkedMatchSlotStartAt: room.slotStartAt,
    linkedMatchDistanceKm: room.distanceKm,
  });

  return mockApiState.runningMatchRoom;
}

function buildMockGuestParticipant({
  userId,
  name,
  tag,
  districtName,
}: {
  userId: string;
  name: string;
  tag?: string;
  districtName: string;
}): RunningMatchRoomParticipant {
  return {
    userId,
    name,
    tag,
    districtName,
    averagePace: '06:20/km',
    levelLabel: 'Lv.1',
    isHost: false,
    isReady: true,
    isCountdownReady: false,
    invited: true,
    joinedAt: new Date().toISOString(),
  };
}

// 초대 코드/초대 카드로 들어온 현재 사용자를 참가자로 넣는다(이미 있으면 그대로). 예약 방이면 즉시 묶는다.
export function joinMockRunningMatchRoomAsCurrentUser() {
  const room = mockApiState.runningMatchRoom;
  if (!room) {
    return room;
  }

  const profile = getCurrentUserProfile() ?? myProfile;
  const currentUserId = profile.publicTag || 'mock-current-user';
  const alreadyJoined = room.participants.some((participant) => (
    participant.userId === currentUserId || participant.tag === currentUserId
  ));

  if (!alreadyJoined && room.participants.length < room.maxParticipants) {
    mockApiState.runningMatchRoom = recalculateMockRunningMatchRoomCanStart({
      ...room,
      joined: true,
      participants: [
        ...room.participants,
        buildMockGuestParticipant({
          userId: currentUserId,
          name: profile.name,
          tag: profile.publicTag,
          districtName: profile.districtName,
        }),
      ],
    });
  }

  return syncMockScheduledRunningMatchRoomLink();
}

export function simulateMockInvitedFriendsAccept(roomId: string) {
  const room = mockApiState.runningMatchRoom;
  if (!room || room.roomId !== roomId || room.startMode !== 'scheduled' || room.linkedMatchId) {
    return room;
  }

  const joinedIds = new Set(room.participants.map((participant) => participant.userId));
  const openSeats = Math.max(0, room.maxParticipants - room.participants.length);
  const acceptingFriends = room.invitedFriendIds
    .filter((friendId) => !joinedIds.has(friendId))
    .slice(0, openSeats)
    .map((friendId) => {
      const friend = mockApiState.friendRanks.find((rank) => rank.id === friendId);
      return buildMockGuestParticipant({
        userId: friendId,
        name: friend?.name ?? '초대한 친구',
        tag: friend?.tag,
        districtName: friend?.liveLocationLabel ?? '친구',
      });
    });
  // 시간이 정해지기 전에 들어와 있던(또는 시간이 바뀌어 수락이 풀린) 게스트도 같은 지연 뒤에
  // 대기실에서 수락한 것으로 본다.
  const hasPendingAcceptance = room.participants.some((participant) => !participant.isHost && !participant.isReady);

  if (acceptingFriends.length === 0 && !hasPendingAcceptance) {
    return room;
  }

  mockApiState.runningMatchRoom = recalculateMockRunningMatchRoomCanStart({
    ...room,
    participants: [
      ...room.participants.map((participant) => (participant.isHost ? participant : { ...participant, isReady: true })),
      ...acceptingFriends,
    ],
  });

  return syncMockScheduledRunningMatchRoomLink();
}

export function scheduleMockInvitedFriendAutoJoin() {
  if (mockInvitedFriendAutoJoinTimer) {
    clearTimeout(mockInvitedFriendAutoJoinTimer);
    mockInvitedFriendAutoJoinTimer = null;
  }

  const room = mockApiState.runningMatchRoom;
  if (!room || room.startMode !== 'scheduled' || room.linkedMatchId) {
    return;
  }

  const joinedIds = new Set(room.participants.map((participant) => participant.userId));
  const hasPendingInvite = room.invitedFriendIds.some((friendId) => !joinedIds.has(friendId));
  const hasPendingAcceptance = room.participants.some((participant) => !participant.isHost && !participant.isReady);
  if (!hasPendingInvite && !hasPendingAcceptance) {
    return;
  }

  const roomId = room.roomId;
  mockInvitedFriendAutoJoinTimer = setTimeout(() => {
    mockInvitedFriendAutoJoinTimer = null;
    simulateMockInvitedFriendsAccept(roomId);
  }, MOCK_INVITED_FRIEND_AUTO_JOIN_DELAY_MS);
}

// 다가오는 매치 목록에 올릴 파티런 예약 항목 (계약 C3): roomId 동봉, 출발 전까지 취소 가능.
export function buildMockPartyRunUpcomingMatchItem(): UpcomingRunningMatchItem | null {
  const room = mockApiState.runningMatchRoom;
  if (!room?.linkedMatchId || !room.linkedMatchSlotStartAt) {
    return null;
  }

  const slotStartAt = room.linkedMatchSlotStartAt;
  const slotStartMs = Date.parse(slotStartAt);
  if (!Number.isFinite(slotStartMs)) {
    return null;
  }

  const profile = getCurrentUserProfile() ?? myProfile;
  const currentUserId = profile.publicTag || 'mock-current-user';
  const counterpart = room.participants.find((participant) => (
    participant.userId !== currentUserId && participant.tag !== currentUserId
  ));
  const started = slotStartMs <= Date.now();

  return {
    matchId: room.linkedMatchId,
    roomId: room.roomId,
    mode: room.mode,
    distanceKm: room.distanceKm,
    slotStartAt,
    slotLabel: formatDuelSlotLabel(slotStartAt),
    status: started ? 'active' : 'matched',
    participantCount: room.participants.length,
    counterpartLabel: room.mode === 'duel'
      ? counterpart?.name ?? '상대 미정'
      : `${room.participants.length}명 파티런`,
    summary: `${formatMockMatchSlotDateLabel(slotStartAt)} ${formatDuelSlotLabel(slotStartAt)} · ${room.distanceKm.toFixed(1)}km 파티런`,
    canCancel: !started,
    cancelableUntilAt: slotStartAt,
  };
}

// 카드의 '예약 취소' (계약 C4): 파티런 세션 취소는 방까지 함께 지운다.
export function cancelMockPartyRunReservation(matchId: string | undefined) {
  const room = mockApiState.runningMatchRoom;
  if (!matchId || !room?.linkedMatchId || room.linkedMatchId !== matchId) {
    return false;
  }

  mockApiState.runningMatchRoom = null;
  return true;
}
