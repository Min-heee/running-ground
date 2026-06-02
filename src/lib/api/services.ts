import {
  connectedSources,
  friendRanks,
  friendRequests,
  friendRunRecords,
  myProfile,
  myRunRecords,
  weeklySummary,
} from '@/data/mock';
import { UserProfile, WeeklySummary } from '@/domain/types';
import { apiGet } from './client';
import { USE_MOCK_API } from './config';
import {
  FriendActivityResponse,
  FriendLeaderboardResponse,
  IntegrationStatusResponse,
  MyActivityResponse,
  RunDetailResponse,
} from './types';

export async function fetchHomeSummary(): Promise<WeeklySummary> {
  if (USE_MOCK_API) {
    return weeklySummary;
  }

  return apiGet<WeeklySummary>('/home/summary');
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

export async function fetchFriendActivity(friendId: string): Promise<FriendActivityResponse> {
  if (USE_MOCK_API) {
    const friend = friendRanks.find((rank) => rank.id === friendId) ?? friendRanks[0];
    return {
      friend,
      runs: friendRunRecords,
      monthlyDistanceKm: Number(friendRunRecords.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1)),
      monthlyPoints: friend.points,
    };
  }

  return apiGet<FriendActivityResponse>(`/friends/${encodeURIComponent(friendId)}/activity`);
}

export async function fetchIntegrationStatus(): Promise<IntegrationStatusResponse> {
  if (USE_MOCK_API) {
    return {
      sources: connectedSources,
    };
  }

  return apiGet<IntegrationStatusResponse>('/integrations/sources');
}

export async function fetchMyProfile(): Promise<UserProfile> {
  if (USE_MOCK_API) {
    return myProfile;
  }

  return apiGet<UserProfile>('/me/profile');
}

export async function fetchRunDetail(runId: string): Promise<RunDetailResponse> {
  if (USE_MOCK_API) {
    const run = myRunRecords.find((record) => record.id === runId) ?? myRunRecords[0];
    return {
      run,
      weeklyDistanceKm: weeklySummary.totalDistanceKm,
      estimatedMinutes: Math.round(run.distanceKm * 5.5),
      earnedPoint: Math.round(run.distanceKm * 2.4),
    };
  }

  return apiGet<RunDetailResponse>(`/runs/${encodeURIComponent(runId)}`);
}
