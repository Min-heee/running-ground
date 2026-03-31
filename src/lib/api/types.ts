import { ConnectedSource, FriendRank, FriendRequest, FriendRunRecord, MyRunRecord, UserProfile, WeeklySummary } from '@/domain/types';

export type HomeSummaryResponse = WeeklySummary;

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
};

export type FriendRunRecordsResponse = FriendRunRecord[];

export type IntegrationStatusResponse = {
  sources: ConnectedSource[];
};

export type MyProfileResponse = UserProfile;
