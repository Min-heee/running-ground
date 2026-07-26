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
