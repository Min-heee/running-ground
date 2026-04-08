import { ConnectedSource, DistrictPersonalRank, FriendRank, FriendRequest, FriendRunRecord, MarketOverview, MyRunRecord, RegionDrilldownNode, RunSourceType, UniversityLeagueRank, UserProfile, WeeklySummary } from '@/domain/types';

export type HomeSummaryResponse = WeeklySummary;
export type MarketOverviewResponse = MarketOverview;

export type AuthResponse = {
  accessToken: string;
  user: UserProfile;
};

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
  runs: FriendRunRecordsResponse;
  monthlyDistanceKm: number;
  monthlyPoints: number;
};

export type FriendRunRecordsResponse = FriendRunRecord[];

export type IntegrationStatusResponse = {
  sources: ConnectedSource[];
};

export type IntegrationSyncResponse = {
  success: boolean;
  syncedSources: number;
  syncedRuns: number;
  lastSyncedAt: string;
};

export type IntegrationSourceActionInput = {
  sourceType: RunSourceType;
};

export type IntegrationSourceActionResponse = {
  success: boolean;
  source: ConnectedSource;
  sources: ConnectedSource[];
};

export type MarketClaimResponse = {
  success: boolean;
  claimedItemId: string;
  overview: MarketOverview;
};

export type MyProfileResponse = UserProfile;

export type NotificationSettingsResponse = {
  friendAlerts: boolean;
  districtAlerts: boolean;
  marketAlerts: boolean;
};

export type UpdateMyProfileInput = {
  name: string;
};

export type UpdateMyProfileResponse = UserProfile;

export type UpdateMyRegionInput = {
  districtName: string;
};

export type UpdateMyRegionResponse = UserProfile;

export type UpdateNotificationSettingsInput = NotificationSettingsResponse;

export type UpdateNotificationSettingsResponse = NotificationSettingsResponse;

export type CreateFriendRequestResponse = {
  success: boolean;
  requestId: string;
  status: 'pending' | 'accepted';
};

export type FriendRequestActionResponse = {
  success: boolean;
  requestId: string;
  status: 'accepted' | 'rejected' | 'cancelled';
};

export type DistrictPersonalResponse = {
  districtName: string;
  myRank: DistrictPersonalRank | null;
  myPoints: number;
  weeklyDistanceKm: number;
  focusRanks: DistrictPersonalRank[];
  ranks: DistrictPersonalRank[];
};

export type RegionBreadcrumbItem = Pick<RegionDrilldownNode, 'id' | 'name' | 'level'>;

export type RegionLeagueResponse = {
  currentNode: RegionDrilldownNode;
  breadcrumb: RegionBreadcrumbItem[];
  children: RegionDrilldownNode[];
};

export type UniversityLeagueResponse = {
  ranks: UniversityLeagueRank[];
};

export type RunDetailResponse = {
  run: MyRunRecord;
  weeklyDistanceKm: number;
  estimatedMinutes: number;
  earnedPoint: number;
};
