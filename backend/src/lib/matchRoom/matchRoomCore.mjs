import {
  MATCH_ROOM_HOST_START_DELAY_SECONDS,
  MATCH_ROOM_IDLE_TTL_MS,
  MATCH_SESSION_ACTIVE_TTL_MS,
} from '../matchConstants.mjs';
import { areAllRunningMatchRoomParticipantsCountdownReady } from '../matchPureHelpers.mjs';
import {
  findMatchSessionById,
  hydrateMatchSessionState,
} from '../runningMatchSessionStoreHelpers.mjs';

export function ensureMatchRooms(store) {
  if (!Array.isArray(store.matchRooms)) {
    store.matchRooms = [];
  }

  return store.matchRooms;
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

export function getMatchRoomLinkedSession(room, store) {
  if (!room?.linkedMatchId) {
    return null;
  }

  return findMatchSessionById(store, room.linkedMatchId);
}

export function getRunningMatchRoomState(room, store, now = new Date()) {
  const linkedSession = getMatchRoomLinkedSession(room, store);

  if (!linkedSession) {
    // A transient findMatchSessionById miss while a linked match is STILL attached (the same
    // race that was dropping the slot block) must NOT collapse the room to 'waiting' — that
    // flickers the guest's room state active↔waiting, which kills its countdown overlay
    // (roomCountdownEntry needs state ∈ arming/countdown/active). Derive the pre-active state
    // from the DURABLE room.slotStartAt instead; the client infers 'active' from the slot
    // elapsing on its own clock. Never claim a false 'active' from this no-session path.
    if (room.linkedMatchId) {
      const slotMs = room.slotStartAt ? new Date(room.slotStartAt).getTime() : Number.NaN;
      if (
        room.startMode === 'host'
        && !room.countdownArmedAt
        && !areAllRunningMatchRoomParticipantsCountdownReady(room)
      ) {
        return 'arming';
      }
      if (Number.isFinite(slotMs)) {
        const remainingSeconds = Math.max(0, Math.ceil((slotMs - now.getTime()) / 1000));
        return remainingSeconds <= MATCH_ROOM_HOST_START_DELAY_SECONDS ? 'countdown' : 'arming';
      }
      return 'arming';
    }
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
  const linkedSlotMs = new Date(linkedSession.slotStartAt).getTime();
  const linkedSlotPassed = Number.isFinite(linkedSlotMs) && now.getTime() >= linkedSlotMs;

  // The SHARED linked session hydrates to 'active' the instant ANY participant pushes live
  // progress — i.e. the HOST's pre-start GPS warm-up, which can land 60-90s BEFORE this room's
  // OWN slot. The ROOM must NOT report 'active' before its slot: a pre-slot 'active' makes the
  // guest's derivePartyRunStartPhase return 'active' (the roomState==='active' branch) and SKIP
  // its countdown entirely (observed on-device: phase→active at remaining=85s). Only honor
  // 'active' once the slot has actually passed.
  if (linkedState === 'active' && linkedSlotPassed) {
    return 'active';
  }

  if (linkedState === 'active' || linkedState === 'matched') {
    // Pre-slot — whether the session reads 'matched' OR is already warm-up-'active'. Count the
    // room down to its OWN slot so the guest shows the countdown, then it flips to 'active' at
    // the slot.
    const remainingSeconds = Math.max(0, Math.ceil((linkedSlotMs - now.getTime()) / 1000));

    if (room.startMode === 'host' && remainingSeconds > MATCH_ROOM_HOST_START_DELAY_SECONDS) {
      return 'arming';
    }

    return remainingSeconds <= MATCH_ROOM_HOST_START_DELAY_SECONDS ? 'countdown' : 'waiting';
  }

  return 'waiting';
}
