import type {
  FriendRank,
  FriendRequest,
  FriendRunRecord,
} from '@/domain/types';

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
