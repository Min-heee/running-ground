import { ApiError, logBackendInfo } from '../../response/httpResponse.mjs';
import {
  isMatchRoomVisibleToUser,
  isParticipantDoneWithMatch,
  shouldClearLiveRunShareEntry,
} from '../matchPureHelpers.mjs';
import {
  countUserQueueRefs,
  pruneMatchQueues,
  removeUsersFromMatchQueue,
} from '../matchQueueStoreHelpers.mjs';
import {
  ensureMatchSessions,
  hydrateMatchSessionState,
  pruneMatchSessions,
} from '../runningMatchSessionStoreHelpers.mjs';
import {
  ensureMatchRooms,
  getMatchRoomLinkedSession,
  getRunningMatchRoomState,
  pruneMatchRooms,
} from './matchRoomCore.mjs';
import {
  findRunningMatchRoomForUser,
  syncMatchRooms,
} from './matchRoomSync.mjs';
import {
  buildMatchRoomLockMessage,
  buildRunningMatchBlockerApiDetails,
  buildRunningMatchRequestBlocker,
  buildRunningMatchRoomResponse,
  logRunningMatchRequestBlocker,
} from './matchRoomResponses.mjs';

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
