// 앱 아이콘 배지 (오너 2026-08-01: 카카오톡처럼 안 읽은 알림 수가 아이콘에 1, 2, 15로
// 쌓이게). 진실값은 서버 인박스 unreadCount 하나 — 클라는 그 값을 아이콘에 비추기만 한다.
//
// 흐름: 공지 푸시는 서버가 payload badge로 아이콘에 직접 찍고(iOS), 앱을 열거나(포그라운드
// 전환 포함) 알림센터에서 읽고/지울 때마다 여기서 실제 unreadCount로 재동기화한다.
// expo-notifications가 없는 구버전 바이너리에선 조용히 no-op (OTA 안전).

import { AppState } from 'react-native';
import { fetchInbox } from '@/lib/api/services/notifications';

export async function setAppIconBadge(count: number): Promise<void> {
  try {
    const Notifications = await import('expo-notifications');

    if (typeof Notifications.setBadgeCountAsync === 'function') {
      await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
    }
  } catch {
    // 네이티브 모듈 없음/권한 거절 — 배지는 조용히 포기.
  }
}

export async function syncAppIconBadgeFromServer(): Promise<void> {
  try {
    const payload = await fetchInbox();
    await setAppIconBadge(payload.unreadCount ?? 0);
  } catch {
    // 미로그인(401)/네트워크 실패 — 다음 동기화 때 맞춘다.
  }
}

let foregroundSyncStarted = false;

// 앱 부팅 시 한 번 호출 — 즉시 1회 동기화하고, 이후 포그라운드 전환마다 다시 맞춘다.
export function startAppIconBadgeSync(): void {
  void syncAppIconBadgeFromServer();

  if (foregroundSyncStarted) {
    return;
  }

  foregroundSyncStarted = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void syncAppIconBadgeFromServer();
    }
  });
}
