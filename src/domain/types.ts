export type RunSourceType =
  | 'apple_health'
  | 'health_connect'
  | 'garmin'
  | 'strava'
  | 'nrc'
  | 'manual';

export type WeeklySummary = {
  totalDistanceKm: number;
  totalRuns: number;
  goalAchievementRate: number;
  streakDays: number;
  latestRun: {
    distanceKm: number;
    source: string;
  };
  friendName: string;
  friendGapKm: number;
  districtName: string;
  districtRank: number;
  districtPoints: number;
  districtBattle: {
    myDistrict: string;
    averageDistancePerMember: number;
    totalDistanceKm: number;
    participationRate: number;
    districtRank: number;
  };
};

export type FriendRank = {
  id: string;
  rank: number;
  name: string;
  tag?: string;
  distanceKm: number;
  points: number;
  isRunningNow?: boolean;
};

export type ConnectedSource = {
  sourceType: RunSourceType;
  displayName: string;
  connected: boolean;
  connectionStatus: 'connected' | 'planned';
  lastSyncedAt?: string;
  recommendedPlatform?: 'ios' | 'android' | 'all';
};

export type UserProfile = {
  name: string;
  provinceName?: string;
  cityName?: string;
  districtName: string;
  universityName?: string;
  addressDetail?: string;
  publicTag: string;
};

export type DistrictBattleRank = {
  rank: number;
  districtName: string;
  averageDistanceKm: number;
  participationRate: number;
  participants: number;
};

export type RegionDrilldownNode = {
  id: string;
  name: string;
  level: 'country' | 'province' | 'city' | 'district';
  averageDistanceKm: number;
  totalDistanceKm: number;
  participationRate: number;
  participants: number;
  rank: number;
  children?: RegionDrilldownNode[];
};

export type DistrictPersonalRank = {
  id: string;
  rank: number;
  name: string;
  distanceKm: number;
  points: number;
  isMe?: boolean;
  isFriend?: boolean;
};

export type FriendRequestStatus = 'pending' | 'received' | 'accepted';

export type FriendRequest = {
  id: string;
  name: string;
  tag: string;
  status: FriendRequestStatus;
};

export type FriendRunRecord = {
  id: string;
  date: string;
  distanceKm: number;
  pace: string;
};

export type MyRunRecord = {
  id: string;
  date: string;
  distanceKm: number;
  pace: string;
  source: string;
};

export type MarketRewardClaimState = 'claimable' | 'claimed' | 'locked';

export type MarketRewardItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  costPoints: number;
  partnerName?: string;
  repeatable: boolean;
  claimState: MarketRewardClaimState;
};

export type MarketOverview = {
  currentPoints: number;
  totalRedeemedCount: number;
  items: MarketRewardItem[];
};

export type UniversityLeagueRank = {
  rank: number;
  universityName: string;
  totalDistanceKm: number;
  participants: number;
};

export type OfflineRaceStatus =
  | 'registration_open'
  | 'registration_closing'
  | 'registration_closed'
  | 'live'
  | 'finished';

export type OfflineRaceParticipantPreview = {
  id: string;
  name: string;
  paceGoal: string;
  regionLabel: string;
};

export type OfflineRaceEvent = {
  id: string;
  title: string;
  subtitle: string;
  distanceKm: number;
  startsAt: string;
  registrationClosesAt: string;
  participationMode: string;
  proofMethod: string;
  runWindowMinutes: number;
  hostLabel: string;
  participantCount: number;
  capacity: number;
  entryFeePoints: number;
  operationNote: string;
  registered: boolean;
  status: OfflineRaceStatus;
  participantPreview: OfflineRaceParticipantPreview[];
};

export type OfflineRacePastEvent = {
  id: string;
  title: string;
  distanceKm: number;
  finishedAt: string;
  modeLabel: string;
  winnerName: string;
  finishers: number;
  summary: string;
};

export type OfflineRaceHub = {
  featuredEvent: OfflineRaceEvent;
  upcomingEvents: OfflineRaceEvent[];
  pastEvents: OfflineRacePastEvent[];
  guideSteps: string[];
};
