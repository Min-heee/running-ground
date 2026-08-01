import assert from 'node:assert/strict';
import {
  MAX_USER_NOTIFICATIONS,
  appendUserNotification,
  countUnreadUserNotifications,
  listUserNotifications,
  markUserNotificationsRead,
} from './userNotifications.mjs';

function createNowIso() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 5, 8, 0, 0, tick += 1)).toISOString();
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`[userNotifications] ok - ${name}`);
  } catch (error) {
    console.error(`[userNotifications] fail - ${name}`);
    throw error;
  }
}

runTest('appends, lists latest-first, and exposes unread count', () => {
  const store = {};
  const nowIso = createNowIso();

  appendUserNotification(store, {
    userId: 'user-1',
    type: 'friend_request',
    title: '친구 요청',
    body: '새 친구 요청이 있어요.',
    data: { friendUserId: 'friend-1' },
    nowIso,
  });
  appendUserNotification(store, {
    userId: 'user-1',
    type: 'match_invite',
    title: '파티런 초대',
    body: '초대가 도착했어요.',
    data: { roomId: 'room-1' },
    nowIso,
  });
  appendUserNotification(store, {
    userId: 'other-user',
    type: 'friend_request',
    title: '다른 사용자',
    body: '다른 사용자 알림이에요.',
    nowIso,
  });

  const payload = listUserNotifications(store, 'user-1');

  assert.equal(payload.unreadCount, 2);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].type, 'match_invite');
  assert.deepEqual(payload.items[0].data, { roomId: 'room-1' });
});

runTest('marks selected notifications and all notifications as read', () => {
  const store = {};
  const nowIso = createNowIso();
  const first = appendUserNotification(store, {
    userId: 'user-1',
    type: 'friend_request',
    title: '친구 요청',
    body: '새 친구 요청이 있어요.',
    nowIso,
  });
  appendUserNotification(store, {
    userId: 'user-1',
    type: 'friend_accepted',
    title: '친구 요청 수락',
    body: '친구 요청이 수락됐어요.',
    nowIso,
  });

  assert.equal(markUserNotificationsRead(store, 'user-1', [first.id], { nowIso }).unreadCount, 1);
  assert.equal(markUserNotificationsRead(store, 'user-1', undefined, { nowIso }).unreadCount, 0);
  assert.equal(listUserNotifications(store, 'user-1').unreadCount, 0);
});

runTest('prunes per-user notifications with read old items removed first', () => {
  const store = {};
  const nowIso = createNowIso();

  for (let index = 0; index < MAX_USER_NOTIFICATIONS; index += 1) {
    const item = appendUserNotification(store, {
      userId: 'user-1',
      type: 'match_result',
      title: `결과 ${index}`,
      body: '대결 결과가 확정됐어요.',
      data: { matchId: `match-${index}` },
      nowIso,
    });

    if (index < 3) {
      markUserNotificationsRead(store, 'user-1', [item.id], { nowIso });
    }
  }

  appendUserNotification(store, {
    userId: 'user-1',
    type: 'rank_change',
    title: '랭크 LP 변동',
    body: '랭크 LP가 반영됐어요.',
    data: { matchId: 'latest-match' },
    nowIso,
  });

  const payload = listUserNotifications(store, 'user-1');

  assert.equal(payload.items.length, MAX_USER_NOTIFICATIONS);
  assert.equal(payload.items[0].data.matchId, 'latest-match');
  assert.equal(payload.items.some((item) => item.data?.matchId === 'match-0'), false);
});

runTest('returns unread count from the pruned store', () => {
  const store = {};
  const nowIso = createNowIso();

  for (let index = 0; index < MAX_USER_NOTIFICATIONS + 1; index += 1) {
    appendUserNotification(store, {
      userId: 'user-1',
      type: 'match_result',
      title: `결과 ${index}`,
      body: '대결 결과가 확정됐어요.',
      data: { matchId: `match-${index}` },
      nowIso,
    });
  }

  assert.equal(markUserNotificationsRead(store, 'user-1', [], { nowIso }).unreadCount, MAX_USER_NOTIFICATIONS);
});

runTest('countUnread: readAt 없는 내 알림만 센다 (아이콘 배지 진실값)', () => {
  const store = {};
  const nowIso = createNowIso();

  appendUserNotification(store, { userId: 'user-1', type: 'friend_request', title: '친구 신청', body: 'a', nowIso });
  appendUserNotification(store, { userId: 'user-1', type: 'match_result', title: '결과', body: 'b', nowIso });
  appendUserNotification(store, { userId: 'user-2', type: 'match_result', title: '남의 것', body: 'c', nowIso });

  assert.equal(countUnreadUserNotifications(store, 'user-1'), 2);
  assert.equal(countUnreadUserNotifications(store, 'user-2'), 1);
  assert.equal(countUnreadUserNotifications(store, 'user-3'), 0);

  markUserNotificationsRead(store, 'user-1', null, { nowIso });
  assert.equal(countUnreadUserNotifications(store, 'user-1'), 0);
});
