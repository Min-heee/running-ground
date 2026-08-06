// 알림 푸시 탭 라우팅의 계약: 공지 → 공지 탭, 인박스 유형 → 알림 탭, 그 외엔 null.

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveUserNotificationPushHref } from './userNotificationPushRouting';

test('공지 푸시는 공지 탭으로', () => {
  assert.deepEqual(resolveUserNotificationPushHref({ type: 'notice', noticeId: 'n1' }), {
    pathname: '/notification-center',
    params: { tab: 'announcements' },
  });
});

test('인박스 유형은 알림 탭으로', () => {
  for (const type of ['match_invite', 'inquiry_reply']) {
    assert.deepEqual(resolveUserNotificationPushHref({ type }), {
      pathname: '/notification-center',
      params: { tab: 'notifications' },
    });
  }
});

test('match_result는 가로채지 않는다 — 전용 결과 화면 딥링크 계약이 처리', () => {
  assert.equal(resolveUserNotificationPushHref({ type: 'match_result', matchId: 'm1' }), null);
});

test('매치 리마인더(kind 체계)·모르는 유형·빈 데이터는 건드리지 않는다', () => {
  assert.equal(resolveUserNotificationPushHref({ kind: 'match-reminder' }), null);
  assert.equal(resolveUserNotificationPushHref({ type: 'unknown-thing' }), null);
  assert.equal(resolveUserNotificationPushHref(null), null);
  assert.equal(resolveUserNotificationPushHref(undefined), null);
});

test('friend request pushes deep-link straight to the friend-requests screen', () => {
  assert.equal(resolveUserNotificationPushHref({ type: 'friend_request' }), '/friend-requests');
});

test('런마당 푸시는 알림함 대신 런마당 목록으로 딥링크', () => {
  assert.equal(resolveUserNotificationPushHref({ type: 'runmadang_invite' }), '/runmadang');
  assert.equal(resolveUserNotificationPushHref({ type: 'runmadang_joined', challengeId: 'c1' }), '/runmadang');
  assert.equal(resolveUserNotificationPushHref({ type: 'runmadang_settled' }), '/runmadang');
});
