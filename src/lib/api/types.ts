import { ConnectedSource, FriendRank, FriendRequest, FriendRunRecord, MyRunRecord, UserProfile, WeeklySummary } from '@/domain/types';

export type HomeSummaryResponse = WeeklySummary;

export type AuthResponse = {
  accessToken: string;
  user: UserProfile;
};

export type MyActivityResponse = {
  runs: MyRunRecord[];
  monthlyDistanceKm: number;
  monthlyPoints: number;
};

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

export type IntegrationStatusResponse = {
  sources: ConnectedSource[];
};

export type MyProfileResponse = UserProfile;

export type UpdateMyProfileInput = {
  name: string;
};

export type UpdateMyProfileResponse = UserProfile;

export type CreateFriendRequestResponse = {
  success: boolean;
  requestId: string;
  status: 'pending' | 'accepted';
};

export type RunDetailResponse = {
  run: MyRunRecord;
  weeklyDistanceKm: number;
  estimatedMinutes: number;
  earnedPoint: number;
};
