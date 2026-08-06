import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveNotificationHref } from './notificationCenter';
import type { InboxNotification } from '@/lib/api/types';

function makeNotification(overrides: Partial<InboxNotification>): InboxNotification {
  return {
    id: 'n1',
    type: 'friend_request',
    title: '',
    body: '',
    createdAt: '2026-08-06T00:00:00.000Z',
    readAt: null,
    ...overrides,
  } as InboxNotification;
}

// 알림 탭 라우팅 계약 (오너 2026-08-06): 친구 신청 알림은 data 유무와 무관하게
// 친구 요청 화면으로 간다.
test('friend request notifications open the friend-requests screen', () => {
  assert.equal(resolveNotificationHref(makeNotification({ type: 'friend_request' })), '/friend-requests');
  assert.equal(
    resolveNotificationHref(makeNotification({ type: 'friend_request', data: { fromUserId: 'u1' } as never })),
    '/friend-requests',
  );
});

test('friend accepted opens the friends tab, inquiry reply opens support (data-free)', () => {
  assert.equal(resolveNotificationHref(makeNotification({ type: 'friend_accepted' })), '/(tabs)/friends');
  assert.equal(resolveNotificationHref(makeNotification({ type: 'inquiry_reply' })), '/support');
});

test('match result with matchId still opens the dedicated result screen', () => {
  const href = resolveNotificationHref(makeNotification({
    type: 'match_result',
    data: { matchId: 'm-1', mode: 'duel' } as never,
  }));
  assert.deepEqual(href, { pathname: '/match-result', params: { matchId: 'm-1', matchMode: 'duel' } });
});

test('unknown notifications without data stay non-navigating', () => {
  assert.equal(resolveNotificationHref(makeNotification({ type: 'rank_change' })), null);
});

// 런마당 알림(초대/참가/정산)은 data 유무와 무관하게 런마당 목록으로 간다.
test('runmadang notifications open the runmadang list screen', () => {
  assert.equal(resolveNotificationHref(makeNotification({ type: 'runmadang_invite' })), '/runmadang');
  assert.equal(
    resolveNotificationHref(makeNotification({ type: 'runmadang_settled', data: { challengeId: 'c1' } as never })),
    '/runmadang',
  );
  assert.equal(resolveNotificationHref(makeNotification({ type: 'runmadang_joined' })), '/runmadang');
});
