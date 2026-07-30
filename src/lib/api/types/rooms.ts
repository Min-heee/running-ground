import type { RunningMatchLiveStatus } from '@/lib/api/types/matches';

export type RunningMatchRoomMode = 'duel' | 'group';
export type RunningMatchRoomStartMode = 'scheduled' | 'host';
export type RunningMatchRoomState = 'waiting' | 'arming' | 'countdown' | 'active';

export type RunningMatchRoomParticipant = {
  userId: string;
  name: string;
  tag?: string;
  districtName: string;
  averagePace: string;
  levelLabel: string;
  liveDistanceKm?: number;
  liveElapsedSeconds?: number;
  livePace?: string;
  liveUpdatedAt?: string;
  liveStatus?: RunningMatchLiveStatus;
  finishedAt?: string;
  officialDistanceKm?: number;
  officialElapsedSeconds?: number;
  officialAveragePace?: string;
  officialRank?: number;
  officialGapAheadKm?: number | null;
  officialGapLeaderKm?: number;
  officialComparedAt?: string;
  officialReady?: boolean;
  isHost: boolean;
  isReady?: boolean;
  isCountdownReady?: boolean;
  invited: boolean;
  joinedAt: string;
};

export type RunningMatchRoomInvitee = {
  inviteId?: string;
  roomId?: string;
  inviteToken?: string;
  invitedUserId?: string;
  userId: string;
  name: string;
  tag?: string;
  districtName: string;
  averagePace: string;
  levelLabel: string;
  status: 'pending';
  invitedAt?: string;
};

export type RunningMatchRoom = {
  roomId: string;
  inviteToken: string;
  inviteLink: string;
  mode: RunningMatchRoomMode;
  state: RunningMatchRoomState;
  startMode: RunningMatchRoomStartMode;
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  maxParticipants: number;
  minParticipants: number;
  canStart: boolean;
  isHost: boolean;
  joined?: boolean;
  hostUserId: string;
  hostName: string;
  participants: RunningMatchRoomParticipant[];
  invitedFriendIds: string[];
  invitedFriends?: RunningMatchRoomInvitee[];
  countdownReadyCount?: number;
  countdownReadyRequiredCount?: number;
  linkedMatchId?: string;
  linkedMatchStatus?: 'matched' | 'active';
  linkedMatchSlotStartAt?: string;
  linkedMatchDistanceKm?: number;
};

export type RunningMatchRoomResponse = {
  success: boolean;
  serverNow?: string;
  room: RunningMatchRoom | null;
};

export type JoinedRunningMatchRoomResponse = Omit<RunningMatchRoomResponse, 'success' | 'room'> & {
  success: true;
  room: RunningMatchRoom;
};

export type RunningMatchRoomBlockerSource =
  | 'matchRooms.participant'
  | 'matchRooms.invited'
  | 'matchSessions.activeParticipant'
  | 'matchQueues.duel'
  | 'matchQueues.group'
  | 'liveRunShares.active';

export type RunningMatchRoomErrorCode =
  | 'active_room_blocked'
  | 'already_joined'
  | 'room_not_found'
  | 'stale_room_blocked'
  | 'invalid_room_response';

export type RunningMatchRoomBlockerDetails = {
  source: RunningMatchRoomBlockerSource;
  roomId?: string;
  sessionId?: string;
  queueId?: string;
  mode?: RunningMatchRoomMode;
  state?: string;
  startMode?: RunningMatchRoomStartMode;
  slotStartAt?: string;
  linkedMatchId?: string | null;
  isHost?: boolean;
  isParticipant?: boolean;
  isInvited?: boolean;
  updatedAt?: string | null;
};

export type RunningMatchRoomCleanupResponse = {
  success: boolean;
  serverNow?: string;
  code?: RunningMatchRoomErrorCode;
  cleaned: boolean;
  cleanedItems: string[];
  blocker?: 'activeRoom' | 'matchSession' | 'matchQueue' | 'liveRunShare';
  blockerSource?: RunningMatchRoomBlockerSource;
  blockerDetails?: RunningMatchRoomBlockerDetails;
  message?: string;
  room: RunningMatchRoom | null;
};

export type RunningMatchForceResetResponse = {
  success: boolean;
  serverNow: string;
  cleaned: boolean;
  cleanedItems: string[];
};

export type CreateRunningMatchRoomInput = {
  mode: RunningMatchRoomMode;
  distanceKm: number;
  startMode: RunningMatchRoomStartMode;
  slotStartAt?: string;
  maxParticipants?: number;
  invitedFriendIds?: string[];
};

export type UpdateRunningMatchRoomInput = {
  roomId: string;
  distanceKm: number;
  startMode: RunningMatchRoomStartMode;
  slotStartAt?: string;
  maxParticipants?: number;
  invitedFriendIds?: string[];
};

export type JoinRunningMatchRoomInput = {
  inviteToken: string;
};

export type StartRunningMatchRoomInput = {
  roomId: string;
};

export type LeaveRunningMatchRoomInput = {
  roomId: string;
  // 방장의 '방 삭제' 버튼에서만 true. 방을 폭파해 참가자 전원을 퇴장시킨다.
  // 자동 복구 경로(빈 대기실 화해, 방 만들기 blocker 회수)는 절대 이걸 켜지 않는다 —
  // 아무도 누르지 않았는데 남의 파티방이 사라지면 안 된다.
  deleteRoom?: boolean;
};

export type UpdateRunningMatchRoomReadyInput = {
  roomId: string;
  ready: boolean;
};

export type AcknowledgeRunningMatchRoomCountdownInput = {
  roomId: string;
};
