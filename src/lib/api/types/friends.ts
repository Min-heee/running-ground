import type {
  FriendRank,
  FriendRequest,
  FriendRunRecord,
} from '@/domain';

export type FriendLeaderboardResponse = {
  ranks: FriendRank[];
  requests: FriendRequest[];
};

export type FriendActivityResponse = {
  friend: FriendRank;
  runs: FriendRunRecordsResponse;
  monthlyDistanceKm: number;
  monthlyPoints: number;
};

export type FriendRunRecordsResponse = FriendRunRecord[];

export type CreateFriendRequestResponse = {
  success: boolean;
  requestId: string;
  status: 'pending' | 'accepted';
};

export type FriendRequestActionResponse = {
  success: boolean;
  requestId: string;
  status: 'accepted' | 'rejected' | 'cancelled';
};

// GET /friends/relation/:userId — 사람 탭 분기 재료.
export type FriendRelation = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';

export type FriendRelationResponse = {
  userId: string;
  name: string;
  relation: FriendRelation;
};

// GET /friends/live-run?friendId= — 친구 실시간 지도 화면이 폴링한다 (오너 2026-07-31).
export type FriendLiveRunResponse = {
  isRunningNow: boolean;
  name: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  paceLabel?: string;
  locationLabel?: string;
  startedAt?: string;
  updatedAt?: string;
  allowCheers?: boolean;
};

export type SendFriendCheerInput = {
  friendId: string;
  message: string;
};
