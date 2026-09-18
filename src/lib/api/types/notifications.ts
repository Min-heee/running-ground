export type InboxNotificationType =
  | 'match_invite'
  // 방장이 파티방을 삭제해 참가자/초대자가 퇴장당했을 때. 이미 사라진 방이라 갈 곳이
  // 없으므로 data에 roomId를 싣지 않는다(= 눌러도 이동하지 않는 알림).
  | 'match_room_closed'
  // 파티런 예약 확정 (오너 2026-09-09): 초대받은 친구가 수락해 예약 매칭이 잡혔을 때 방장(그룹은
  // 전원)에게. data.roomId로 대기방에 간다.
  | 'match_reserved'
  | 'match_result'
  | 'friend_request'
  | 'friend_accepted'
  | 'rank_change'
  | 'chase_settlement'
  | 'inquiry_reply'
  // 그라운드 (기간제 포인트 내기): 초대 / 참가 / 정산·취소 결과.
  | 'runmadang_invite'
  | 'runmadang_joined'
  | 'runmadang_settled'
  // 크루대전 (오너 2026-09-18): 시즌 결과 / 내보내짐 / 캡틴이 됨 / 가입 신청 도착(캡틴) /
  // 내 신청의 승인·거절. 가입 신청만 크루 관리로, 나머지는 크루 탭으로 간다.
  | 'crew_season_result'
  | 'crew_kicked'
  | 'crew_captain'
  | 'crew_join_request'
  | 'crew_join_decided';

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
  slotStartAt?: string;
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
