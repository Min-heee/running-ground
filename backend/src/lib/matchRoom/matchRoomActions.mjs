import { ApiError } from '../../response/httpResponse.mjs';
import { MATCH_ROOM_HOST_MAX_LOADING_WAIT_SECONDS } from '../matchConstants.mjs';
import { validateMatchSlotInput } from '../matchSlotValidation.mjs';
import {
  areAllRunningMatchRoomGuestsReady,
  areAllRunningMatchRoomParticipantsCountdownReady,
  getMatchRoomMinParticipants,
  normalizeMatchQueueDistance,
  normalizeMatchRoomMaxParticipants,
} from '../matchPureHelpers.mjs';
import { createMatchSession } from '../runningMatchSessionStoreHelpers.mjs';
import { nextId } from '../idHelpers.mjs';
import { areFriends } from '../socialStoreHelpers.mjs';
import { appendUserNotification } from '../userNotifications.mjs';
import { ensureMatchRooms } from './matchRoomCore.mjs';
import {
  armRunningMatchRoomCountdown,
  buildHostStartedMatchSlotStartAt,
  findRunningMatchRoomById,
  findRunningMatchRoomByInviteToken,
  syncMatchRooms,
} from './matchRoomSync.mjs';
import {
  buildRunningMatchBlockerApiDetails,
  buildRunningMatchRequestBlocker,
  buildRunningMatchRoomResponse,
  logRunningMatchRequestBlocker,
} from './matchRoomResponses.mjs';
import {
  assertUserCanRequestAnotherMatch,
  cleanupStaleRunningMatchRoomState,
} from './matchRoomCleanup.mjs';

function createMatchRoomInviteToken(store) {
  const rooms = ensureMatchRooms(store);
  const existingTokens = new Set(rooms.map((room) => String(room.inviteToken ?? '').toUpperCase()).filter(Boolean));

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const token = Math.random().toString(36).slice(2, 8).toUpperCase();

    if (!existingTokens.has(token)) {
      return token;
    }
  }

  return nextId('room-invite').replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
}

function getMatchRoomModeLabel(mode) {
  return mode === 'duel' ? '1대1' : '그룹';
}

function appendMatchRoomInviteNotifications(store, currentUser, room, invitedUserIds) {
  for (const invitedUserId of invitedUserIds) {
    appendUserNotification(store, {
      userId: invitedUserId,
      type: 'match_invite',
      title: '파티런 초대',
      body: `${currentUser.name}님이 ${getMatchRoomModeLabel(room.mode)} 파티런에 초대했어요.`,
      data: {
        roomId: room.id,
        inviteToken: room.inviteToken,
        mode: room.mode,
      },
    });
  }
}

export function createRunningMatchRoom(store, currentUser, {
  mode,
  distanceKm,
  startMode,
  slotStartAt,
  maxParticipants,
  invitedFriendIds = [],
}) {
  assertUserCanRequestAnotherMatch(store, currentUser);

  const normalizedInvitedFriendIds = [...new Set(invitedFriendIds
    .filter((userId) => typeof userId === 'string')
    .map((userId) => userId.trim())
    .filter((userId) => userId && userId !== currentUser.id))];

  for (const friendId of normalizedInvitedFriendIds) {
    if (!areFriends(store, currentUser.id, friendId)) {
      throw new ApiError(400, '친구 목록에 있는 러너만 방에 초대할 수 있어.');
    }
  }

  const normalizedStartMode = startMode === 'host' ? 'host' : 'scheduled';
  const normalizedSlotStartAt = normalizedStartMode === 'host'
    ? new Date().toISOString()
    : validateMatchSlotInput(slotStartAt);
  const room = {
    id: nextId(`${mode}-room`),
    inviteToken: createMatchRoomInviteToken(store),
    hostUserId: currentUser.id,
    mode,
    startMode: normalizedStartMode,
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt: normalizedSlotStartAt,
    maxParticipants: normalizeMatchRoomMaxParticipants(mode, maxParticipants),
    minParticipants: getMatchRoomMinParticipants(mode),
    invitedFriendIds: normalizedInvitedFriendIds,
    participants: [{
      userId: currentUser.id,
      isHost: true,
      isReady: false,
      isCountdownReady: false,
      invited: false,
      joinedAt: new Date().toISOString(),
    }],
    createdAt: new Date().toISOString(),
    linkedMatchId: null,
  };

  ensureMatchRooms(store).push(room);
  appendMatchRoomInviteNotifications(store, currentUser, room, normalizedInvitedFriendIds);
  syncMatchRooms(store);
  return buildRunningMatchRoomResponse(store, currentUser, room);
}

function requireJoinedRunningMatchRoomResponse(payload) {
  if (payload?.room?.roomId) {
    return payload;
  }

  throw new ApiError(
    404,
    '방 정보를 불러오지 못했습니다. 다시 시도해주세요.',
    { code: 'invalid_room_response' },
  );
}

export function joinRunningMatchRoom(store, currentUser, { inviteToken }) {
  const room = findRunningMatchRoomByInviteToken(store, inviteToken);

  if (!room) {
    throw new ApiError(404, '참여할 방을 찾지 못했어. 초대 코드가 잘못됐거나 방이 삭제됐을 수 있어.', {
      code: 'room_not_found',
    });
  }

  if (room.participants.some((participant) => participant.userId === currentUser.id)) {
    return requireJoinedRunningMatchRoomResponse(buildRunningMatchRoomResponse(store, currentUser, room));
  }

  const initialBlocker = buildRunningMatchRequestBlocker(store, currentUser);
  const initialBlockerRoomId = initialBlocker?.details?.roomId;
  const blocksDifferentRoom = initialBlocker && (
    initialBlocker.legacyBlocker !== 'activeRoom' || !initialBlockerRoomId || initialBlockerRoomId !== room.id
  );

  if (blocksDifferentRoom) {
    const cleanup = cleanupStaleRunningMatchRoomState(store, currentUser);
    const blockerRoomId = cleanup.blockerDetails?.roomId;
    const stillBlocksDifferentRoom = cleanup.blocker && (
      cleanup.blocker !== 'activeRoom' || !blockerRoomId || blockerRoomId !== room.id
    );

    if (!stillBlocksDifferentRoom) {
      return joinRunningMatchRoom(store, currentUser, { inviteToken });
    }

    const blocker = {
      legacyBlocker: cleanup.blocker,
      source: cleanup.blockerSource ?? cleanup.blocker,
      details: cleanup.blockerDetails ?? null,
    };
    logRunningMatchRequestBlocker('running_match_join_blocked', currentUser, blocker);
    throw new ApiError(400, cleanup.message ?? '이미 진행 중인 매칭 상태가 있어요.', buildRunningMatchBlockerApiDetails(blocker));
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 시작 준비에 들어간 방이라 지금은 참여할 수 없어.');
  }

  if (room.participants.length >= room.maxParticipants) {
    throw new ApiError(400, '이 방은 이미 정원이 다 찼어.');
  }

  room.participants.push({
    userId: currentUser.id,
    isHost: false,
    isReady: false,
    isCountdownReady: false,
    invited: room.invitedFriendIds.includes(currentUser.id),
    joinedAt: new Date().toISOString(),
  });

  syncMatchRooms(store);
  return requireJoinedRunningMatchRoomResponse(buildRunningMatchRoomResponse(store, currentUser, room));
}

export function startRunningMatchRoom(store, currentUser, { roomId }) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '시작할 방을 찾지 못했어.', { code: 'room_not_found' });
  }

  if (room.hostUserId !== currentUser.id) {
    throw new ApiError(403, '방장만 시작할 수 있어.');
  }

  if (room.startMode !== 'host') {
    throw new ApiError(400, '예약 시작 방은 시간에 맞춰 자동으로 시작돼.');
  }

  if (room.linkedMatchId) {
    return buildRunningMatchRoomResponse(store, currentUser, room);
  }

  if (room.participants.length < room.minParticipants) {
    throw new ApiError(400, `최소 ${room.minParticipants}명은 모여야 시작할 수 있어.`);
  }

  if (!areAllRunningMatchRoomGuestsReady(room)) {
    throw new ApiError(400, '모든 참가자가 준비 완료해야 시작할 수 있어.');
  }

  const now = new Date();
  const slotStartAt = buildHostStartedMatchSlotStartAt(now, MATCH_ROOM_HOST_MAX_LOADING_WAIT_SECONDS);
  room.slotStartAt = slotStartAt;
  room.participants = room.participants.map((participant) => ({
    ...participant,
    isCountdownReady: participant.userId === currentUser.id,
  }));
  const session = createMatchSession(
    store,
    room.mode,
    room.distanceKm,
    slotStartAt,
    room.participants.map((participant, index) => ({
      id: participant.userId,
      seedRank: index + 1,
    })),
    { isPartyRun: true },
  );
  room.linkedMatchId = session.id;

  return buildRunningMatchRoomResponse(store, currentUser, room);
}

export function updateRunningMatchRoomReady(store, currentUser, {
  roomId,
  ready,
}) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '준비 상태를 바꿀 방을 찾지 못했어.', { code: 'room_not_found' });
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 시작 준비에 들어간 방은 준비 상태를 바꿀 수 없어.');
  }

  const participant = room.participants.find((entry) => entry.userId === currentUser.id);

  if (!participant) {
    throw new ApiError(404, '이 방 참가자 목록에서 사용자를 찾지 못했어.');
  }

  if (participant.isHost) {
    throw new ApiError(400, '방장은 준비 버튼 대신 시작 버튼을 사용해줘.');
  }

  participant.isReady = Boolean(ready);
  syncMatchRooms(store);
  return buildRunningMatchRoomResponse(store, currentUser, room);
}

export function acknowledgeRunningMatchRoomCountdown(store, currentUser, { roomId }) {
  const now = new Date();
  const room = findRunningMatchRoomById(store, roomId, now);

  if (!room) {
    throw new ApiError(404, '카운트다운 준비 상태를 반영할 방을 찾지 못했어.', { code: 'room_not_found' });
  }

  if (!room.linkedMatchId) {
    throw new ApiError(400, '아직 시작 준비가 시작되지 않은 방이에요.');
  }

  const participant = room.participants.find((entry) => entry.userId === currentUser.id);

  if (!participant) {
    throw new ApiError(404, '이 방 참가자 목록에서 사용자를 찾지 못했어.');
  }

  participant.isCountdownReady = true;
  if (!room.countdownArmedAt && areAllRunningMatchRoomParticipantsCountdownReady(room)) {
    armRunningMatchRoomCountdown(store, room, now);
  }
  syncMatchRooms(store, now);
  return buildRunningMatchRoomResponse(store, currentUser, room, now);
}

export function updateRunningMatchRoom(store, currentUser, {
  roomId,
  distanceKm,
  startMode,
  slotStartAt,
  maxParticipants,
  invitedFriendIds = [],
}) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    throw new ApiError(404, '설정할 방을 찾지 못했어.', { code: 'room_not_found' });
  }

  if (room.hostUserId !== currentUser.id) {
    throw new ApiError(403, '방장만 방 설정을 바꿀 수 있어.');
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 시작 준비에 들어간 방은 설정을 바꿀 수 없어.');
  }

  const normalizedInvitedFriendIds = [...new Set(invitedFriendIds
    .filter((userId) => typeof userId === 'string')
    .map((userId) => userId.trim())
    .filter((userId) => userId && userId !== currentUser.id))];

  for (const friendId of normalizedInvitedFriendIds) {
    if (!areFriends(store, currentUser.id, friendId)) {
      throw new ApiError(400, '친구 목록에 있는 러너만 방에 초대할 수 있어.');
    }
  }

  const previousInvitedFriendIds = new Set(room.invitedFriendIds ?? []);

  room.distanceKm = normalizeMatchQueueDistance(distanceKm);
  room.startMode = startMode === 'host' ? 'host' : 'scheduled';
  room.slotStartAt = room.startMode === 'host'
    ? new Date().toISOString()
    : validateMatchSlotInput(slotStartAt);
  room.maxParticipants = normalizeMatchRoomMaxParticipants(room.mode, maxParticipants);
  room.invitedFriendIds = normalizedInvitedFriendIds;
  room.updatedAt = new Date().toISOString();
  appendMatchRoomInviteNotifications(
    store,
    currentUser,
    room,
    normalizedInvitedFriendIds.filter((userId) => !previousInvitedFriendIds.has(userId)),
  );
  syncMatchRooms(store);

  return buildRunningMatchRoomResponse(store, currentUser, room);
}

export function leaveRunningMatchRoom(store, currentUser, { roomId }) {
  const room = findRunningMatchRoomById(store, roomId);

  if (!room) {
    return { success: true, room: null };
  }

  if (room.linkedMatchId) {
    throw new ApiError(400, '이미 대결 세션이 만들어진 방은 대결 화면에서 정리해줘.');
  }

  const participantIndex = room.participants.findIndex((participant) => participant.userId === currentUser.id);
  const wasInvitedOnly = room.invitedFriendIds.includes(currentUser.id) && participantIndex === -1;

  if (participantIndex === -1 && !wasInvitedOnly) {
    return buildRunningMatchRoomResponse(store, currentUser, room);
  }

  room.invitedFriendIds = room.invitedFriendIds.filter((userId) => userId !== currentUser.id);

  if (participantIndex !== -1) {
    const wasHost = room.participants[participantIndex].isHost;
    room.participants.splice(participantIndex, 1);

    if (!room.participants.length) {
      store.matchRooms = ensureMatchRooms(store).filter((entry) => entry.id !== room.id);
      return { success: true, room: null };
    }

    if (wasHost) {
      room.hostUserId = room.participants[0].userId;
      room.participants = room.participants.map((participant, index) => ({
        ...participant,
        isHost: index === 0,
      }));
    }
  }

  return buildRunningMatchRoomResponse(store, currentUser, room);
}
