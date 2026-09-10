import assert from 'node:assert/strict';
import {
  MAX_USER_NOTIFICATIONS,
  appendUserNotification,
  countUnreadUserNotifications,
  listUserNotifications,
  markUserNotificationsRead,
  USER_NOTIFICATION_TYPES,
} from './userNotifications.mjs';
import {
  NOTIFICATION_PUSH_INBOX_ONLY_TYPES,
  NOTIFICATION_PUSH_SETTING_KEY_BY_TYPE,
} from './notificationPushPump.mjs';

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

// 예약 파티런 성립 알림 (2026-09-09): 유형이 등록돼 있고, 원격 푸시는 매치 리마인더 설정을 따른다.
runTest('match_reserved is an accepted type and rides the matchReminders push setting', () => {
  const store = {};
  const nowIso = createNowIso();

  const reserved = appendUserNotification(store, {
    userId: 'host-user',
    type: 'match_reserved',
    title: '파티런 예약 완료',
    body: '참가 러너님이 수락했어요 · 6. 24. (수) 11:00 시작',
    data: { roomId: 'room-1', matchId: 'duel-match-1', mode: 'duel', slotStartAt: '2026-06-24T02:00:00.000Z' },
    nowIso,
  });

  assert.equal(reserved?.type, 'match_reserved');
  assert.deepEqual(reserved.data, { roomId: 'room-1', matchId: 'duel-match-1', mode: 'duel', slotStartAt: '2026-06-24T02:00:00.000Z' });
  assert.equal(NOTIFICATION_PUSH_SETTING_KEY_BY_TYPE.match_reserved, 'matchReminders');
});

// 새 유형을 한쪽에만 추가하면 펌프가 설정 게이트 없이(undefined) 발송하거나 인박스에만 남는다 —
// 두 목록은 항상 같이 움직여야 한다.
runTest('every inbox type has a push-setting entry (or is explicitly inbox-only)', () => {
  for (const type of USER_NOTIFICATION_TYPES) {
    const hasSettingEntry = Object.prototype.hasOwnProperty.call(NOTIFICATION_PUSH_SETTING_KEY_BY_TYPE, type);
    assert.equal(hasSettingEntry || NOTIFICATION_PUSH_INBOX_ONLY_TYPES.has(type), true, `${type}: push setting entry missing`);
  }
});
