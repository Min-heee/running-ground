import {
  MATCH_SESSION_ACTIVE_TTL_MS,
  MATCH_SESSION_UNSTARTED_ACTIVE_GRACE_MS,
} from '../matchConstants.mjs';
import { resolveParticipantLiveStatus } from '../matchPureHelpers.mjs';

export function ensureMatchSessions(store) {
  if (!Array.isArray(store.matchSessions)) {
    store.matchSessions = [];
  }

  return store.matchSessions;
}

export function hydrateMatchSessionState(session, now = new Date()) {
  const nowMs = now.getTime();
  const startedAtMs = session.startedAt ? new Date(session.startedAt).getTime() : Number.NaN;
  const slotStartAtMs = new Date(session.slotStartAt).getTime();
  const hasLiveProgress = session.participants.some((participant) => {
    const liveStatus = resolveParticipantLiveStatus(participant, now);
    return ['running', 'background', 'paused', 'finished', 'disconnected', 'forfeited'].includes(liveStatus);
  });

  if (Number.isFinite(startedAtMs)) {
    const hasNeverReallyStarted = !hasLiveProgress
      && session.participants.every((participant) => !participant.liveUpdatedAt);

    if (hasNeverReallyStarted) {
      const referenceStartMs = Number.isFinite(slotStartAtMs) ? slotStartAtMs : startedAtMs;

      if (referenceStartMs + MATCH_SESSION_UNSTARTED_ACTIVE_GRACE_MS <= nowMs) {
        return 'expired';
      }
    }

    return startedAtMs + MATCH_SESSION_ACTIVE_TTL_MS > nowMs ? 'active' : 'expired';
  }

  if (Number.isFinite(slotStartAtMs) && slotStartAtMs <= nowMs) {
    session.startedAt = new Date(slotStartAtMs).toISOString();
    return 'active';
  }

  if (hasLiveProgress) {
    session.startedAt = new Date(Math.min(nowMs, slotStartAtMs)).toISOString();
    return 'active';
  }

  if (!Number.isFinite(slotStartAtMs) || slotStartAtMs + MATCH_SESSION_ACTIVE_TTL_MS <= nowMs) {
    return 'expired';
  }

  return 'matched';
}
