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
import { DistrictPersonalRank, MarketOverview, MarketRewardItem, OfflineRaceEvent, OfflineRaceHub, OfflineRaceStatus, RegionDrilldownNode, RunMatchResult, RunSourceType, UniversityLeagueRank } from '@/domain/types';
import { getAccessToken, getCurrentUserProfile, setCurrentUserProfile } from '@/lib/session';
import { apiGet, apiPatch, apiPost } from './client';
import { USE_MOCK_API } from './config';
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
  CancelRunningMatchInput,
  CancelRunningMatchResponse,
  CreateFriendRequestResponse,
  DistrictPersonalResponse,
  FetchRunningMatchStatusInput,
  FriendActivityResponse,
  FriendLeaderboardResponse,
  FriendRequestActionResponse,
  FetchMatchDemandSummaryInput,
  LeaveRunningMatchInput,
  LeaveRunningMatchResponse,
  HomeSummaryResponse,
  QueueIntegrationImportResponse,
  MatchDemandSummaryResponse,
  RequestDuelMatchInput,
  RequestDuelMatchResponse,
  RequestGroupMatchInput,
  RequestGroupMatchResponse,
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
type MockMatchLiveStatus = 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';

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

const mockDuelMatchPool = [
  {
    id: 'duel-runner-1',
    name: '박지훈',
    tag: '#PJ82Q',
    districtName: '송파구',
    averagePace: '05:18/km',
    weeklyDistanceKm: 31.2,
    lifetimeDistanceKm: 182.4,
  },
  {
    id: 'duel-runner-2',
    name: '한예린',
    tag: '#HY55R',
    districtName: '마포구',
    averagePace: '05:34/km',
    weeklyDistanceKm: 24.6,
    lifetimeDistanceKm: 149.1,
  },
  {
    id: 'duel-runner-3',
    name: '정이안',
    tag: '#JI20M',
    districtName: '성동구',
    averagePace: '05:49/km',
    weeklyDistanceKm: 19.8,
    lifetimeDistanceKm: 98.7,
  },
  {
    id: 'duel-runner-4',
    name: '윤서준',
    tag: '#YS44K',
    districtName: '강서구',
    averagePace: '06:08/km',
    weeklyDistanceKm: 16.2,
    lifetimeDistanceKm: 74.3,
  },
];
const RECOMMENDED_MATCH_DISTANCES = [3, 5, 7, 10, 15, 21.1, 42.2];
const DUEL_MIN_COMPATIBILITY_SCORE = 72;
const GROUP_MIN_COMPATIBILITY_SCORE = 68;
const GROUP_MIN_PARTICIPANTS = 5;
const MATCH_BOOKING_CUTOFF_MS = 30 * 60 * 1000;
const MATCH_CANCELLATION_CUTOFF_MS = 60 * 60 * 1000;
const MATCH_RUNNING_STALE_MS = 90 * 1000;
const MATCH_BACKGROUND_STALE_MS = 20 * 60 * 1000;

let mockRunningMatchSessions: Record<'duel' | 'group', RunningMatchStatusResponse | null> = {
  duel: null,
  group: null,
};

function formatMockTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function parsePaceLabelToSeconds(pace: string) {
  const matched = String(pace).trim().match(/^(\d{1,2}):(\d{2})\/km$/i);

  if (!matched) {
    return 5 * 60 + 30;
  }

  return Number(matched[1]) * 60 + Number(matched[2]);
}

function getMockMatchBonusPoints(matchResult?: RunMatchResult | null) {
  if (!matchResult) {
    return 0;
  }

  if (matchResult.mode === 'duel') {
    if (matchResult.resultTone === 'win') {
      return 12;
    }

    if (matchResult.resultTone === 'draw') {
      return 6;
    }

    if (matchResult.resultTone === 'lose') {
      return 3;
    }

    return 0;
  }

  const participantCount = typeof matchResult.participantCount === 'number' ? matchResult.participantCount : 0;
  const rank = typeof matchResult.rank === 'number' ? matchResult.rank : 0;

  if (participantCount < 2 || rank < 1) {
    return 0;
  }

  if (rank === 1) {
    return 15;
  }

  if (rank <= 3) {
    return 10;
  }

  if (rank <= 10) {
    return 6;
  }

  return 4;
}

function buildMockPointBreakdown(basePoints: number, matchResult?: RunMatchResult | null) {
  const normalizedBasePoints = Math.max(0, Math.round(basePoints));
  const matchBonusPoints = getMockMatchBonusPoints(matchResult);

  return {
    levelPoints: normalizedBasePoints,
    streakPoints: 0,
    growthPoints: 0,
    matchBonusPoints,
    totalPoints: normalizedBasePoints + matchBonusPoints,
  };
}

function formatSecondsPerKm(seconds: number) {
  const normalizedSeconds = Math.max(0, Math.round(seconds));
  const minutesPart = Math.floor(normalizedSeconds / 60);
  const secondsPart = String(normalizedSeconds % 60).padStart(2, '0');
  return `${minutesPart}:${secondsPart}/km`;
}

function formatDuelSlotLabel(slotStartAt: string) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '시간대 미정';
  }

  const startHours = String(slotStart.getHours()).padStart(2, '0');
  const startMinutes = String(slotStart.getMinutes()).padStart(2, '0');
  return `${startHours}:${startMinutes}`;
}

function formatMockMatchSlotDateLabel(slotStartAt: string) {
  const slotStart = new Date(slotStartAt);

  if (Number.isNaN(slotStart.getTime())) {
    return '날짜 미정';
  }

  return slotStart.toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
}

function getMockMatchBookingClosesAt(slotStartAt: string) {
  const slotStartAtMs = new Date(slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return null;
  }

  return new Date(slotStartAtMs - MATCH_BOOKING_CUTOFF_MS).toISOString();
}

function getMockMatchCancelableUntilAt(slotStartAt: string) {
  const slotStartAtMs = new Date(slotStartAt).getTime();

  if (!Number.isFinite(slotStartAtMs)) {
    return null;
  }

  return new Date(slotStartAtMs - MATCH_CANCELLATION_CUTOFF_MS).toISOString();
}

function buildPaceBandLabel(baseSecondsPerKm: number) {
  return `${formatSecondsPerKm(baseSecondsPerKm - 15)} ~ ${formatSecondsPerKm(baseSecondsPerKm + 15)}`;
}

function buildLevelLabel(lifetimeDistanceKm: number) {
  return `Lv.${Math.floor(Math.max(lifetimeDistanceKm, 0) / 10)}`;
}

function calculateMockCompatibilityScore(
  currentPaceSeconds: number,
  currentLifetimeDistanceKm: number,
  currentWeeklyDistanceKm: number,
  candidate: (typeof mockDuelMatchPool)[number],
  distanceKm: number,
  mode: 'duel' | 'group',
) {
  const currentLevel = Math.floor(Math.max(currentLifetimeDistanceKm, 0) / 10);
  const candidateLevel = Math.floor(Math.max(candidate.lifetimeDistanceKm, 0) / 10);
  const paceGapSeconds = Math.abs(parsePaceLabelToSeconds(candidate.averagePace) - currentPaceSeconds);
  const levelGap = Math.abs(candidateLevel - currentLevel);
  const distanceGap = Math.abs(candidate.weeklyDistanceKm / 3 - distanceKm);
  const weeklyGap = Math.abs(candidate.weeklyDistanceKm - currentWeeklyDistanceKm);
  const penalty = paceGapSeconds * (mode === 'duel' ? 0.22 : 0.16)
    + levelGap * (mode === 'duel' ? 8 : 6.5)
    + distanceGap * (mode === 'duel' ? 2.8 : 2.2)
    + weeklyGap * (mode === 'duel' ? 0.8 : 0.55);

  return Math.max(0, Math.min(100, Number((100 - penalty).toFixed(1))));
}

function isRecommendedMatchDistance(distanceKm: number) {
  return RECOMMENDED_MATCH_DISTANCES.some((recommendedDistanceKm) => Math.abs(recommendedDistanceKm - distanceKm) < 0.15);
}

function findNearestRecommendedDistance(distanceKm: number) {
  return RECOMMENDED_MATCH_DISTANCES.reduce((closestDistanceKm, candidateDistanceKm) => (
    Math.abs(candidateDistanceKm - distanceKm) < Math.abs(closestDistanceKm - distanceKm)
      ? candidateDistanceKm
      : closestDistanceKm
  ));
}

function buildDistanceRecommendationHint(distanceKm: number) {
  if (isRecommendedMatchDistance(distanceKm)) {
    return '';
  }

  return `추천 거리 ${findNearestRecommendedDistance(distanceKm)}km로 바꾸면 더 빨리 비슷한 러너가 모일 수 있어요.`;
}

function estimateMockCurrentPaceSeconds() {
  const paceValues = myRunRecords
    .map((run) => parsePaceLabelToSeconds(run.pace))
    .filter((value) => Number.isFinite(value));

  if (!paceValues.length) {
    return 5 * 60 + 30;
  }

  return Math.round(paceValues.reduce((sum, value) => sum + value, 0) / paceValues.length);
}

function buildMockDuelMatchResponse(input: RequestDuelMatchInput): RequestDuelMatchResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentPaceSeconds = estimateMockCurrentPaceSeconds();
  const currentLifetimeDistanceKm = profile.lifetimeDistanceKm ?? weeklySummary.totalDistanceKm;
  const currentWeeklyDistanceKm = weeklySummary.totalDistanceKm;
  const distanceRecommendationHint = buildDistanceRecommendationHint(input.distanceKm);

  const bestCandidate = [...mockDuelMatchPool]
    .map((candidate) => ({
      candidate,
      score: calculateMockCompatibilityScore(
        currentPaceSeconds,
        currentLifetimeDistanceKm,
        currentWeeklyDistanceKm,
        candidate,
        input.distanceKm,
        'duel',
      ),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (input.testMode) {
    const testOpponent = bestCandidate?.candidate ?? mockDuelMatchPool[0];
    const testOpponentLevelLabel = buildLevelLabel(testOpponent.lifetimeDistanceKm);

    return {
      success: true,
      matched: true,
      isTestMatch: true,
      requestId: `mock-duel-test-${Date.now()}`,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      slotLabel: formatDuelSlotLabel(input.slotStartAt),
      paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
      levelBandLabel: `${buildLevelLabel(currentLifetimeDistanceKm)} 전후`,
      criteriaSummary: '테스트용 1대1 매칭을 바로 만들었어요.',
      estimatedWaitMinutes: 0,
      opponent: {
        ...testOpponent,
        name: `테스트 ${testOpponent.name}`,
        levelLabel: testOpponentLevelLabel,
        compatibilitySummary: `${testOpponent.averagePace} 페이스 · ${testOpponentLevelLabel} · 테스트 상대`,
      },
    };
  }

  if (!bestCandidate || bestCandidate.score < DUEL_MIN_COMPATIBILITY_SCORE) {
    return {
      success: true,
      matched: false,
      requestId: `mock-duel-${Date.now()}`,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      slotLabel: formatDuelSlotLabel(input.slotStartAt),
      paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
      levelBandLabel: `${buildLevelLabel(currentLifetimeDistanceKm)} 전후`,
      criteriaSummary: `지금 이 시간대에는 사람이 있어도 페이스나 레벨 차이가 커서 바로 붙이지 않았어요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
    };
  }

  const opponent = bestCandidate.candidate;
  const opponentLevelLabel = buildLevelLabel(opponent.lifetimeDistanceKm);

  return {
    success: true,
    matched: true,
    requestId: `mock-duel-${Date.now()}`,
    distanceKm: Number(input.distanceKm.toFixed(1)),
    slotStartAt: input.slotStartAt,
    slotLabel: formatDuelSlotLabel(input.slotStartAt),
    paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
    levelBandLabel: `${buildLevelLabel(currentLifetimeDistanceKm)} 전후`,
    criteriaSummary: '최근 평균 페이스와 누적 거리 레벨이 비슷한 러너를 먼저 붙였어요.',
    estimatedWaitMinutes: 0,
    opponent: {
      ...opponent,
      levelLabel: opponentLevelLabel,
      compatibilitySummary: `${opponent.averagePace} 페이스 · ${opponentLevelLabel} · ${opponent.weeklyDistanceKm.toFixed(1)}km/주 · 적합도 ${bestCandidate.score.toFixed(0)}점`,
    },
  };
}

function buildMockGroupMatchResponse(input: RequestGroupMatchInput): RequestGroupMatchResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentPaceSeconds = estimateMockCurrentPaceSeconds();
  const currentLifetimeDistanceKm = profile.lifetimeDistanceKm ?? weeklySummary.totalDistanceKm;
  const currentWeeklyDistanceKm = weeklySummary.totalDistanceKm;
  const currentLevelLabel = buildLevelLabel(currentLifetimeDistanceKm);
  const currentParticipantId = profile.publicTag || 'current-runner';
  const maxGroupSize = 30;
  const distanceRecommendationHint = buildDistanceRecommendationHint(input.distanceKm);
  const selectedCandidates = [...mockDuelMatchPool]
    .map((candidate) => ({
      candidate,
      score: calculateMockCompatibilityScore(
        currentPaceSeconds,
        currentLifetimeDistanceKm,
        currentWeeklyDistanceKm,
        candidate,
        input.distanceKm,
        'group',
      ),
    }))
    .filter((entry) => entry.score >= GROUP_MIN_COMPATIBILITY_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxGroupSize - 1)
    .map((entry) => entry.candidate);

  if (input.testMode) {
    const testParticipants = [
      {
        id: currentParticipantId,
        name: profile.name,
        tag: profile.publicTag,
        districtName: profile.districtName,
        averagePace: formatSecondsPerKm(currentPaceSeconds),
        levelLabel: currentLevelLabel,
        weeklyDistanceKm: weeklySummary.totalDistanceKm,
        lifetimeDistanceKm: currentLifetimeDistanceKm,
        seedRank: 0,
        seedSummary: '',
      },
      ...Array.from({ length: 5 }, (_, index) => {
        const baseCandidate = selectedCandidates[index % Math.max(selectedCandidates.length, 1)] ?? mockDuelMatchPool[index % mockDuelMatchPool.length];
        return {
          ...baseCandidate,
          id: `group-test-${index + 1}`,
          name: `테스트 러너 ${index + 1}`,
          levelLabel: buildLevelLabel(baseCandidate.lifetimeDistanceKm),
          seedRank: 0,
          seedSummary: '',
        };
      }),
    ]
      .sort((left, right) => parsePaceLabelToSeconds(left.averagePace) - parsePaceLabelToSeconds(right.averagePace))
      .map((participant, index) => ({
        ...participant,
        seedRank: index + 1,
        seedSummary: `${index + 1}번 시드 · ${participant.averagePace}`,
      }));
    const mySeedRank = testParticipants.find((participant) => participant.id === currentParticipantId)?.seedRank ?? 1;

    return {
      success: true,
      matched: true,
      isTestMatch: true,
      requestId: `mock-group-test-${Date.now()}`,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      slotLabel: formatDuelSlotLabel(input.slotStartAt),
      paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
      levelBandLabel: `${currentLevelLabel} 전후`,
      criteriaSummary: '테스트용 6인 그룹 매칭을 바로 만들었어요.',
      estimatedWaitMinutes: 0,
      maxGroupSize,
      participantsCount: testParticipants.length,
      mySeedRank,
      participants: testParticipants,
    };
  }

  if (!selectedCandidates.length) {
    return {
      success: true,
      matched: false,
      requestId: `group-request-${Date.now()}`,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      slotLabel: formatDuelSlotLabel(input.slotStartAt),
      paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
      levelBandLabel: `${currentLevelLabel} 전후`,
      criteriaSummary: `아직 같은 시간대 그룹에 모인 비슷한 러너가 적어요. 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 15,
      maxGroupSize,
      participantsCount: 1,
      mySeedRank: 1,
      participants: [
        {
          id: currentParticipantId,
          name: profile.name,
          tag: profile.publicTag,
          districtName: profile.districtName,
          averagePace: formatSecondsPerKm(currentPaceSeconds),
          levelLabel: currentLevelLabel,
          weeklyDistanceKm: weeklySummary.totalDistanceKm,
          lifetimeDistanceKm: currentLifetimeDistanceKm,
          seedRank: 1,
          seedSummary: '첫 대기 러너',
        },
      ],
    };
  }

  const participants = [
    {
      id: currentParticipantId,
      name: profile.name,
      tag: profile.publicTag,
      districtName: profile.districtName,
      averagePace: formatSecondsPerKm(currentPaceSeconds),
      levelLabel: currentLevelLabel,
      weeklyDistanceKm: weeklySummary.totalDistanceKm,
      lifetimeDistanceKm: currentLifetimeDistanceKm,
      seedRank: 0,
      seedSummary: '',
    },
    ...selectedCandidates.map((candidate) => ({
      ...candidate,
      levelLabel: buildLevelLabel(candidate.lifetimeDistanceKm),
      seedRank: 0,
      seedSummary: '',
    })),
  ]
    .sort((left, right) => {
      const leftScore = parsePaceLabelToSeconds(left.averagePace) * 0.65 + left.weeklyDistanceKm * -1.9 + left.lifetimeDistanceKm * -0.08;
      const rightScore = parsePaceLabelToSeconds(right.averagePace) * 0.65 + right.weeklyDistanceKm * -1.9 + right.lifetimeDistanceKm * -0.08;
      return leftScore - rightScore;
    })
    .map((participant, index) => ({
      ...participant,
      seedRank: index + 1,
      seedSummary: `${index + 1}번 시드 · ${participant.averagePace}`,
    }));

  const mySeedRank = participants.find((participant) => participant.id === currentParticipantId)?.seedRank ?? 1;

  if (participants.length < GROUP_MIN_PARTICIPANTS) {
    return {
      success: true,
      matched: false,
      requestId: `group-request-${Date.now()}`,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      slotLabel: formatDuelSlotLabel(input.slotStartAt),
      paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
      levelBandLabel: `${currentLevelLabel} 전후`,
      criteriaSummary: `현재 비슷한 러너는 ${participants.length}/${maxGroupSize}명이라 아직 그룹을 열지 않았어요. 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 재미있는 경쟁이 됩니다.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
      estimatedWaitMinutes: 10,
      maxGroupSize,
      participantsCount: participants.length,
      mySeedRank,
      participants,
    };
  }

  return {
    success: true,
    matched: true,
    requestId: `group-request-${Date.now()}`,
    distanceKm: Number(input.distanceKm.toFixed(1)),
    slotStartAt: input.slotStartAt,
    slotLabel: formatDuelSlotLabel(input.slotStartAt),
    paceBandLabel: buildPaceBandLabel(currentPaceSeconds),
    levelBandLabel: `${currentLevelLabel} 전후`,
    criteriaSummary: '비슷한 페이스와 누적 거리 레벨 러너를 먼저 모아 그룹 대결을 만들었어요.',
    estimatedWaitMinutes: 0,
    maxGroupSize,
    participantsCount: participants.length,
    mySeedRank,
    participants,
  };
}

function buildMockMatchDemandSummary(input: FetchMatchDemandSummaryInput): MatchDemandSummaryResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentPaceSeconds = estimateMockCurrentPaceSeconds();
  const currentLifetimeDistanceKm = profile.lifetimeDistanceKm ?? weeklySummary.totalDistanceKm;
  const currentWeeklyDistanceKm = weeklySummary.totalDistanceKm;
  const capacity = input.mode === 'duel' ? 2 : 30;
  const compatibleThreshold = input.mode === 'duel' ? DUEL_MIN_COMPATIBILITY_SCORE : GROUP_MIN_COMPATIBILITY_SCORE;
  const matchingCandidates = [...mockDuelMatchPool]
    .map((candidate) => ({
      candidate,
      score: calculateMockCompatibilityScore(
        currentPaceSeconds,
        currentLifetimeDistanceKm,
        currentWeeklyDistanceKm,
        candidate,
        input.distanceKm,
        input.mode,
      ),
    }))
    .filter((entry) => entry.score >= compatibleThreshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, input.mode === 'duel' ? 1 : Math.min(capacity - 1, mockDuelMatchPool.length))
    .map((entry) => entry.candidate);

  const paceSamples = [currentPaceSeconds, ...matchingCandidates.map((candidate) => parsePaceLabelToSeconds(candidate.averagePace))];
  const averagePaceSeconds = Math.round(paceSamples.reduce((sum, value) => sum + value, 0) / paceSamples.length);
  const participantsCount = Math.min(capacity, matchingCandidates.length + 1);
  const distanceRecommendationHint = buildDistanceRecommendationHint(input.distanceKm);

  return {
    success: true,
    mode: input.mode,
    distanceKm: Number(input.distanceKm.toFixed(1)),
    slotStartAt: input.slotStartAt,
    slotLabel: formatDuelSlotLabel(input.slotStartAt),
    averagePace: formatSecondsPerKm(averagePaceSeconds),
    participantsCount,
    competitiveParticipantsCount: participantsCount,
    capacity,
    fillRatioLabel: `${participantsCount}/${capacity}`,
    paceBandLabel: buildPaceBandLabel(averagePaceSeconds),
    summaryText: input.mode === 'duel'
      ? `현재 이 시간대에는 바로 붙일 만한 러너 ${participantsCount}/${capacity}명이 있고, 평균 페이스는 ${formatSecondsPerKm(averagePaceSeconds)}예요.${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`
      : `현재 이 시간대에는 비슷한 그룹 러너 ${participantsCount}/${capacity}명이 있고, 평균 페이스는 ${formatSecondsPerKm(averagePaceSeconds)}예요.${participantsCount < GROUP_MIN_PARTICIPANTS ? ` 최소 ${GROUP_MIN_PARTICIPANTS}명은 모여야 시작해요.` : ''}${distanceRecommendationHint ? ` ${distanceRecommendationHint}` : ''}`,
  };
}

function syncMockRunningMatchSession(mode: 'duel' | 'group') {
  const currentSession = mockRunningMatchSessions[mode];

  if (!currentSession) {
    return null;
  }

  const nextSession: RunningMatchStatusResponse = {
    ...currentSession,
    readyToStart: new Date(currentSession.slotStartAt).getTime() <= Date.now(),
  };
  mockRunningMatchSessions[mode] = nextSession;
  return hydrateMockRunningMatchSessionStatuses(nextSession);
}

function resolveMockParticipantLiveStatus(
  participant: { liveStatus?: string; liveUpdatedAt?: string; finishedAt?: string },
  now = Date.now(),
): MockMatchLiveStatus {
  if (participant.finishedAt) {
    return 'finished';
  }

  const storedStatus: MockMatchLiveStatus = participant.liveStatus === 'running'
    || participant.liveStatus === 'background'
    || participant.liveStatus === 'paused'
    || participant.liveStatus === 'disconnected'
    || participant.liveStatus === 'forfeited'
    || participant.liveStatus === 'finished'
    || participant.liveStatus === 'ready'
    ? participant.liveStatus
    : 'ready';
  if (!participant.liveUpdatedAt || storedStatus === 'ready' || storedStatus === 'forfeited') {
    return storedStatus;
  }

  const liveUpdatedAtMs = new Date(participant.liveUpdatedAt).getTime();
  if (!Number.isFinite(liveUpdatedAtMs)) {
    return storedStatus;
  }

  const ageMs = now - liveUpdatedAtMs;
  if (storedStatus === 'running' && ageMs > MATCH_RUNNING_STALE_MS) {
    return 'disconnected';
  }

  if ((storedStatus === 'background' || storedStatus === 'paused') && ageMs > MATCH_BACKGROUND_STALE_MS) {
    return 'disconnected';
  }

  return storedStatus;
}

function hydrateMockRunningMatchSessionStatuses(session: RunningMatchStatusResponse): RunningMatchStatusResponse {
  return {
    ...session,
    ...(session.opponent ? {
      opponent: {
        ...session.opponent,
        liveStatus: resolveMockParticipantLiveStatus(session.opponent),
      },
    } : {}),
    ...(session.participants ? {
      participants: session.participants.map((participant) => ({
        ...participant,
        liveStatus: resolveMockParticipantLiveStatus(participant),
      })),
    } : {}),
  };
}

function buildMockWaitingMatchStatus(input: FetchRunningMatchStatusInput): RunningMatchStatusResponse {
  const summary = buildMockMatchDemandSummary({
    mode: input.mode,
    distanceKm: input.distanceKm,
    slotStartAt: input.slotStartAt,
  });
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentLifetimeDistanceKm = profile.lifetimeDistanceKm ?? weeklySummary.totalDistanceKm;
  const groupPreview = input.mode === 'group'
    ? buildMockGroupMatchResponse({
        distanceKm: input.distanceKm,
        slotStartAt: input.slotStartAt,
      })
    : null;
  const expiresAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  const bookingClosesAt = getMockMatchBookingClosesAt(input.slotStartAt) ?? expiresAt;

  return {
    success: true,
    mode: input.mode,
    state: 'waiting',
    distanceKm: summary.distanceKm,
    slotStartAt: summary.slotStartAt,
    slotLabel: summary.slotLabel,
    paceBandLabel: summary.paceBandLabel,
    levelBandLabel: `${buildLevelLabel(currentLifetimeDistanceKm)} 전후`,
    criteriaSummary: summary.summaryText,
    estimatedWaitMinutes: Math.max(1, Math.ceil((new Date(bookingClosesAt).getTime() - Date.now()) / (60 * 1000))),
    participantCount: summary.participantsCount,
    competitiveParticipantsCount: summary.competitiveParticipantsCount,
    acceptedCount: 0,
    capacity: summary.capacity,
    userAccepted: false,
    readyToStart: false,
    expiresAt: bookingClosesAt,
    expiresInSeconds: Math.ceil((new Date(bookingClosesAt).getTime() - Date.now()) / 1000),
    ...(groupPreview ? {
      participants: groupPreview.participants.slice(0, summary.participantsCount),
      mySeedRank: groupPreview.mySeedRank,
    } : {}),
  };
}

function buildMockDuelMatchStatus(response: RequestDuelMatchResponse): RunningMatchStatusResponse {
  if (!response.matched || !response.opponent) {
    return buildMockWaitingMatchStatus({
      mode: 'duel',
      distanceKm: response.distanceKm,
      slotStartAt: response.slotStartAt,
    });
  }

  return {
    success: true,
    mode: 'duel',
    state: 'matched',
    ...(response.isTestMatch ? { isTestMatch: true } : {}),
    matchId: response.requestId,
    distanceKm: response.distanceKm,
    slotStartAt: response.slotStartAt,
    slotLabel: response.slotLabel,
    paceBandLabel: response.paceBandLabel,
    levelBandLabel: response.levelBandLabel,
    criteriaSummary: `${formatMockMatchSlotDateLabel(response.slotStartAt)} ${response.slotLabel}에 비슷한 페이스 상대와 매칭이 잡혔어요.`,
    estimatedWaitMinutes: 0,
    participantCount: 2,
    acceptedCount: 0,
    capacity: 2,
    userAccepted: true,
    readyToStart: new Date(response.slotStartAt).getTime() <= Date.now(),
    canCancel: Boolean(getMockMatchCancelableUntilAt(response.slotStartAt))
      && Date.now() < new Date(getMockMatchCancelableUntilAt(response.slotStartAt) ?? 0).getTime(),
    cancelableUntilAt: getMockMatchCancelableUntilAt(response.slotStartAt) ?? undefined,
    expiresAt: getMockMatchBookingClosesAt(response.slotStartAt) ?? undefined,
    expiresInSeconds: getMockMatchBookingClosesAt(response.slotStartAt)
      ? Math.max(0, Math.ceil((new Date(getMockMatchBookingClosesAt(response.slotStartAt)!).getTime() - Date.now()) / 1000))
      : undefined,
    opponent: {
      ...response.opponent,
      accepted: true,
      liveStatus: 'ready',
    },
  };
}

function buildMockGroupMatchStatus(response: RequestGroupMatchResponse): RunningMatchStatusResponse {
  if (!response.matched) {
    return buildMockWaitingMatchStatus({
      mode: 'group',
      distanceKm: response.distanceKm,
      slotStartAt: response.slotStartAt,
    });
  }

  return {
    success: true,
    mode: 'group',
    state: 'matched',
    ...(response.isTestMatch ? { isTestMatch: true } : {}),
    matchId: response.requestId,
    distanceKm: response.distanceKm,
    slotStartAt: response.slotStartAt,
    slotLabel: response.slotLabel,
    paceBandLabel: response.paceBandLabel,
    levelBandLabel: response.levelBandLabel,
    criteriaSummary: `${formatMockMatchSlotDateLabel(response.slotStartAt)} ${response.slotLabel}에 ${response.participantsCount}명 그룹 대결이 잡혔어요.`,
    estimatedWaitMinutes: 0,
    participantCount: response.participantsCount,
    acceptedCount: 0,
    capacity: response.maxGroupSize,
    userAccepted: true,
    readyToStart: new Date(response.slotStartAt).getTime() <= Date.now(),
    canCancel: Boolean(getMockMatchCancelableUntilAt(response.slotStartAt))
      && Date.now() < new Date(getMockMatchCancelableUntilAt(response.slotStartAt) ?? 0).getTime(),
    cancelableUntilAt: getMockMatchCancelableUntilAt(response.slotStartAt) ?? undefined,
    expiresAt: getMockMatchBookingClosesAt(response.slotStartAt) ?? undefined,
    expiresInSeconds: getMockMatchBookingClosesAt(response.slotStartAt)
      ? Math.max(0, Math.ceil((new Date(getMockMatchBookingClosesAt(response.slotStartAt)!).getTime() - Date.now()) / 1000))
      : undefined,
    participants: response.participants.map((participant) => ({
      ...participant,
      accepted: true,
      liveStatus: 'ready',
    })),
    mySeedRank: response.mySeedRank,
  };
}

function isExclusiveIntegrationSourceType(sourceType: RunSourceType) {
  return sourceType !== 'manual' && sourceType !== 'runningground';
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
    liveLocationLabel: undefined,
  };
}

function upsertMockCurrentUserRank() {
  const profile = getCurrentUserProfile() ?? myProfile;
  const existingRank = mockFriendRanks.find((entry) => entry.tag === profile.publicTag);

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

  mockFriendRanks = normalizeMockFriendRanks([...mockFriendRanks, nextRank]);
  return mockFriendRanks.find((entry) => entry.tag === profile.publicTag) ?? nextRank;
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
    const pointBreakdown = buildMockPointBreakdown(distanceKm >= 0.1 ? 10 : 0);

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
      earnedPoint: pointBreakdown.totalPoints,
      pointBreakdown,
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

export async function createTrackedRun(input: CreateTrackedRunInput): Promise<CreateTrackedRunResponse> {
  if (USE_MOCK_API) {
    const distanceKm = Number(input.distanceKm.toFixed(1));
    const pointBreakdown = buildMockPointBreakdown(distanceKm >= 0.1 ? 10 : 0, input.matchResult);
    const trackedRun = {
      id: `tracked-run-${Date.now()}`,
      date: input.date,
      distanceKm,
      pace: input.pace,
      source: 'RunningGround',
      sourceType: 'runningground' as const,
      durationSeconds: input.durationSeconds,
      cadenceSpm: input.cadenceSpm ?? null,
      elevationGainM: input.elevationGainM ?? null,
      route: input.route,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      ...(input.matchResult ? { matchResult: input.matchResult } : {}),
    };

    myRunRecords.unshift(trackedRun);

    return {
      run: trackedRun,
      weeklyDistanceKm: distanceKm,
      estimatedMinutes: Math.round(input.durationSeconds / 60),
      earnedPoint: pointBreakdown.totalPoints,
      pointBreakdown,
    };
  }

  const createdRun = await apiPost<CreateTrackedRunResponse>(
    '/runs/tracked',
    {
      date: input.date,
      distanceKm: input.distanceKm,
      pace: input.pace,
      durationSeconds: input.durationSeconds,
      cadenceSpm: input.cadenceSpm ?? null,
      elevationGainM: input.elevationGainM ?? null,
      route: input.route,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      matchResult: input.matchResult ?? null,
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '실시간 러닝 기록 저장에 실패했어.',
    },
  );

  await fetchMyProfile();
  return createdRun;
}

export async function createRunningRoutePreview(
  input: CreateRunningRoutePreviewInput,
): Promise<CreateRunningRoutePreviewResponse> {
  if (USE_MOCK_API) {
    return {
      displayTitle: input.displayTitle,
      description: input.description,
      startLabel: input.startLabel,
      requestedKeyword: input.keyword,
      requestedDistanceKm: Number(input.desiredDistanceKm.toFixed(1)),
      estimatedDistanceKm: Number(input.desiredDistanceKm.toFixed(2)),
      coordinates: input.roughCoordinates,
      provider: 'template',
      roadFollowed: false,
      warning: '로컬 미리보기 모드에서는 도보 경로 엔진 대신 그림 윤곽선을 먼저 보여드려요.',
    };
  }

  return apiPost<CreateRunningRoutePreviewResponse>(
    '/running/route-preview',
    input,
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '추천 그림 경로를 만들지 못했어.',
    },
  );
}

export async function updateRunningLiveShare(
  input: UpdateRunningLiveShareInput,
): Promise<UpdateRunningLiveShareResponse> {
  if (USE_MOCK_API) {
    const currentUserRank = upsertMockCurrentUserRank();
    const isRunningNow = input.enabled && input.status === 'running';
    const normalizedLocationLabel = input.locationLabel?.trim();

    currentUserRank.isRunningNow = isRunningNow;
    currentUserRank.liveLocationLabel = isRunningNow && normalizedLocationLabel ? normalizedLocationLabel : undefined;
    mockFriendRanks = normalizeMockFriendRanks(mockFriendRanks);

    return {
      success: true,
      liveSharingEnabled: input.enabled,
      isRunningNow,
      ...(isRunningNow && normalizedLocationLabel ? { locationLabel: normalizedLocationLabel } : {}),
      updatedAt: new Date().toISOString(),
    };
  }

  return apiPatch<UpdateRunningLiveShareResponse>(
    '/me/live-sharing',
    {
      enabled: input.enabled,
      status: input.status,
      locationLabel: input.locationLabel?.trim() ?? '',
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '위치 공유 상태를 반영하지 못했어.',
    },
  );
}

export async function requestDuelMatch(input: RequestDuelMatchInput): Promise<RequestDuelMatchResponse> {
  if (USE_MOCK_API) {
    const response = buildMockDuelMatchResponse(input);
    mockRunningMatchSessions.duel = buildMockDuelMatchStatus(response);
    return response;
  }

  return apiPost<RequestDuelMatchResponse>(
    '/running/matches/duel',
    {
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      testMode: Boolean(input.testMode),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '1대1 매칭을 찾지 못했어.',
    },
  );
}

export async function requestGroupMatch(input: RequestGroupMatchInput): Promise<RequestGroupMatchResponse> {
  if (USE_MOCK_API) {
    const response = buildMockGroupMatchResponse(input);
    mockRunningMatchSessions.group = buildMockGroupMatchStatus(response);
    return response;
  }

  return apiPost<RequestGroupMatchResponse>(
    '/running/matches/group',
    {
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      testMode: Boolean(input.testMode),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '그룹 매칭을 찾지 못했어.',
    },
  );
}

export async function fetchMatchDemandSummary(input: FetchMatchDemandSummaryInput): Promise<MatchDemandSummaryResponse> {
  if (USE_MOCK_API) {
    return buildMockMatchDemandSummary(input);
  }

  return apiPost<MatchDemandSummaryResponse>(
    '/running/matches/summary',
    {
      mode: input.mode,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '현재 매칭 현황을 불러오지 못했어.',
    },
  );
}

export async function fetchRunningMatchStatus(input: FetchRunningMatchStatusInput): Promise<RunningMatchStatusResponse> {
  if (USE_MOCK_API) {
    const currentSession = syncMockRunningMatchSession(input.mode);

    if (
      currentSession
      && currentSession.distanceKm === Number(input.distanceKm.toFixed(1))
      && currentSession.slotStartAt === input.slotStartAt
    ) {
      return currentSession;
    }

    return buildMockWaitingMatchStatus(input);
  }

  return apiPost<RunningMatchStatusResponse>(
    '/running/matches/status',
    {
      mode: input.mode,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '매칭 상태를 불러오지 못했어.',
    },
  );
}

export async function fetchUpcomingRunningMatches(): Promise<UpcomingRunningMatchesResponse> {
  if (USE_MOCK_API) {
    const items = (['duel', 'group'] as const)
      .map((mode) => syncMockRunningMatchSession(mode))
      .filter((session): session is RunningMatchStatusResponse => {
        if (!session) {
          return false;
        }

        return ['matched', 'active'].includes(session.state);
      })
      .map((session) => ({
        matchId: session.matchId ?? `${session.mode}-${session.slotStartAt}`,
        mode: session.mode,
        ...(session.isTestMatch ? { isTestMatch: true } : {}),
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: session.slotLabel,
        status: session.state === 'active' ? 'active' as const : 'matched' as const,
        participantCount: session.participantCount,
        counterpartLabel: session.mode === 'duel'
          ? session.opponent?.name ?? '상대 미정'
          : `${session.participantCount}명 그룹`,
        summary: `${formatMockMatchSlotDateLabel(session.slotStartAt)} ${session.slotLabel} · ${session.distanceKm.toFixed(1)}km`,
        canCancel: session.state === 'matched'
          && Boolean(getMockMatchCancelableUntilAt(session.slotStartAt))
          && Date.now() < new Date(getMockMatchCancelableUntilAt(session.slotStartAt) ?? 0).getTime(),
        cancelableUntilAt: getMockMatchCancelableUntilAt(session.slotStartAt) ?? new Date(session.slotStartAt).toISOString(),
      }))
      .sort((left, right) => new Date(left.slotStartAt).getTime() - new Date(right.slotStartAt).getTime());

    return { items };
  }

  return apiGet<UpcomingRunningMatchesResponse>(
    '/running/matches/upcoming',
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '다가오는 매치를 불러오지 못했어.',
    },
  );
}

export async function acceptRunningMatch(input: AcceptRunningMatchInput): Promise<RunningMatchStatusResponse> {
  if (USE_MOCK_API) {
    const duelSession = syncMockRunningMatchSession('duel');
    const groupSession = syncMockRunningMatchSession('group');
    const currentSession = duelSession?.matchId === input.matchId
      ? duelSession
      : groupSession?.matchId === input.matchId
        ? groupSession
        : null;

    if (!currentSession) {
      throw new Error('수락할 매치를 찾지 못했어.');
    }

    return currentSession;
  }

  return apiPost<RunningMatchStatusResponse>(
    '/running/matches/accept',
    input,
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '매치 수락을 반영하지 못했어.',
    },
  );
}

export async function cancelRunningMatch(input: CancelRunningMatchInput): Promise<CancelRunningMatchResponse> {
  if (USE_MOCK_API) {
    mockRunningMatchSessions[input.mode] = null;
    return { success: true };
  }

  return apiPost<CancelRunningMatchResponse>(
    '/running/matches/cancel',
    {
      ...input,
      distanceKm: Number(input.distanceKm.toFixed(1)),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '매칭 취소를 반영하지 못했어.',
    },
  );
}

export async function leaveRunningMatch(input: LeaveRunningMatchInput): Promise<LeaveRunningMatchResponse> {
  if (USE_MOCK_API) {
    mockRunningMatchSessions.duel = null;
    mockRunningMatchSessions.group = null;
    return { success: true };
  }

  return apiPost<LeaveRunningMatchResponse>(
    '/running/matches/leave',
    input,
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '매치 이탈 상태를 반영하지 못했어.',
    },
  );
}

export async function updateRunningMatchProgress(
  input: UpdateRunningMatchProgressInput,
): Promise<UpdateRunningMatchProgressResponse> {
  if (USE_MOCK_API) {
    const duelSession = syncMockRunningMatchSession('duel');
    const groupSession = syncMockRunningMatchSession('group');
    const currentSession = duelSession?.matchId === input.matchId
      ? duelSession
      : groupSession?.matchId === input.matchId
        ? groupSession
        : null;

    if (!currentSession) {
      throw new Error('진행 중인 매치를 찾지 못했어.');
    }

    if (currentSession.mode === 'duel' && currentSession.opponent) {
      const nextLiveStatus: MockMatchLiveStatus = input.status === 'finished' ? 'finished' : input.status;
      const nextSession = {
        ...currentSession,
        opponent: {
          ...currentSession.opponent,
          liveStatus: nextLiveStatus,
          liveDistanceKm: Number(input.distanceKm.toFixed(2)),
          liveElapsedSeconds: input.elapsedSeconds,
          livePace: input.currentPace,
          liveUpdatedAt: new Date().toISOString(),
          ...(input.status === 'finished' ? { finishedAt: new Date().toISOString() } : { finishedAt: undefined }),
        },
      };
      mockRunningMatchSessions.duel = nextSession;
      return hydrateMockRunningMatchSessionStatuses(nextSession);
    }

    if (currentSession.mode === 'group' && currentSession.participants) {
      const nextLiveStatus: MockMatchLiveStatus = input.status === 'finished' ? 'finished' : input.status;
      const nextParticipants = currentSession.participants.map((participant) => (
        participant.seedRank === (currentSession.mySeedRank ?? 1)
          ? {
            ...participant,
            liveStatus: nextLiveStatus,
            liveDistanceKm: Number(input.distanceKm.toFixed(2)),
            liveElapsedSeconds: input.elapsedSeconds,
            livePace: input.currentPace,
            liveUpdatedAt: new Date().toISOString(),
            ...(input.status === 'finished' ? { finishedAt: new Date().toISOString() } : { finishedAt: undefined }),
          }
          : participant
      ));

      const nextSession = {
        ...currentSession,
        participants: nextParticipants,
      };
      mockRunningMatchSessions.group = nextSession;
      return hydrateMockRunningMatchSessionStatuses(nextSession);
    }

    return hydrateMockRunningMatchSessionStatuses(currentSession);
  }

  return apiPost<UpdateRunningMatchProgressResponse>(
    '/running/matches/progress',
    {
      ...input,
      distanceKm: Number(input.distanceKm.toFixed(2)),
      elapsedSeconds: Math.max(0, Math.round(input.elapsedSeconds)),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '실시간 경쟁 상태를 업데이트하지 못했어.',
    },
  );
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
        : isExclusiveIntegrationSourceType(sourceType) && isExclusiveIntegrationSourceType(source.sourceType)
          ? {
            ...source,
            connected: false,
            connectionStatus: 'planned',
            lastSyncedAt: undefined,
            pendingImportCount: undefined,
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
    startedAt?: string;
    endedAt?: string;
    durationSeconds?: number;
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
        ...(run.startedAt ? { startedAt: run.startedAt.trim() } : {}),
        ...(run.endedAt ? { endedAt: run.endedAt.trim() } : {}),
        ...(typeof run.durationSeconds === 'number' ? { durationSeconds: Math.max(1, Math.round(run.durationSeconds)) } : {}),
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
      matchReminders: input.matchReminders,
    };

    return { ...mockNotificationPreferences };
  }

  return apiPatch<UpdateNotificationSettingsResponse>(
    '/me/notifications',
    {
      friendAlerts: input.friendAlerts,
      districtAlerts: input.districtAlerts,
      marketAlerts: input.marketAlerts,
      matchReminders: input.matchReminders,
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
      const pointBreakdown = buildMockPointBreakdown(Math.round(run.distanceKm * 2.4));

      return {
        run: {
          ...run,
          source: '친구 기록',
        },
        weeklyDistanceKm: weeklySummary.totalDistanceKm,
        estimatedMinutes: Math.round(run.distanceKm * 5.5),
        earnedPoint: pointBreakdown.totalPoints,
        pointBreakdown,
      };
    }

    const run = input?.runId
      ? (myRunRecords.find((entry) => entry.id === input.runId) ?? myRunRecords[0])
      : myRunRecords[0];
    const pointBreakdown = buildMockPointBreakdown(Math.round(run.distanceKm * 2.4), run.matchResult);

    return {
      run,
      weeklyDistanceKm: weeklySummary.totalDistanceKm,
      estimatedMinutes: Math.round(run.distanceKm * 5.5),
      earnedPoint: pointBreakdown.totalPoints,
      pointBreakdown,
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
