export type InboxNotificationType =
  | 'match_invite'
  // 방장이 파티방을 삭제해 참가자/초대자가 퇴장당했을 때. 이미 사라진 방이라 갈 곳이
  // 없으므로 data에 roomId를 싣지 않는다(= 눌러도 이동하지 않는 알림).
  | 'match_room_closed'
  | 'match_result'
  | 'friend_request'
  | 'friend_accepted'
  | 'rank_change'
  | 'chase_settlement'
  | 'inquiry_reply'
  // 런마당 (기간제 포인트 내기): 초대 / 참가 / 정산·취소 결과.
  | 'runmadang_invite'
  | 'runmadang_joined'
  | 'runmadang_settled';

export type InboxNotificationData = {
  roomId?: string;
  matchId?: string;
  mode?: 'duel' | 'group';
  friendUserId?: string;
  tier?: string;
  lpDelta?: number;
  arenaId?: string;
  runId?: string;
  inquiryId?: string;
  challengeId?: string;
  [key: string]: unknown;
};

export type InboxNotification = {
  id: string;
  userId: string;
  type: InboxNotificationType;
  title: string;
  body: string;
  data?: InboxNotificationData;
  createdAt: string;
  readAt: string | null;
};

export type InboxResponse = {
  items: InboxNotification[];
  unreadCount: number;
};

export type MarkInboxReadResponse = {
  unreadCount: number;
};

export type DeleteInboxResponse = {
  deletedCount: number;
  unreadCount: number;
};
