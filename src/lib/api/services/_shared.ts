import {
  districtPersonalRanks,
  friendRanks,
  friendRunRecords,
  myProfile,
  myRunRecords,
  regionDrilldownTree,
  universityLeagueRanks,
  weeklySummary,
} from '@/data/mock';
import { addressCatalog } from '@/features/location/addressCatalog';
import { DistrictPersonalRank, MarketOverview, MarketRewardItem, OfflineRaceEvent, OfflineRaceStatus, RegionDrilldownNode, RunMatchResult, RunSourceType, UniversityLeagueRank } from '@/domain/types';
import { getAccessToken, getCurrentUserProfile, setCurrentUserProfile } from '@/lib/session';
import { apiGet, apiPatch, apiPost } from '../client';
import { USE_MOCK_API } from '../config';
import {
  mockApiState,
  mockMarketCatalog,
  type MockOfflineRaceEventState,
  type MockOfflineRaceHubState,
} from './mock/state';
import {
  buildLevelLabel,
  formatDuelSlotLabel,
} from './mock/matches';
import {
  ActiveNoticesResponse,
  CreateManualRunInput,
  CreateManualRunResponse,
  CreateRunningRoutePreviewInput,
  CreateRunningRoutePreviewResponse,
  CreateTrackedRunInput,
  CreateTrackedRunResponse,
  UpdateRunningLiveShareInput,
  UpdateRunningLiveShareResponse,
  AcceptRunningMatchInput,
  AcknowledgeRunningMatchRoomCountdownInput,
  CancelRunningMatchInput,
  CancelRunningMatchResponse,
  CreateRunningMatchRoomInput,
  CreateFriendRequestResponse,
  DistrictPersonalResponse,
  FetchRunningMatchStatusInput,
  FriendActivityResponse,
  FriendLeaderboardResponse,
  FriendRequestActionResponse,
  FetchMatchDemandSummaryInput,
  JoinRunningMatchRoomInput,
  LeaveRunningMatchInput,
  LeaveRunningMatchResponse,
  LeaveRunningMatchRoomInput,
  HomeSummaryResponse,
  QueueIntegrationImportResponse,
  MatchDemandSummaryResponse,
  RequestDuelMatchInput,
  RequestDuelMatchResponse,
  RequestGroupMatchInput,
  RequestGroupMatchResponse,
  RunningMatchRoom,
  RunningMatchRoomInvitee,
  RunningMatchRoomParticipant,
  RunningMatchRoomResponse,
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
  RunningMatchStatusResponse,
  RunDetailResponse,
  StartRunningMatchRoomInput,
  UpdateRunningMatchProgressInput,
  UpdateRunningMatchProgressResponse,
  UpdateNotificationSettingsInput,
  UpdateNotificationSettingsResponse,
  UpdateMyRegionInput,
  UpdateMyRegionResponse,
  UpdateMyProfileInput,
  UpdateMyProfileResponse,
  UniversityCatalogResponse,
  UniversityLeagueResponse,
  UpcomingRunningMatchesResponse,
  UpdateRunningMatchRoomReadyInput,
  UpdateRunningMatchRoomInput,
} from '../types';

export { mockApiState, mockMarketCatalog };
export type { MockOfflineRaceEventState, MockOfflineRaceHubState };
export * from './mock/matches';

export function isExclusiveIntegrationSourceType(sourceType: RunSourceType) {
  return sourceType !== 'manual' && sourceType !== 'runningground';
}

export function buildMockMarketOverview(): MarketOverview {
  const items: MarketRewardItem[] = mockMarketCatalog.map((item) => ({
    ...item,
    claimState: mockApiState.claimedMarketItemIds.has(item.id)
      ? 'claimed'
      : mockApiState.marketPoints >= item.costPoints
        ? 'claimable'
        : 'locked',
  }));

  return {
    currentPoints: mockApiState.marketPoints,
    totalRedeemedCount: mockApiState.claimedMarketItemIds.size,
    items,
  };
}

export function normalizeMockFriendRanks(ranks: typeof mockApiState.friendRanks) {
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

export function createMockFriendRank(input: { id: string; name: string; tag: string }) {
  const nextIndex = mockApiState.friendRanks.length + 1;
  const distanceKm = Number((62 + nextIndex * 4.3).toFixed(1));

  return {
    id: input.id,
    name: input.name,
    tag: input.tag,
    distanceKm,
    points: Math.round(distanceKm * 1.15),
    rank: nextIndex,
    isRunningNow: false,
    liveLocationLabel: undefined,
  };
}

export function upsertMockCurrentUserRank() {
  const profile = getCurrentUserProfile() ?? myProfile;
  const existingRank = mockApiState.friendRanks.find((entry) => entry.tag === profile.publicTag);

  if (existingRank) {
    existingRank.name = profile.name;
    existingRank.tag = profile.publicTag;
    return existingRank;
  }

  const nextRank = createMockFriendRank({
    id: `me-${Date.now()}`,
    name: profile.name,
    tag: profile.publicTag,
  });

  mockApiState.friendRanks = normalizeMockFriendRanks([...mockApiState.friendRanks, nextRank]);
  return mockApiState.friendRanks.find((entry) => entry.tag === profile.publicTag) ?? nextRank;
}

export function normalizeMockUniversityRanks(ranks: UniversityLeagueRank[]) {
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

export function normalizeRegionChildren(children: RegionDrilldownNode[]) {
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

export function getOfflineRaceStatus(event: Pick<OfflineRaceEvent, 'startsAt' | 'registrationClosesAt'>, now = new Date()): OfflineRaceStatus {
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

export function buildMyOfflineRacePreview() {
  const profile = getCurrentUserProfile() ?? myProfile;

  return {
    id: 'offline-race-me',
    name: profile.name,
    paceGoal: '5:30/km',
    regionLabel: profile.districtName,
  };
}

export function decorateOfflineRaceEvent(event: MockOfflineRaceEventState): OfflineRaceEvent {
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

export function buildMockOfflineRaceHub(): OfflineRaceHubResponse {
  return {
    featuredEvent: decorateOfflineRaceEvent(mockApiState.offlineRaceHubState.featuredEvent),
    upcomingEvents: mockApiState.offlineRaceHubState.upcomingEvents.map((event) => decorateOfflineRaceEvent(event)),
    pastEvents: mockApiState.offlineRaceHubState.pastEvents.map((event) => ({ ...event })),
    guideSteps: [...mockApiState.offlineRaceHubState.guideSteps],
  };
}

export function mutateMockOfflineRaceRegistration(
  eventId: string,
  action: 'join' | 'cancel',
): OfflineRaceEntryActionResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const eventGroups: Array<{ type: 'featured' | 'upcoming'; event: MockOfflineRaceEventState; index?: number }> = [
    { type: 'featured', event: mockApiState.offlineRaceHubState.featuredEvent },
    ...mockApiState.offlineRaceHubState.upcomingEvents.map((event, index) => ({ type: 'upcoming' as const, event, index })),
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
    mockApiState.offlineRaceHubState = {
      ...mockApiState.offlineRaceHubState,
      featuredEvent: event,
    };
  } else if (typeof target.index === 'number') {
    mockApiState.offlineRaceHubState = {
      ...mockApiState.offlineRaceHubState,
      upcomingEvents: mockApiState.offlineRaceHubState.upcomingEvents.map((item, index) => (index === target.index ? event : item)),
    };
  }

  return {
    success: true,
    event: decorateOfflineRaceEvent(event),
  };
}

export async function requireAccessToken() {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('로그인이 필요해.');
  }

  return accessToken;
}

export function findRegionPath(node: RegionDrilldownNode, targetId: string): RegionDrilldownNode[] | null {
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

export function findRegionByName(node: RegionDrilldownNode, targetName: string): RegionDrilldownNode | null {
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

export const mockRegionalRunnerNames = [
  '김관우', '박지훈', '최민준', '한예린', '정이안', '이서윤', '박도윤', '김서하', '윤지후', '장민재',
  '이도현', '오하린', '조유준', '강서아', '백시우', '문가온', '남지호', '전유나', '신민호', '임다온',
  '유시온', '배하준', '권채은', '서태윤', '노서준', '정하율', '차도현', '홍서진', '최연우', '김하민',
  '안채린', '오민재', '류예린', '송도윤', '이하율', '하서준', '주아린', '문지후', '고예준', '서가은',
];

export function buildMockDistrictPersonalResponse(nodeId?: string): DistrictPersonalResponse {
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

export * from './mock/rooms';
