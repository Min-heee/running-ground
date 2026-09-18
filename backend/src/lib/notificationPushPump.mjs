// 인앱 알림별 원격 푸시 펌프 — notificationPushQueue에 쌓인 인텐트를 트랜잭션 밖에서
// 발송한다.
//
// 커밋 검증 발송 (적대 리뷰 수술): 인텐트의 알림 id가 방금 로드한(=커밋된) 스토어에
// 실존할 때만, 그 저장본의 제목/본문/데이터로 발송한다.
// - 롤백된 트랜잭션의 알림은 끝내 안 나타난다 → REQUEUE_WINDOW가 지나면 폐기 (팬텀 없음).
// - 커밋이 느린 국면(락/vacuum/순단)엔 아직 안 보인다 → 재큐잉돼 커밋 후 발송 (조기
//   발송·배지 -1 없음).
// 배지는 발송 시점의 안 읽은 알림 수(커밋 기준)라 아이콘 숫자가 인박스와 일치한다.

import { sendExpoPushNotifications } from './expoPushSender.mjs';
import {
  drainUserNotificationPushes,
  getPendingUserNotificationPushCount,
  requeueUserNotificationPush,
} from './notificationPushQueue.mjs';
import { collectPushTargetEntries, removePushToken } from './pushTokens.mjs';
import { countUnreadUserNotifications, ensureUserNotificationsStore } from './userNotifications.mjs';

// 커밋 확인 재시도 창 — 이 나이를 넘긴 미발견 인텐트는 롤백(또는 50개 상한 prune)으로
// 보고 버린다. statement_timeout 15s를 여유 있게 덮는다.
export const NOTIFICATION_PUSH_REQUEUE_WINDOW_MS = 60_000;

// 알림 유형별 수신 설정 게이트 — 공지처럼 게이트 없는 서비스 메시지는 null.
// (설정이 없는 유저는 기본 ON — collectPushTargetEntries의 기존 규칙.)
export const NOTIFICATION_PUSH_SETTING_KEY_BY_TYPE = {
  friend_request: 'friendAlerts',
  friend_accepted: 'friendAlerts',
  match_invite: 'matchReminders',
  match_room_closed: 'matchReminders',
  match_reserved: 'matchReminders',
  match_result: 'matchReminders',
  chase_settlement: 'matchReminders',
  inquiry_reply: null,
  // 그라운드는 친구 기반 내기 — 친구 알림 설정을 따른다.
  runmadang_invite: 'friendAlerts',
  runmadang_joined: 'friendAlerts',
  runmadang_settled: 'friendAlerts',
  // 크루대전 — 사람 사이의 모임이라 친구 알림 설정을 따른다 (2026-09-18).
  crew_season_result: 'friendAlerts',
  crew_kicked: 'friendAlerts',
  crew_captain: 'friendAlerts',
  crew_join_request: 'friendAlerts',
  crew_join_decided: 'friendAlerts',
};

// 인박스 전용(푸시 안 보냄) 유형 — rank_change는 랭크전 완료 때 match_result와 항상
// 같이 생겨 한 사건에 푸시 두 발이 나가는 문제(적대 리뷰)가 있어 인박스에만 남긴다.
export const NOTIFICATION_PUSH_INBOX_ONLY_TYPES = new Set(['rank_change']);

export async function flushUserNotificationPushes({
  loadStore,
  mutateStore,
  sendPushes = sendExpoPushNotifications,
  olderThanMs = 1_000,
  nowMs = Date.now(),
}) {
  const items = drainUserNotificationPushes({ olderThanMs, nowMs });

  if (items.length === 0) {
    return { attempted: 0, sent: 0, requeued: 0, dropped: 0 };
  }

  const store = await loadStore();
  const notifications = ensureUserNotificationsStore(store);
  let sent = 0;
  let requeued = 0;
  let dropped = 0;

  for (const item of items) {
    if (NOTIFICATION_PUSH_INBOX_ONLY_TYPES.has(item.type)) {
      dropped += 1;
      continue;
    }

    // 커밋 실존 확인 — 없으면 아직 커밋 전이거나 롤백된 것.
    const notification = notifications.find(
      (entry) => entry?.id === item.notificationId && entry.userId === item.userId,
    );

    if (!notification) {
      if (nowMs - item.enqueuedAtMs < NOTIFICATION_PUSH_REQUEUE_WINDOW_MS) {
        requeueUserNotificationPush(item);
        requeued += 1;
      } else {
        dropped += 1;
      }

      continue;
    }

    const settingKey = NOTIFICATION_PUSH_SETTING_KEY_BY_TYPE[item.type] ?? null;
    const targets = collectPushTargetEntries(store, {
      userIds: [item.userId],
      ...(settingKey ? { settingKey } : {}),
    }).map((entry) => ({
      token: entry.token,
      // 카카오톡식 아이콘 배지 — 커밋된 스토어 기준 안 읽은 수 (이 알림 포함).
      badge: countUnreadUserNotifications(store, entry.userId),
    }));

    if (targets.length === 0) {
      continue;
    }

    const result = await sendPushes(
      targets,
      {
        title: notification.title,
        body: notification.body,
        data: { type: notification.type, ...(notification.data ?? {}) },
      },
      {
        onInvalidTokens: async (invalidTokens) => {
          await mutateStore((mutableStore) => {
            for (const token of invalidTokens) {
              removePushToken(mutableStore, token);
            }

            return null;
          });
        },
      },
    );
    sent += result.sent;
  }

  return { attempted: items.length, sent, requeued, dropped };
}

let pumpTimer = null;

export function startUserNotificationPushPump({
  loadStore,
  mutateStore,
  intervalMs = 3_000,
  onError = () => {},
}) {
  if (pumpTimer) {
    return pumpTimer;
  }

  pumpTimer = setInterval(() => {
    if (getPendingUserNotificationPushCount() === 0) {
      return;
    }

    flushUserNotificationPushes({ loadStore, mutateStore }).catch(onError);
  }, intervalMs);
  // 테스트/스크립트 실행이 펌프 때문에 안 끝나면 안 된다.
  pumpTimer.unref?.();

  return pumpTimer;
}

export function stopUserNotificationPushPumpForTest() {
  if (pumpTimer) {
    clearInterval(pumpTimer);
    pumpTimer = null;
  }
}
