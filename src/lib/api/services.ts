import {
  connectedSources,
  friendRanks,
  friendRequests,
  friendRunRecords,
  myProfile,
  myRunRecords,
  weeklySummary,
} from '@/data/mock';
import { apiGet } from './client';
import { USE_MOCK_API } from './config';
import {
  FriendActivityResponse,
  FriendLeaderboardResponse,
  HomeSummaryResponse,
  IntegrationStatusResponse,
  MyActivityResponse,
  MyProfileResponse,
} from './types';

export async function fetchHomeSummary(): Promise<HomeSummaryResponse> {
  if (USE_MOCK_API) {
    return weeklySummary;
  }

  return apiGet<HomeSummaryResponse>('/home/summary');
}

export async function fetchMyActivity(): Promise<MyActivityResponse> {
  if (USE_MOCK_API) {
    return {
      runs: myRunRecords,
      monthlyDistanceKm: Number(myRunRecords.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1)),
      monthlyPoints: weeklySummary.districtPoints,
    };
  }

  return apiGet<MyActivityResponse>('/me/activity');
}

export async function fetchFriendLeaderboard(): Promise<FriendLeaderboardResponse> {
  if (USE_MOCK_API) {
    return {
      ranks: friendRanks,
      requests: friendRequests,
    };
  }

  return apiGet<FriendLeaderboardResponse>('/friends/leaderboard');
}

export async function fetchFriendActivity(): Promise<FriendActivityResponse> {
  if (USE_MOCK_API) {
    return {
      friend: friendRanks[0],
      runs: friendRunRecords,
    };
  }

  return apiGet<FriendActivityResponse>('/friends/1/activity');
}

export async function fetchIntegrationStatus(): Promise<IntegrationStatusResponse> {
  if (USE_MOCK_API) {
    return {
      sources: connectedSources,
    };
  }

  return apiGet<IntegrationStatusResponse>('/integrations/sources');
}

export async function fetchMyProfile(): Promise<MyProfileResponse> {
  if (USE_MOCK_API) {
    return myProfile;
  }

  return apiGet<MyProfileResponse>('/me/profile');
}
