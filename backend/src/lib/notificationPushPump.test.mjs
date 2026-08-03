// 알림별 푸시 파이프라인의 계약 (적대 리뷰 반영판):
// 커밋 실존 확인 후 발송(롤백 팬텀 불가), 미커밋은 재큐잉→창 지나면 폐기, 저장본으로
// 발송, 설정 게이트, rank_change는 인박스 전용, 배지 = 안 읽은 수, 죽은 토큰 정리.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTIFICATION_PUSH_REQUEUE_WINDOW_MS,
  flushUserNotificationPushes,
} from './notificationPushPump.mjs';
import {
  drainUserNotificationPushes,
  enqueueUserNotificationPush,
  getPendingUserNotificationPushCount,
  resetUserNotificationPushQueueForTest,
} from './notificationPushQueue.mjs';
import { appendUserNotification } from './userNotifications.mjs';

const NOW_MS = Date.parse('2026-08-03T12:00:00.000Z');
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

function buildStore({ friendAlertsOff = false } = {}) {
  return {
    users: [
      { id: 'user-a', name: '회원G', ...(friendAlertsOff ? { notificationSettings: { friendAlerts: false } } : {}) },
      { id: 'user-b', name: '상대' },
    ],
    pushTokens: [
      { token: TOKEN_A, userId: 'user-a', platform: 'ios', updatedAt: new Date(NOW_MS).toISOString() },
      { token: TOKEN_B, userId: 'user-b', platform: 'ios', updatedAt: new Date(NOW_MS).toISOString() },
    ],
    notifications: [],
  };
}

function buildSendRecorder() {
  const calls = [];
  return {
    calls,
    sendPushes: async (tokens, message) => {
      calls.push({ tokens, message });
      return { sent: tokens.length, failed: 0, invalidTokens: [] };
    },
  };
}

function flushWith(store, { sendPushes, nowMs = NOW_MS + 10_000, mutateStore = async () => null } = {}) {
  return flushUserNotificationPushes({
    loadStore: async () => store,
    mutateStore,
    sendPushes,
    olderThanMs: 0,
    nowMs,
  });
}

test('나이 게이트: 너무 어린 인텐트는 드레인되지 않는다', () => {
  resetUserNotificationPushQueueForTest();
  enqueueUserNotificationPush({ notificationId: 'n1', userId: 'user-a', type: 'friend_request' }, NOW_MS);

  assert.equal(drainUserNotificationPushes({ olderThanMs: 1_000, nowMs: NOW_MS + 500 }).length, 0);
  assert.equal(drainUserNotificationPushes({ olderThanMs: 1_000, nowMs: NOW_MS + 1_500 }).length, 1);
});

test('커밋된 알림은 저장본 제목/본문/데이터로, 배지 = 안 읽은 수', async () => {
  resetUserNotificationPushQueueForTest();
  const store = buildStore();
  appendUserNotification(store, {
    userId: 'user-a', type: 'friend_request', title: '친구 신청', body: '상대님이 신청했어요',
    data: { friendUserId: 'user-b' },
  });
  appendUserNotification(store, {
    userId: 'user-a', type: 'match_result', title: '결과 확정', body: '이겼어요', data: { matchId: 'm1' },
  });

  const recorder = buildSendRecorder();
  const result = await flushWith(store, { sendPushes: recorder.sendPushes });

  assert.equal(result.sent, 2);
  assert.equal(recorder.calls.length, 2);
  assert.deepEqual(recorder.calls[0].tokens, [{ token: TOKEN_A, badge: 2 }]);
  assert.equal(recorder.calls[0].message.title, '친구 신청');
  assert.equal(recorder.calls[0].message.data.type, 'friend_request');
  assert.equal(recorder.calls[0].message.data.friendUserId, 'user-b');
  assert.equal(recorder.calls[1].message.data.matchId, 'm1');
});

test('미커밋(스토어에 없는 id)은 발송하지 않고 재큐잉 — 커밋 후 다음 틱에 나간다', async () => {
  resetUserNotificationPushQueueForTest();
  const store = buildStore();
  // 커밋 전 상황: 인텐트만 있고 스토어에 알림이 없다.
  enqueueUserNotificationPush({ notificationId: 'n-slow', userId: 'user-a', type: 'friend_request' }, NOW_MS);

  const recorder = buildSendRecorder();
  const first = await flushWith(store, { sendPushes: recorder.sendPushes, nowMs: NOW_MS + 5_000 });

  assert.equal(first.sent, 0);
  assert.equal(first.requeued, 1);
  assert.equal(recorder.calls.length, 0);
  assert.equal(getPendingUserNotificationPushCount(), 1);

  // 커밋이 도착한 뒤엔 저장본으로 발송된다.
  store.notifications.push({
    id: 'n-slow', userId: 'user-a', type: 'friend_request',
    title: '친구 신청', body: '늦게 커밋됨', createdAt: new Date(NOW_MS).toISOString(), readAt: null,
  });
  const second = await flushWith(store, { sendPushes: recorder.sendPushes, nowMs: NOW_MS + 8_000 });

  assert.equal(second.sent, 1);
  assert.equal(recorder.calls[0].message.body, '늦게 커밋됨');
});

test('롤백된 알림(창 지나도 미발견)은 폐기된다 — 팬텀 푸시 불가', async () => {
  resetUserNotificationPushQueueForTest();
  const store = buildStore();
  enqueueUserNotificationPush({ notificationId: 'n-rolled', userId: 'user-a', type: 'friend_request' }, NOW_MS);

  const recorder = buildSendRecorder();
  const result = await flushWith(store, {
    sendPushes: recorder.sendPushes,
    nowMs: NOW_MS + NOTIFICATION_PUSH_REQUEUE_WINDOW_MS + 1_000,
  });

  assert.equal(result.dropped, 1);
  assert.equal(recorder.calls.length, 0);
  assert.equal(getPendingUserNotificationPushCount(), 0);
});

test('rank_change는 인박스 전용 — 결과 푸시와 이중 발송하지 않는다', async () => {
  resetUserNotificationPushQueueForTest();
  const store = buildStore();
  appendUserNotification(store, {
    userId: 'user-a', type: 'rank_change', title: '랭크 변동', body: '실버로 승급',
  });

  const recorder = buildSendRecorder();
  const result = await flushWith(store, { sendPushes: recorder.sendPushes });

  assert.equal(result.dropped, 1);
  assert.equal(recorder.calls.length, 0);
});

test('설정 게이트: friendAlerts 끈 유저에겐 친구 푸시가 안 가고, 문의 답변은 게이트 없음', async () => {
  resetUserNotificationPushQueueForTest();
  const store = buildStore({ friendAlertsOff: true });
  appendUserNotification(store, { userId: 'user-a', type: 'friend_request', title: '친구 신청', body: 'b' });
  appendUserNotification(store, { userId: 'user-a', type: 'inquiry_reply', title: '문의 답변', body: '답변 도착' });

  const recorder = buildSendRecorder();
  await flushWith(store, { sendPushes: recorder.sendPushes });

  assert.equal(recorder.calls.length, 1);
  assert.equal(recorder.calls[0].message.title, '문의 답변');
  assert.equal(recorder.calls[0].tokens[0].token, TOKEN_A);
});

test('죽은 토큰(DeviceNotRegistered)은 mutateStore로 정리된다', async () => {
  resetUserNotificationPushQueueForTest();
  const store = buildStore();
  appendUserNotification(store, { userId: 'user-a', type: 'friend_request', title: '친구 신청', body: 'b' });

  let remainingTokens = null;
  await flushWith(store, {
    mutateStore: async (mutator) => {
      mutator(store);
      remainingTokens = store.pushTokens.map((entry) => entry.token);
      return null;
    },
    sendPushes: async (tokens, message, { onInvalidTokens }) => {
      await onInvalidTokens([TOKEN_A]);
      return { sent: 0, failed: 1, invalidTokens: [TOKEN_A] };
    },
  });

  assert.deepEqual(remainingTokens, [TOKEN_B]);
});
