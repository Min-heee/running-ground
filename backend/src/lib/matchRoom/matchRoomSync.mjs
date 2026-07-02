import {
  MATCH_ROOM_HOST_LOADING_SECONDS,
  MATCH_ROOM_HOST_START_DELAY_SECONDS,
} from '../matchConstants.mjs';
import {
  areAllRunningMatchRoomParticipantsCountdownReady,
  isMatchRoomVisibleToUser,
} from '../matchPureHelpers.mjs';
import {
  createMatchSession,
  findMatchSessionById,
} from '../runningMatchSessionStoreHelpers.mjs';
import {
  getMatchRoomLinkedSession,
  pruneMatchRooms,
} from './matchRoomCore.mjs';

export function buildHostStartedMatchSlotStartAt(now = new Date(), loadingSeconds = MATCH_ROOM_HOST_LOADING_SECONDS) {
  return new Date(now.getTime() + (loadingSeconds + MATCH_ROOM_HOST_START_DELAY_SECONDS) * 1000).toISOString();
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

export function findRunningMatchRoomById(store, roomId, now = new Date()) {
  return syncMatchRooms(store, now).find((room) => room.id === roomId) ?? null;
}

export function findRunningMatchRoomByInviteToken(store, inviteToken, now = new Date()) {
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

export function armRunningMatchRoomCountdown(store, room, now = new Date()) {
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
  // last ack took (observed live as a variable 0.4s–7s gap).
  //
  // GAME-GRADE RULE: a still-FUTURE slot is NEVER moved — not even when a straggler's ack
  // lands inside the final 10s. The old "keep only if >= now+10s, else rebuild to now+15s"
  // branch re-stamped the slot mid-countdown (observed live: room slot :08 vs re-stamped
  // duel slot :17 — the host counted 3-2-1 on the original instant while the guest's digit
  // died at ~6). A late joiner simply gets a SHORTER visible countdown and joins at the
  // current digit; every phone still starts at the SAME instant, which also scales to 30+
  // (one late ack can no longer slide the start for everyone). Rebuild ONLY when the slot
  // is missing/unparseable or already elapsed (a stale/aborted start needing a fresh slot).
  const existingSlotMs = Date.parse(linkedSession.slotStartAt ?? room.slotStartAt ?? '');
  const slotStartAt = Number.isFinite(existingSlotMs) && existingSlotMs > now.getTime()
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
