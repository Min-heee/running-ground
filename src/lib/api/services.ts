import {
  connectedSources,
  createOfflineRaceHubMock,
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
import { addressCatalog } from '@/features/location/addressCatalog';
import { DistrictPersonalRank, MarketOverview, MarketRewardItem, OfflineRaceEvent, OfflineRaceHub, OfflineRaceStatus, RegionDrilldownNode, RunSourceType, UniversityLeagueRank } from '@/domain/types';
import { getAccessToken, getCurrentUserProfile, setCurrentUserProfile } from '@/lib/session';
import { apiGet, apiPatch, apiPost } from './client';
import { USE_MOCK_API } from './config';
import {
  ActiveNoticesResponse,
  CreateManualRunInput,
  CreateManualRunResponse,
  CreateFriendRequestResponse,
  DistrictPersonalResponse,
  FriendActivityResponse,
  FriendLeaderboardResponse,
  FriendRequestActionResponse,
  HomeSummaryResponse,
  QueueIntegrationImportResponse,
  IntegrationSourceActionResponse,
  IntegrationSyncResponse,
  IntegrationStatusResponse,
  MarketClaimResponse,
  MarketOverviewResponse,
  MyActivityResponse,
  MyProfileResponse,
  NotificationSettingsResponse,
  OfflineRaceEntryActionResponse,
  OfflineRaceHubResponse,
  RegionLeagueResponse,
  RegionCatalogResponse,
  RunDetailResponse,
  UpdateNotificationSettingsInput,
  UpdateNotificationSettingsResponse,
  UpdateMyRegionInput,
  UpdateMyRegionResponse,
  UpdateMyProfileInput,
  UpdateMyProfileResponse,
  UniversityCatalogResponse,
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
type MockOfflineRaceEventState = Omit<OfflineRaceEvent, 'registered' | 'status'> & {
  registeredUserTags: string[];
};

type MockOfflineRaceHubState = Omit<OfflineRaceHub, 'featuredEvent' | 'upcomingEvents'> & {
  featuredEvent: MockOfflineRaceEventState;
  upcomingEvents: MockOfflineRaceEventState[];
};

const initialOfflineRaceHub = createOfflineRaceHubMock();
const initialFeaturedEvent = initialOfflineRaceHub.featuredEvent;

if (!initialFeaturedEvent) {
  throw new Error('Mock offline race hub requires a featured event.');
}

let mockOfflineRaceHubState: MockOfflineRaceHubState = {
  featuredEvent: {
    ...initialFeaturedEvent,
    registeredUserTags: [],
  },
  upcomingEvents: initialOfflineRaceHub.upcomingEvents.map((event) => ({
    ...event,
    registeredUserTags: [],
  })),
  pastEvents: initialOfflineRaceHub.pastEvents.map((event) => ({ ...event })),
  guideSteps: [...initialOfflineRaceHub.guideSteps],
};

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
    isRunningNow: false,
  };
}

function normalizeMockUniversityRanks(ranks: UniversityLeagueRank[]) {
  return [...ranks]
    .map((entry) => ({
      ...entry,
      averageDistanceKm: Number((entry.totalDistanceKm / Math.max(entry.participants, 1)).toFixed(1)),
    }))
    .sort((left, right) => {
      if (right.averageDistanceKm !== left.averageDistanceKm) {
        return right.averageDistanceKm - left.averageDistanceKm;
      }

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
      averageDistanceKm: Number(entry.averageDistanceKm.toFixed(1)),
    }));
}

function normalizeRegionChildren(children: RegionDrilldownNode[]) {
  return [...children]
    .sort((left, right) => {
      if (right.averageDistanceKm !== left.averageDistanceKm) {
        return right.averageDistanceKm - left.averageDistanceKm;
      }

      if (right.totalDistanceKm !== left.totalDistanceKm) {
        return right.totalDistanceKm - left.totalDistanceKm;
      }

      if (right.participants !== left.participants) {
        return right.participants - left.participants;
      }

      return left.name.localeCompare(right.name, 'ko');
    })
    .map((child, index) => ({
      ...child,
      rank: index + 1,
    }));
}

function getOfflineRaceStatus(event: Pick<OfflineRaceEvent, 'startsAt' | 'registrationClosesAt'>, now = new Date()): OfflineRaceStatus {
  const startsAt = new Date(event.startsAt).getTime();
  const registrationClosesAt = new Date(event.registrationClosesAt).getTime();
  const currentTime = now.getTime();

  if (currentTime >= startsAt + 2 * 60 * 60 * 1000) {
    return 'finished';
  }

  if (currentTime >= startsAt) {
    return 'live';
  }

  if (currentTime >= registrationClosesAt) {
    return 'registration_closed';
  }

  if (registrationClosesAt - currentTime <= 3 * 60 * 60 * 1000) {
    return 'registration_closing';
  }

  return 'registration_open';
}

function buildMyOfflineRacePreview() {
  const profile = getCurrentUserProfile() ?? myProfile;

  return {
    id: 'offline-race-me',
    name: profile.name,
    paceGoal: '5:30/km',
    regionLabel: profile.districtName,
  };
}

function decorateOfflineRaceEvent(event: MockOfflineRaceEventState): OfflineRaceEvent {
  const profile = getCurrentUserProfile() ?? myProfile;
  const registered = event.registeredUserTags.includes(profile.publicTag);
  const status = getOfflineRaceStatus(event);
  const participantPreview = registered
    ? [buildMyOfflineRacePreview(), ...event.participantPreview.filter((entry) => entry.name !== profile.name)].slice(0, 4)
    : event.participantPreview;

  const { registeredUserTags, ...rest } = event;

  return {
    ...rest,
    participantPreview,
    registered,
    status,
  };
}

function buildMockOfflineRaceHub(): OfflineRaceHubResponse {
  return {
    featuredEvent: decorateOfflineRaceEvent(mockOfflineRaceHubState.featuredEvent),
    upcomingEvents: mockOfflineRaceHubState.upcomingEvents.map((event) => decorateOfflineRaceEvent(event)),
    pastEvents: mockOfflineRaceHubState.pastEvents.map((event) => ({ ...event })),
    guideSteps: [...mockOfflineRaceHubState.guideSteps],
  };
}

function mutateMockOfflineRaceRegistration(
  eventId: string,
  action: 'join' | 'cancel',
): OfflineRaceEntryActionResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const eventGroups: Array<{ type: 'featured' | 'upcoming'; event: MockOfflineRaceEventState; index?: number }> = [
    { type: 'featured', event: mockOfflineRaceHubState.featuredEvent },
    ...mockOfflineRaceHubState.upcomingEvents.map((event, index) => ({ type: 'upcoming' as const, event, index })),
  ];
  const target = eventGroups.find((entry) => entry.event.id === eventId);

  if (!target) {
    throw new Error('참가할 레이스를 찾지 못했어.');
  }

  const event = target.event;
  const currentStatus = getOfflineRaceStatus(event);

  if (!['registration_open', 'registration_closing'].includes(currentStatus)) {
    throw new Error('지금은 신청 가능한 시간이 아니야.');
  }

  const isRegistered = event.registeredUserTags.includes(profile.publicTag);

  if (action === 'join') {
    if (isRegistered) {
      throw new Error('이미 신청한 레이스야.');
    }

    if (event.participantCount >= event.capacity) {
      throw new Error('정원이 가득 차서 지금은 대기만 받을 수 있어.');
    }

    event.registeredUserTags = [...event.registeredUserTags, profile.publicTag];
    event.participantCount += 1;
  }

  if (action === 'cancel') {
    if (!isRegistered) {
      throw new Error('아직 신청하지 않은 레이스야.');
    }

    event.registeredUserTags = event.registeredUserTags.filter((tag) => tag !== profile.publicTag);
    event.participantCount = Math.max(0, event.participantCount - 1);
  }

  if (target.type === 'featured') {
    mockOfflineRaceHubState = {
      ...mockOfflineRaceHubState,
      featuredEvent: event,
    };
  } else if (typeof target.index === 'number') {
    mockOfflineRaceHubState = {
      ...mockOfflineRaceHubState,
      upcomingEvents: mockOfflineRaceHubState.upcomingEvents.map((item, index) => (index === target.index ? event : item)),
    };
  }

  return {
    success: true,
    event: decorateOfflineRaceEvent(event),
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

function findRegionByName(node: RegionDrilldownNode, targetName: string): RegionDrilldownNode | null {
  if (node.name === targetName) {
    return node;
  }

  for (const child of node.children ?? []) {
    const matchedChild = findRegionByName(child, targetName);

    if (matchedChild) {
      return matchedChild;
    }
  }

  return null;
}

const mockRegionalRunnerNames = [
  '김관우', '박지훈', '최민준', '한예린', '정이안', '이서윤', '박도윤', '김서하', '윤지후', '장민재',
  '이도현', '오하린', '조유준', '강서아', '백시우', '문가온', '남지호', '전유나', '신민호', '임다온',
  '유시온', '배하준', '권채은', '서태윤', '노서준', '정하율', '차도현', '홍서진', '최연우', '김하민',
  '안채린', '오민재', '류예린', '송도윤', '이하율', '하서준', '주아린', '문지후', '고예준', '서가은',
];

function buildMockDistrictPersonalResponse(nodeId?: string): DistrictPersonalResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const friendNameSet = new Set(friendRanks.map((friend) => friend.name));
  const targetNode = nodeId
    ? findRegionPath(regionDrilldownTree, nodeId)?.at(-1) ?? findRegionByName(regionDrilldownTree, profile.districtName) ?? regionDrilldownTree
    : findRegionByName(regionDrilldownTree, profile.districtName) ?? regionDrilldownTree;
  const isMyRegion = targetNode.name === profile.districtName;
  const listSize = Math.min(Math.max(Math.round(targetNode.participants / 5), 18), 48);
  const myRankPosition = isMyRegion ? Math.min(Math.max(Math.round(listSize * 0.58), 6), listSize - 3) : -1;
  const topDistance = Math.max(targetNode.averageDistanceKm + 14, weeklySummary.totalDistanceKm + 8);
  const ranks: DistrictPersonalRank[] = [];
  let runnerCursor = 0;

  for (let index = 0; index < listSize; index += 1) {
    const rank = index + 1;

    if (index === myRankPosition) {
      ranks.push({
        id: `region-me-${targetNode.id}`,
        rank,
        name: profile.name,
        distanceKm: Number(weeklySummary.totalDistanceKm.toFixed(1)),
        points: weeklySummary.districtPoints,
        isMe: true,
        isFriend: friendNameSet.has(profile.name),
      });
      continue;
    }

    const baseName = mockRegionalRunnerNames[runnerCursor % mockRegionalRunnerNames.length];
    runnerCursor += 1;
    const distanceKm = Number(Math.max(3.2, topDistance - index * 1.15 - (index % 3) * 0.25).toFixed(1));
    const points = Math.max(12, Math.round(distanceKm * 2.15 + (listSize - index) * 0.6));

    ranks.push({
      id: `${targetNode.id}-runner-${rank}`,
      rank,
      name: `${baseName}${runnerCursor > mockRegionalRunnerNames.length ? ` ${Math.ceil(runnerCursor / mockRegionalRunnerNames.length)}` : ''}`,
      distanceKm,
      points,
      isFriend: friendNameSet.has(baseName),
    });
  }

  const myRank = ranks.find((runner) => runner.isMe) ?? null;
  const myRankIndex = myRank ? ranks.findIndex((runner) => runner.id === myRank.id) : -1;
  const focusStart = Math.max(0, myRankIndex - 1);
  const focusRanks = myRankIndex >= 0 ? ranks.slice(focusStart, focusStart + 4) : ranks.slice(0, 4);

  return {
    districtName: targetNode.name,
    myRank,
    myPoints: myRank?.points ?? 0,
    weeklyDistanceKm: myRank?.distanceKm ?? 0,
    focusRanks,
    ranks,
  };
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

export async function fetchActiveNotices(): Promise<ActiveNoticesResponse> {
  if (USE_MOCK_API) {
    return {
      items: [],
    };
  }

  return apiGet<ActiveNoticesResponse>('/notices/active', {
    fallbackMessage: '공지 정보를 불러오지 못했어.',
  });
}

export async function fetchRegionCatalog(): Promise<RegionCatalogResponse> {
  if (USE_MOCK_API) {
    return {
      regions: addressCatalog,
    };
  }

  return apiGet<RegionCatalogResponse>('/catalog/regions', {
    fallbackMessage: '지역 목록을 불러오지 못했어.',
  });
}

export async function fetchUniversityCatalog(): Promise<UniversityCatalogResponse> {
  if (USE_MOCK_API) {
    return {
      universities: [...new Set(universityLeagueRanks.map((entry) => entry.universityName))],
    };
  }

  return apiGet<UniversityCatalogResponse>('/catalog/universities', {
    fallbackMessage: '대학 목록을 불러오지 못했어.',
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

export async function fetchOfflineRaceHub(): Promise<OfflineRaceHubResponse> {
  if (USE_MOCK_API) {
    return buildMockOfflineRaceHub();
  }

  return apiGet<OfflineRaceHubResponse>('/offline-races/hub', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '오프라인 마라톤 정보를 불러오지 못했어.',
  });
}

export async function joinOfflineRace(eventId: string): Promise<OfflineRaceEntryActionResponse> {
  if (USE_MOCK_API) {
    return mutateMockOfflineRaceRegistration(eventId, 'join');
  }

  return apiPost<OfflineRaceEntryActionResponse>(
    `/offline-races/${eventId}/join`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '레이스 신청에 실패했어.',
    },
  );
}

export async function cancelOfflineRace(eventId: string): Promise<OfflineRaceEntryActionResponse> {
  if (USE_MOCK_API) {
    return mutateMockOfflineRaceRegistration(eventId, 'cancel');
  }

  return apiPost<OfflineRaceEntryActionResponse>(
    `/offline-races/${eventId}/cancel`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '레이스 신청 취소에 실패했어.',
    },
  );
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

export async function createManualRun(input: CreateManualRunInput): Promise<CreateManualRunResponse> {
  if (USE_MOCK_API) {
    const distanceKm = Number(input.distanceKm.toFixed(1));

    return {
      run: {
        id: `mock-run-${Date.now()}`,
        date: input.date,
        distanceKm,
        pace: input.pace,
        source: 'Manual',
      },
      weeklyDistanceKm: distanceKm,
      estimatedMinutes: Math.round(distanceKm * 5.5),
      earnedPoint: distanceKm >= 0.1 ? 10 : 0,
    };
  }

  const createdRun = await apiPost<CreateManualRunResponse>(
    '/runs/manual',
    {
      date: input.date,
      distanceKm: input.distanceKm,
      pace: input.pace,
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '수동 러닝 기록 저장에 실패했어.',
    },
  );

  await fetchMyProfile();
  return createdRun;
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

export async function fetchDistrictPersonal(nodeId?: string): Promise<DistrictPersonalResponse> {
  if (USE_MOCK_API) {
    return buildMockDistrictPersonalResponse(nodeId);
  }

  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';

  return apiGet<DistrictPersonalResponse>(`/league/district-personal${query}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '구 내 개인 경쟁 정보를 불러오지 못했어.',
  });
}

export async function fetchRegionLeague(nodeId?: string): Promise<RegionLeagueResponse> {
  if (USE_MOCK_API) {
    const path = nodeId ? (findRegionPath(regionDrilldownTree, nodeId) ?? [regionDrilldownTree]) : [regionDrilldownTree];
    const rawCurrentNode = path[path.length - 1];
    const parentNode = path[path.length - 2] ?? null;
    const normalizedSiblings = parentNode ? normalizeRegionChildren(parentNode.children ?? []) : [rawCurrentNode];
    const currentNode = normalizedSiblings.find((child) => child.id === rawCurrentNode.id) ?? rawCurrentNode;
    const children = normalizeRegionChildren(currentNode.children ?? []);

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
          averageDistanceKm: Number(weeklySummary.totalDistanceKm.toFixed(1)),
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
      scannedRuns: connectedCount * 3,
      importedRuns: connectedCount * 3,
      duplicateRuns: 0,
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

export async function queueIntegrationImports(
  sourceType: Exclude<RunSourceType, 'manual'>,
  runs: Array<{
    externalId?: string;
    sourceLabel?: string;
    date: string;
    distanceKm: number;
    pace: string;
  }>,
): Promise<QueueIntegrationImportResponse> {
  if (USE_MOCK_API) {
    const source = mockConnectedSources.find((entry) => entry.sourceType === sourceType);

    if (!source) {
      throw new Error('가져오기 대상 소스를 찾지 못했어.');
    }

    return {
      success: true,
      source: {
        ...source,
        pendingImportCount: (source.pendingImportCount ?? 0) + runs.length,
      },
      queuedRuns: runs.length,
      pendingRuns: (source.pendingImportCount ?? 0) + runs.length,
    };
  }

  return apiPost<QueueIntegrationImportResponse>(
    `/integrations/sources/${sourceType}/import`,
    {
      runs: runs.map((run) => ({
        ...(run.externalId ? { externalId: run.externalId.trim() } : {}),
        ...(run.sourceLabel ? { sourceLabel: run.sourceLabel.trim() } : {}),
        date: run.date.trim(),
        distanceKm: Number(run.distanceKm.toFixed(1)),
        pace: run.pace.trim(),
      })),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '연동 기록 가져오기 요청에 실패했어.',
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

  const profile = await apiGet<MyProfileResponse>('/me/profile', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '내 프로필을 불러오지 못했어.',
  });

  await setCurrentUserProfile(profile);
  return profile;
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
      provinceName: input.provinceName.trim() || currentProfile.provinceName,
      cityName: input.cityName?.trim() || undefined,
      districtName: input.districtName.trim() || currentProfile.districtName,
    };

    await setCurrentUserProfile(nextProfile);
    return nextProfile;
  }

  const nextProfile = await apiPatch<UpdateMyRegionResponse>(
    '/me/region',
    {
      provinceName: input.provinceName.trim(),
      cityName: input.cityName?.trim() ?? '',
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
