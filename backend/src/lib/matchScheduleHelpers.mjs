import {
  MATCH_BOOKING_CUTOFF_MS,
  MATCH_CANCELLATION_CUTOFF_MS,
  MATCH_TEST_COUNTDOWN_SECONDS,
  MATCH_TEST_MAX_WAIT_MS,
} from './matchConstants.mjs';

export function buildTestMatchStartAt(now = new Date()) {
  return new Date(now.getTime() + MATCH_TEST_COUNTDOWN_SECONDS * 1000).toISOString();
}

export function buildTestMatchQueueExpiresAt(now = new Date()) {
  return new Date(now.getTime() + MATCH_TEST_MAX_WAIT_MS).toISOString();
}

export function getMatchQueueEntryExpiresAt(entry) {
  if (entry?.testMode) {
    return entry.expiresAt || new Date(new Date(entry.requestedAt).getTime() + MATCH_TEST_MAX_WAIT_MS).toISOString();
  }

  return getMatchBookingClosesAt(entry?.slotStartAt);
}

export function isTestMatchSession(session) {
  return session?.isTestMatch === true || session?.participants?.some((participant) => participant.profileSnapshot);
}

export function buildMatchCancellationDeadline(slotStartAt, { isTestMatch = false } = {}) {
  return new Date(
    isTestMatch
      ? slotStartAt
      : new Date(slotStartAt).getTime() - MATCH_CANCELLATION_CUTOFF_MS,
  );
}

export function getMatchBookingClosesAt(slotStartAt) {
  const slotStartAtMs = new Date(slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return null;
  }

  return new Date(slotStartAtMs - MATCH_BOOKING_CUTOFF_MS).toISOString();
}

export function isMatchSlotClosed(slotStartAt, now = new Date()) {
  const closesAt = getMatchBookingClosesAt(slotStartAt);

  if (!closesAt) {
    return true;
  }

  return new Date(closesAt).getTime() <= now.getTime();
}
