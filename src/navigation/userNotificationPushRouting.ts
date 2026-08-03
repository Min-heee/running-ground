// 인앱 알림별 원격 푸시의 탭 라우팅 (오너 2026-08-03) — 서버 notificationPushPump가
// data.type에 알림 유형을 실어 보낸다. 공지는 공지 탭, 나머지 인박스 유형은 알림 탭.
// 매치 리마인더 로컬 알림(data.kind 체계)은 여기 안 걸리고 기존 라우팅을 탄다.

import type { Href } from 'expo-router';

// match_result는 여기 없다 (적대 리뷰): 서버 결과 푸시(type:'match_result' + matchId)는
// 전용 결과 화면(/match-result) 딥링크 계약이 이미 있어 기존 핸들러가 처리해야 한다.
const INBOX_PUSH_TYPES = new Set([
  'match_invite',
  'match_room_closed',
  'friend_request',
  'friend_accepted',
  'rank_change',
  'chase_settlement',
  'inquiry_reply',
]);

export function resolveUserNotificationPushHref(data: unknown): Href | null {
  const type = (data as { type?: unknown } | null | undefined)?.type;

  if (typeof type !== 'string') {
    return null;
  }

  if (type === 'notice') {
    return { pathname: '/notification-center', params: { tab: 'announcements' } };
  }

  if (INBOX_PUSH_TYPES.has(type)) {
    return { pathname: '/notification-center', params: { tab: 'notifications' } };
  }

  return null;
}
