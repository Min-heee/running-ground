import assert from 'node:assert/strict';
import test from 'node:test';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import {
  buildMatchReminderRouteTarget,
  buildMatchResultRouteTarget,
  buildNotificationTraceDetail,
  findRecoveredMatchById,
  isMatchReminderNotification,
  isMatchResultNotification,
  MATCH_REMINDER_DEDUPE_WINDOW_MS,
  MATCH_REMINDER_KIND,
  MATCH_RESULT_NOTIFICATION_TYPE,
  resetMatchReminderNotificationDedupeForTests,
  shouldSkipDuplicateMatchReminderNotification,
  shouldSkipDuplicateMatchResultNotification,
} from '@/navigation/matchReminderNotificationRouting';

function match(overrides: Partial<UpcomingRunningMatchItem> = {}): UpcomingRunningMatchItem {
  return {
    matchId: 'match-1',
    roomId: 'room-1',
    mode: 'duel',
    distanceKm: 5,
    slotStartAt: '2026-05-14T12:00:00.000Z',
    slotLabel: '오후 9:00',
    status: 'active',
    participantCount: 2,
    counterpartLabel: '상대',
    summary: '5km',
    canCancel: false,
    cancelableUntilAt: '2026-05-14T11:30:00.000Z',
    ...overrides,
  };
}

test('match reminder trace detail keeps missing roomId explicit', () => {
  const detail = buildNotificationTraceDetail({
    kind: MATCH_REMINDER_KIND,
    matchId: 'match-1',
    mode: 'duel',
  });

  assert.equal(detail.kind, MATCH_REMINDER_KIND);
  assert.equal(detail.matchId, 'match-1');
  assert.equal(detail.mode, 'duel');
  assert.equal(detail.roomId, null);
});

test('match reminder dedupe skips same match and phase inside the short window', () => {
  resetMatchReminderNotificationDedupeForTests();
  const detail = buildNotificationTraceDetail({
    kind: MATCH_REMINDER_KIND,
    matchId: 'match-1',
  });

  assert.equal(shouldSkipDuplicateMatchReminderNotification(detail, 'received', 1_000), false);
  assert.equal(shouldSkipDuplicateMatchReminderNotification(detail, 'received', 1_500), true);
  assert.equal(
    shouldSkipDuplicateMatchReminderNotification(
      detail,
      'received',
      1_000 + MATCH_REMINDER_DEDUPE_WINDOW_MS + 1,
    ),
    false,
  );
});

test('match reminder recovery finds the upcoming match and builds room-aware route params', () => {
  const detail = buildNotificationTraceDetail({
    kind: MATCH_REMINDER_KIND,
    matchId: 'match-1',
    mode: 'duel',
  });
  const recovered = findRecoveredMatchById([match()], 'match-1');
  const routeTarget = buildMatchReminderRouteTarget(detail, recovered);

  assert.equal(routeTarget?.pathname, '/(tabs)/running');
  assert.equal(routeTarget?.params.focusMatchId, 'match-1');
  assert.equal(routeTarget?.params.focusRoomId, 'room-1');
  assert.equal(routeTarget?.params.forceMatchArena, '1');
});

test('match reminder route can still recover direct matches without a roomId after fetch', () => {
  const detail = buildNotificationTraceDetail({
    kind: MATCH_REMINDER_KIND,
    matchId: 'match-1',
    mode: 'duel',
  });
  const recovered = match({ roomId: undefined, status: 'matched' });
  const routeTarget = buildMatchReminderRouteTarget(detail, recovered);

  assert.equal(routeTarget?.params.focusMatchId, 'match-1');
  assert.equal(routeTarget?.params.focusRoomId, undefined);
  assert.equal(routeTarget?.params.forceMatchArena, undefined);
});

test('match_result notification is detected by type, not the reminder kind', () => {
  const resultDetail = buildNotificationTraceDetail({
    type: MATCH_RESULT_NOTIFICATION_TYPE,
    matchId: 'match-9',
    mode: 'group',
  });

  assert.equal(isMatchResultNotification(resultDetail), true);
  // A result push carries no `kind`, so it must NOT register as a reminder (which would
  // route it into the live arena).
  assert.equal(isMatchReminderNotification(resultDetail), false);
});

test('match_result route target points at the dedicated match-result screen with matchId + mode', () => {
  const detail = buildNotificationTraceDetail({
    type: MATCH_RESULT_NOTIFICATION_TYPE,
    matchId: 'match-9',
    mode: 'group',
  });
  const routeTarget = buildMatchResultRouteTarget(detail);

  assert.equal(routeTarget?.pathname, '/match-result');
  assert.equal(routeTarget?.params.matchId, 'match-9');
  assert.equal(routeTarget?.params.matchMode, 'group');
});

test('result dedupe is separate from the reminder dedupe for the same matchId', () => {
  resetMatchReminderNotificationDedupeForTests();
  const reminderDetail = buildNotificationTraceDetail({
    kind: MATCH_REMINDER_KIND,
    matchId: 'match-1',
  });
  const resultDetail = buildNotificationTraceDetail({
    type: MATCH_RESULT_NOTIFICATION_TYPE,
    matchId: 'match-1',
  });

  // A reminder tap does not consume the result's dedupe slot, and vice versa.
  assert.equal(shouldSkipDuplicateMatchReminderNotification(reminderDetail, 'tap', 1_000), false);
  assert.equal(shouldSkipDuplicateMatchResultNotification(resultDetail, 'tap', 1_000), false);
  // The second result tap for the same match inside the window is throttled.
  assert.equal(shouldSkipDuplicateMatchResultNotification(resultDetail, 'tap', 1_500), true);
  assert.equal(
    shouldSkipDuplicateMatchResultNotification(
      resultDetail,
      'tap',
      1_000 + MATCH_REMINDER_DEDUPE_WINDOW_MS + 1,
    ),
    false,
  );
});
