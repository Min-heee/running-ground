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

// 파티런 예약(isPartyRun)은 출발 직전까지 취소할 수 있다 — 1시간 컷오프는 모르는 사람끼리
// 짝지어진 공식 예약을 위한 것이고(상대를 재큐잉해야 한다), 친구끼리의 약속에는 맞지 않는다.
export function buildMatchCancellationDeadline(slotStartAt, { isTestMatch = false, isPartyRun = false } = {}) {
  return new Date(
    isTestMatch || isPartyRun
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
