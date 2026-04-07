import {
  connectedSources,
  districtPersonalRanks,
  friendRanks,
  friendRequests,
  friendRunRecords,
  myProfile,
  myRunRecords,
  regionDrilldownTree,
  weeklySummary,
} from '@/data/mock';
import { RegionDrilldownNode } from '@/domain/types';
import { getAccessToken, getCurrentUserProfile, setCurrentUserProfile } from '@/lib/session';
import { apiGet, apiPatch, apiPost } from './client';
import { USE_MOCK_API } from './config';
import {
  CreateFriendRequestResponse,
  DistrictPersonalResponse,
  FriendActivityResponse,
  FriendLeaderboardResponse,
  FriendRequestActionResponse,
  HomeSummaryResponse,
  IntegrationSyncResponse,
  IntegrationStatusResponse,
  MyActivityResponse,
  MyProfileResponse,
  RegionLeagueResponse,
  RunDetailResponse,
  UpdateMyProfileInput,
  UpdateMyProfileResponse,
} from './types';

let mockFriendRequests = friendRequests
  .filter((request) => request.status !== 'accepted')
  .map((request) => ({ ...request }));
let mockFriendRanks = friendRanks.map((friend) => ({ ...friend }));
let mockConnectedSources = connectedSources.map((source) => ({ ...source }));

function normalizeMockFriendRanks(ranks: typeof mockFriendRanks) {
  return [...ranks]
    .sort((left, right) => {
      if (right.distanceKm !== left.distanceKm) {
        return right.distanceKm - left.distanceKm;
      }

      if (right.points !== left.points) {
        return right.points - left.points;
      }

      return left.name.localeCompare(right.name, 'ko');
    })
    .map((runner, index) => ({
      ...runner,
      rank: index + 1,
    }));
}

function createMockFriendRank(input: { id: string; name: string; tag: string }) {
  const nextIndex = mockFriendRanks.length + 1;
  const distanceKm = Number((62 + nextIndex * 4.3).toFixed(1));

  return {
    id: input.id,
    name: input.name,
    tag: input.tag,
    distanceKm,
    points: Math.round(distanceKm * 1.15),
    rank: nextIndex,
  };
}

async function requireAccessToken() {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('로그인이 필요해.');
  }

  return accessToken;
}

function findRegionPath(node: RegionDrilldownNode, targetId: string): RegionDrilldownNode[] | null {
  if (node.id === targetId) {
    return [node];
  }

  for (const child of node.children ?? []) {
    const childPath = findRegionPath(child, targetId);

    if (childPath) {
      return [node, ...childPath];
    }
  }

  return null;
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
      ranks: normalizeMockFriendRanks(mockFriendRanks),
      requests: mockFriendRequests,
    };
  }

  return apiGet<FriendLeaderboardResponse>('/friends/leaderboard', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '친구 랭킹을 불러오지 못했어.',
  });
}

export async function fetchDistrictPersonal(): Promise<DistrictPersonalResponse> {
  if (USE_MOCK_API) {
    const profile = getCurrentUserProfile() ?? myProfile;
    const ranks = districtPersonalRanks
      .map((runner) => (
        runner.isMe
          ? {
            ...runner,
            name: profile.name,
          }
          : runner
      ))
      .sort((left, right) => left.rank - right.rank);
    const myRank = ranks.find((runner) => runner.isMe) ?? null;
    const myRankIndex = myRank ? ranks.findIndex((runner) => runner.id === myRank.id) : -1;
    const focusStart = Math.max(0, myRankIndex - 1);
    const focusRanks = myRankIndex >= 0 ? ranks.slice(focusStart, focusStart + 4) : ranks.slice(0, 4);

    return {
      districtName: profile.districtName,
      myRank,
      myPoints: weeklySummary.districtPoints,
      weeklyDistanceKm: weeklySummary.totalDistanceKm,
      focusRanks,
      ranks,
    };
  }

  return apiGet<DistrictPersonalResponse>('/league/district-personal', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '구 내 개인 경쟁 정보를 불러오지 못했어.',
  });
}

export async function fetchRegionLeague(nodeId?: string): Promise<RegionLeagueResponse> {
  if (USE_MOCK_API) {
    const path = nodeId ? (findRegionPath(regionDrilldownTree, nodeId) ?? [regionDrilldownTree]) : [regionDrilldownTree];
    const currentNode = path[path.length - 1];
    const children = [...(currentNode.children ?? [])].sort((left, right) => left.rank - right.rank);

    return {
      currentNode,
      breadcrumb: path.map(({ id, name, level }) => ({ id, name, level })),
      children,
    };
  }

  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';

  return apiGet<RegionLeagueResponse>(`/league/regions${query}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '지역 리그 정보를 불러오지 못했어.',
  });
}

export async function fetchFriendActivity(friendId?: string): Promise<FriendActivityResponse> {
  if (USE_MOCK_API) {
    const normalizedRanks = normalizeMockFriendRanks(mockFriendRanks);
    const friend = friendId
      ? (normalizedRanks.find((entry) => entry.id === friendId) ?? normalizedRanks[0])
      : normalizedRanks[0];

    return {
      friend,
      runs: friendRunRecords,
      monthlyDistanceKm: Number(friendRunRecords.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1)),
      monthlyPoints: friend.points,
    };
  }

  if (!friendId) {
    throw new Error('친구 정보를 찾을 수 없어.');
  }

  return apiGet<FriendActivityResponse>(`/friends/${friendId}/activity`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '친구 활동을 불러오지 못했어.',
  });
}

export async function fetchIntegrationStatus(): Promise<IntegrationStatusResponse> {
  if (USE_MOCK_API) {
    return {
      sources: mockConnectedSources,
    };
  }

  return apiGet<IntegrationStatusResponse>('/integrations/sources', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '연동 상태를 불러오지 못했어.',
  });
}

export async function syncIntegrationSources(): Promise<IntegrationSyncResponse> {
  if (USE_MOCK_API) {
    const lastSyncedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const connectedCount = mockConnectedSources.filter((source) => source.connected).length;

    mockConnectedSources = mockConnectedSources.map((source) => (
      source.connected
        ? {
          ...source,
          lastSyncedAt,
        }
        : source
    ));

    return {
      success: true,
      syncedSources: connectedCount,
      syncedRuns: connectedCount * 3,
      lastSyncedAt,
    };
  }

  return apiPost<IntegrationSyncResponse>(
    '/integrations/sync',
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '연동 동기화에 실패했어.',
    },
  );
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
    const normalizedTag = tag.trim().toUpperCase();
    const requestId = `mock-${Date.now()}`;
    const existingFriend = mockFriendRanks.find((entry) => entry.tag === normalizedTag);

    mockFriendRequests = [
      ...mockFriendRequests.filter((entry) => entry.tag !== normalizedTag),
      {
        id: requestId,
        name: existingFriend?.name
          ?? mockFriendRequests.find((entry) => entry.tag === normalizedTag)?.name
          ?? '새 친구',
        tag: normalizedTag,
        status: 'pending',
      },
    ];

    return {
      success: true,
      requestId,
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

export async function acceptFriendRequest(requestId: string): Promise<FriendRequestActionResponse> {
  if (USE_MOCK_API) {
    const acceptedRequest = mockFriendRequests.find((request) => request.id === requestId);

    if (acceptedRequest && !mockFriendRanks.some((entry) => entry.tag === acceptedRequest.tag)) {
      mockFriendRanks = normalizeMockFriendRanks([
        ...mockFriendRanks,
        createMockFriendRank({
          id: `friend-${requestId}`,
          name: acceptedRequest.name,
          tag: acceptedRequest.tag,
        }),
      ]);
    } else {
      mockFriendRanks = normalizeMockFriendRanks(mockFriendRanks);
    }

    mockFriendRequests = mockFriendRequests.filter((request) => request.id !== requestId);

    return {
      success: true,
      requestId,
      status: 'accepted',
    };
  }

  return apiPost<FriendRequestActionResponse>(
    `/friends/requests/${requestId}/accept`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '친구 요청 수락에 실패했어.',
    },
  );
}

export async function rejectFriendRequest(requestId: string): Promise<FriendRequestActionResponse> {
  if (USE_MOCK_API) {
    mockFriendRequests = mockFriendRequests.filter((request) => request.id !== requestId);

    return {
      success: true,
      requestId,
      status: 'rejected',
    };
  }

  return apiPost<FriendRequestActionResponse>(
    `/friends/requests/${requestId}/reject`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '친구 요청 거절에 실패했어.',
    },
  );
}

export async function cancelFriendRequest(requestId: string): Promise<FriendRequestActionResponse> {
  if (USE_MOCK_API) {
    mockFriendRequests = mockFriendRequests.filter((request) => request.id !== requestId);

    return {
      success: true,
      requestId,
      status: 'cancelled',
    };
  }

  return apiPost<FriendRequestActionResponse>(
    `/friends/requests/${requestId}/cancel`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '보낸 친구 요청 취소에 실패했어.',
    },
  );
}

export async function fetchRunDetail(input?: { runId?: string; friendId?: string }): Promise<RunDetailResponse> {
  if (USE_MOCK_API) {
    if (input?.friendId) {
      const run = input.runId
        ? (friendRunRecords.find((entry) => entry.id === input.runId) ?? friendRunRecords[0])
        : friendRunRecords[0];

      return {
        run: {
          ...run,
          source: '친구 기록',
        },
        weeklyDistanceKm: weeklySummary.totalDistanceKm,
        estimatedMinutes: Math.round(run.distanceKm * 5.5),
        earnedPoint: Math.round(run.distanceKm * 2.4),
      };
    }

    const run = input?.runId
      ? (myRunRecords.find((entry) => entry.id === input.runId) ?? myRunRecords[0])
      : myRunRecords[0];

    return {
      run,
      weeklyDistanceKm: weeklySummary.totalDistanceKm,
      estimatedMinutes: Math.round(run.distanceKm * 5.5),
      earnedPoint: Math.round(run.distanceKm * 2.4),
    };
  }

  if (input?.friendId && input?.runId) {
    return apiGet<RunDetailResponse>(`/friends/${input.friendId}/runs/${input.runId}`, {
      accessToken: await requireAccessToken(),
      fallbackMessage: '친구 러닝 상세를 불러오지 못했어.',
    });
  }

  if (input?.runId) {
    return apiGet<RunDetailResponse>(`/runs/${input.runId}`, {
      accessToken: await requireAccessToken(),
      fallbackMessage: '러닝 상세를 불러오지 못했어.',
    });
  }

  return apiGet<RunDetailResponse>('/runs/latest', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '러닝 상세를 불러오지 못했어.',
  });
}
