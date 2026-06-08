export type InboxNotificationType =
  | 'match_invite'
  | 'match_result'
  | 'friend_request'
  | 'friend_accepted'
  | 'rank_change';

export type InboxNotificationData = {
  roomId?: string;
  matchId?: string;
  mode?: 'duel' | 'group';
  friendUserId?: string;
  tier?: string;
  lpDelta?: number;
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
