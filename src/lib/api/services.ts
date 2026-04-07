import {
  connectedSources,
  friendRanks,
  friendRequests,
  friendRunRecords,
  myProfile,
  myRunRecords,
  weeklySummary,
} from '@/data/mock';
import { getAccessToken, getCurrentUserProfile, setCurrentUserProfile } from '@/lib/session';
import { apiGet, apiPatch, apiPost } from './client';
import { USE_MOCK_API } from './config';
import {
  CreateFriendRequestResponse,
  FriendActivityResponse,
  FriendLeaderboardResponse,
  HomeSummaryResponse,
  IntegrationStatusResponse,
  MyActivityResponse,
  MyProfileResponse,
  RunDetailResponse,
  UpdateMyProfileInput,
  UpdateMyProfileResponse,
} from './types';

async function requireAccessToken() {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('로그인이 필요해.');
  }

  return accessToken;
}

export async function fetchHomeSummary(): Promise<HomeSummaryResponse> {
  if (USE_MOCK_API) {
    return weeklySummary;
  }

  return apiGet<HomeSummaryResponse>('/home/summary', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '홈 요약을 불러오지 못했어.',
  });
}

export async function fetchMyActivity(): Promise<MyActivityResponse> {
  if (USE_MOCK_API) {
    return {
      runs: myRunRecords,
      monthlyDistanceKm: Number(myRunRecords.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1)),
      monthlyPoints: weeklySummary.districtPoints,
    };
  }

  return apiGet<MyActivityResponse>('/me/activity', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '내 활동을 불러오지 못했어.',
  });
}

export async function fetchFriendLeaderboard(): Promise<FriendLeaderboardResponse> {
  if (USE_MOCK_API) {
    return {
      ranks: friendRanks,
      requests: friendRequests,
    };
  }

  return apiGet<FriendLeaderboardResponse>('/friends/leaderboard', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '친구 랭킹을 불러오지 못했어.',
  });
}

export async function fetchFriendActivity(): Promise<FriendActivityResponse> {
  if (USE_MOCK_API) {
    return {
      friend: friendRanks[0],
      runs: friendRunRecords,
      monthlyDistanceKm: Number(friendRunRecords.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1)),
      monthlyPoints: friendRanks[0].points,
    };
  }

  return apiGet<FriendActivityResponse>('/friends/1/activity', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '친구 활동을 불러오지 못했어.',
  });
}

export async function fetchIntegrationStatus(): Promise<IntegrationStatusResponse> {
  if (USE_MOCK_API) {
    return {
      sources: connectedSources,
    };
  }

  return apiGet<IntegrationStatusResponse>('/integrations/sources', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '연동 상태를 불러오지 못했어.',
  });
}

export async function fetchMyProfile(): Promise<MyProfileResponse> {
  if (USE_MOCK_API) {
    return getCurrentUserProfile() ?? myProfile;
  }

  return apiGet<MyProfileResponse>('/me/profile', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '내 프로필을 불러오지 못했어.',
  });
}

export async function updateMyProfile(input: UpdateMyProfileInput): Promise<UpdateMyProfileResponse> {
  if (USE_MOCK_API) {
    const currentProfile = getCurrentUserProfile() ?? myProfile;
    const nextProfile = {
      ...currentProfile,
      name: input.name.trim() || currentProfile.name,
    };

    await setCurrentUserProfile(nextProfile);
    return nextProfile;
  }

  const nextProfile = await apiPatch<UpdateMyProfileResponse>(
    '/me/profile',
    {
      name: input.name.trim(),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '프로필 저장에 실패했어.',
    },
  );

  await setCurrentUserProfile(nextProfile);
  return nextProfile;
}

export async function createFriendRequest(tag: string): Promise<CreateFriendRequestResponse> {
  if (USE_MOCK_API) {
    return {
      success: true,
      requestId: `mock-${Date.now()}`,
      status: 'pending',
    };
  }

  return apiPost<CreateFriendRequestResponse>(
    '/friends/requests',
    {
      tag: tag.trim().toUpperCase(),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '친구 요청 전송에 실패했어.',
    },
  );
}

export async function fetchRunDetail(): Promise<RunDetailResponse> {
  if (USE_MOCK_API) {
    const run = myRunRecords[0];
    return {
      run,
      weeklyDistanceKm: weeklySummary.totalDistanceKm,
      estimatedMinutes: Math.round(run.distanceKm * 5.5),
      earnedPoint: Math.round(run.distanceKm * 2.4),
    };
  }

  return apiGet<RunDetailResponse>('/runs/latest', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '러닝 상세를 불러오지 못했어.',
  });
}
