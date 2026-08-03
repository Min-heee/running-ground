// 인앱 알림별 원격 푸시의 인텐트 큐 (오너 2026-08-03: 친구 신청·대결 결과도 카톡처럼
// 즉시 폰 알림+배지).
//
// appendUserNotification은 mutateStore 트랜잭션 안에서 불리므로 네트워크를 하면 안 되고
// (단일 라이터 블로킹), blob 아웃박스는 드레인마다 whole-store 재기록(#209)을 만든다 —
// 그래서 인메모리 큐 + 커밋 밖 펌프(notificationPushPump)로 나눈다.
//
// 인텐트는 알림 id만 들고 다닌다 (적대 리뷰 수술): 제목/본문/배지는 펌프가 '커밋된'
// 스토어에서 그 id를 실제로 찾은 뒤에만 읽는다 — 트랜잭션이 롤백되면 알림이 스토어에
// 없으므로 팬텀 푸시가 구조적으로 불가능하고, 커밋이 늦으면 다음 틱에 재시도된다.
// 프로세스가 죽으면 미발송 푸시는 사라지지만 알림 자체는 인박스에 남는다: 푸시는 전달
// 보장이 아니라 최선 노력이다.
//
// 이 모듈은 의존성 0 — userNotifications가 import해도 순환이 생기지 않는다.

let pendingPushes = [];

export function enqueueUserNotificationPush({ notificationId, userId, type }, nowMs = Date.now()) {
  pendingPushes.push({ notificationId, userId, type, enqueuedAtMs: nowMs });
}

// 커밋 확인에 실패한(아직 스토어에 안 보이는) 인텐트를 되돌린다 — enqueuedAtMs를
// 보존해 재큐잉 상한(펌프의 REQUEUE_WINDOW) 판정이 누적되게 한다.
export function requeueUserNotificationPush(item) {
  pendingPushes.push(item);
}

// 발송 후보 꺼내기 — 너무 어린(진행 중 트랜잭션일 수 있는) 인텐트는 남겨둔다. 이 나이
// 게이트는 싼 1차 필터일 뿐이고, 정확성은 펌프의 커밋 실존 확인이 책임진다.
export function drainUserNotificationPushes({ olderThanMs = 1_000, nowMs = Date.now() } = {}) {
  const ready = [];
  const young = [];

  for (const item of pendingPushes) {
    if (nowMs - item.enqueuedAtMs >= olderThanMs) {
      ready.push(item);
    } else {
      young.push(item);
    }
  }

  pendingPushes = young;
  return ready;
}

export function getPendingUserNotificationPushCount() {
  return pendingPushes.length;
}

export function resetUserNotificationPushQueueForTest() {
  pendingPushes = [];
}
