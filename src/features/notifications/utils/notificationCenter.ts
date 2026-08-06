import type { Href } from 'expo-router';

import type { InboxNotification, InboxNotificationType } from '@/services';

export type NotificationCenterTab = 'announcements' | 'notifications';

export const NOTIFICATION_CENTER_TABS = [
  { key: 'announcements', label: '공지사항' },
  { key: 'notifications', label: '알림' },
] as const;

export function normalizeInitialTab(tab?: string | string[]): NotificationCenterTab {
  const value = Array.isArray(tab) ? tab[0] : tab;
  return value === 'notifications' ? 'notifications' : 'announcements';
}

export function formatRelativeTime(createdAt: string) {
  const createdMs = Date.parse(createdAt);

  if (!Number.isFinite(createdMs)) {
    return '';
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - createdMs) / 60_000));

  if (diffMinutes < 1) {
    return '방금 전';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}일 전`;
}

export function getNotificationTypeLabel(type: InboxNotificationType) {
  switch (type) {
    case 'match_invite':
      return '초대';
    case 'match_room_closed':
      return '파티방';
    case 'match_result':
      return '결과';
    case 'friend_request':
      return '친구 요청';
    case 'friend_accepted':
      return '친구 수락';
    case 'rank_change':
      return '랭크';
    case 'chase_settlement':
      return '경찰과 도둑';
    case 'inquiry_reply':
      return '문의 답변';
    case 'runmadang_invite':
    case 'runmadang_joined':
    case 'runmadang_settled':
      return '런마당';
    default:
      return '알림';
  }
}

export function resolveNotificationHref(notification: InboxNotification): Href | null {
  const data = notification.data;

  // 타입만으로 목적지가 정해지는 알림은 data 유무와 무관하게 먼저 라우팅한다
  // (오너 2026-08-06: 친구 신청 알림 탭 → 친구 요청 화면).
  if (notification.type === 'friend_request') {
    return '/friend-requests';
  }
  // 수락됨 알림은 이제 친구가 된 상대를 보러 친구 탭으로.
  if (notification.type === 'friend_accepted') {
    return '/(tabs)/friends';
  }
  // 문의 답변 알림 → 문의하기 화면(내역에 답변이 보인다). data 없이도 성립.
  if (notification.type === 'inquiry_reply') {
    return '/support';
  }
  // 런마당 알림(초대/참가/정산) → 런마당 목록으로. 목록이 판별 카드를 보여주므로
  // challengeId 없이도 성립.
  if (
    notification.type === 'runmadang_invite'
    || notification.type === 'runmadang_joined'
    || notification.type === 'runmadang_settled'
  ) {
    return '/runmadang';
  }

  if (!data) {
    return null;
  }

  // A confirmed-result (결과확정) inbox row opens the dedicated match-result screen, fetched
  // by matchId from the backend — NOT the live/finished arena. This must be checked before
  // the roomId/matchId branches below, which route into the arena.
  if (notification.type === 'match_result' && typeof data.matchId === 'string' && data.matchId.trim()) {
    return {
      pathname: '/match-result',
      params: {
        matchId: data.matchId.trim(),
        ...(data.mode === 'duel' || data.mode === 'group' ? { matchMode: data.mode } : {}),
      },
    };
  }

  // 경찰과 도둑런 정산 알림 → 해당 러닝의 상세(정산 카드)로.
  if (notification.type === 'chase_settlement' && typeof data.runId === 'string' && data.runId.trim()) {
    return {
      pathname: '/run-detail',
      params: { runId: data.runId.trim() },
    };
  }

  if (typeof data.roomId === 'string' && data.roomId.trim()) {
    return '/match-room';
  }

  if (typeof data.matchId === 'string' && data.matchId.trim()) {
    return {
      pathname: '/(tabs)/running',
      params: {
        focusMatchId: data.matchId,
        focusMatchMode: data.mode === 'group' ? 'group' : 'duel',
        forceMatchArena: '1',
        focusMatchNonce: String(Date.now()),
      },
    };
  }

  if (typeof data.friendUserId === 'string' && data.friendUserId.trim()) {
    return {
      pathname: '/friend-detail',
      params: { friendId: data.friendUserId },
    };
  }

  return null;
}
