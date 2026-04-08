import {
  connectedSources,
  districtPersonalRanks,
  friendRanks,
  friendRequests,
  friendRunRecords,
  marketOverview,
  myNotificationSettings,
  myProfile,
  myRunRecords,
  regionDrilldownTree,
  universityLeagueRanks,
  weeklySummary,
} from '@/data/mock';
import { MarketOverview, MarketRewardItem, RegionDrilldownNode, RunSourceType, UniversityLeagueRank } from '@/domain/types';
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
  IntegrationSourceActionResponse,
  IntegrationSyncResponse,
  IntegrationStatusResponse,
  MarketClaimResponse,
  MarketOverviewResponse,
  MyActivityResponse,
  MyProfileResponse,
  NotificationSettingsResponse,
  RegionLeagueResponse,
  RunDetailResponse,
  UpdateNotificationSettingsInput,
  UpdateNotificationSettingsResponse,
  UpdateMyRegionInput,
  UpdateMyRegionResponse,
  UpdateMyProfileInput,
  UpdateMyProfileResponse,
  UniversityLeagueResponse,
} from './types';

let mockFriendRequests = friendRequests
  .filter((request) => request.status !== 'accepted')
  .map((request) => ({ ...request }));
let mockFriendRanks = friendRanks.map((friend) => ({ ...friend }));
let mockConnectedSources = connectedSources.map((source) => ({ ...source }));
let mockNotificationPreferences = { ...myNotificationSettings };
let mockMarketPoints = marketOverview.currentPoints;
let mockClaimedMarketItemIds = new Set(
  marketOverview.items
    .filter((item) => item.claimState === 'claimed')
    .map((item) => item.id),
);
const mockMarketCatalog = marketOverview.items.map(({ claimState, ...item }) => ({ ...item }));

function formatMockTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function buildMockMarketOverview(): MarketOverview {
  const items: MarketRewardItem[] = mockMarketCatalog.map((item) => ({
    ...item,
    claimState: mockClaimedMarketItemIds.has(item.id)
      ? 'claimed'
      : mockMarketPoints >= item.costPoints
        ? 'claimable'
        : 'locked',
  }));

  return {
    currentPoints: mockMarketPoints,
    totalRedeemedCount: mockClaimedMarketItemIds.size,
    items,
  };
}

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

function normalizeMockUniversityRanks(ranks: UniversityLeagueRank[]) {
  return [...ranks]
    .sort((left, right) => {
      if (right.totalDistanceKm !== left.totalDistanceKm) {
        return right.totalDistanceKm - left.totalDistanceKm;
      }

      if (right.participants !== left.participants) {
        return right.participants - left.participants;
      }

      return left.universityName.localeCompare(right.universityName, 'ko');
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      totalDistanceKm: Number(entry.totalDistanceKm.toFixed(1)),
    }));
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

export async function fetchMarketOverview(): Promise<MarketOverviewResponse> {
  if (USE_MOCK_API) {
    return buildMockMarketOverview();
  }

  return apiGet<MarketOverviewResponse>('/market/overview', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '마켓 정보를 불러오지 못했어.',
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

export async function fetchUniversityLeague(): Promise<UniversityLeagueResponse> {
  if (USE_MOCK_API) {
    const profile = getCurrentUserProfile() ?? myProfile;
    const normalizedUniversityName = profile.universityName?.trim() ?? '';
    const ranks = universityLeagueRanks.map((entry) => ({ ...entry }));

    if (normalizedUniversityName) {
      const existingRank = ranks.find((entry) => entry.universityName === normalizedUniversityName);

      if (existingRank) {
        existingRank.totalDistanceKm = Number((existingRank.totalDistanceKm + weeklySummary.totalDistanceKm).toFixed(1));
        existingRank.participants += 1;
      } else {
        ranks.push({
          rank: ranks.length + 1,
          universityName: normalizedUniversityName,
          totalDistanceKm: weeklySummary.totalDistanceKm,
          participants: 1,
        });
      }
    }

    return {
      ranks: normalizeMockUniversityRanks(ranks),
    };
  }

  return apiGet<UniversityLeagueResponse>('/league/universities', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '대학 리그 정보를 불러오지 못했어.',
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
    const lastSyncedAt = formatMockTimestamp();
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

export async function connectIntegrationSource(sourceType: RunSourceType): Promise<IntegrationSourceActionResponse> {
  if (USE_MOCK_API) {
    const targetSource = mockConnectedSources.find((source) => source.sourceType === sourceType);

    if (!targetSource) {
      throw new Error('연결할 소스를 찾지 못했어.');
    }

    mockConnectedSources = mockConnectedSources.map((source) => (
      source.sourceType === sourceType
        ? {
          ...source,
          connected: true,
          connectionStatus: 'connected',
          lastSyncedAt: source.lastSyncedAt ?? (source.sourceType === 'manual' ? formatMockTimestamp() : undefined),
        }
        : source
    ));

    const source = mockConnectedSources.find((entry) => entry.sourceType === sourceType);

    if (!source) {
      throw new Error('연결된 소스를 다시 확인하지 못했어.');
    }

    return {
      success: true,
      source,
      sources: mockConnectedSources,
    };
  }

  return apiPost<IntegrationSourceActionResponse>(
    `/integrations/sources/${sourceType}/connect`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '소스 연결에 실패했어.',
    },
  );
}

export async function disconnectIntegrationSource(sourceType: RunSourceType): Promise<IntegrationSourceActionResponse> {
  if (USE_MOCK_API) {
    const targetSource = mockConnectedSources.find((source) => source.sourceType === sourceType);

    if (!targetSource) {
      throw new Error('해제할 소스를 찾지 못했어.');
    }

    mockConnectedSources = mockConnectedSources.map((source) => (
      source.sourceType === sourceType
        ? {
          ...source,
          connected: false,
          connectionStatus: 'planned',
          lastSyncedAt: undefined,
        }
        : source
    ));

    const source = mockConnectedSources.find((entry) => entry.sourceType === sourceType);

    if (!source) {
      throw new Error('연결 해제된 소스를 다시 확인하지 못했어.');
    }

    return {
      success: true,
      source,
      sources: mockConnectedSources,
    };
  }

  return apiPost<IntegrationSourceActionResponse>(
    `/integrations/sources/${sourceType}/disconnect`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '소스 연결 해제에 실패했어.',
    },
  );
}

export async function claimMarketItem(itemId: string): Promise<MarketClaimResponse> {
  if (USE_MOCK_API) {
    const item = mockMarketCatalog.find((entry) => entry.id === itemId);

    if (!item) {
      throw new Error('교환할 리워드를 찾지 못했어.');
    }

    if (!item.repeatable && mockClaimedMarketItemIds.has(item.id)) {
      throw new Error('이미 교환한 리워드야.');
    }

    if (mockMarketPoints < item.costPoints) {
      throw new Error('포인트가 부족해서 아직 교환할 수 없어.');
    }

    mockMarketPoints -= item.costPoints;
    mockClaimedMarketItemIds.add(item.id);

    return {
      success: true,
      claimedItemId: item.id,
      overview: buildMockMarketOverview(),
    };
  }

  return apiPost<MarketClaimResponse>(
    `/market/items/${itemId}/claim`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '리워드 교환에 실패했어.',
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
    const normalizedUniversityName = input.universityName?.trim() ?? '';
    const nextProfile = {
      ...currentProfile,
      name: input.name.trim() || currentProfile.name,
      universityName: normalizedUniversityName || undefined,
    };

    await setCurrentUserProfile(nextProfile);
    return nextProfile;
  }

  const nextProfile = await apiPatch<UpdateMyProfileResponse>(
    '/me/profile',
    {
      name: input.name.trim(),
      universityName: input.universityName?.trim() ?? '',
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '프로필 저장에 실패했어.',
    },
  );

  await setCurrentUserProfile(nextProfile);
  return nextProfile;
}

export async function fetchNotificationSettings(): Promise<NotificationSettingsResponse> {
  if (USE_MOCK_API) {
    return { ...mockNotificationPreferences };
  }

  return apiGet<NotificationSettingsResponse>('/me/notifications', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '알림 설정을 불러오지 못했어.',
  });
}

export async function updateNotificationSettings(
  input: UpdateNotificationSettingsInput,
): Promise<UpdateNotificationSettingsResponse> {
  if (USE_MOCK_API) {
    mockNotificationPreferences = {
      friendAlerts: input.friendAlerts,
      districtAlerts: input.districtAlerts,
      marketAlerts: input.marketAlerts,
    };

    return { ...mockNotificationPreferences };
  }

  return apiPatch<UpdateNotificationSettingsResponse>(
    '/me/notifications',
    {
      friendAlerts: input.friendAlerts,
      districtAlerts: input.districtAlerts,
      marketAlerts: input.marketAlerts,
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '알림 설정 저장에 실패했어.',
    },
  );
}

export async function updateMyRegion(input: UpdateMyRegionInput): Promise<UpdateMyRegionResponse> {
  if (USE_MOCK_API) {
    const currentProfile = getCurrentUserProfile() ?? myProfile;
    const nextProfile = {
      ...currentProfile,
      districtName: input.districtName.trim() || currentProfile.districtName,
    };

    await setCurrentUserProfile(nextProfile);
    return nextProfile;
  }

  const nextProfile = await apiPatch<UpdateMyRegionResponse>(
    '/me/region',
    {
      districtName: input.districtName.trim(),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '지역 저장에 실패했어.',
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
