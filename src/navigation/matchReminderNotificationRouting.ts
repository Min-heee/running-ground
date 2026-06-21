import type { UpcomingRunningMatchItem } from '@/lib/api/types';

export const MATCH_REMINDER_KIND = 'runningground-match-reminder';
// The server-pushed result notification carries `type: 'match_result'` in its data
// (no `kind`, which is reserved for the locally-scheduled reminder). Tapping it must
// open the dedicated match-result screen, NOT the live arena.
export const MATCH_RESULT_NOTIFICATION_TYPE = 'match_result';
export const MATCH_REMINDER_DEDUPE_WINDOW_MS = 15_000;

export type MatchReminderNotificationPhase = 'received' | 'tap';

export type NotificationTraceDetail = {
  hasInviteToken: boolean;
  inviteTokenLength: number | null;
  kind: string | null;
  type: string | null;
  matchId: string | null;
  mode: 'duel' | 'group' | null;
  roomId: string | null;
};

type MatchResultRouteTarget = {
  pathname: '/match-result';
  params: {
    matchId: string;
    matchMode?: 'duel' | 'group';
  };
};

type MatchReminderRouteTarget = {
  pathname: '/(tabs)/running';
  params: {
    focusMatchMode?: 'duel' | 'group';
    focusMatchId?: string;
    focusMatchDistanceKm?: string;
    focusMatchSlotStartAt?: string;
    focusMatchIsTest?: string;
    focusMatchNonce: string;
    focusRoomId?: string;
    forceMatchArena?: string;
  };
};

const notificationDedupeMap = new Map<string, number>();

function getPayload(data: unknown) {
  return typeof data === 'object' && data !== null
    ? data as Record<string, unknown>
    : {};
}

function normalizeMode(value: unknown): 'duel' | 'group' | null {
  return value === 'duel' || value === 'group' ? value : null;
}

export function buildNotificationTraceDetail(data: unknown): NotificationTraceDetail {
  const payload = getPayload(data);
  const roomId = typeof payload.roomId === 'string' && payload.roomId.trim()
    ? payload.roomId
    : null;
  const matchId = typeof payload.matchId === 'string' && payload.matchId.trim()
    ? payload.matchId
    : null;
  const kind = typeof payload.kind === 'string' ? payload.kind : null;
  const type = typeof payload.type === 'string' ? payload.type : null;
  const inviteToken = typeof payload.inviteToken === 'string' ? payload.inviteToken : null;

  return {
    hasInviteToken: Boolean(inviteToken),
    inviteTokenLength: inviteToken?.length ?? null,
    kind,
    type,
    matchId,
    mode: normalizeMode(payload.mode),
    roomId,
  };
}

export function isMatchReminderNotification(detail: NotificationTraceDetail) {
  return detail.kind === MATCH_REMINDER_KIND && Boolean(detail.matchId);
}

// A confirmed-result push (결과확정). Detected by the inbox `type` the backend stamps
// onto the notification data — distinct from the reminder's `kind`.
export function isMatchResultNotification(detail: NotificationTraceDetail) {
  return detail.type === MATCH_RESULT_NOTIFICATION_TYPE && Boolean(detail.matchId);
}

export function buildMatchResultRouteTarget(
  detail: NotificationTraceDetail,
): MatchResultRouteTarget | null {
  if (!detail.matchId) {
    return null;
  }

  return {
    pathname: '/match-result',
    params: {
      matchId: detail.matchId,
      matchMode: detail.mode ?? undefined,
    },
  };
}

export function isMatchReminderMissingRoomId(detail: NotificationTraceDetail) {
  return isMatchReminderNotification(detail) && !detail.roomId;
}

function buildDedupeKey(detail: NotificationTraceDetail, phase: MatchReminderNotificationPhase) {
  return [
    phase,
    detail.kind ?? 'unknown',
    detail.matchId ?? 'no-match',
  ].join(':');
}

export function shouldSkipDuplicateMatchReminderNotification(
  detail: NotificationTraceDetail,
  phase: MatchReminderNotificationPhase,
  nowMs = Date.now(),
) {
  if (!isMatchReminderNotification(detail)) {
    return false;
  }

  const key = buildDedupeKey(detail, phase);
  const lastHandledAtMs = notificationDedupeMap.get(key);

  if (lastHandledAtMs !== undefined && nowMs - lastHandledAtMs < MATCH_REMINDER_DEDUPE_WINDOW_MS) {
    return true;
  }

  notificationDedupeMap.set(key, nowMs);
  return false;
}

// Result notifications use a SEPARATE dedupe key (prefixed `result:` + keyed on `type`)
// so they are never collapsed against a same-matchId reminder, and repeated result
// pushes for the same match within the window are throttled on their own.
function buildResultDedupeKey(detail: NotificationTraceDetail, phase: MatchReminderNotificationPhase) {
  return [
    'result',
    phase,
    detail.type ?? 'unknown',
    detail.matchId ?? 'no-match',
  ].join(':');
}

export function shouldSkipDuplicateMatchResultNotification(
  detail: NotificationTraceDetail,
  phase: MatchReminderNotificationPhase,
  nowMs = Date.now(),
) {
  if (!isMatchResultNotification(detail)) {
    return false;
  }

  const key = buildResultDedupeKey(detail, phase);
  const lastHandledAtMs = notificationDedupeMap.get(key);

  if (lastHandledAtMs !== undefined && nowMs - lastHandledAtMs < MATCH_REMINDER_DEDUPE_WINDOW_MS) {
    return true;
  }

  notificationDedupeMap.set(key, nowMs);
  return false;
}

export function resetMatchReminderNotificationDedupeForTests() {
  notificationDedupeMap.clear();
}

export function findRecoveredMatchById(
  matches: UpcomingRunningMatchItem[],
  matchId: string | null,
) {
  if (!matchId) {
    return null;
  }

  return matches.find((match) => match.matchId === matchId) ?? null;
}

export function buildMatchReminderRouteTarget(
  detail: NotificationTraceDetail,
  recoveredMatch?: UpcomingRunningMatchItem | null,
): MatchReminderRouteTarget | null {
  const matchId = recoveredMatch?.matchId ?? detail.matchId;
  const mode = recoveredMatch?.mode ?? detail.mode ?? undefined;

  if (!matchId && !detail.roomId && !recoveredMatch?.roomId) {
    return null;
  }

  return {
    pathname: '/(tabs)/running',
    params: {
      focusMatchMode: mode,
      focusMatchId: matchId ?? undefined,
      focusMatchDistanceKm: recoveredMatch ? String(recoveredMatch.distanceKm) : undefined,
      focusMatchSlotStartAt: recoveredMatch?.slotStartAt,
      focusMatchIsTest: recoveredMatch?.isTestMatch ? '1' : recoveredMatch ? '0' : undefined,
      focusMatchNonce: String(Date.now()),
      focusRoomId: recoveredMatch?.roomId ?? detail.roomId ?? undefined,
      forceMatchArena: recoveredMatch?.status === 'active' ? '1' : undefined,
    },
  };
}
