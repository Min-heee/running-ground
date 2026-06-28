import { ApiError, logBackendInfo } from '../response/httpResponse.mjs';
import {
  MATCH_ROOM_HOST_LOADING_SECONDS,
  MATCH_ROOM_HOST_MAX_LOADING_WAIT_SECONDS,
  MATCH_ROOM_HOST_START_DELAY_SECONDS,
  MATCH_ROOM_IDLE_TTL_MS,
  MATCH_SESSION_ACTIVE_TTL_MS,
} from './matchConstants.mjs';
import {
  buildLiveRunShareLockMessage,
  buildSingleMatchLockMessage,
} from './matchFormatting.mjs';
import { formatDuelSlotLabel as formatDuelSlotLabelFromDateTime } from './dateTimeFormatting.mjs';
import { validateMatchSlotInput } from './matchSlotValidation.mjs';
import {
  buildMatchRoomInviteLink,
  buildOfficialStandingFields,
  areAllRunningMatchRoomGuestsReady,
  areAllRunningMatchRoomParticipantsCountdownReady,
  getMatchRoomMinParticipants,
  isMatchRoomVisibleToUser,
  isParticipantDoneWithMatch,
  normalizeMatchQueueDistance,
  normalizeMatchRoomMaxParticipants,
  shouldClearLiveRunShareEntry,
} from './matchPureHelpers.mjs';
import {
  countUserQueueRefs,
  findAnyQueuedMatchEntryForUser,
  pruneMatchQueues,
  removeUsersFromMatchQueue,
} from './matchQueueStoreHelpers.mjs';
import {
  buildMatchRunnerProfile,
  buildOfficialSessionStandings,
  buildParticipantLiveSnapshot,
  createMatchSession,
  ensureMatchSessions,
  findAnyReservedMatchSessionForUser,
  findMatchSessionById,
  hydrateMatchSessionState,
  pruneMatchSessions,
} from './runningMatchSessionStoreHelpers.mjs';
import { nextId } from './idHelpers.mjs';
import { areFriends } from './socialStoreHelpers.mjs';
import { findUserById } from './userStoreHelpers.mjs';
import { appendUserNotification } from './userNotifications.mjs';

function ensureMatchRooms(store) {
  if (!Array.isArray(store.matchRooms)) {
    store.matchRooms = [];
  }

  return store.matchRooms;
}

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

export function pruneMatchRooms(store, now = new Date()) {
  const rooms = ensureMatchRooms(store);
  const activeUserIds = new Set(store.users.map((user) => user.id));
  const nowMs = now.getTime();

  store.matchRooms = rooms.filter((room) => {
    if (!room || typeof room !== 'object') {
      return false;
    }

    if (!room.hostUserId || !activeUserIds.has(room.hostUserId)) {
      return false;
    }

    if (!Array.isArray(room.participants) || room.participants.length === 0) {
      return false;
    }

    room.participants = room.participants.filter((participant) => activeUserIds.has(participant.userId));
    room.invitedFriendIds = Array.isArray(room.invitedFriendIds)
      ? room.invitedFriendIds.filter((userId) => activeUserIds.has(userId) && userId !== room.hostUserId)
      : [];

    if (!room.participants.some((participant) => participant.userId === room.hostUserId)) {
      return false;
    }

    if (room.linkedMatchId) {
      const linkedSession = findMatchSessionById(store, room.linkedMatchId);

      if (!linkedSession) {
        return false;
      }

      const linkedState = hydrateMatchSessionState(linkedSession, now);
      return linkedState === 'matched' || linkedState === 'active';
    }

    if (room.startMode === 'scheduled') {
      const slotStartAtMs = new Date(room.slotStartAt).getTime();
      return Number.isFinite(slotStartAtMs) && slotStartAtMs + MATCH_SESSION_ACTIVE_TTL_MS > nowMs;
    }

    const createdAtMs = new Date(room.createdAt).getTime();
    return Number.isFinite(createdAtMs) && createdAtMs + MATCH_ROOM_IDLE_TTL_MS > nowMs;
  });

  return store.matchRooms;
}

function getMatchRoomLinkedSession(room, store) {
  if (!room?.linkedMatchId) {
    return null;
  }

  return findMatchSessionById(store, room.linkedMatchId);
}

function buildHostStartedMatchSlotStartAt(now = new Date(), loadingSeconds = MATCH_ROOM_HOST_LOADING_SECONDS) {
  return new Date(now.getTime() + (loadingSeconds + MATCH_ROOM_HOST_START_DELAY_SECONDS) * 1000).toISOString();
}

function getRunningMatchRoomState(room, store, now = new Date()) {
  const linkedSession = getMatchRoomLinkedSession(room, store);

  if (!linkedSession) {
    return 'waiting';
  }

  if (
    room.startMode === 'host'
    && !room.countdownArmedAt
    && !areAllRunningMatchRoomParticipantsCountdownReady(room)
  ) {
    return 'arming';
  }

  const linkedState = hydrateMatchSessionState(linkedSession, now);

  if (linkedState === 'active') {
    return 'active';
  }

  if (linkedState === 'matched') {
    const remainingSeconds = Math.max(0, Math.ceil((new Date(linkedSession.slotStartAt).getTime() - now.getTime()) / 1000));

    if (room.startMode === 'host' && remainingSeconds > MATCH_ROOM_HOST_START_DELAY_SECONDS) {
      return 'arming';
    }

    return remainingSeconds <= MATCH_ROOM_HOST_START_DELAY_SECONDS ? 'countdown' : 'waiting';
  }

  return 'waiting';
}

function syncScheduledMatchRoom(room, store, now = new Date()) {
  if (!room || room.startMode !== 'scheduled' || room.linkedMatchId) {
    return room;
  }

  if (room.participants.length < room.minParticipants) {
    return room;
  }

  const slotStartAtMs = new Date(room.slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return room;
  }

  if (now.getTime() < slotStartAtMs - MATCH_ROOM_HOST_START_DELAY_SECONDS * 1000) {
    return room;
  }

  const session = createMatchSession(
    store,
    room.mode,
    room.distanceKm,
    room.slotStartAt,
    room.participants.map((participant, index) => ({
      id: participant.userId,
      seedRank: index + 1,
    })),
    { isPartyRun: true },
  );

  room.linkedMatchId = session.id;
  return room;
}

export function syncMatchRooms(store, now = new Date()) {
  const rooms = pruneMatchRooms(store, now);
  return rooms
    .map((room) => syncScheduledMatchRoom(room, store, now))
    .map((room) => syncHostStartedMatchRoomCountdown(room, store, now));
}

function findRunningMatchRoomById(store, roomId, now = new Date()) {
  return syncMatchRooms(store, now).find((room) => room.id === roomId) ?? null;
}

function findRunningMatchRoomByInviteToken(store, inviteToken, now = new Date()) {
  const normalizedToken = String(inviteToken ?? '').trim().toUpperCase();

  if (!normalizedToken) {
    return null;
  }

  return syncMatchRooms(store, now).find((room) => String(room.inviteToken).toUpperCase() === normalizedToken) ?? null;
}

export function findRunningMatchRoomForUser(store, userId, now = new Date()) {
  const rooms = syncMatchRooms(store, now)
    .filter((room) => isMatchRoomVisibleToUser(room, userId))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return rooms[0] ?? null;
}

export function findRunningMatchRoomInviteInboxForUser(store, currentUser, now = new Date()) {
  const identityAliases = new Set([
    currentUser?.id,
    currentUser?.publicTag,
  ].map((value) => String(value ?? '').trim()).filter(Boolean));
  const rooms = syncMatchRooms(store, now)
    .filter((room) => (
      !room.participants.some((participant) => identityAliases.has(participant.userId))
      && Array.isArray(room.invitedFriendIds)
      && room.invitedFriendIds.some((invitedUserId) => identityAliases.has(String(invitedUserId ?? '').trim()))
    ))
    .sort((left, right) => new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime());

  return rooms[0] ?? null;
}

function buildRunningMatchRoomParticipantPayload(store, participant, linkedParticipantFieldsByUserId = null) {
  const user = findUserById(store, participant.userId);
  const runner = buildMatchRunnerProfile(store, user);
  const linkedParticipantFields = linkedParticipantFieldsByUserId?.get(participant.userId) ?? null;

  return {
    userId: runner.id,
    name: runner.name,
    tag: runner.tag,
    districtName: runner.districtName,
    averagePace: runner.averagePace,
    levelLabel: runner.levelLabel,
    ...(linkedParticipantFields ?? {}),
    isHost: Boolean(participant.isHost),
    isReady: Boolean(participant.isReady),
    isCountdownReady: Boolean(participant.isCountdownReady),
    invited: Boolean(participant.invited),
    joinedAt: participant.joinedAt,
  };
}

function buildRunningMatchRoomInviteePayload(store, room, userId, invitedAt) {
  const user = findUserById(store, userId);
  const runner = buildMatchRunnerProfile(store, user);

  return {
    inviteId: `${room.id}:${runner.id}`,
    roomId: room.id,
    inviteToken: room.inviteToken,
    invitedUserId: runner.id,
    userId: runner.id,
    name: runner.name,
    tag: runner.tag,
    districtName: runner.districtName,
    averagePace: runner.averagePace,
    levelLabel: runner.levelLabel,
    status: 'pending',
    ...(invitedAt ? { invitedAt } : {}),
  };
}

function armRunningMatchRoomCountdown(store, room, now = new Date()) {
  if (!room?.linkedMatchId) {
    return room;
  }

  const linkedSession = findMatchSessionById(store, room.linkedMatchId);
  if (!linkedSession) {
    return room;
  }

  // Already armed → the shared start instant is locked; a re-entry (a status echo / re-queue
  // path that re-reaches arm) must NOT re-stamp the slot. Re-stamping here is the key-churn
  // re-flash vector at the source: it moves slotStartAt, which rotates the client countdownKey
  // (`${matchId}:${slotStartAt}`) and re-mints the locked countdown mid-flight. Additive,
  // idempotent guard — once armed, arming is a no-op for the slot.
  if (room.countdownArmedAt) {
    return room;
  }

  // Arming signals "everyone is ready" — it must NOT move the shared start time. The
  // host has no room-update channel once linkedMatchId is set, so rewriting the slot
  // here left the host counting against the slot agreed at start while guests counted
  // against the rewritten one: the two countdowns finished apart by however long the
  // last ack took (observed live as a variable 0.4s–7s gap). Keep the start slot while
  // it still leaves the full visible countdown; only rebuild it in the edge case where
  // it no longer does.
  const existingSlotMs = Date.parse(linkedSession.slotStartAt ?? room.slotStartAt ?? '');
  const minSlotMs = now.getTime() + MATCH_ROOM_HOST_START_DELAY_SECONDS * 1000;
  const slotStartAt = Number.isFinite(existingSlotMs) && existingSlotMs >= minSlotMs
    ? new Date(existingSlotMs).toISOString()
    : buildHostStartedMatchSlotStartAt(now);
  room.slotStartAt = slotStartAt;
  room.countdownArmedAt = now.toISOString();
  linkedSession.slotStartAt = slotStartAt;
  delete linkedSession.startedAt;
  return room;
}

function syncHostStartedMatchRoomCountdown(room, store, now = new Date()) {
  if (!room || room.startMode !== 'host' || !room.linkedMatchId) {
    return room;
  }

  const linkedSession = getMatchRoomLinkedSession(room, store);
  if (!linkedSession || room.countdownArmedAt) {
    return room;
  }

  const allParticipantsCountdownReady = areAllRunningMatchRoomParticipantsCountdownReady(room);
  const ceilingSlotStartAtMs = new Date(linkedSession.slotStartAt ?? room.slotStartAt).getTime();
  const maxLoadingWindowEnded = Number.isFinite(ceilingSlotStartAtMs)
    && now.getTime() >= ceilingSlotStartAtMs - MATCH_ROOM_HOST_START_DELAY_SECONDS * 1000;

  if (allParticipantsCountdownReady || maxLoadingWindowEnded) {
    return armRunningMatchRoomCountdown(store, room, now);
  }

  return room;
}

export function buildRunningMatchRoomResponse(store, currentUser, room, now = new Date()) {
  if (!room) {
    return {
      success: true,
      serverNow: now.toISOString(),
      room: null,
    };
  }

  const hostUser = findUserById(store, room.hostUserId);
  const linkedSession = getMatchRoomLinkedSession(room, store);
  const linkedMatchState = linkedSession ? hydrateMatchSessionState(linkedSession, now) : null;
  const linkedOfficialByUserId = linkedSession
    ? new Map(buildOfficialSessionStandings(store, linkedSession, now).map((standing) => [standing.userId, standing]))
    : null;
  const linkedParticipantFieldsByUserId = linkedSession
    ? new Map(linkedSession.participants.map((participant) => [
        participant.userId,
        {
          ...buildParticipantLiveSnapshot(linkedSession, participant, now),
          ...buildOfficialStandingFields(linkedOfficialByUserId?.get(participant.userId)),
        },
      ]))
    : null;
  const roomState = getRunningMatchRoomState(room, store, now);
  const hasJoined = room.participants.some((participant) => participant.userId === currentUser.id);
  const joinedUserIds = new Set(room.participants.map((participant) => participant.userId));
  const pendingInvitedFriendIds = room.invitedFriendIds.filter((userId) => !joinedUserIds.has(userId));
  const linkedCurrentParticipant = linkedSession?.participants?.find((participant) => participant.userId === currentUser.id);

  if (linkedCurrentParticipant && isParticipantDoneWithMatch(linkedCurrentParticipant, now)) {
    return {
      success: true,
      serverNow: now.toISOString(),
      room: null,
    };
  }

  return {
    success: true,
    serverNow: now.toISOString(),
    room: {
      roomId: room.id,
      inviteToken: room.inviteToken,
      inviteLink: buildMatchRoomInviteLink(room.inviteToken),
      mode: room.mode,
      state: roomState,
      startMode: room.startMode,
      distanceKm: room.distanceKm,
      slotStartAt: room.slotStartAt,
      slotLabel: room.startMode === 'host' && !linkedSession
        ? '방장 시작'
        : formatDuelSlotLabelFromDateTime(room.slotStartAt),
      maxParticipants: room.maxParticipants,
      minParticipants: room.minParticipants,
      canStart: room.startMode === 'host'
        && room.hostUserId === currentUser.id
        && !linkedSession
        && room.participants.length >= room.minParticipants
        && areAllRunningMatchRoomGuestsReady(room),
      isHost: room.hostUserId === currentUser.id,
      hostUserId: room.hostUserId,
      hostName: hostUser.name,
      participants: room.participants
        .map((participant) => buildRunningMatchRoomParticipantPayload(store, participant, linkedParticipantFieldsByUserId))
        .sort((left, right) => {
          if (left.isHost !== right.isHost) {
            return left.isHost ? -1 : 1;
          }

          return new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime();
        }),
      invitedFriendIds: room.invitedFriendIds,
      invitedFriends: pendingInvitedFriendIds.map((userId) => buildRunningMatchRoomInviteePayload(store, room, userId, room.updatedAt ?? room.createdAt)),
      countdownReadyCount: room.participants.filter((participant) => participant.isCountdownReady).length,
      countdownReadyRequiredCount: room.participants.length,
      ...(linkedSession ? {
        linkedMatchId: linkedSession.id,
        linkedMatchStatus: linkedMatchState === 'active' ? 'active' : 'matched',
        linkedMatchSlotStartAt: linkedSession.slotStartAt,
        linkedMatchDistanceKm: linkedSession.distanceKm,
      } : {}),
      joined: hasJoined,
    },
  };
}

function buildMatchRoomLockMessage(room, store, currentUserId) {
  const modeLabel = room.mode === 'duel' ? '1대1 방' : '그룹 방';
  const roomState = getRunningMatchRoomState(room, store);

  if (roomState === 'active') {
    return `이미 진행 중인 ${modeLabel}이 있어요. 현재 대결을 먼저 끝내야 새 매칭을 신청할 수 있어요.`;
  }

  if (room.startMode === 'host' && !room.linkedMatchId) {
    return `이미 참여 중인 ${modeLabel}이 있어요. 그 방을 먼저 나와야 다른 매칭을 신청할 수 있어요.`;
  }

  return `이미 예약된 ${modeLabel}이 있어요. 기존 방을 먼저 정리해야 다른 매칭을 신청할 수 있어요.`;
}

function getLiveRunShareEntryForUser(store, userId) {
  if (Array.isArray(store.liveRunShares)) {
    return store.liveRunShares.find((entry) => entry?.userId === userId) ?? null;
  }

  if (store.liveRunShares && typeof store.liveRunShares === 'object') {
    return store.liveRunShares[userId] ?? null;
  }

  return null;
}

function buildRunningMatchRequestBlocker(store, currentUser, now = new Date()) {
  const existingSession = findAnyReservedMatchSessionForUser(store, currentUser.id, now);

  if (existingSession) {
    return {
      legacyBlocker: 'matchSession',
      source: 'matchSessions.activeParticipant',
      message: buildSingleMatchLockMessage(existingSession.session.mode, existingSession.session.slotStartAt, existingSession.state),
      details: {
        source: 'matchSessions.activeParticipant',
        sessionId: existingSession.session.id,
        mode: existingSession.session.mode,
        state: existingSession.state,
        slotStartAt: existingSession.session.slotStartAt,
      },
    };
  }

  const existingQueue = findAnyQueuedMatchEntryForUser(store, currentUser.id);

  if (existingQueue) {
    return {
      legacyBlocker: 'matchQueue',
      source: `matchQueues.${existingQueue.mode}`,
      message: buildSingleMatchLockMessage(existingQueue.mode, existingQueue.entry.slotStartAt, 'waiting'),
      details: {
        source: `matchQueues.${existingQueue.mode}`,
        queueId: existingQueue.entry.id,
        mode: existingQueue.mode,
        state: 'waiting',
        slotStartAt: existingQueue.entry.slotStartAt,
      },
    };
  }

  const existingRoom = findRunningMatchRoomForUser(store, currentUser.id, now);

  if (existingRoom) {
    const participant = existingRoom.participants.find((entry) => entry.userId === currentUser.id) ?? null;
    const isInvited = Array.isArray(existingRoom.invitedFriendIds) && existingRoom.invitedFriendIds.includes(currentUser.id);
    const roomState = getRunningMatchRoomState(existingRoom, store, now);
    const source = participant ? 'matchRooms.participant' : 'matchRooms.invited';

    return {
      legacyBlocker: 'activeRoom',
      source,
      message: buildMatchRoomLockMessage(existingRoom, store, currentUser.id),
      room: existingRoom,
      details: {
        source,
        roomId: existingRoom.id,
        mode: existingRoom.mode,
        state: roomState,
        startMode: existingRoom.startMode,
        slotStartAt: existingRoom.slotStartAt,
        linkedMatchId: existingRoom.linkedMatchId ?? null,
        isHost: existingRoom.hostUserId === currentUser.id,
        isParticipant: Boolean(participant),
        isInvited,
      },
    };
  }

  const liveRunShare = getLiveRunShareEntryForUser(store, currentUser.id);

  if (liveRunShare && !shouldClearLiveRunShareEntry(liveRunShare, now)) {
    return {
      legacyBlocker: 'liveRunShare',
      source: 'liveRunShares.active',
      message: buildLiveRunShareLockMessage(),
      details: {
        source: 'liveRunShares.active',
        state: String(liveRunShare.status ?? 'running'),
        updatedAt: liveRunShare.updatedAt ?? liveRunShare.lastUpdatedAt ?? liveRunShare.createdAt ?? null,
      },
    };
  }

  return null;
}

function logRunningMatchRequestBlocker(label, currentUser, blocker) {
  if (!blocker) {
    return;
  }

  logBackendInfo(label, {
    userId: currentUser.id,
    blocker: blocker.legacyBlocker,
    blockerSource: blocker.source,
    blockerDetails: blocker.details,
  });
}

function buildRunningMatchBlockerApiDetails(blocker) {
  return {
    blocker: blocker.legacyBlocker,
    blockerSource: blocker.source,
    blockerDetails: blocker.details ?? null,
    code: blocker.legacyBlocker === 'activeRoom' ? 'active_room_blocked' : 'stale_room_blocked',
  };
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

function countUserRoomRefs(store, userId) {
  return ensureMatchRooms(store).filter((room) => isMatchRoomVisibleToUser(room, userId)).length;
}

function countUserSessionRefs(store, userId) {
  return ensureMatchSessions(store).filter((session) => (
    Array.isArray(session.participants)
    && session.participants.some((participant) => participant.userId === userId)
  )).length;
}

function clearUserStaleReferenceFields(store, currentUser) {
  const cleanedItems = [];
  const now = new Date();
  const roomIdFields = [
    'activeRoomId',
    'activeMatchRoomId',
    'activeRunningMatchRoomId',
    'currentRoomId',
    'currentMatchRoomId',
    'partyRunRoomId',
  ];
  const matchIdFields = [
    'activeMatchId',
    'activeSessionId',
    'runningMatchId',
    'currentMatchId',
    'activeDuelMatchId',
    'activeGroupMatchId',
  ];

  for (const field of roomIdFields) {
    const value = currentUser[field];
    const hasCurrentUserRoomReference = ensureMatchRooms(store).some((room) => (
      room.id === value && isMatchRoomVisibleToUser(room, currentUser.id)
    ));

    if (typeof value === 'string' && value && !hasCurrentUserRoomReference) {
      delete currentUser[field];
      cleanedItems.push(`user.${field}`);
    }
  }

  for (const field of matchIdFields) {
    const value = currentUser[field];
    const hasCurrentUserSessionReference = ensureMatchSessions(store).some((session) => (
      session.id === value
      && ['matched', 'active'].includes(hydrateMatchSessionState(session, now))
      && session.participants.some((participant) => (
        participant.userId === currentUser.id && !isParticipantDoneWithMatch(participant, now)
      ))
    ));

    if (typeof value === 'string' && value && !hasCurrentUserSessionReference) {
      delete currentUser[field];
      cleanedItems.push(`user.${field}`);
    }
  }

  return cleanedItems;
}

function clearUserLiveRunShare(store, userId, now = new Date()) {
  if (Array.isArray(store.liveRunShares)) {
    const beforeCount = store.liveRunShares.length;
    store.liveRunShares = store.liveRunShares.filter((entry) => (
      entry?.userId !== userId || !shouldClearLiveRunShareEntry(entry, now)
    ));
    return store.liveRunShares.length !== beforeCount;
  }

  if (store.liveRunShares && typeof store.liveRunShares === 'object') {
    const entry = store.liveRunShares[userId];
    if (Object.prototype.hasOwnProperty.call(store.liveRunShares, userId) && shouldClearLiveRunShareEntry(entry, now)) {
      delete store.liveRunShares[userId];
      return true;
    }
  }

  return false;
}

function forceClearUserLiveRunShare(store, userId) {
  if (Array.isArray(store.liveRunShares)) {
    const beforeCount = store.liveRunShares.length;
    store.liveRunShares = store.liveRunShares.filter((entry) => entry?.userId !== userId);
    return store.liveRunShares.length !== beforeCount;
  }

  if (store.liveRunShares && typeof store.liveRunShares === 'object') {
    if (Object.prototype.hasOwnProperty.call(store.liveRunShares, userId)) {
      delete store.liveRunShares[userId];
      return true;
    }
  }

  return false;
}

function detachUserFromStaleMatchRoom(store, room, userId) {
  const rooms = ensureMatchRooms(store);
  const roomIndex = rooms.findIndex((entry) => entry.id === room.id);

  if (roomIndex === -1) {
    return false;
  }

  const nextParticipants = room.participants.filter((participant) => participant.userId !== userId);
  const beforeInviteCount = Array.isArray(room.invitedFriendIds) ? room.invitedFriendIds.length : 0;
  room.invitedFriendIds = Array.isArray(room.invitedFriendIds)
    ? room.invitedFriendIds.filter((invitedUserId) => invitedUserId !== userId)
    : [];
  const removedParticipant = nextParticipants.length !== room.participants.length;
  const removedInvite = room.invitedFriendIds.length !== beforeInviteCount;

  if (!removedParticipant && !removedInvite) {
    return false;
  }

  if (nextParticipants.length === 0) {
    store.matchRooms = rooms.filter((entry) => entry.id !== room.id);
    return true;
  }

  const removedHost = room.hostUserId === userId || room.participants.some((participant) => participant.userId === userId && participant.isHost);
  room.participants = nextParticipants;

  if (removedHost) {
    room.hostUserId = room.participants[0].userId;
    room.participants = room.participants.map((participant, index) => ({
      ...participant,
      isHost: index === 0,
    }));
  }

  room.updatedAt = new Date().toISOString();
  return true;
}

export function forceResetRunningMatchStateForUser(store, currentUser, now = new Date()) {
  const cleanedItems = [];
  const nowIso = now.toISOString();
  const rooms = ensureMatchRooms(store);
  const nextRooms = [];

  for (const room of rooms) {
    const beforeParticipantCount = Array.isArray(room.participants) ? room.participants.length : 0;
    const beforeInviteCount = Array.isArray(room.invitedFriendIds) ? room.invitedFriendIds.length : 0;
    const nextParticipants = (room.participants ?? []).filter((participant) => participant.userId !== currentUser.id);
    const nextInvitedFriendIds = Array.isArray(room.invitedFriendIds)
      ? room.invitedFriendIds.filter((userId) => userId !== currentUser.id)
      : [];
    const removedParticipant = nextParticipants.length !== beforeParticipantCount;
    const removedInvite = nextInvitedFriendIds.length !== beforeInviteCount;

    if (!removedParticipant && !removedInvite) {
      nextRooms.push(room);
      continue;
    }

    if (!nextParticipants.length) {
      cleanedItems.push(`matchRooms.deleted:${room.id}`);
      continue;
    }

    const removedHost = room.hostUserId === currentUser.id
      || (room.participants ?? []).some((participant) => participant.userId === currentUser.id && participant.isHost);

    room.participants = nextParticipants;
    room.invitedFriendIds = nextInvitedFriendIds;

    if (removedHost) {
      room.hostUserId = nextParticipants[0].userId;
      room.participants = nextParticipants.map((participant, index) => ({
        ...participant,
        isHost: index === 0,
      }));
      cleanedItems.push(`matchRooms.hostTransferred:${room.id}`);
    }

    if (removedParticipant) {
      cleanedItems.push(`matchRooms.participantRemoved:${room.id}`);
    }

    if (removedInvite) {
      cleanedItems.push(`matchRooms.inviteRemoved:${room.id}`);
    }

    room.updatedAt = nowIso;
    nextRooms.push(room);
  }

  store.matchRooms = nextRooms;

  for (const session of ensureMatchSessions(store)) {
    if (!Array.isArray(session.participants)) {
      continue;
    }

    const participant = session.participants.find((entry) => entry.userId === currentUser.id);
    if (!participant || ['finished', 'forfeited'].includes(participant.liveStatus)) {
      continue;
    }

    participant.liveStatus = 'forfeited';
    participant.liveUpdatedAt = nowIso;
    participant.forfeitedAt = nowIso;
    cleanedItems.push(`matchSessions.forfeited:${session.id}`);
  }

  for (const mode of ['duel', 'group']) {
    const beforeQueueRefs = countUserQueueRefs(store, currentUser.id);
    removeUsersFromMatchQueue(store, mode, [currentUser.id]);
    const afterQueueRefs = countUserQueueRefs(store, currentUser.id);

    if (afterQueueRefs < beforeQueueRefs) {
      cleanedItems.push(`matchQueues.${mode}.removed`);
    }
  }

  if (forceClearUserLiveRunShare(store, currentUser.id)) {
    cleanedItems.push('liveRunShares.currentUser');
  }

  cleanedItems.push(...clearUserStaleReferenceFields(store, currentUser));
  syncMatchRooms(store, now);

  logBackendInfo('running_match_force_reset', {
    cleanedItems,
    userId: currentUser.id,
  });

  return {
    success: true,
    serverNow: nowIso,
    cleaned: cleanedItems.length > 0,
    cleanedItems,
  };
}

export function cleanupStaleRunningMatchRoomState(store, currentUser, now = new Date()) {
  const cleanedItems = [];
  const beforeRoomRefs = countUserRoomRefs(store, currentUser.id);
  const beforeSessionRefs = countUserSessionRefs(store, currentUser.id);
  const beforeQueueRefs = countUserQueueRefs(store, currentUser.id);

  pruneMatchQueues(store, now);
  pruneMatchSessions(store, now);
  pruneMatchRooms(store, now);

  const afterPruneRoomRefs = countUserRoomRefs(store, currentUser.id);
  const afterPruneSessionRefs = countUserSessionRefs(store, currentUser.id);
  const afterPruneQueueRefs = countUserQueueRefs(store, currentUser.id);

  if (afterPruneRoomRefs < beforeRoomRefs) {
    cleanedItems.push('matchRooms.pruned');
  }

  if (afterPruneSessionRefs < beforeSessionRefs) {
    cleanedItems.push('matchSessions.pruned');
  }

  if (afterPruneQueueRefs < beforeQueueRefs) {
    cleanedItems.push('matchQueues.pruned');
  }

  cleanedItems.push(...clearUserStaleReferenceFields(store, currentUser));

  const existingRoom = findRunningMatchRoomForUser(store, currentUser.id, now);

  if (existingRoom) {
    const linkedSession = getMatchRoomLinkedSession(existingRoom, store);
    const linkedParticipant = linkedSession?.participants?.find((participant) => participant.userId === currentUser.id) ?? null;
    const roomPayload = buildRunningMatchRoomResponse(store, currentUser, existingRoom, now);
    const shouldDetachStaleRoomParticipant = Boolean(
      !roomPayload.room
      || (linkedParticipant && isParticipantDoneWithMatch(linkedParticipant, now))
      || (existingRoom.linkedMatchId && !linkedSession),
    );

    if (!shouldDetachStaleRoomParticipant) {
      const blocker = buildRunningMatchRequestBlocker(store, currentUser, now);
      logRunningMatchRequestBlocker('running_match_cleanup_blocked', currentUser, blocker);
      return {
        success: true,
        serverNow: now.toISOString(),
        code: 'active_room_blocked',
        cleaned: cleanedItems.length > 0,
        cleanedItems,
        blocker: blocker?.legacyBlocker ?? 'activeRoom',
        blockerSource: blocker?.source ?? 'matchRooms.participant',
        blockerDetails: blocker?.details ?? {
          source: 'matchRooms.participant',
          roomId: existingRoom.id,
          mode: existingRoom.mode,
          state: getRunningMatchRoomState(existingRoom, store, now),
        },
        message: blocker?.message ?? buildMatchRoomLockMessage(existingRoom, store, currentUser.id),
        room: roomPayload.room,
      };
    }

    if (detachUserFromStaleMatchRoom(store, existingRoom, currentUser.id)) {
      cleanedItems.push('matchRooms.detachedDoneParticipant');
    }

    pruneMatchRooms(store, now);
  }

  if (clearUserLiveRunShare(store, currentUser.id, now)) {
    cleanedItems.push('liveRunShares.currentUser');
  }

  const blocker = buildRunningMatchRequestBlocker(store, currentUser, now);

  if (blocker) {
    logRunningMatchRequestBlocker('running_match_cleanup_blocked', currentUser, blocker);
    return {
      success: true,
      serverNow: now.toISOString(),
      code: blocker.legacyBlocker === 'activeRoom' ? 'active_room_blocked' : 'stale_room_blocked',
      cleaned: cleanedItems.length > 0,
      cleanedItems,
      blocker: blocker.legacyBlocker,
      blockerSource: blocker.source,
      blockerDetails: blocker.details,
      message: blocker.message,
      room: blocker.room ? buildRunningMatchRoomResponse(store, currentUser, blocker.room, now).room : null,
    };
  }

  const nextRoom = findRunningMatchRoomForUser(store, currentUser.id, now);

  return {
    success: true,
    serverNow: now.toISOString(),
    cleaned: cleanedItems.length > 0,
    cleanedItems,
    room: nextRoom ? buildRunningMatchRoomResponse(store, currentUser, nextRoom, now).room : null,
  };
}


export function assertUserCanRequestAnotherMatch(store, currentUser) {
  const now = new Date();
  const cleanup = cleanupStaleRunningMatchRoomState(store, currentUser, now);

  if (cleanup.blocker) {
    logRunningMatchRequestBlocker('running_match_request_blocked', currentUser, {
      legacyBlocker: cleanup.blocker,
      source: cleanup.blockerSource ?? cleanup.blocker,
      details: cleanup.blockerDetails ?? null,
    });
    throw new ApiError(400, cleanup.message ?? '이미 진행 중인 매칭 상태가 있어요.', buildRunningMatchBlockerApiDetails({
      legacyBlocker: cleanup.blocker,
      source: cleanup.blockerSource ?? cleanup.blocker,
      details: cleanup.blockerDetails ?? null,
    }));
  }
}
