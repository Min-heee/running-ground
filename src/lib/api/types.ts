import { ConnectedSource, FriendRank, FriendRequest, FriendRunRecord, MyRunRecord } from '@/domain/types';

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
  runs: FriendRunRecord[];
  monthlyDistanceKm: number;
  monthlyPoints: number;
};

export type IntegrationStatusResponse = {
  sources: ConnectedSource[];
};

export type RunDetailResponse = {
  run: MyRunRecord;
  weeklyDistanceKm: number;
  estimatedMinutes: number;
  earnedPoint: number;
};
