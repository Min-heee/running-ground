import assert from 'node:assert/strict';
import test from 'node:test';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import {
  buildMatchReminderRouteTarget,
  buildNotificationTraceDetail,
  findRecoveredMatchById,
  MATCH_REMINDER_DEDUPE_WINDOW_MS,
  MATCH_REMINDER_KIND,
  resetMatchReminderNotificationDedupeForTests,
  shouldSkipDuplicateMatchReminderNotification,
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
