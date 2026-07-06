import {
  GROUP_MATCH_MAX_PARTICIPANTS,
  GROUP_PACE_MATCH_TOLERANCE_SECONDS,
} from '../matchConstants.mjs';
import {
  isParticipantDoneWithMatch,
  isSameMatchDistance,
  normalizeMatchQueueDistance,
} from '../matchPureHelpers.mjs';
import { nextId } from '../idHelpers.mjs';
import { isTestMatchSession } from '../matchScheduleHelpers.mjs';
import {
  ensureMatchSessions,
  hydrateMatchSessionState,
} from './matchSessionCore.mjs';
import { sweepStuckMatchSessionFallbacks } from './matchSessionFallbackSeals.mjs';
import { recordVanishedMatch } from '../vanishedMatchTombstones.mjs';

// Every session dropped from the store passes through here so a device still polling
// the vanished matchId gets a terminal 410 (match_gone) instead of retrying a 404
// forever. Cheap no-op when nothing was removed.
function recordPrunedSessions(previousSessions, keptSessions, now) {
  if (previousSessions.length === keptSessions.length) {
    return;
  }

  const keptIds = new Set(keptSessions.map((session) => session.id));

  for (const session of previousSessions) {
    if (session?.id && !keptIds.has(session.id)) {
      recordVanishedMatch(session.id, now);
    }
  }
}

export function pruneMatchSessions(store, now = new Date()) {
  const sessions = ensureMatchSessions(store);
  const activeUserIds = new Set(store.users.map((user) => user.id));

  // Self-heal stuck one-finisher matches BEFORE pruning so a sealed-but-stranded session is
  // resolved + back-filled while it is still physically present. A sealed DNF runner stays a
  // non-finisher (not "done"), so a freshly-sealed one-finisher session is NOT dropped by the
  // filter below — it persists until both sides are terminal or it expires, exactly as before.
  sweepStuckMatchSessionFallbacks(store, now);

  const keptSessions = sessions.filter((session) => {
    if (!session || !Array.isArray(session.participants) || !session.participants.length) {
      return false;
    }

    if (session.participants.some((participant) => !participant.profileSnapshot && !activeUserIds.has(participant.userId))) {
      return false;
    }

    if (session.participants.every((participant) => isParticipantDoneWithMatch(participant, now))) {
      return false;
    }

    return hydrateMatchSessionState(session, now) !== 'expired';
  });

  recordPrunedSessions(sessions, keptSessions, now);
  store.matchSessions = keptSessions;

  return store.matchSessions;
}

function clearUsersFromMatchSessions(store, mode, userIds) {
  const blockedUserIds = new Set(userIds);
  const sessions = pruneMatchSessions(store);
  const keptSessions = sessions.filter((session) => (
    session.mode !== mode || !session.participants.some((participant) => (
      blockedUserIds.has(participant.userId) && !isParticipantDoneWithMatch(participant)
    ))
  ));

  recordPrunedSessions(sessions, keptSessions, new Date());
  store.matchSessions = keptSessions;
}

// Single source of truth for the per-participant session shape. addParticipantToMatchSession
// reuses it so a late joiner is byte-for-byte identical to a founding participant.
function buildSessionParticipant(participant, index) {
  return {
    userId: participant.id,
    seedRank: participant.seedRank ?? index + 1,
    ...(participant.profileSnapshot ? { profileSnapshot: participant.profileSnapshot } : {}),
    acceptedAt: null,
    liveStatus: 'ready',
    liveDistanceKm: 0,
    liveElapsedSeconds: 0,
    livePace: '--:--/km',
    liveUpdatedAt: null,
    finishedAt: null,
    finishElapsedSeconds: null,
  };
}

export function createMatchSession(store, mode, distanceKm, slotStartAt, participants, options = {}) {
  clearUsersFromMatchSessions(store, mode, participants.map((participant) => participant.id));
  const session = {
    id: nextId(`${mode}-match`),
    mode,
    isTestMatch: options.isTestMatch === true,
    isPartyRun: options.isPartyRun === true,
    distanceKm: normalizeMatchQueueDistance(distanceKm),
    slotStartAt,
    // The group anchor — the average pace of the founding 3 — is the gate every later
    // joiner is measured against (±GROUP_PACE_MATCH_TOLERANCE_SECONDS). Persisted at
    // creation; undefined for duels/test sessions where no anchor is supplied.
    ...(Number.isFinite(options.anchorPaceMinutes) ? { anchorPaceMinutes: options.anchorPaceMinutes } : {}),
    createdAt: new Date().toISOString(),
    matchedAt: new Date().toISOString(),
    participants: participants.map((participant, index) => buildSessionParticipant(participant, index)),
  };
  ensureMatchSessions(store).push(session);
  return session;
}

// One-at-a-time late-join admission: push exactly one participant (the closest joiner
// the caller already selected) onto an existing forming group session, using the same
// shape createMatchSession produces. seedRank defaults to the next slot after the
// current participants.
export function addParticipantToMatchSession(session, participant) {
  const index = session.participants.length;
  session.participants.push(buildSessionParticipant(participant, index));
  return session;
}

// Find an existing forming group session a joiner can slot into: same mode + SAME
// distance (exact after normalization) + same slot, still in the 'matched' (pre-start)
// state, under the size cap,
// and whose anchor pace is within ±GROUP_PACE_MATCH_TOLERANCE_SECONDS of the joiner.
// Returns the session or null. Caller adds exactly one joiner per HTTP call so the
// closest joiner wins the single open seat (closest-first, one at a time).
export function findJoinableGroupSession(store, { distanceKm, slotStartAt, joinerPaceMinutes, now = new Date() } = {}) {
  if (!Number.isFinite(joinerPaceMinutes)) {
    return null;
  }

  const normalizedDistanceKm = distanceKm === undefined || distanceKm === null
    ? null
    : normalizeMatchQueueDistance(distanceKm);
  const sessions = pruneMatchSessions(store, now);

  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index];

    if (session.mode !== 'group' || isTestMatchSession(session)) {
      continue;
    }

    if (!Number.isFinite(session.anchorPaceMinutes)) {
      continue;
    }

    if (hydrateMatchSessionState(session, now) !== 'matched') {
      continue;
    }

    if (session.participants.length >= GROUP_MATCH_MAX_PARTICIPANTS) {
      continue;
    }

    // Same-distance ONLY (isSameMatchDistance): a 5.1km requester must never late-join
    // a 5.0km group — the old ±0.15 band allowed exactly that.
    if (normalizedDistanceKm !== null && !isSameMatchDistance(session.distanceKm, normalizedDistanceKm)) {
      continue;
    }

    if (slotStartAt && session.slotStartAt !== slotStartAt) {
      continue;
    }

    const anchorGapSeconds = Math.abs(joinerPaceMinutes - session.anchorPaceMinutes) * 60;

    if (anchorGapSeconds > GROUP_PACE_MATCH_TOLERANCE_SECONDS) {
      continue;
    }

    return session;
  }

  return null;
}

export function findMatchSessionById(store, matchId) {
  if (!matchId) {
    return null;
  }

  return pruneMatchSessions(store).find((session) => session.id === matchId) ?? null;
}

export function findMatchSessionForUser(store, mode, userId, { distanceKm, slotStartAt, testMode = false, matchId } = {}) {
  if (matchId) {
    const directSession = findMatchSessionById(store, matchId);

    if (!directSession || directSession.mode !== mode) {
      return null;
    }

    if (isTestMatchSession(directSession) !== testMode) {
      return null;
    }

    if (!directSession.participants.some((participant) => participant.userId === userId)) {
      return null;
    }

    return directSession;
  }

  const normalizedDistanceKm = distanceKm === undefined ? null : normalizeMatchQueueDistance(distanceKm);
  const sessions = pruneMatchSessions(store);

  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index];
    if (session.mode !== mode) {
      continue;
    }

    if (isTestMatchSession(session) !== testMode) {
      continue;
    }

    if (!session.participants.some((participant) => (
      participant.userId === userId && !isParticipantDoneWithMatch(participant)
    ))) {
      continue;
    }

    if (normalizedDistanceKm !== null && Math.abs(session.distanceKm - normalizedDistanceKm) >= 0.15) {
      continue;
    }

    if (!testMode && slotStartAt && session.slotStartAt !== slotStartAt) {
      continue;
    }

    return session;
  }

  return null;
}

export function findAnyReservedMatchSessionForUser(store, userId, now = new Date()) {
  const sessions = pruneMatchSessions(store, now);

  for (const session of sessions) {
    const participant = session.participants.find((item) => (
      item.userId === userId && !isParticipantDoneWithMatch(item, now)
    ));

    if (!participant) {
      continue;
    }

    const state = hydrateMatchSessionState(session, now);

    if (['matched', 'active'].includes(state)) {
      return { session, state };
    }
  }

  return null;
}
